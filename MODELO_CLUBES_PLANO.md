# Modelo de probabilidade do bolão de clubes — plano de implementação

Resposta técnica à especificação `modelo_probabilidade_clubes_2026.md`, depois de
(a) conferir o snapshot Opta anexado, (b) simular os estimadores propostos e
(c) calibrar os parâmetros contra dados reais do nosso próprio banco.

Data: 31/07/2026. Snapshot Opta: `opta_snapshot_global_2026-07-31.csv` (13.789 clubes).

---

## 1. O que foi verificado

### 1.1. O snapshot Opta é real e cobre 100% do bolão

13.789 linhas, escala 0–100 (Arsenal = 100,0; menor = 15,54). Os **40 clubes**
do bolão foram localizados e conferidos um a um. Nenhum ficou de fora.

Ambiguidades que exigiram decisão manual (a busca automática por similaridade
erra em todas elas):

| No app | No Opta | Observação |
|---|---|---|
| Athletico-PR | Athletico Paranaense | 2º melhor palpite automático era **Atlético Mineiro** |
| Santa Fe | Independiente Santa Fe | 1º palpite automático era **Real Santander** (errado) |
| Bragantino | RB Bragantino | |
| Independiente del Valle | Independiente Valle | |
| Montevideo City Torque | City Torque | nome curto ≠ nome do clube |
| Bolivar | Bolívar | acento |
| Vasco / Vasco da Gama | Vasco da Gama | **mesmo clube, dois nomes no nosso banco** |

### 1.2. Os 40 clubes são estatisticamente muito parecidos

```
N = 40   média = 83,55   desvio-padrão = 3,35   mínimo = 73,71 (Juventude)   máximo = 90,39 (Flamengo)
```

Amplitude de 16,7 pontos numa escala de 0–100. Isso tem consequência direta na
seção 3.

### 1.3. Parâmetros calibrados com dados reais (72 jogos do Paulistão 2026)

O Paulistão 2026 está no nosso banco com placar completo, e os 16 clubes estão no
snapshot Opta. Ajuste por máxima verossimilhança (Poisson + Dixon-Coles):

```
mu_H  = 1,468 gols          (mandante)
mu_A  = 0,819 gols          (visitante)
beta  = 0,0361              IC95% aproximado [0,017 ; 0,057]
rho   = +0,121              NÃO significativo (delta log-verossimilhança = 0,27; precisa > 1,92)
```

**Ganho de cada componente, em nats por jogo:**

| Componente | log-loss por jogo | ganho |
|---|---:|---:|
| só a média global de gols | 2,8722 | — |
| + mando de campo | 2,7802 | **0,0920** |
| + rating Opta | 2,6962 | **0,0840** |
| + correção Dixon-Coles | 2,6924 | 0,0038 |

O mando vale tanto quanto o Opta inteiro. **Dixon-Coles vale 4% do mando e não é
estatisticamente distinguível de zero** nesta amostra.

Ressalva honesta: o snapshot é de julho e o Paulistão foi em janeiro–março, então há
lookahead no rating; e estadual tem rotação de elenco. O `beta` deve ser
recalibrado quando houver histórico das três copas. A ordem de grandeza, porém,
é sólida — e é ela que importa (ver 2.2).

---

## 2. As três decisões de matemática

### 2.1. Estimador: a proposta do documento fica

Foi pedido simular o método do documento (média ponderada de razões) contra o que
eu havia proposto (razão de somas). Fiz o estudo Monte Carlo pareado, com verdade
conhecida, medindo viés, RMSE e **log-loss preditivo fora da amostra**.

**Com a força do adversário conhecida exatamente**, a razão de somas ganha, e o
ganho cresce com a heterogeneidade do adversário (até +10% de RMSE):

| dispersão do adversário | jogos | RMSE doc | RMSE razão-de-somas | ganho |
|---:|---:|---:|---:|---:|
| 0,20 | 20 | 0,1754 | 0,1727 | +1,5% |
| 0,70 | 20 | 0,1859 | 0,1670 | **+10,1%** |

**Com a força do adversário estimada com ruído — que é a realidade, porque
usamos o `Def₀` derivado do Opta e não a verdade — ela inverte e perde feio:**

