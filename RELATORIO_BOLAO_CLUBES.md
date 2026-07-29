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
- **Pênaltis** (só na volta, quando o agregado empata): o palpite é **apenas o vencedor** (sem placar) → **+7** se acertar, **0** se errar (`calc_pen_winner_points`; colunas `matches.pen_winner` / `predictions.pred_pen_winner`).
- *(Mundial legado permanece por placar: 5 vencedor / 10 placar exato — o exato é 10 **totais**, não somados aos 5.)*

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

## 11. Correções pós‑auditoria

### 🔴 P0 — Escalada de privilégio via `profiles` (`20260728000005_secure_profiles_privileged_columns.sql`)
| Como estava | O que mudou |
|---|---|
| A policy de UPDATE de `profiles` só checava `auth.uid() = id`, e o role `authenticated` tinha `UPDATE` na tabela inteira. Como o RLS não compara `OLD`/`NEW`, **qualquer usuário podia gravar `is_admin = true` na própria linha** (e mexer em `total_money`/`total_points`/`exact_matches`) por uma requisição direta ao PostgREST — virando admin e passando por todas as policies administrativas. | Correção **no banco**, em duas camadas: **(1) privilégio por coluna** — `REVOKE UPDATE ON profiles FROM authenticated/anon/PUBLIC` e `GRANT UPDATE (username, avatar_url) TO authenticated` (as funções `SECURITY DEFINER` de pontuação/prêmios rodam como dono e não são afetadas); **(2) trigger `protect_profile_privileged_columns`** (defesa em profundidade) que bloqueia mudança de `is_admin`/`total_money`/`total_points`/`exact_matches` quando a chamada vem dos roles de cliente (`authenticated`/`anon`) e zera essas colunas num INSERT feito por cliente. |

Colunas que o usuário legitimamente edita (confirmado no código): `avatar_url` (`updateProfileAvatar`) e `username` (cadastro). Nada de frontend foi usado como proteção — o bloqueio é do banco. Observação: o tipo TS ainda expõe `is_admin` como gravável em `profiles.Update`, mas isso é cosmético (tipos gerados); a barreira real é o banco.

### 🔴 P0 — Adulteração de pontos e backdoors (`20260728000006_secure_predictions_and_functions.sql`)
| Como estava | O que mudou |
|---|---|
| **(2a)** A policy de UPDATE de `predictions` só checava `auth.uid() = user_id` e o role `authenticated` tinha UPDATE na tabela inteira. A trigger `check_prediction_window` libera o UPDATE quando os campos do palpite não mudam (para o sistema pontuar), mas **não distingue sistema de usuário** → o usuário podia gravar `points_earned/regular/extra/pen` na própria linha. O ranking lê `points_earned` direto. | **Privilégio por coluna**: `REVOKE INSERT/UPDATE ON predictions FROM cliente` + `GRANT` só nas colunas do palpite (`pred_home/away`, `pred_extra_result`, `pred_pen_home/away`, `user_id`, `match_id`) — **nunca `points_*`**. Trigger `protect_prediction_points` bloqueia mudança de pontos e zera no INSERT do cliente. |
| **(2b)** `recalculate_user_points` e `recompute_competition_podium` eram `SECURITY DEFINER` sem checagem de admin e **executáveis por anon/authenticated**. | **`REVOKE EXECUTE`** dessas funções dos roles de cliente (os triggers que as usam rodam como `SECURITY DEFINER` e não precisam do grant; o app não as chama). |
| **(2c)** `create_test_user` e `update_test_profile` (`SECURITY DEFINER`) estavam executáveis por cliente — criavam `auth.users` e gravavam pontos/`is_admin` em qualquer perfil, furando até a proteção anterior. | **Funções removidas** (`DROP`). Permanecem só nos arquivos `supabase_test_users*.sql` para ambiente de dev; **não recriar em produção**. |

Confirmado que o **único** `rpc` chamado pelo app é `distribute_tournament_prizes` (que tem checagem interna de admin) — por isso os REVOKE de EXECUTE acima não afetam o app.

### 🔒 Hardening — EXECUTE de funções por padrão (`20260728000007_harden_function_execute.sql`)
Generaliza o achado do item 2c/3 (funções de teste abertas). Como no Postgres toda função nasce com `EXECUTE` para `PUBLIC`, esta migração **revoga EXECUTE de PUBLIC/anon/authenticated em todas as funções do schema `public`** (exceto as de extensões), **reconcede** apenas `distribute_tournament_prizes` ao `authenticated` (a única chamada via `rpc`, com checagem interna de admin) e ajusta o **default** para funções futuras não concederem EXECUTE a `PUBLIC`. Triggers continuam funcionando (não exigem EXECUTE) e chamadas internas em funções `SECURITY DEFINER` rodam como o dono.

