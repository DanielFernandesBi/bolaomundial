-- ============================================================================
-- 🔴 BLOQUEADOR: conceder pred_pen_winner ao role de cliente
-- ============================================================================
-- A migração 000006 endureceu predictions com privilégio POR COLUNA
-- (REVOKE INSERT/UPDATE + GRANT só nas colunas do palpite). Depois, a 000012
-- criou a coluna pred_pen_winner (pênaltis dos clubes) — mas ela NÃO foi incluída
-- nos GRANTs. Resultado: usuário comum não consegue INSERIR/ATUALIZAR o palpite
-- de volta dos clubes (o frontend manda pred_pen_winner no payload) → erro de
-- permissão ao salvar a volta.
--
-- Correção: conceder INSERT/UPDATE APENAS de pred_pen_winner (nada em points_*).
-- ============================================================================

GRANT INSERT (pred_pen_winner) ON public.predictions TO authenticated;
GRANT UPDATE (pred_pen_winner) ON public.predictions TO authenticated;

-- Verificação:
--   SELECT has_column_privilege('authenticated', 'public.predictions', 'pred_pen_winner', 'INSERT'); -- true
--   SELECT has_column_privilege('authenticated', 'public.predictions', 'pred_pen_winner', 'UPDATE'); -- true
