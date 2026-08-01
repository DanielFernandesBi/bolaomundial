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

Este ambiente tem política de rede por lista de permissão: `api.github.com` e
`pypi.org` respondem, `api.sportmonks.com`, `api-football.com` e
`v3.football.api-sports.io` são negados no CONNECT. **Nenhuma chamada às APIs de
futebol pôde ser feita daqui.** Tudo abaixo vem de pesquisa e do PDF de cobertura
anexado, e o que depende de chave está marcado como pendente de confirmação.

### 4.0. Sportmonks (Enterprise) cobre 30 de 30 — e resolve o risco que sobrava

O PDF `Football Enterprise plan leagues and features` foi conferido inteiro
(29 páginas, 1.815 competições). Todas as competições que o modelo precisa estão
lá, **inclusive os estaduais brasileiros**, que eram o risco em aberto da
API-Football:

| ID | Competição | features |
|---:|---|---:|
| 1122 | Copa Libertadores | 11 |
| 1116 | Copa Sudamericana | 8 |
| 654 | Copa do Brasil | 8 |
| 648 / 651 | Brasil Série A / Série B | 11 / 11 |
| 657 / 660 | Brasil Série C / Série D | 9 / 9 |
| 636 / 645 / 642 | Argentina Superliga / Primera B Nacional / Copa Argentina | 11 / 10 / 7 |
| 663 | Chile Primera División | 11 |
| 672 | Colômbia Liga BetPlay | 10 |
| 696 | Equador Liga Pro | 10 |
| 764 | Peru Primera División | 11 |
| 770 | Uruguai Primera División | 10 |
| **755** | **Paraguai Division 1** | 10 |
| 1098 | Bolívia Liga de Fútbol Prof | 10 |
| 800 | Venezuela Primera División | 9 |
| 1313 / 1296 / 1307 / 1302 | Paulista A1 / Carioca 1 / Mineiro 1 / Gaúcho 1 | 10 / 9 / 10 / 10 |
| 1299 / 1300 / 1291 / 1316 | Catarinense / Cearense / Baiano / Pernambucano 1 | 9 / 9 / 9 / 9 |
| 1311 / 1304 | Paranaense 1 / Goiano 1 | 9 / 9 |
| 1294 / 1386 | Copa do Nordeste / Copa Verde | 7 / 6 |

Atenção: `Division Intermedia` (761) é a **segunda** divisão paraguaia. O top
paraguaio — onde jogam Cerro Porteño, Olimpia e Recoleta — é o **755**.

Todas marcam `Historical data`, o que resolve o problema de origem dos dados de
calibração (`beta`, `rho`, `mu_c` por competição), que na API-Football dependia
do limite de temporadas do plano.

**CONFERIDO — e a resposta é não.** O token existente é de **Football Free
Plan**. `/v3/football/leagues` devolve exatamente quatro ligas:

```
271   Superliga (Dinamarca)          501   Premiership (Escócia)
1659  Superliga Play-offs            513   Premiership Play-Offs
```

Nenhuma competição sul-americana. O PDF descreve o plano **Enterprise**, que é
material comercial, não o que a conta enxerga. O limite de 3.000 req/hora é
generoso, mas irrelevante sem as ligas.

**Sportmonks fica fora**, a menos que se contrate o Enterprise — cotado sob
consulta e de outra ordem de grandeza que os US$ 19/mês do plano Pro da
API-Football. Para um bolão de sete pessoas, não se justifica.

### 4.1. Alternativa: API-Football — os limites do plano gratuito

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

### 4.4. Veredito sobre a API — decidido

**API-Football, plano gratuito, consultando por data.** A Sportmonks saiu por
falta de cobertura no plano que temos (4.0), e o plano dela que cobriria custa
outra ordem de grandeza.