| dispersão do adversário | jogos | viés doc | viés razão-de-somas | ganho |
|---:|---:|---:|---:|---:|
| 0,20 | 20 | −0,091 | −0,080 | +0,2% |
| 0,70 | 20 | −0,063 | **+0,027** | **−12,4%** |

Causa: a razão de somas pondera cada jogo por `Def_adv`, concentrando o peso
justamente nos jogos contra adversários fracos, que são os de `Def₀` mais
incerto. O erro do denominador vira viés (Jensen), e o viés cresce com a
concentração. A média de razões dilui isso entre todos os jogos.

**Conclusão: eu estava errado. A fórmula do documento não muda.**

O que substitui as duas é o **ajuste conjunto iterado** (Poisson penalizado, todos
os clubes ao mesmo tempo, força do adversário estimada em vez de plugada):

| dispersão | jogos | doc | 1 passada | conjunto | conjunto vs doc |
|---:|---:|---:|---:|---:|---:|
| 0,20 | 8 | 1,01548 | 1,01536 | 1,01257 | +0,29% |
| 0,70 | 20 | 1,00367 | 1,00838 | 1,00211 | +0,15% |

Ele ganha sempre, nunca tem a explosão da versão de uma passada, e de quebra
resolve dois defeitos que eu havia apontado e que não teriam outra solução:
o `Def_adversário,0` congelado (aqui ele é iterado até o ponto fixo) e o
`mu_c` mal identificado (aqui os interceptos de competição entram no mesmo
ajuste). A atualização de cada iteração é exatamente a razão de somas — que só
é correta **dentro** do laço, com o valor corrente, nunca numa passada só.

Custo: ~40 linhas e ~30 iterações sobre algumas centenas de jogos. Milissegundos.

### 2.2. O que realmente importa não é o estimador — é o `kappa`

Custo de errar cada parâmetro, medido em log-loss preditivo, tudo na mesma escala:

| parâmetro | valor | piora |
|---|---:|---:|
| `kappa` | 0,5 | **+5,10%** |
| `kappa` | 1 | +3,45% |
| `kappa` | 2 | +1,81% |
| `kappa` | **5 (o do documento)** | referência |
| `kappa` | 10 | **−0,73%** |
| `kappa` | 20 | **−0,90%** |
| `beta` | 0,25× do correto | +1,05% |
| `beta` | 0,5× a 2× do correto | ≤ 0,61% |
| meia-vida | 10 a 10.000 dias | ≤ 0,94% |
| escolha do estimador | — | ≤ 0,30% |

Ordem de prioridade: **`kappa` ≫ `beta` > meia-vida ≈ estimador.**

`kappa = 5` do documento é baixo. O ótimo neste cenário fica entre 10 e 20.
Adotar **`kappa = 12`** como valor inicial, recalibrável.

Sobre o `beta`: a tolerância é larga (fator de 2 para cada lado), mas a escala
importa. O motor de seleções usa `FIFA_BETA = 0,3` sobre pontos FIFA divididos
por `FIFA_SCALE = 150`. Reaproveitar `0,3` cru sobre pontos Opta daria
`exp(0,3 × 16,7 / 2) ≈ 12×` de vantagem para o Flamengo. O valor correto é
**0,036**, e a fórmula deve usar `beta * (R - R̄)` com `R` na escala Opta crua,
documentado no código.

### 2.3. Dixon-Coles fica de fora da v1

Ganho medido: 0,0038 nats/jogo, não significativo. Em troca traz um parâmetro a
calibrar, um modo de falha (τ negativo quando `λ_H·λ_A·ρ > 1`) e uma
renormalização. Entra na v2, se e quando houver amostra das três copas que o
justifique. A estrutura do código deixa o gancho pronto (`rho = 0` desliga).

---

## 3. O achado que muda o valor do projeto

Com o `beta` calibrado e o rating real dos 40 clubes, as **24 chaves reais das
oitavas** ficam assim:

```
copa_do_brasil  Palmeiras      x Fortaleza                72,6%
copa_do_brasil  Atlético-MG    x Juventude                65,8%
sudamericana    Boca Juniors   x Recoleta                 60,4%
libertadores    Palmeiras      x Cerro Porteño            60,4%
...
libertadores    Fluminense     x Independiente Rivadavia  50,1%
sudamericana    Vasco da Gama  x Olimpia                  50,2%
```

