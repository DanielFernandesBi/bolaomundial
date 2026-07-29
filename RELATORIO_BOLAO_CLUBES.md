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