Risco residual assumido: não foi possível confirmar de fonte primária se a
API-Football cobre os estaduais brasileiros. Se não cobrir, o impacto é pequeno
— é a competição de menor peso (0,60) e a de maior rotação de elenco, ou seja, a
que mais contamina a estimativa — e só afeta janeiro a abril, fora da janela do
bolão.

`club_fixtures` nasce com coluna `provider` e o cliente fica atrás de uma
interface. Trocar de fornecedor depois é trocar um arquivo, não refazer o
sistema.

---

## 4.7. O que o plano gratuito da API-Football realmente permite (medido)

Conferido em 01/08/2026 com chave real, chamando a API de dentro do banco.
A conta responde `{"plan":"Free","limit_day":100}`.

**Duas travas que a documentação não deixa óbvias:**

1. **Temporada.** Qualquer consulta com `?season=` responde
   `"Free plans do not have access to this season, try from 2022 to 2024"`.
   Isso derruba `/teams?league=13&season=2026` e `/fixtures?league=73&season=2026`
   — ou seja, todo o caminho "descobrir os times da competição" e "puxar a
   tabela da competição".
2. **Data.** `/fixtures?date=` funciona **sem** trava de temporada, mas só
   dentro de uma janela de ~3 dias: `"try from 2026-07-31 to 2026-08-02"`.

**Consequência prática:** consultar por data não era só a opção mais econômica
— é a **única que funciona** no plano gratuito. E a arquitetura fica assim:

| | |
|---|---|
| custo por sincronização | 1 chamada (o dia inteiro do mundo, ~500–1.000 jogos) |
| rotina | 2×/dia, sempre reprocessando ontem = 4 chamadas/dia |
| folga | 96 chamadas/dia sobrando |
| backfill | **não existe** — dia fora da janela está perdido para sempre |

**O que os US$ 19/mês do plano Pro comprariam**, se um dia se justificar:

- histórico de verdade, para recalibrar `beta`, `rho` e `mu_c` sobre Libertadores
  e Copa do Brasil em vez do Paulistão (que tem lookahead e rotação de elenco);
- jogos futuros, para a página de resultados também mostrar a agenda;
- resiliência: hoje, dois dias de cron parado significam dados perdidos que não
  se recuperam.

Nenhum dos três é bloqueante agora. O primeiro é o que mais valeria.

### 4.5. Onde roda o cron

O plano Hobby da Vercel limita cron a execução diária. Duas sincronizações/dia
exigem plano Pro **ou** `pg_cron` + `pg_net` no próprio Supabase. Recomendo o
Supabase: já é nossa infraestrutura, não custa nada a mais, e mantém a chave
fora da Vercel.

### 4.6. A chave

A chave **nunca** entra no repositório, em `.env` versionado, em migração, em
comentário de código ou em documento. Vive só como variável de ambiente do
Supabase (Vault/secrets) e, se necessário, da Vercel — e é lida apenas em
código de servidor.

Uma chave que já circulou por canal de texto deve ser considerada comprometida e
**rotacionada** no painel do fornecedor. A rotação é gratuita e instantânea; a
chave nova é que vai para o Vault.

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

### Fase 0 — sem dependência externa — **CONCLUÍDA**

| # | Entrega | Estado |
|---|---|---|
| 0.1 | `opta_snapshots` + `opta_club_ratings`, com RLS fechada | feito — **403 clubes**, conferidos por checksum contra o CSV |
| 0.2 | `club_source_ids`: 50 clubes, 40 do bolão, mapeados ao Opta um a um | feito |
| 0.3 | `club_aliases` + `club_key_normalize()` + `club_resolve()` | feito — 58 apelidos, 0 colisões |
| 0.4 | `lib/club-model/`: prior, decaimento, pesos, ajuste conjunto, Poisson, Dixon-Coles | feito |
| 0.5 | Backtest e invariâncias contra os 72 jogos do Paulistão | feito — 18 verificações passando |
| 0.6 | `scripts/club-model/import-opta-snapshot.ts` (import completo, idempotente) | feito — para carregar o snapshot inteiro quando houver service role key |

