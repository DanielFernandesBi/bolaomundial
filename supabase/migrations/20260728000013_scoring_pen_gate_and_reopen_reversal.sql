-- ============================================================================
-- 🔴 Coerência do motor de pontuação (auditoria itens 13 e 14)
-- ============================================================================
-- (13) Pênaltis não podiam pontuar quando NÃO deveriam existir. O motor só olhava
--      "tem pen_winner? pontua". Nos clubes, os pênaltis só existem quando o
--      AGREGADO empata; se o admin preencher o vencedor num 5x2, não deve pontuar.
--      A regra é centralizada aqui: tie_aggregate_tied() decide, e o motor gateia.
--
-- (14) Reabrir uma partida FINISHED -> SCHEDULED deixava os pontos no ranking
--      (a trigger só somava ao finalizar; não havia caminho inverso). Agora o motor
--      REVERTE atomicamente os pontos daquele jogo ao sair de FINISHED.
-- ============================================================================

-- Agregado do confronto está empatado (e as duas pernas finalizadas)? ---------
CREATE OR REPLACE FUNCTION tie_aggregate_tied(p_tie_id INTEGER)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t     public.ties%ROWTYPE;
    ida   public.matches%ROWTYPE;
    volta public.matches%ROWTYPE;
    a_goals INTEGER;
    b_goals INTEGER;
BEGIN
    SELECT * INTO t FROM public.ties WHERE id = p_tie_id;
    IF t.id IS NULL OR t.ida_match_id IS NULL OR t.volta_match_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT * INTO ida   FROM public.matches WHERE id = t.ida_match_id;
    SELECT * INTO volta FROM public.matches WHERE id = t.volta_match_id;

    IF ida.status <> 'FINISHED' OR volta.status <> 'FINISHED'
       OR ida.score_home IS NULL OR ida.score_away IS NULL
       OR volta.score_home IS NULL OR volta.score_away IS NULL THEN
        RETURN false;
    END IF;

    a_goals :=
        (CASE WHEN ida.team_home = t.team_a THEN ida.score_home
              WHEN ida.team_away = t.team_a THEN ida.score_away ELSE 0 END)
      + (CASE WHEN volta.team_home = t.team_a THEN volta.score_home
              WHEN volta.team_away = t.team_a THEN volta.score_away ELSE 0 END);

    b_goals :=
        (CASE WHEN ida.team_home = t.team_b THEN ida.score_home
              WHEN ida.team_away = t.team_b THEN ida.score_away ELSE 0 END)
      + (CASE WHEN volta.team_home = t.team_b THEN volta.score_home
              WHEN volta.team_away = t.team_b THEN volta.score_away ELSE 0 END);

    RETURN a_goals = b_goals;
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.tie_aggregate_tied(integer) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION tie_aggregate_tied IS 'True se o agregado do confronto está empatado e as duas pernas terminaram (base para validar pênaltis nos clubes).';

-- Motor de pontuação com gate de pênaltis + reversão ao reabrir ---------------
CREATE OR REPLACE FUNCTION process_match_finished()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    prediction_record RECORD;
    new_regular INTEGER;
    new_extra INTEGER;
    new_pen INTEGER;
    new_total INTEGER;
    old_total INTEGER;
    was_exact BOOLEAN;
    is_exact BOOLEAN;
    match_tournament_id INTEGER;
    pens_count_clubs BOOLEAN;
