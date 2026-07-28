-- ============================================
-- BOLÃO: Prazo de palpites por PARTIDA
-- ============================================
-- Cada palpite é bloqueado a partir do início da PARTIDA específica
-- (m.match_date), para TODOS os usuários — inclusive admin.
--
-- IMPORTANTE: a trava deve barrar apenas mudanças no PALPITE em si
-- (pred_home, pred_away, pred_extra_result, pred_pen_home, pred_pen_away).
-- UPDATEs que tocam somente as colunas de pontos são feitos pelo trigger
-- de pontuação `process_match_finished` quando o admin lança o placar; se a
-- trava os bloqueasse, o lançamento de resultado estouraria
-- "A partida já começou. Palpites encerrados." e faria rollback da transação.

CREATE OR REPLACE FUNCTION public.check_prediction_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    match_start_time TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Em UPDATE, se nenhum campo do palpite mudou (apenas pontos/sistema), libera.
    IF TG_OP = 'UPDATE' THEN
        IF NEW.match_id          IS NOT DISTINCT FROM OLD.match_id
           AND NEW.pred_home         IS NOT DISTINCT FROM OLD.pred_home
           AND NEW.pred_away         IS NOT DISTINCT FROM OLD.pred_away
           AND NEW.pred_extra_result IS NOT DISTINCT FROM OLD.pred_extra_result
           AND NEW.pred_pen_home     IS NOT DISTINCT FROM OLD.pred_pen_home
           AND NEW.pred_pen_away     IS NOT DISTINCT FROM OLD.pred_pen_away
        THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Data de início da PARTIDA específica deste palpite
    SELECT match_date INTO match_start_time
    FROM public.matches
    WHERE id = NEW.match_id;

    -- Sem data conhecida (torneio/jogo sem data): permitir
    IF match_start_time IS NULL THEN
        RETURN NEW;
    END IF;

    -- Bloquear apenas se ESTA partida já começou (para todos, inclusive admin)
    IF NOW() > match_start_time THEN
        RAISE EXCEPTION 'A partida já começou. Palpites encerrados.';
    END IF;

    RETURN NEW;
END;
$function$;

-- Recriar a trigger (a função já foi substituída acima, mas garantimos que existe)
DROP TRIGGER IF EXISTS tr_check_prediction_window ON public.predictions;
CREATE TRIGGER tr_check_prediction_window
    BEFORE INSERT OR UPDATE ON public.predictions
    FOR EACH ROW
    EXECUTE FUNCTION check_prediction_window();

COMMENT ON FUNCTION public.check_prediction_window() IS
'Valida palpites: bloqueia INSERT/alteração do palpite após o início da PARTIDA específica (para todos). UPDATEs que só alteram colunas de pontos (sistema) passam, para não bloquear a pontuação ao lançar resultados.';
