# Testes (pgTAP) das regras críticas

A lógica sensível (pontuação, pênaltis, agregado, pódio, prêmio, RLS) vive em
funções PL/pgSQL e triggers do Postgres — por isso os testes são **pgTAP**,
rodando contra o banco real com as migrações aplicadas.

## Como rodar

Requer o **Supabase CLI** + **Docker** (para o Postgres local):

```bash
supabase start        # sobe o Postgres local e aplica as migrações
npm test              # = supabase test db  (roda supabase/tests/*.test.sql)
```

Alternativa sem Docker: aplicar as migrações num **branch/cópia** do Supabase e
rodar os arquivos `*.test.sql` via `psql` (o banco precisa da extensão `pgtap`).

## O que já é coberto

- **`01_scoring_functions.test.sql`** — funções puras (rodam em qualquer Postgres com pgTAP):
  - `calculate_prediction_points` — 30 / 17 / 15 / 12 / empate 15 / 10 / 3 / 0
  - `calc_pen_winner_points` — pênaltis dos clubes (0 / 7)
  - `calc_pen_points` — pênaltis legado (0 / 5 / 10)
  - `calc_extra_points` — prorrogação (0 / 5)
  - `calc_podium_points_cv` — pódio por competição (40 / 25 / consolação 10)
  - `calc_podium_points` — pódio legado (40 / 20 / 25 / consolação 10)
- **`02_bracket_aggregate.test.sql`** — `tie_aggregate_tied`: empate, não‑empate,
  mandantes invertidos, pernas não finalizadas.
- **`03_bracket_flow.test.sql`** — fluxo de `advance_tie`/`ensure_tie_matches`:
  bracket fixo (2 vencedores → 1 QF com exatamente 1 ida + 1 volta, sem duplicar),
  barreira de sorteio (agregado empatado sem pênaltis não classifica), final `single`
  (1 jogo `single`, nunca volta; campeão gravado) e participante pendente (não cria jogo).

## Próxima camada (recomendado adicionar)

Estes precisam de fixtures de `auth.users` + `profiles` e/ou emulação de role
(`SET LOCAL ROLE authenticated` + `request.jwt.claims`), por isso ficaram como
TODO com esqueleto abaixo:

- **Motor de pontuação** (`process_match_finished`): lançar um jogo FINISHED e
  conferir `predictions.points_*` + `tournament_rankings.total_points`;
  re‑finalizar (idempotência via delta); **FINISHED → SCHEDULED** (reversão);
  **gate de pênaltis** (agregado 5×2 com vencedor preenchido ⇒ `points_pen = 0`;
  agregado empatado ⇒ 7).
- **Pódio real** por competição (`tournament_competition_results` ⇒ recálculo) e
  correção de pódio.
- **Prêmio** (`distribute_tournament_prizes`): empate completo ⇒ posição
  compartilhada e soma/divisão (ex.: 2 no topo ⇒ `(1º+2º)/2` cada).
- **Segurança (RLS/privilégios)**: usuário não altera `points_*` nem `is_admin`;
  palpite alheio invisível antes do início e visível depois; pódio travado após o prazo.

Esqueleto de teste com role/claims (para os itens de segurança):

```sql
BEGIN;
SELECT plan(1);
-- fixtures como postgres (bypassa RLS)...
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<uuid-do-usuario>","role":"authenticated"}';
SELECT throws_ok(
  $$ UPDATE public.profiles SET is_admin = true WHERE id = '<uuid-do-usuario>' $$,
  '42501',  -- insufficient_privilege / permission denied for column
  NULL,
  'usuário comum não consegue virar admin'
);
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
```