**20 dos 24 confrontos ficam entre 43% e 55%.** Desvio médio em relação a 50/50:
**5,6 pontos percentuais.** O confronto mais desequilibrado do bolão inteiro é
Palmeiras × Fortaleza, a 72,6%.

Isso não é defeito do modelo — é a realidade de um mata-mata entre clubes
sul-americanos de nível parecido, e o snapshot confirma: desvio-padrão de 3,35
pontos entre os 40. Mas tem uma consequência de produto que precisa ser dita:
**um simulador construído sobre este prior vai exibir "50/50" em quase toda
chave.**

Pior: com `kappa = 5`, a atualização pelos jogos pós-T0 injeta muito mais ruído
do que sinal. Simulando 8 jogos reais de dois clubes cuja força verdadeira
**não muda**, a probabilidade de classificação passeia por:

| `kappa` | p5 | p50 | p95 | amplitude |
|---:|---:|---:|---:|---:|
| 2 | 22,9% | 54,2% | 83,4% | 60,5 pp |
| **5 (documento)** | 31,5% | 52,9% | 73,9% | **42,4 pp** |
| 10 | 37,5% | 52,9% | 68,2% | 30,7 pp |
| **12 (adotado)** | ~39% | ~53% | ~66% | ~27 pp |
| 20 | 44,0% | 53,1% | 62,1% | 18,1 pp |

Com os parâmetros do documento, um confronto de 53% oscilaria entre 31% e 74%
**por puro acaso dos placares**, sem que nada de real tivesse mudado. O jogador
veria o número dançar e concluiria — corretamente — que o simulador não sabe de nada.

**Decisões que decorrem disso:**

1. `kappa = 12`, não 5.
2. A tela exibe **intervalo**, não ponto: "Mirassol 53% (39–66%)", com o número de
   jogos que sustenta a estimativa. O Monte Carlo passa a sortear `Atk/Def` de uma
   lognormal com `σ ∝ 1/√(kappa + Σw)` em cada cenário, em vez de usar o ponto fixo.
   Sem isso as probabilidades saem superconfiantes.
3. Arredondamento em número inteiro. Nada de "63,4%".
4. **A página de resultados vem primeiro.** Ela entrega valor real e imediato; o
   simulador entrega quase-moedas com barra de erro. A ordem do documento
   (Etapa 4 antes do motor) estava certa — por um motivo mais forte do que o
   documento supunha.

---

## 4. A API

Não consegui alcançar `api-football.com` nem `v3.football.api-sports.io` deste
ambiente (a política de rede do sandbox nega o CONNECT). Tudo abaixo vem de
pesquisa e precisa ser confirmado com uma chave real antes do commit final.

### 4.1. Os limites do plano gratuito, e por que o documento errou o cálculo

Confirmado: **Free = 100 requisições/dia e 10 requisições/minuto.**

O §6.6 da especificação afirma que uma sincronização diária caberia no plano
gratuito. Não cabe, do jeito proposto: 40 clubes × 4 sincronizações = 160
chamadas/dia. E o limite **por minuto** é pior: 40 chamadas sequenciais levam 4
minutos, o que estoura o tempo de uma serverless function da Vercel.

O problema não é o plano — é consultar **por time**.

### 4.2. Consultar por data, não por time

`GET /fixtures?date=YYYY-MM-DD` devolve todos os jogos do dia; filtramos
localmente pelos nossos IDs. Orçamento real:

```
2 sincronizações/dia × (1–3 chamadas de fixtures + janela retroativa)   ≈ 6–10 chamadas/dia
estatísticas de partida                                                 0 (o modelo não usa xG)
                                                                        ─────────────────────
                                                                        ~10% da cota gratuita
```

Backfill histórico para calibrar `beta`, `rho` e `mu_c`
(`/fixtures?league={id}&season={ano}`, paginado): estimados 30–60 chamadas, uma
vez só, cabendo num único dia de cota.

**Recomendação: começar no plano gratuito.** O Pro (US$ 19/mês) fica como
contingência para um único cenário — se o plano gratuito restringir as
temporadas históricas a ponto de inviabilizar o backfill de calibração. Esse é o
item nº 1 a testar quando a chave existir.

Isso também torna desnecessário o rodízio de times que você levantou: com
consulta por data não existe custo por clube, então não há o que rodiziar. O
rodízio continua sendo o plano B correto, se a cota apertar por outro motivo.

### 4.3. Cobertura — o risco que sobra