### 🔴 P0 — Palpites públicos antes do jogo (`20260728000008_rls_hide_predictions_before_kickoff.sql`)
| Como estava | O que mudou |
|---|---|
| A interface só mostrava os palpites de terceiros depois do início, mas `predictions` e `podium_predictions` tinham `SELECT USING (true)` e `anon` tinha SELECT — qualquer um lia **todos os palpites** direto pela Data API (anon key) antes dos jogos. O segredo do palpite não existia de fato. | A regra passa a ser **do banco (RLS)**: em `predictions`, o palpite de outro usuário só é visível quando a **partida** já começou (`match_date <= now()`) ou terminou; em `podium_predictions`, quando a **competição** já começou. O próprio usuário sempre vê o seu; **admin** vê tudo; **anon (não logado) não vê nada**. |

Compatível com as telas: "Próximas" lê só o próprio palpite; "Transparência" e "Encerradas" consultam jogos já iniciados/finalizados; "Desempenho" usa jogos finalizados. A trava de **alterar** o palpite após o início já existia (trigger `check_prediction_window`); agora o **esconder** até o início também é garantido no banco.

### 🔴 P0 — Pódio alterável após a trava (`20260728000009_podium_deadline_trigger.sql`)
| Como estava | O que mudou |
|---|---|
| A trava de prazo do palpite de pódio estava só no server action `savePodiumPrediction`. A RLS de `podium_predictions` só garantia `auth.uid() = user_id`, **sem trigger de prazo** — então via Data API o usuário podia inserir/alterar o palpite de pódio **depois do início** (até depois de saber o resultado real) e ser premiado quando o admin lançasse o campeão/vice. | Trigger **`check_podium_window`** (BEFORE INSERT/UPDATE) bloqueia gravar/alterar o palpite de pódio depois do 1º jogo da competição (mesma regra do server action; espelha o `check_prediction_window`). A outra ponta — `recompute_competition_podium` exposto — **já havia sido fechada** na `000007` (REVOKE EXECUTE dos clientes). |

### 🔴 P0 funcional — Pódio dos clubes zerado por UPDATE do torneio (`20260728000010_fix_podium_mechanisms_isolation.sql`)
| Como estava | O que mudou |
|---|---|
| Regressão introduzida na feature: coexistiam dois mecanismos gravando `tournament_rankings.podium_points`. O **legado** (`process_tournament_podium`, AFTER UPDATE em `tournaments`) percorria `podium_predictions` **sem filtrar `competition`** e usava `tournaments.champion_team/...`. Se rodasse no torneio de clubes (por divergência do `WHEN` em produção, ou por mexer nas colunas de pódio), recalculava com `champion_team = NULL` → `calc_podium_points = 0` → **zerava** o pódio somado das 3 competições (ex.: 115 → 0). | **Isolamento dos dois mecanismos**: `process_tournament_podium` passa a processar só picks **legados** (`competition IS NULL`) — no torneio de clubes o laço fica vazio e não toca em `podium_points`; a trigger é reafirmada com o `WHEN` correto (só dispara quando as colunas de pódio do torneio mudam), corrigindo divergência de prod; e, por simetria, `recompute_competition_podium` soma só picks **por competição** (`competition IS NOT NULL`). |

### ⚠️ Integridade — `NULL` não é único no pódio legado (`20260728000011_podium_legacy_unique_index.sql`)
| Como estava | O que mudou |
|---|---|
| A `000003` trocou `UNIQUE (user_id, tournament_id)` por `UNIQUE (user_id, tournament_id, competition)`. Como o pódio legado (Mundial) usa `competition = NULL` e `NULL` não é igual a `NULL` num UNIQUE comum, o banco passou a **aceitar múltiplos palpites de pódio do mesmo usuário no mesmo torneio** (o Mundial não tem duplicados, mas a garantia sumiu). | Adicionado **índice único parcial** `podium_predictions_legacy_uidx ON (user_id, tournament_id) WHERE competition IS NULL` — restaura "um pódio legado por usuário/torneio". O UNIQUE composto continua (necessário para o `onConflict` do upsert dos clubes, onde `competition` nunca é NULL). |

### ❌ Regressão — Pódio do Mundial sumiu do frontend (corrigido no código, sem migration)
| Como estava | O que mudou |
|---|---|
| Ao migrar o pódio para "por competição", `getPodiumData`/`getPodiumTransparency` passaram a **ignorar** partidas sem `competition` (`if (!m.competition) return;`). O Mundial legado tem `competition = NULL` em todos os jogos → **nenhum card de pódio nem transparência** na tela pública, embora banco/ranking/admin mantivessem o pódio. | O pódio agora tem **dois modos**: `competition` (clubes: campeão+vice por competição) e **`legacy`** (Mundial: campeão+vice+**3º**, resultado real em `tournaments.*`). Quando o torneio não tem partidas com `competition`, é montado um bloco legado único. `PodiumCard` renderiza 2 ou 3 slots conforme o modo; `PodiumTransparency` mostra o 3º quando aplicável; `savePodiumPrediction` aceita `competition` nulo (grava via select-then-write, já que `NULL` não casa no `onConflict` composto). Arquivos: `matches/actions.ts`, `components/podium-card.tsx`, `components/podium-transparency.tsx`, `matches/page.tsx`. |

