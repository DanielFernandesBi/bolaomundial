-- ============================================================================
-- 🔴 P0 SEGURANÇA: impedir adulteração de pontos (predictions) e backdoors
-- ============================================================================
-- PROBLEMAS (auditoria):
--   (2a) A policy de UPDATE de predictions só checa (auth.uid() = user_id) e o role
--        `authenticated` tinha UPDATE na tabela inteira. A trigger check_prediction_window
--        libera UPDATE quando os campos do PALPITE não mudam (para o "sistema" pontuar),
--        mas NÃO distingue sistema de usuário → o usuário podia gravar direto
--        points_earned/points_regular/points_extra/points_pen na própria linha.
--        O ranking lê predictions.points_earned e recalculate_user_points soma isso.
--   (2b) recalculate_user_points e recompute_competition_podium são SECURITY DEFINER,
--        sem checagem de admin, e estavam executáveis por anon/authenticated.
--   (2c) create_test_user / update_test_profile são SECURITY DEFINER e executáveis por
--        cliente — backdoor que cria auth.users e grava pontos/is_admin em QUALQUER perfil,
--        furando inclusive a proteção do item 1.
--
-- Correção NO BANCO. Escritas do sistema (process_match_finished etc.) são SECURITY
-- DEFINER e rodam como o dono → não são afetadas por REVOKE de coluna/EXECUTE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (A) predictions: privilégio por coluna — usuário só grava o PALPITE
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE ON public.predictions FROM PUBLIC;
REVOKE INSERT, UPDATE ON public.predictions FROM anon;
REVOKE INSERT, UPDATE ON public.predictions FROM authenticated;

-- Colunas do palpite (nunca points_*). user_id/match_id entram porque o upsert do
-- savePrediction os inclui no SET; o RLS (auth.uid() = user_id) impede uso cruzado.
GRANT INSERT (user_id, match_id, pred_home, pred_away, pred_extra_result, pred_pen_home, pred_pen_away)
  ON public.predictions TO authenticated;
GRANT UPDATE (user_id, match_id, pred_home, pred_away, pred_extra_result, pred_pen_home, pred_pen_away)
  ON public.predictions TO authenticated;
-- SELECT e DELETE permanecem como estavam.

-- ---------------------------------------------------------------------------
-- (B) Trigger de defesa em profundidade nos pontos do palpite
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_prediction_points()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        IF TG_OP = 'INSERT' THEN
            NEW.points_earned  := 0;
            NEW.points_regular := 0;
            NEW.points_extra   := 0;
            NEW.points_pen     := 0;
        ELSIF TG_OP = 'UPDATE' THEN
            IF NEW.points_earned  IS DISTINCT FROM OLD.points_earned
            OR NEW.points_regular IS DISTINCT FROM OLD.points_regular
            OR NEW.points_extra   IS DISTINCT FROM OLD.points_extra
            OR NEW.points_pen     IS DISTINCT FROM OLD.points_pen THEN
                RAISE EXCEPTION 'Alteração de pontos do palpite não é permitida.';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_protect_prediction_points ON public.predictions;
CREATE TRIGGER trigger_protect_prediction_points
    BEFORE INSERT OR UPDATE ON public.predictions
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_prediction_points();

-- ---------------------------------------------------------------------------
-- (C) Revogar EXECUTE das funções de manutenção (não são chamadas pelo app;
--     os triggers que as usam rodam como SECURITY DEFINER e não precisam do GRANT)
-- ---------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('recalculate_user_points', 'recompute_competition_podium')
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- (D) Remover backdoors de teste (SECURITY DEFINER executáveis por cliente).
--     NÃO recriar em produção. Ficam nos arquivos supabase_test_users*.sql
--     apenas para ambientes de desenvolvimento.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('create_test_user', 'update_test_profile')
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
    END LOOP;
END $$;

COMMENT ON FUNCTION public.protect_prediction_points IS
  'P0: impede que usuários (authenticated/anon) alterem points_earned/regular/extra/pen; process_match_finished (SECURITY DEFINER) passa.';

-- ---------------------------------------------------------------------------
-- Verificação (como usuário comum, deve FALHAR):
--   UPDATE public.predictions SET points_earned = 999 WHERE user_id = auth.uid();
--   SELECT public.recalculate_user_points(auth.uid(), 1);   -- permission denied
-- ---------------------------------------------------------------------------