O que precisa existir: Libertadores, Sul-Americana, Copa do Brasil, Brasileirão
Série A e B, e os campeonatos nacionais de Argentina, Uruguai, Paraguai, Chile,
Colômbia, Equador, Peru e Bolívia. A API-Football anuncia cobertura ampla dessas
ligas e a documentação de terceiros confirma os IDs das copas continentais, mas
**não consegui confirmar de fonte primária**, em especial os estaduais
brasileiros (que a especificação quer com peso 0,60).

Se faltarem os estaduais, o impacto é pequeno: são a competição de menor peso e
a de maior rotação de elenco — a que mais contamina a estimativa. Seguiríamos sem
eles.

### 4.4. Veredito sobre a API

**API-Football serve, no plano gratuito, se consultarmos por data.** Não vejo
motivo para trocar de fornecedor no MVP. A Sportmonks só entraria se xG virasse
requisito — e o item 2.3 mostra que nem Dixon-Coles se paga hoje, então xG está
muito longe de se pagar.

### 4.5. Onde roda o cron

O plano Hobby da Vercel limita cron a execução diária. Duas sincronizações/dia
exigem plano Pro **ou** `pg_cron` + `pg_net` no próprio Supabase. Recomendo o
Supabase: já é nossa infraestrutura, não custa nada a mais, e mantém a chave
fora da Vercel.

---

## 5. O que a especificação não previu e o nosso banco exige

### 5.1. São 40 clubes, não 47

48 vagas (3 competições × 8 confrontos × 2 jogos), 7 clubes repetidos em duas
competições, 1 clube com dois nomes. `is_bolao_team` como booleano perde a
informação de em quais competições o clube está — vira relação, não flag.

### 5.2. Três espaços de nomes, não dois

A especificação prevê o mapa Opta ↔ API-Football. Falta o terceiro, que é o
nosso: `matches.team_home` / `matches.team_away` são texto livre. A prova de que
isso é problema real está no nosso próprio banco: **"Vasco" e "Vasco da Gama"**
no bolão de clubes, **"Red Bull Bragantino" e "Bragantino"** no Paulistão. O
`team_key` é a chave canônica dos três.

### 5.3. O chaveamento pós-oitavas não existe — e em parte é sorteado

Só as oitavas estão cadastradas. O palpite de campeão exige simular até a final.
Na Copa do Brasil o chaveamento das quartas é **sorteado**, então cada cenário do
Monte Carlo tem que sortear a própria chave. A especificação assume
"chaveamento real do banco" e não trata isso. É o item mais subestimado do
documento e o que mais afeta a probabilidade de título.

### 5.4. A pontuação é outra

O §20/Etapa 8 diz "reaproveitar a lógica de pontuação existente". Ela não serve:

| | motor atual (seleções) | bolão de clubes |
|---|---|---|
| pódio | 1 por torneio, com 3º lugar | **1 por competição**, sem 3º lugar |
| campeão / vice | 40 / 20 / 25 | **40 / 25**, consolação 10 |
| classificado | — | **7 pontos** (`pred_pen_winner`, só no jogo de volta) |
| prorrogação | palpite de resultado | **não existe** neste bolão |
| placar de pênaltis | palpite de placar | **não existe** neste bolão |

Confirmado no banco: 0 palpites com `pred_extra_result`, 0 com `pred_pen_home`,
152 com `pred_pen_winner` — todos em jogos de volta.

### 5.5. RLS

Nenhuma das seis tabelas novas menciona RLS. Neste projeto tudo é lido com a
chave anon: sem política, ou vaza ou não lê. Definido abaixo.

### 5.6. Bug de schema

`club_fixture_team_stats` com PK `(fixture_id, team_key)` impede gravar
estatística de adversário não mapeado — coluna de PK é `NOT NULL`, e o §4.2 diz
explicitamente que essas partidas são salvas. Vira `(fixture_id, location)`.

### 5.7. Reuso maior do que o documento supõe

`lib/probability/engine.ts` (528 linhas) já tem prior exponencial sobre rating,
encolhimento por `kappa`, ataque/defesa Poisson, amostragem, chaveamento e
agregação de cenários. Falta ajuste por adversário, decaimento temporal, peso de
competição, mando (hoje há uma média única) e confronto de dois jogos. É
evolução de ~200 linhas num módulo novo, não reescrita. O documento acerta em
criar `lib/club-model/` separado — o motor de seleções continua intocado.

