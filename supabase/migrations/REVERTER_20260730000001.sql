-- ============================================================================
-- REVERSÃO da migração 20260730000001 (trava por competição + fase)
-- ============================================================================
-- NÃO é uma migração: é o plano de fuga. Rodar SÓ se a trava por fase precisar
-- ser desfeita. Restaura `check_prediction_window` exatamente como estava em
-- produção antes da aplicação (capturado com pg_get_functiondef em 30/07/2026,
-- logo antes de aplicar).
--
-- ATENÇÃO: esta versão antiga contém o furo do pred_pen_winner — a comparação de
-- "nada mudou" não inclui essa coluna, então dá para trocar o vencedor dos
-- pênaltis depois do jogo começar. Se precisar reverter a REGRA DE PRAZO mas
-- quiser manter o furo fechado, acrescente a linha marcada abaixo.
--
-- As funções prediction_deadline e phase_already_started podem ficar: nada as
-- chama depois da reversão, e o app (se também for revertido) não as usa.
-- Para removê-las de vez, ver o fim do arquivo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_prediction_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
           -- AND NEW.pred_pen_winner   IS NOT DISTINCT FROM OLD.pred_pen_winner  ← descomente para manter o furo fechado
        THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Data de inicio da PARTIDA especifica deste palpite
    SELECT match_date INTO match_start_time
    FROM public.matches
    WHERE id = NEW.match_id;

    -- Sem data conhecida: permite
    IF match_start_time IS NULL THEN
        RETURN NEW;
    END IF;

    -- Bloqueia apenas se ESTA partida ja comecou (para todos, inclusive admin)
    IF NOW() > match_start_time THEN
        RAISE EXCEPTION 'A partida já começou. Palpites encerrados.';
    END IF;

    RETURN NEW;
END;
$function$;

-- Limpeza opcional (só se quiser apagar de vez as funções novas):
-- DROP FUNCTION IF EXISTS public.phase_already_started(INT);
-- DROP FUNCTION IF EXISTS public.prediction_deadline(INT);