### 🔧 Mudança de regra — Pênaltis dos clubes: só vencedor, +7 (`20260728000012_pen_winner_only_clubs.sql`)
| Como estava | O que mudou |
|---|---|
| Nos clubes, o palpite de pênaltis era **placar** (`pred_pen_home/away`) e pontuava como o Mundial (5 vencedor / 10 exato). | Decisão dos usuários: no bolão de clubes o palpite é **apenas o vencedor** dos pênaltis (sem placar), valendo **7** se acertar e **0** se errar. Novas colunas `predictions.pred_pen_winner` e `matches.pen_winner`; função `calc_pen_winner_points`; `process_match_finished` escolhe o modelo por `has_extra_time` (Mundial=placar 5/10; clubes=vencedor 7/0). Wizard, admin, transparência, detalhe de partida e `advanceBracket` passam a usar o vencedor nos clubes. O Mundial legado continua por placar, intocado. |

### 🔴 Coerência do motor de pontuação (`20260728000013_scoring_pen_gate_and_reopen_reversal.sql`)
| # | Como estava | O que mudou |
|---|---|---|
| 13 | O motor pontuava pênaltis sempre que houvesse resultado de pênalti, **sem verificar** se eles deveriam existir. Nos clubes, um 5×2 no agregado com o vencedor preenchido por engano concederia `points_pen`. A regra "só no empate de agregado" vivia só no `bracket.ts`. | Regra **centralizada** no banco: nova função `tie_aggregate_tied(tie_id)`; em `process_match_finished`, nos clubes (`has_extra_time=false`, `leg='volta'`, com confronto), os pontos de pênalti só valem se o **agregado empatar** — senão `points_pen = 0`. |
| 14 | Reabrir `FINISHED → SCHEDULED` **não revertia** os pontos (a trigger só somava ao finalizar). O jogo saía de "Encerradas" mas os pontos ficavam no ranking até (e se) fosse finalizado de novo. | `process_match_finished` ganhou um ramo de **reversão atômica**: ao sair de `FINISHED`, zera os pontos das predictions daquele jogo e desconta do `tournament_rankings` (e das cravadas), mantendo o ranking coerente no intervalo. |

### ⚠️ Ranking diário contava "cravada" errado (item 15 — código)
| Como estava | O que mudou |
|---|---|
| O ranking diário usava `isExact = points_earned >= 20`. Com a pontuação de mata‑mata isso conta falsas cravadas (17+5=22, 15+5=20 viram "cravada") e depende da soma. | Passou a usar **`points_regular === 30`** (placar exato do tempo normal). Mesma correção estendida aos contadores de cravada do **Perfil** e do **Desempenho** (que usavam `points_earned === 25 || === 20`). O `exact_matches` autoritativo no banco já estava certo (auditoria item 10). Arquivos: `ranking/actions.ts`, `profile/actions.ts`, `desempenho/actions.ts`. |

### ⚠️ Empates completos: posição compartilhada + prêmio dividido (item 16 — `20260728000014_prize_shared_positions.sql`)
| Como estava | O que mudou |
|---|---|
| `distribute_tournament_prizes` ordenava por `(total_points DESC, exact_matches DESC)` e dava 1º/2º/3º sem regra determinística para empates completos → a ordem dos empatados dependia do PostgreSQL. | Regra do usuário: em empate completo, **posição compartilhada**; quando envolve dinheiro, **soma‑se o prêmio das posições ocupadas pelo grupo e divide‑se pelo nº de empatados** (ex.: 2 no topo → cada um `(1º+2º)/2`; 3 no topo → `(1º+2º+3º)/3`; fora do pódio → 0). Implementado com `ROW_NUMBER`/janela por `(total_points, exact_matches)`. *(A exibição do ranking ainda numera sequencialmente — mostrar a posição compartilhada na tabela é um ajuste de UI opcional; o dinheiro já é justo/determinístico.)* |

---

## 12. Índice de arquivos

**Novos**
- `supabase/migrations/20260728000001_matches_competition_legs.sql`
- `supabase/migrations/20260728000002_create_ties_bracket.sql`
- `supabase/migrations/20260728000003_podium_per_competition.sql`
- `supabase/migrations/20260728000004_tournament_has_simulator.sql`
- `supabase/migrations/20260728000005_secure_profiles_privileged_columns.sql`
- `supabase/migrations/20260728000006_secure_predictions_and_functions.sql`
- `supabase/migrations/20260728000007_harden_function_execute.sql`
- `supabase/migrations/20260728000008_rls_hide_predictions_before_kickoff.sql`
- `supabase/migrations/20260728000009_podium_deadline_trigger.sql`
- `supabase/migrations/20260728000010_fix_podium_mechanisms_isolation.sql`
- `supabase/migrations/20260728000011_podium_legacy_unique_index.sql`
- `supabase/migrations/20260728000012_pen_winner_only_clubs.sql`
- `supabase/migrations/20260728000013_scoring_pen_gate_and_reopen_reversal.sql`
- `supabase/migrations/20260728000014_prize_shared_positions.sql`
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