---

## 6. Plano de implementação

Ordem escolhida: **valor primeiro, motor depois**, e nada que dependa de chave de
API bloqueia o que não depende.

### Fase 0 — sem dependência externa (pode começar agora)

| # | Entrega | Observação |
|---|---|---|
| 0.1 | `opta_snapshots` + `opta_club_ratings` + import dos 13.789 clubes | RLS: leitura pública, escrita só service role |
| 0.2 | `club_source_ids` com os 40 clubes → Opta, mapeados e conferidos | `api_football_team_id` fica nulo |
| 0.3 | `club_aliases` — "Vasco"/"Vasco da Gama", "Bragantino"/"Red Bull Bragantino" | resolve 5.2 |
| 0.4 | `lib/club-model/` : prior, decaimento, pesos, ajuste conjunto iterado, Poisson | testável offline |
| 0.5 | Backtest contra os 72 jogos do Paulistão que já temos | trava `beta`, `mu_H`, `mu_A` |

Nada disso toca no app em produção. `has_simulator` do bolão de clubes continua
`false`, então nada aparece para o usuário até estar pronto.

### Fase 1 — coleta (precisa da chave)

| # | Entrega |
|---|---|
| 1.1 | Conferir cobertura das ligas e o limite de temporadas históricas do plano gratuito |
| 1.2 | Descobrir e conferir manualmente os 40 `api_football_team_id` |
| 1.3 | `club_fixtures` + cliente da API + sincronização **por data** |
| 1.4 | Backfill histórico para calibração (`beta`, `mu_c` por competição) |
| 1.5 | Cron no Supabase (`pg_cron` + `pg_net`), 2×/dia, com log de sincronização |

### Fase 2 — página de resultados (valor para o usuário)

Rota `/[tournament]/resultados`. Escopo enxuto na v1: lista agrupada por data,
filtro por clube e filtro "só as três copas". Padrão visual dos cards de
partidas, mobile-first, com o horário da última sincronização. Os filtros de
país e de janela de 7/15/30/60 dias do §11.3 ficam para depois.

### Fase 3 — motor e simulador

| # | Entrega |
|---|---|
| 3.1 | Força dinâmica a partir dos jogos reais, `club_strength_current` |
| 3.2 | Confronto de ida e volta, com a regra de desempate de cada competição |
| 3.3 | Sorteio do chaveamento pós-oitavas (obrigatório na Copa do Brasil) |
| 3.4 | Monte Carlo com a pontuação do bolão de clubes (5.4) e incerteza de parâmetro |
| 3.5 | Tela com intervalo e amostra visíveis; ligar `has_simulator` |

---

## 7. Parâmetros iniciais adotados

```
model_version      = clubs-2026-v1
snapshot_at        = 2026-07-31
beta               = 0,0361        (calibrado no Paulistão; recalibrar com as copas)
mu_H / mu_A        = 1,468 / 0,819 (idem)
kappa              = 12            (não 5 — ver 2.2)
half_life_days     = 60            (parâmetro pouco sensível)
rho                = 0             (Dixon-Coles desligado na v1 — ver 2.3)
xg                 = não usado
scenarios_default  = 20.000
incerteza          = lognormal, sigma = 0,35 / sqrt(kappa + soma dos pesos)
```

## 8. Testes mínimos (além dos do §19 da especificação)

- Clube que joga **exatamente** conforme o prior por N jogos mantém `Atk` inalterado.
  É o melhor teste de regressão do módulo de força inteiro.
- O ajuste conjunto converge e é invariante à escala (`Atk × c`, `Def ÷ c` é o mesmo modelo).
- `beta` fora de [0,005 ; 0,20] falha o build — protege contra reaproveitar `FIFA_BETA`.
- Soma da matriz de placares = 1 depois de truncar em 10×10 e renormalizar.
- Confronto de dois jogos: agregado nunca usa gol fora de casa.
- Pontuação: pódio por competição, sem 3º lugar; `pred_pen_winner` só na volta.

## 9. O que preciso de você

Uma chave da API-Football (plano gratuito serve para começar) em
`API_FOOTBALL_KEY`. Sem ela a Fase 1 não anda — mas a Fase 0 anda inteira, e é
onde está o trabalho de fundação.
