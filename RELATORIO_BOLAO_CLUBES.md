# Relatório de Alterações — Bolão Mata‑Mata de Clubes 2026

> Documento de auditoria. Descreve as **ideias/necessidades novas**, **como o sistema estava antes** e **o que foi criado ou alterado**. Referência de commit inicial da feature: primeiro commit do repositório.
> Data: 2026‑07‑28.

---

## 1. Contexto e objetivo

O sistema (Next.js + Supabase) já rodava um bolão de mata‑mata do **Mundial de seleções**. A necessidade nova é um bolão diferente:

- Cobrir a **fase de mata‑mata (das oitavas em diante) de 3 competições de clubes**: **Copa do Brasil, CONMEBOL Sul‑Americana e CONMEBOL Libertadores**.
- Jogos majoritariamente de **ida e volta**.
- Se o **placar agregado** empatar → vai **direto aos pênaltis** (essas competições **não têm gol qualificado / gol fora de casa**).
- **Não há prorrogação.**

### Decisões tomadas com o usuário
1. **Bolão unificado**: 1 torneio, 1 ranking, 1 prêmio, com as 3 competições dentro.
2. Jogos **agrupados por competição** na tela.
3. **Pódio por competição**: campeão + vice de cada uma (não há 3º lugar nessas competições). Pontuação: **campeão 40, vice 25, consolação 10** (consolação = acertou o time no pódio, mas com a posição trocada).
4. **Pênaltis anexados ao jogo da volta** (ida = placar simples).
5. **Auto‑progressão do chaveamento** (ideia adicional do usuário): como as chaves já estão definidas, pré‑cadastrar o esqueleto e o sistema:
   - ao finalizar a **volta**, calcula quem passou (agregado; empate → pênaltis da volta);
   - quando os dois confrontos que alimentam a próxima fase terminam, **lança automaticamente** os jogos seguintes;
   - na final, define **campeão/vice** automaticamente.
6. **Simulador**: é específico do Mundial → apenas **escondido** neste bolão (adaptação fica para depois).
7. Pontuação de jogos **15/10** (empate seco / vitória seca) **já estava aplicada** em produção → sem migração de valores.

---

## 2. Banco de dados (migrations novas)

Todas aditivas e seguras; **não alteram torneios antigos**. Arquivos em `supabase/migrations/`.

### `20260728000001_matches_competition_legs.sql`
| Como estava | O que mudou |
|---|---|
| `matches` não tinha noção de competição nem de perna. `match_date` era `NOT NULL`. Mata‑mata (`is_knockout`) sempre implicava prorrogação **e** pênaltis. | Adicionadas colunas: **`competition`** (`copa_do_brasil`/`sudamericana`/`libertadores`), **`has_extra_time`** (default `true`; `false` = sem prorrogação), **`leg`** (`ida`/`volta`). **`match_date` passou a ser nullable** (`NULL` = "data a definir"). |

### `20260728000002_create_ties_bracket.sql`
| Como estava | O que mudou |
|---|---|
| Não existia o conceito de **confronto** — só "jogos" soltos. | Criada a tabela **`ties`** (confronto = ida + volta): `competition`, `round` (oitavas/quartas/semi/final), `slot`, `team_a/b`, `ida_match_id`, `volta_match_id`, `winner_*`, `decided_by` (aggregate/penalties) e, para a auto‑progressão, **`next_tie_id` + `next_slot_side`**. Adicionada **`matches.tie_id`**. RLS: leitura pública, escrita só admin. |

