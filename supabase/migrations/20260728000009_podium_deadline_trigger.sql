-- ============================================================================
-- 🔴 P0: trava de prazo do palpite de PÓDIO no banco (não só no server action)
-- ============================================================================
-- PROBLEMA (auditoria item 5): savePodiumPrediction checa o prazo (1º jogo da
-- competição) só no server action. A RLS de podium_predictions só garante
-- (auth.uid() = user_id), sem trava de tempo. Logo, via Data API direta o usuário
-- podia INSERIR/ATUALIZAR o palpite de pódio DEPOIS do início — inclusive depois de
-- conhecer o resultado real — e, quando o admin lançasse o campeão/vice, o trigger
-- de recálculo premiaria o palpite adulterado.
--
-- (A outra ponta — recompute_competition_podium exposto — já foi fechada na
--  migração 000007, que revogou o EXECUTE dessa função dos roles de cliente.)
--
-- CORREÇÃO: trigger BEFORE INSERT/UPDATE que bloqueia a gravação depois do 1º jogo
-- da competição (competition NULL = 1º jogo do torneio, p/ o Mundial). Espelha a
-- regra de savePodiumPrediction e o padrão do check_prediction_window.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_podium_window()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    first_start TIMESTAMPTZ;
BEGIN
    -- Enforce apenas para os roles de cliente; correções via SQL Editor (postgres)
    -- ou service_role passam.
    IF current_user IN ('authenticated', 'anon') THEN
        SELECT MIN(m.match_date) INTO first_start
        FROM public.matches m
        WHERE m.tournament_id = NEW.tournament_id
          AND (NEW.competition IS NULL OR m.competition = NEW.competition)
          AND m.match_date IS NOT NULL;

        IF first_start IS NOT NULL AND now() > first_start THEN
            RAISE EXCEPTION 'O prazo do palpite de pódio desta competição já encerrou.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_podium_window ON public.podium_predictions;
CREATE TRIGGER trigger_check_podium_window
    BEFORE INSERT OR UPDATE ON public.podium_predictions
    FOR EACH ROW
    EXECUTE FUNCTION public.check_podium_window();

COMMENT ON FUNCTION public.check_podium_window IS
  'P0: bloqueia gravar/alterar palpite de pódio após o 1º jogo da competição (para roles de cliente).';

-- ---------------------------------------------------------------------------
-- Verificação (como usuário comum, após o 1º jogo da competição, deve FALHAR):
--   UPDATE public.podium_predictions SET champion_team = 'X'
--   WHERE user_id = auth.uid() AND competition = 'libertadores';
-- ---------------------------------------------------------------------------
