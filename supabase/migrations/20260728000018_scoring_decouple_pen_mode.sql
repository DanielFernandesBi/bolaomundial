-- ============================================================================
-- Desacoplar o modo de pontuação de pênaltis da prorrogação (has_extra_time)
-- ============================================================================
-- Antes, process_match_finished escolhia o modelo de pênaltis por has_extra_time
-- (true=placar, false=vencedor). Isso quebra o caso de uma FINAL de clubes que
-- pode TER prorrogação real (has_extra_time=true) e mesmo assim o palpite de
-- pênaltis deve ser só o VENCEDOR (7).
--
-- Agora o motor usa:
--   • matches.penalty_prediction_mode ('score' -> calc_pen_points; 'winner' -> calc_pen_winner_points)
--   • matches.extra_prediction_enabled (só pontua prorrogação quando true)
-- Mantém: gate de agregado (só na volta de séries two_leg) e a reversão ao reabrir.
-- Regras/valores de pontuação NÃO mudam.
-- ============================================================================

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
    pens_valid BOOLEAN;
BEGIN
    match_tournament_id := NEW.tournament_id;

    -- ---- REABERTURA: FINISHED -> não-FINISHED => reverter pontos ----
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

        -- Gate de pênaltis: só na VOLTA de uma série (two_leg) o pênalti depende do
        -- agregado empatar. Em jogo único (leg='single') ou fora de confronto, vale o
        -- que o admin registrou.
        IF NEW.tie_id IS NOT NULL AND NEW.leg = 'volta' THEN
            pens_valid := tie_aggregate_tied(NEW.tie_id);
        ELSE
            pens_valid := true;
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

            -- Prorrogação: só pontua quando a modalidade está habilitada
            IF NEW.extra_prediction_enabled THEN
                new_extra := calc_extra_points(prediction_record.pred_extra_result, NEW.extra_time_result);
            ELSE
                new_extra := 0;
            END IF;

            -- Pênaltis: modo explícito (score/winner), e só se forem válidos (gate de agregado)
            IF pens_valid THEN
                IF NEW.penalty_prediction_mode = 'score' THEN
                    new_pen := calc_pen_points(
                        prediction_record.pred_pen_home, prediction_record.pred_pen_away,
                        NEW.pen_home, NEW.pen_away
                    );
                ELSE
                    new_pen := calc_pen_winner_points(prediction_record.pred_pen_winner, NEW.pen_winner);
                END IF;
            ELSE
                new_pen := 0;
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
                prediction_record.user_id, match_tournament_id, new_total,
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