### `20260728000003_podium_per_competition.sql`
| Como estava | O que mudou |
|---|---|
| `podium_predictions` era **1 por torneio** (campeão/vice/**3º**), unicidade `(user, torneio)`. Pódio real morava em colunas de `tournaments`. Pontuação: `calc_podium_points` (campeão 40 / vice 20 / 3º 25 / consolação 10). | `podium_predictions` ganhou **`competition`**; unicidade virou **`(user, torneio, competição)`**. Nova tabela **`tournament_competition_results`** (campeão/vice real por competição). Nova função **`calc_podium_points_cv`** (campeão **40**, vice **25**, consolação **10**, sem 3º). Função **`recompute_competition_podium(torneio)`** soma o pódio das 3 competições em `tournament_rankings.podium_points` (idempotente), disparada por **trigger** ao lançar/alterar o resultado real de uma competição. O pódio do Mundial (função/trigger antigos) ficou intacto. |

### `20260728000004_tournament_has_simulator.sql`
| Como estava | O que mudou |
|---|---|
| O link do **Simulador** aparecia em **todo** torneio, embora o motor seja específico do Mundial. | Adicionada **`tournaments.has_simulator`** (default `false`); `mundial-mata-mata-2026` marcado `true`. O simulador passa a ser opt‑in por torneio. |

---

## 3. Regras de pontuação (referência de auditoria)

**Não mudaram** as 7 categorias do tempo normal (já em produção): placar exato **30**; vencedor+gols do vencedor **17**; vencedor+saldo **15**; vencedor+gols do perdedor **12**; empate seco **15**; vitória seca **10**; consolação (1 placar avulso) **3**.

**Mata‑mata (clubes):**
- **Prorrogação**: não existe (não coletada nem pontuada).
- **Pênaltis** (só na volta, quando o agregado empata): acertar vencedor **+5**; placar exato dos pênaltis **+10**. Reaproveita `calc_pen_points`.

**Pódio por competição** (`calc_podium_points_cv`):
- Campeão exato **40**; vice exato **25**; **consolação 10** (acertou o time, mas trocou campeão↔vice). Acerto exato tem prioridade sobre a consolação.
- Total do pódio do jogador = soma das 3 competições, guardado em `tournament_rankings.podium_points` e somado ao `total_points` (ranking único).

---

## 4. Lógica de auto‑progressão (`lib/bracket.ts` — arquivo novo)

Como não existia nada disso antes, é **100% novo**. Roda no **server action** de admin (não é trigger de banco), quando o admin finaliza um jogo:

1. `advanceBracketForMatch(matchId)` → acha o `tie` do jogo → `advanceTie(tie)`.
2. Se as **duas pernas** estão finalizadas com placar:
   - calcula o **agregado por nome** de cada time (robusto à ordem mandante/visitante);
   - agregado diferente → vencedor; **empate → pênaltis da volta** (se não houver placar de pênaltis com vencedor, retorna aviso e **não avança**);
   - grava `winner_*` e `decided_by` no confronto.
3. Se é a **final** → grava campeão/vice em `tournament_competition_results` (dispara a pontuação do pódio).
4. Senão → coloca o vencedor no `next_tie` (lado a/b) e, quando o próximo confronto fica com os **dois** times, **cria a ida e a volta** dele (`match_date` NULL = "data a definir"; ida `is_knockout=false`, volta `is_knockout=true`, ambos `has_extra_time=false`).

As mensagens ("avançou — próxima fase gerada", "preencha os pênaltis para desempatar") voltam ao admin no toast.

---

## 5. Backend (server actions) — antes/depois

### `app/[tournament]/matches/actions.ts`
| Como estava | O que mudou |
|---|---|
| `savePrediction` bloqueava por `new Date(match.match_date)` — quebraria com data nula. | Passou a **ignorar a trava quando `match_date` é NULL** (palpite aberto até haver data). |
| Pódio era **1 por torneio** com 3º lugar (`getPodiumData`/`savePodiumPrediction`/`getPodiumTransparency`). | Reescritos **por competição**: `getPodiumData` retorna um bloco por competição (times, trava por 1º jogo da competição, palpite do usuário, resultado real); `savePodiumPrediction(slug, competition, {campeão, vice})`; `getPodiumTransparency` agrupa por competição. |

### `app/[tournament]/admin/actions.ts`
| Como estava | O que mudou |
|---|---|
| `updateMatchScore` só gravava o placar. | Ao finalizar, chama **`advanceBracketForMatch`** e retorna `bracketWarning`/`bracketInfo`. |
| `createMatch`/`updateMatch` não conheciam competição/perna/prorrogação; data era obrigatória. | Aceitam **`competition`, `leg`, `hasExtraTime`** e **data opcional** (vazia → "a definir"). |
| Pódio real só existia para o Mundial (`setTournamentPodium`). | Adicionados **`getAdminCompetitionResults`** e **`setTournamentCompetitionResult`** (lançar/corrigir campeão‑vice por competição). |

---

## 6. Frontend — antes/depois

| Arquivo | Como estava | O que mudou |
|---|---|---|
| `components/match-card.tsx` | Wizard fixo de **3 passos** (normal → prorrogação → pênaltis). `isLocked` quebrava com data nula. | Wizard **dinâmico**: **2 passos** (normal → pênaltis) quando `has_extra_time=false`; ida sem wizard (placar simples). Trava **null‑safe** e **badge "data e horário a definir"**. |
| `app/[tournament]/matches/page.tsx` | Lista única de jogos; **1** card de pódio. | Jogos **agrupados por competição** (seções) nas abas Próximas/Transparência/Encerradas; **um card de pódio por competição**; aba Pódio com blocos por competição. Jogos "a definir" entram nas Próximas. |
| `components/podium-card.tsx` | Campeão/vice/**3º** de um torneio. | **Campeão + vice** de **uma competição** (recebe `competitionKey`/`competitionName`). |
| `components/podium-transparency.tsx` | Lista única (campeão/vice/3º). | **Agrupada por competição** (campeão/vice). |
| `components/navbar.tsx` | Link do Simulador sempre visível. | Usa `getTournamentNavInfo` e **esconde o Simulador** quando `has_simulator=false`. |
| `app/actions/tournament.ts` | Só `getTournamentName`. | Adicionado **`getTournamentNavInfo`** (nome + `hasSimulator`). |

---

## 7. Admin — antes/depois

| Arquivo | Como estava | O que mudou |
|---|---|---|
| `app/[tournament]/admin/admin-matches-table.tsx` | Lançamento de mata‑mata sempre mostrava **prorrogação + pênaltis**. Data assumida não‑nula. | Esconde a **prorrogação** quando `has_extra_time=false` (só pênaltis na volta). Mostra **mensagens da auto‑progressão** no toast. Data nula vira "⚠ Data a definir". |
| `create-match-dialog.tsx` / `edit-match-dialog.tsx` | Campos: times, escudos, data (obrigatória), fase, mata‑mata. | Adicionados **competição**, **perna (ida/volta)**, **"tem prorrogação"** e **data opcional**. |
| `app/[tournament]/admin/page.tsx` | Mostrava o pódio antigo (Mundial) quando knockout. | Mostra **`CompetitionResultsEntry`** (novo) quando o torneio tem competições; mantém o pódio antigo só para o Mundial. |
| `competition-results-entry.tsx` | — | **Novo**: lançar/corrigir campeão‑vice por competição (fallback do que a auto‑progressão já faz). |

---

## 8. Seed — `supabase_seed_mata_mata_clubes_2026.sql` (novo)

Cria o torneio unificado `mata-mata-clubes-2026` (`format='knockout'`, `has_simulator=false`) e uma função **`seed_knockout_competition(tid, competition, jsonb_8_confrontos)`** que monta **todo o esqueleto** de uma competição (quartas/semi/final vazias já ligadas + oitavas com times + 16 jogos ida/volta). Você chama 1× por competição preenchendo os 8 confrontos das oitavas (o arquivo traz um exemplo da Libertadores para substituir). As fases seguintes nascem sozinhas via auto‑progressão.

---

## 9. Infra / Git

- Projeto **não era** repositório git. Foi inicializado, com **`.gitignore` corrigido** (antes só tinha `.vercel`) para excluir `node_modules`, `.next`, **`.env.local`** (chaves do Supabase) e artefatos de build.
- Commit inicial: **133 arquivos**, **sem segredos** (verificado). Enviado para `https://github.com/DanielFernandesBi/bolaomundial`.

---

## 10. Limitações conhecidas e pendências

- **Correção que inverte o classificado após a próxima fase já criada:** o `advanceBracket` só cria os jogos seguintes se ainda não existirem, então os jogos já gerados ficam com o time antigo → ajuste manual (dá para automatizar um "desfazer" depois).
- **Simulador** não foi adaptado para clubes (só escondido) — decisão de deixar para depois.
- **Aplicar no Supabase:** as 4 migrations e o seed (com os sorteios reais) ainda precisam ser executados no banco.
- Tipagem: o projeto compila com `ignoreBuildErrors: true` (baseline pré‑existente); a validação usada é `next build`, que **passou**.

---

## 11. Índice de arquivos

**Novos**
- `supabase/migrations/20260728000001_matches_competition_legs.sql`
- `supabase/migrations/20260728000002_create_ties_bracket.sql`
- `supabase/migrations/20260728000003_podium_per_competition.sql`
- `supabase/migrations/20260728000004_tournament_has_simulator.sql`
- `supabase_seed_mata_mata_clubes_2026.sql`
- `lib/competitions.ts`
- `lib/bracket.ts`
- `app/[tournament]/admin/competition-results-entry.tsx`
- `RELATORIO_BOLAO_CLUBES.md` (este arquivo)

**Alterados**
- `app/[tournament]/matches/actions.ts`
- `app/[tournament]/admin/actions.ts`
- `app/[tournament]/matches/page.tsx`
- `app/[tournament]/admin/page.tsx`
- `app/[tournament]/admin/admin-matches-table.tsx`
- `app/[tournament]/admin/create-match-dialog.tsx`
- `app/[tournament]/admin/edit-match-dialog.tsx`
- `app/actions/tournament.ts`
- `components/match-card.tsx`
- `components/podium-card.tsx`
- `components/podium-transparency.tsx`
- `components/navbar.tsx`
- `.gitignore`
