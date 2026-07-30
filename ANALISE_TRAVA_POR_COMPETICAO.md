# Trava do palpite por competição + fase — análise e implementação

Branch: `feature/trava-por-competicao` · Base: `4ace0a1` (main)
**Nada foi aplicado no Supabase de produção.** A migração está no repositório,
aguardando decisão.

---

## A mudança

**Hoje:** cada palpite fecha no horário de início da *própria partida*.
**Adotado:** os palpites de uma **FASE** de uma competição — ida e volta juntos —
fecham no horário do **primeiro jogo daquela fase**. Cada competição tem o seu
prazo, e **cada fase abre um prazo novo**: as quartas só fecham no primeiro jogo
das quartas.

Com o calendário atual (oitavas):

| Competição | Prazo das oitavas | Jogos que fecham junto |
| --- | --- | --- |
| Copa do Brasil | **01/08, 17:30** | 16 |
| Libertadores | **11/08, 19:00** | 16 |
| Sul-Americana | *sem prazo* (nenhum dos 10 jogos tem data) | 10 |

Partidas **sem competição** (Mundial, torneios de grupos) ou sem confronto
associado mantêm a regra antiga, por partida.

### Por que FASE e não competição inteira

A primeira versão desta análise travava a competição inteira. O efeito colateral
era grave: os jogos das quartas em diante são criados só depois, pela fase
anterior, e **nasceriam com o prazo já vencido** — ninguém poderia palpitar
deles. Com a trava por fase, cada fase abre a sua janela em tempo oportuno.

### O prazo é a MENOR data da fase, não a primeira cadastrada

`prediction_deadline` faz `MIN(match_date)` sobre a fase e é **recalculada a cada
consulta** — não congela. Confirmado em produção, com rollback:

| Ação do admin numa fase sem datas | Prazo resultante |
| --- | --- |
| nenhuma data | *sem prazo* |
| cadastra um jogo em 20/09 | 20/09 21:30 |
| cadastra outro em 05/09 | **05/09 19:00** (andou para trás) |
| adia esse de 05/09 para 30/09 | **20/09 21:30** (voltou) |

Ou seja: sempre coincide com o primeiro jogo da fase, na ordem do calendário. A
ordem em que o admin digita não importa.

**Isso trouxe um risco que a trava por partida não tinha.** Como o prazo anda nos
dois sentidos, adiar o jogo mais cedo faria uma fase JÁ DISPUTADA reabrir — com
os resultados na mesa. E o gatilho antigo não checava `status`, então dava para
alterar palpite de jogo finalizado.

Fechado com `phase_already_started()`: a fase também conta como encerrada quando
**qualquer jogo dela já começou ou foi finalizado**. Assim ela nunca reabre.
Adiamento sem nada disputado continua reabrindo — aí a fase de fato não
aconteceu. Verificado:

```
fase_em_curso                     = BLOQUEADO ✓
apos_adiar_jogo_ja_disputado      = BLOQUEADO (fase não reabre) ✓
tudo_adiado_sem_jogo_disputado    = PASSOU (reabre, e deve mesmo) ✓
```

A mesma conta é refeita no TypeScript (`buildPhaseClosedAt`), para a tela não
mostrar aberto o que o banco bloqueia.

### Por que `ties.round` e não `matches.phase`

`matches` **não tem coluna de fase**. Existe `phase`, mas é rótulo de texto e
separa ida de volta ("Oitavas de final – ida" / "– volta") — agrupar por ele
daria dois prazos para o mesmo confronto. A fase de verdade é `ties.round`,
alcançada por `matches.tie_id`.

---

## Varredura: o que a mudança toca

### 1. A trava de verdade está no BANCO, não no código

O ponto mais importante do levantamento. Existe o gatilho
`tr_check_prediction_window` em `predictions` (`BEFORE INSERT OR UPDATE`), com a
função `check_prediction_window()`. **Mudar só o server action não mudaria a
regra** — qualquer um com a chave anon poderia gravar pela Data API dentro da
janela antiga. Por isso a migração `20260730000001` é obrigatória, e é ela que
manda; o TypeScript passa a ser apenas a mensagem de erro amigável e a tela.

### 2. 🔴 Furo de segurança PRÉ-EXISTENTE, confirmado em produção

A função liberava o UPDATE sem checar prazo quando "nenhum campo do palpite
mudou" — mas a lista comparada **não incluía `pred_pen_winner`**. E
`authenticated` tem UPDATE nessa coluna (conferido em
`information_schema.column_privileges`). No bolão de clubes ela **é** o palpite
de pênaltis (`penalty_prediction_mode = 'winner'`), e pênaltis valem pontos.

Testado em produção dentro de bloco com rollback garantido por exceção:

```
A) alterar pred_home depois do início  -> BLOQUEADO ✓
B) alterar só pred_pen_winner          -> PASSOU    ← furo
```

Ou seja: dava para trocar o vencedor dos pênaltis **depois do jogo começar, já
sabendo o resultado**. Não tem relação com o redesign nem com esta mudança —
é um defeito antigo que a varredura encontrou. A migração o fecha, incluindo
`pred_pen_winner` na comparação.

### 3. Vestígio do método antigo

`getMatchesWithPredictions` calculava e devolvia `tournamentStartDate`, e
`MatchCard` declarava a prop `tournamentStartDate` — **nunca passada, nunca
usada**. É resquício de um prazo único de torneio que existiu antes. Removido
dos dois lados.

