-- ============================================================================
-- ⚠️ INTEGRIDADE: unicidade do pódio legado (competition NULL)
-- ============================================================================
-- PROBLEMA (auditoria item 7): a migração 000003 trocou
--   UNIQUE (user_id, tournament_id)  ->  UNIQUE (user_id, tournament_id, competition)
-- Em UNIQUE comum, NULLs são considerados distintos entre si. Como o pódio legado
-- (Mundial) usa competition = NULL, o banco passou a aceitar conceitualmente vários
-- palpites de pódio do MESMO usuário no MESMO torneio (todos com competition NULL).
-- O Mundial atual não tem duplicados, mas a garantia anterior sumiu.
--
-- CORREÇÃO: índice único PARCIAL para competition IS NULL — restaura "um pódio legado
-- por (usuário, torneio)". O UNIQUE composto continua existindo (é necessário para o
-- onConflict do upsert dos clubes, onde competition NUNCA é NULL). Assim:
--   • clubes (competition NOT NULL)  → coberto pelo UNIQUE composto;
--   • legado (competition NULL)      → coberto por este índice parcial.
-- (Alternativa seria UNIQUE ... NULLS NOT DISTINCT, mas depende de PostgreSQL 15+ e
--  exigiria recriar a constraint usada pelo upsert.)
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS podium_predictions_legacy_uidx
    ON public.podium_predictions (user_id, tournament_id)
    WHERE competition IS NULL;

COMMENT ON INDEX public.podium_predictions_legacy_uidx IS
  'Unicidade do pódio legado (competition IS NULL): um palpite por usuário/torneio, já que NULL não é único no UNIQUE composto.';

-- Observação: se este CREATE falhar por já existirem duplicados de competition NULL,
-- é sinal de dado inconsistente — dedupe manual antes de recriar o índice.