Nada disso toca no app em produção. `has_simulator` do bolão de clubes continua
`false`, e as quatro tabelas novas não são lidas por nenhuma tela.

**Verificações que passaram a valer como teste de regressão:**

- todo nome que existe em `matches` resolve para um clube canônico — 41 nomes do
  bolão de clubes e 17 do Paulistão, **0 sem correspondência**;
- os 41 nomes do bolão viram **40 clubes**: a duplicata Vasco/Vasco da Gama
  deixou de existir;
- clube que joga exatamente conforme o prior não muda de força (pega erro de
  sinal, de escala e de normalização de uma vez);
- clube sem jogos mantém o prior exato; clube na média tem ataque e defesa 1,0;
- matriz de placares soma 1 mesmo com `rho` absurdo (grampeado à faixa válida);
- o parser do CSV do Opta lê as 13.789 linhas com 20 colunas cada, **inclusive
  as 28 com vírgula dentro de aspas** — um `split(',')` teria corrompido essas
  linhas em silêncio.

**Duas correções ao que estava escrito aqui antes:**

1. `beta` reajustado em TypeScript, independente do ajuste em Python: **0,0370**,
   IC95% [0,0160 ; 0,0585]. A constante do código (0,0361) está dentro do
   intervalo, e as duas implementações concordam.
2. O backtest **não consegue medir o valor do ajuste dinâmico**, e isso não tem
   conserto com o dado que temos: o snapshot é de 31/07 e o Paulistão foi em
   janeiro–março, então o rating já incorpora aqueles jogos. Somá-los de novo é
   a dupla contagem que o §2.1 da especificação manda evitar. O que o backtest
   mede, e isso vale: `kappa` baixo degrada rápido (de 20 para 2 são 3 pontos
   percentuais de log-verossimilhança), e o motor não diverge com dado real. O
   ótimo nesta amostra é `kappa = 20`; como o viés de lookahead infla o valor do
   prior, o ótimo verdadeiro deve ser menor. **`kappa = 12` fica como meio-termo
   defensável, para recalibrar na Fase 1.**

### Fase 1 — coleta — **CONCLUÍDA**

| # | Entrega | Estado |
|---|---|---|
| 1.0 | Fornecedor fixado: API-Football (Sportmonks recusada por cobertura) | feito |
| 1.1 | Chave no Vault do Supabase, cifrada, fora do repositório | feito |
| 1.2 | Cobertura conferida: Libertadores 13, Sul-Americana 11, Copa do Brasil 73, todas as primeiras divisões e **todos os estaduais** | feito |
| 1.3 | `club_fixtures` + `api_football_get()` + `sync_club_fixtures(data)` | feito |
| 1.4 | Backfill histórico | **impossível no plano gratuito** — ver 4.7 |
| 1.5 | Cron 2×/dia via `pg_cron`, com log e tolerância a dia recusado | feito |
| 1.6 | Mapa de clubes ampliado de 50 para 384, sem chutar nomes ambíguos | feito |

O risco que estava em aberto — estaduais possivelmente não cobertos — **não se
confirmou**: Paulista A1, Carioca, Mineiro, Gaúcho, Catarinense, Paranaense,
Baiano, Pernambucano, Cearense e Goiano estão todos lá, temporada 2026.

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

1. **Criar uma conta gratuita na API-Football** (dashboard.api-football.com) e
   guardar a chave. É o único bloqueio da Fase 1 — não consigo criar conta em
   seu nome, e a política de rede deste ambiente nega conexão às APIs de
   futebol, então nem para testar a chave eu chego lá.
2. **Rotacionar o token da Sportmonks**, que circulou por canal de texto. Ele
   não serve mais para o projeto, mas continua sendo credencial da sua conta.
3. A chave da API-Football vai para o Vault do Supabase, nunca para arquivo do
   repositório.

A Fase 0 está concluída e não dependia de nada disso.