### 4. Reflexos tratados

| Área | Antes | Agora |
| --- | --- | --- |
| `check_prediction_window` (banco) | prazo da partida | prazo da fase |
| `savePrediction` (server action) | prazo da partida | consulta a MESMA função do banco, por RPC |
| `MatchCard.isLocked` | `now > match_date` | `now > lock_at` |
| Contagem regressiva da pílula | até o jogo | até o prazo |
| Pílula de estado | "Apostas fechadas" | "Apostas fechadas" (travado) × "Em andamento" (jogo rolando) |
| Banner: "Próximo jogo fecha em" | próximo jogo | **"Próximo prazo fecha em"** |
| Banner | — | nova faixa "Palpites fecham em", com as 3 datas |
| `semPalpite` (etiqueta) | jogo não iniciado | jogo ainda **palpitável** |

O ponto sutil é o último. Contar como "pendência" um jogo cuja competição já
fechou mandaria o jogador para uma tela onde não há nada a fazer. Depois do
prazo, aquilo é prejuízo consumado, não tarefa.

O card agora recebe `lock_at` **pronto do servidor** em vez de recalcular a
regra na tela. Regra de prazo em dois lugares diverge com o tempo.

### 5. O pódio passa a ficar coerente

`check_podium_window` usa o 1º jogo da COMPETIÇÃO (não da fase). Hoje o pódio
fecha antes dos palpites de placar; depois desta mudança os dois passam a fechar
no mesmo instante **nas oitavas**. Nas fases seguintes eles voltam a divergir: o
pódio continua fechado, e cada nova fase abre prazo próprio para os placares.
Isso está correto — o pódio é palpite de campeão, e tem de fechar antes de a
competição começar.

### 6. O que NÃO mudei, de propósito

**A RLS `Predictions visible after kickoff or own` continua revelando palpite a
palpite**, no início de cada jogo — não no prazo da fase. Ou seja: os palpites
ficam congelados no 1º jogo da fase, mas só aparecem para os outros quando cada
jogo começa.

Isso é **mais restritivo** que a trava, nunca menos — não abre brecha. E preserva
a graça: ninguém vê a fase inteira de todo mundo de uma vez.

A alternativa seria revelar tudo de uma vez no 1º jogo, já que a partir dali nada
pode mudar — o argumento a favor é que a transparência ("ninguém alterou depois
que a bola rolou") passaria a ser verificável para a competição inteira logo no
começo. **É uma decisão sua**; deixei como está porque muda o espírito do bolão,
não só a mecânica.

---

## Verificação executada

A migração foi instalada, testada e revertida dentro de um bloco abortado por
exceção — produção nunca foi alterada (conferido depois: a função nova nem
existe lá, nenhum registro de teste sobrou, datas originais):

```
oitavas_volta      = BLOQUEADO   (jogo de VOLTA, ainda no futuro, já fechado) ✓
QUARTAS_NOVAS      = PASSOU      (fase criada depois abre prazo próprio)     ✓
libertadores       = PASSOU      (prazo independente por competição)          ✓
pen_winner_oitavas = BLOQUEADO   (o furo fechou)                              ✓
pontuacao          = PASSOU      (o sistema ainda grava points_*)             ✓
```

O segundo é o que a mudança de "competição" para "fase" resolveu: criei umas
quartas de final com data futura enquanto as oitavas estavam fechadas, e elas
aceitaram palpite.

`tsc`: 251 erros, os mesmos 251 da `main` — nenhum novo. `next build` compila.

---

## Como aplicar (quando decidir)

1. Aplicar `supabase/migrations/20260730000001_prediction_window_per_competition.sql`
   (cria `public.prediction_deadline` e reescreve `check_prediction_window`).
2. Fazer merge da branch na `main`.

**Na ordem.** Se o código subir antes da migração, a tela dirá que o prazo é o 1º
jogo enquanto o banco ainda aceita palpite até cada jogo — inconsistente, mas
sem risco de perda. O contrário (migração antes do código) é seguro: o banco
fica mais estrito e a tela só ficaria otimista.

---

## Riscos e pontos de atenção

- **Encurta MUITO o prazo.** Hoje dá para palpitar o jogo de volta até o dia dele;
  depois, ida e volta das oitavas têm de estar prontos antes do primeiro jogo da
  fase. Na Copa do Brasil isso é **01/08 às 17:30**. **Avise o grupo antes de
  aplicar** — o bolão está em uso agora (os palpites subiram de 3.187 para 3.340
  durante esta análise).
- **Sul-Americana continua sem prazo**, porque nenhum dos 10 jogos tem data.
- **Palpites de ida e volta viram aposta no escuro**: o jogador terá de palpitar o
  jogo de volta sem saber o resultado da ida. É o efeito pretendido, mas muda o
  jogo e vale explicar ao grupo.
- **Fases seguintes**: resolvido pela trava por fase — as quartas abrem prazo
  próprio quando ganharem data. Mas isso vira uma **obrigação operacional**: se o
  admin criar os jogos das quartas com data e o primeiro deles já tiver passado,
  a fase inteira nasce fechada. Lançar as datas com antecedência deixa de ser
  zelo e passa a ser requisito.
- **Fase sem data nenhuma fica aberta**, não fechada. É o caso da Sul-Americana
  hoje: 10 jogos, nenhum com data, prazo `NULL` → palpite liberado. Quando a
  primeira data entrar, a fase inteira passa a ter prazo.
