# Trava do palpite por competição — análise e implementação

Branch: `feature/trava-por-competicao` · Base: `4ace0a1` (main)
**Nada foi aplicado no Supabase de produção.** A migração está no repositório,
aguardando decisão.

---

## A mudança

**Hoje:** cada palpite fecha no horário de início da *própria partida*.
**Proposto:** num bolão de competições, TODOS os palpites de uma competição —
ida, volta e fases seguintes — fecham no horário do **primeiro jogo daquela
competição**. Cada competição tem o seu prazo.

Com o calendário atual:

| Competição | Prazo | Jogos que fecham junto |
| --- | --- | --- |
| Copa do Brasil | **01/08, 17:30** | 16 |
| Libertadores | **11/08, 19:00** | 16 |
| Sul-Americana | *sem prazo* (nenhum jogo tem data) | 4 |

Partidas **sem competição** (Mundial, torneios de grupos) mantêm a regra antiga,
por partida. Trocar isso travaria uma Copa do Mundo inteira no primeiro jogo —
não é o que se pediu e mudaria torneios já em andamento.

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
| `check_prediction_window` (banco) | prazo da partida | prazo da competição |
| `savePrediction` (server action) | prazo da partida | prazo da competição |
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

`check_podium_window` já usava exatamente esta regra (1º jogo da competição).
Hoje o pódio fecha **antes** dos palpites de placar; depois desta mudança os
dois fecham no mesmo instante. É uma simplificação real para explicar ao grupo.

### 6. O que NÃO mudei, de propósito

**A RLS `Predictions visible after kickoff or own` continua revelando palpite a
palpite**, no início de cada jogo — não no prazo da competição. Ou seja: os
palpites ficam congelados no 1º jogo, mas só aparecem para os outros quando cada
jogo começa.

Isso é **mais restritivo** que a trava, nunca menos — não abre brecha. E preserva
a graça: ninguém vê o chaveamento inteiro de todo mundo de uma vez.

A alternativa seria revelar tudo de uma vez no 1º jogo, já que a partir dali nada
pode mudar — o argumento a favor é que a transparência ("ninguém alterou depois
que a bola rolou") passaria a ser verificável para a competição inteira logo no
começo. **É uma decisão sua**; deixei como está porque muda o espírito do bolão,
não só a mecânica.

---

## Verificação executada

A migração foi instalada, testada e revertida dentro de um bloco abortado por
exceção — produção nunca foi alterada (conferido depois: função original intacta,
datas originais, 3.187 palpites):

```
copa_placar          = BLOQUEADO   (jogo FUTURO da Copa, competição já aberta) ✓
copa_so_pen_winner   = BLOQUEADO   (o furo fechou) ✓
liber_ainda_aberta   = PASSOU      (prazo independente por competição) ✓
gatilho_pontuacao    = PASSOU      (o sistema ainda grava points_*) ✓
```

`tsc`: 251 erros, os mesmos 251 da `main` — nenhum novo. `next build` compila.

---

## Como aplicar (quando decidir)

1. Aplicar `supabase/migrations/20260730000001_prediction_window_per_competition.sql`.
2. Fazer merge da branch na `main`.

**Na ordem.** Se o código subir antes da migração, a tela dirá que o prazo é o 1º
jogo enquanto o banco ainda aceita palpite até cada jogo — inconsistente, mas
sem risco de perda. O contrário (migração antes do código) é seguro: o banco
fica mais estrito e a tela só ficaria otimista.

---

## Riscos e pontos de atenção

- **Encurta MUITO o prazo.** Hoje dá para palpitar o jogo de volta até o dia dele;
  depois, tudo tem de estar pronto antes do primeiro jogo. Na Copa do Brasil isso
  é **01/08 às 17:30** — daqui a pouco. **Avise o grupo antes de aplicar.**
- **Sul-Americana continua sem prazo**, porque nenhum dos 4 jogos tem data. Ela só
  passa a ter prazo quando o admin lançar a primeira data. Enquanto isso, os
  palpites da Sula ficam abertos.
- **Palpites de ida e volta viram aposta no escuro**: o jogador terá de palpitar o
  jogo de volta sem saber o resultado da ida. É o efeito pretendido, mas muda o
  jogo e vale explicar ao grupo.
- **Jogos "a definir" das fases seguintes**: quando o admin gerar as quartas, esses
  jogos herdam o prazo da competição — que já terá vencido. Na prática **ninguém
  poderá palpitar as quartas em diante.** Isto precisa de decisão: ou o prazo vale
  só para as oitavas (e cada fase seguinte ganha o seu), ou o bolão inteiro é
  decidido antes do primeiro jogo. **A implementação atual faz a segunda coisa** —
  é a leitura literal do pedido, mas é a consequência mais séria e provavelmente
  não é o que se quer.