BEGIN
    match_tournament_id := NEW.tournament_id;

    -- ---- (14) REABERTURA: FINISHED -> não-FINISHED => reverter pontos ----
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'FINISHED' AND NEW.status <> 'FINISHED' AND match_tournament_id IS NOT NULL THEN
            FOR prediction_record IN
                SELECT p.id, p.user_id, p.points_earned, p.points_regular
                FROM public.predictions p
                WHERE p.match_id = NEW.id
            LOOP
                was_exact := (COALESCE(prediction_record.points_regular, 0) = 30);

                UPDATE public.tournament_rankings
                SET total_points  = total_points - COALESCE(prediction_record.points_earned, 0),
                    exact_matches = exact_matches - (CASE WHEN was_exact THEN 1 ELSE 0 END),
                    updated_at    = NOW()
                WHERE user_id = prediction_record.user_id
                  AND tournament_id = match_tournament_id;

                UPDATE public.predictions
                SET points_regular = 0, points_extra = 0, points_pen = 0, points_earned = 0
                WHERE id = prediction_record.id;
            END LOOP;

            RETURN NEW;
        END IF;
    END IF;

    -- ---- Pontuação normal ao finalizar ----
    IF NEW.status = 'FINISHED' AND NEW.score_home IS NOT NULL AND NEW.score_away IS NOT NULL THEN
        IF match_tournament_id IS NULL THEN
            RAISE WARNING 'Jogo % não tem tournament_id associado. Pulando processamento de pontos.', NEW.id;
            RETURN NEW;
        END IF;

        -- (13) Nos clubes, pênaltis só contam se o agregado empatar (na volta com confronto).
        IF NEW.has_extra_time THEN
            pens_count_clubs := false;  -- não se aplica (Mundial usa placar)
        ELSIF NEW.tie_id IS NOT NULL AND NEW.leg = 'volta' THEN
            pens_count_clubs := tie_aggregate_tied(NEW.tie_id);
        ELSE
            pens_count_clubs := true;   -- sem confronto de ida/volta: confia no lançamento
        END IF;

        FOR prediction_record IN
            SELECT p.id, p.user_id, p.pred_home, p.pred_away,
                   p.pred_extra_result, p.pred_pen_home, p.pred_pen_away, p.pred_pen_winner,
                   p.points_earned AS old_total_earned,
                   p.points_regular AS old_regular
            FROM public.predictions p
            WHERE p.match_id = NEW.id
        LOOP
            new_regular := calculate_prediction_points(
                prediction_record.pred_home, prediction_record.pred_away,
                NEW.score_home, NEW.score_away
            );

            new_extra := calc_extra_points(prediction_record.pred_extra_result, NEW.extra_time_result);

            IF NEW.has_extra_time THEN
                new_pen := calc_pen_points(
                    prediction_record.pred_pen_home, prediction_record.pred_pen_away,
                    NEW.pen_home, NEW.pen_away
                );
            ELSIF pens_count_clubs THEN
                new_pen := calc_pen_winner_points(prediction_record.pred_pen_winner, NEW.pen_winner);
            ELSE
                new_pen := 0;  -- agregado não empatou => pênaltis não valem
            END IF;

            new_total := new_regular + new_extra + new_pen;
            old_total := COALESCE(prediction_record.old_total_earned, 0);

            was_exact := (COALESCE(prediction_record.old_regular, 0) = 30);
            is_exact  := (new_regular = 30);

            UPDATE public.predictions
            SET points_regular = new_regular,
                points_extra   = new_extra,
                points_pen     = new_pen,
                points_earned  = new_total
            WHERE id = prediction_record.id;

            INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches)
            VALUES (
                prediction_record.user_id,
                match_tournament_id,
                new_total,
                CASE WHEN is_exact THEN 1 ELSE 0 END
            )
            ON CONFLICT (user_id, tournament_id) DO UPDATE
            SET total_points = tournament_rankings.total_points - old_total + new_total,
                exact_matches = tournament_rankings.exact_matches
                                + (CASE WHEN is_exact THEN 1 ELSE 0 END)
                                - (CASE WHEN was_exact THEN 1 ELSE 0 END),
                updated_at = NOW();
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Nota (item 13): o gate confia em ambas as pernas finalizadas. No fluxo normal a
-- ida é finalizada antes da volta, então ao finalizar a volta o agregado é conhecido.
-- Se a volta for finalizada ANTES da ida (fora de ordem), os pênaltis ficam 0 até
-- re-salvar a volta com a ida já finalizada.
