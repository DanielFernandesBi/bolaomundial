-- ============================================================================
-- REGRA NOVA (clubes): pênaltis = só o VENCEDOR, valendo 7 (não há placar)
-- ============================================================================
-- Decisão dos usuários: no bolão de clubes o palpite de pênaltis é apenas quem
-- vence a disputa (sem placar). Pontuação: 0 se errar, 7 se acertar.
--
-- O Mundial legado continua com o modelo por PLACAR (calc_pen_points: 5 vencedor,
-- 10 placar exato) — INTOCADO. A distinção é por matches.has_extra_time:
--   • has_extra_time = true  (Mundial)  -> pênaltis por placar (5/10)
--   • has_extra_time = false (clubes)   -> pênaltis por vencedor (7/0)
-- ============================================================================

-- 1) Colunas do modelo "por vencedor" ---------------------------------------
-- Palpite: quem o usuário acha que vence os pênaltis ('home' | 'away').
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pred_pen_winner TEXT
  CHECK (pred_pen_winner IS NULL OR pred_pen_winner IN ('home', 'away'));

-- Resultado real: quem venceu os pênaltis ('home' | 'away'). NULL = não houve.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS pen_winner TEXT
  CHECK (pen_winner IS NULL OR pen_winner IN ('home', 'away'));

COMMENT ON COLUMN public.predictions.pred_pen_winner IS 'Palpite do vencedor dos pênaltis (home/away) — modelo dos clubes; só conta se houver pênaltis';
COMMENT ON COLUMN public.matches.pen_winner IS 'Vencedor real dos pênaltis (home/away); NULL se não houve';

-- 2) Pontuação por vencedor (7 acertou, 0 errou) ----------------------------
CREATE OR REPLACE FUNCTION calc_pen_winner_points(
    pred_winner TEXT,      -- 'home' / 'away'
    actual_winner TEXT     -- 'home' / 'away' / NULL (não houve)
)
RETURNS INTEGER AS $$
BEGIN
    IF actual_winner IS NULL OR pred_winner IS NULL THEN
        RETURN 0;
    END IF;
    IF pred_winner = actual_winner THEN
        RETURN 7;
    END IF;
    RETURN 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calc_pen_winner_points IS 'Pênaltis por vencedor (clubes): 7 se acertar o vencedor, senão 0';

-- 3) process_match_finished: escolhe o modelo de pênaltis por has_extra_time --
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
BEGIN
    IF NEW.status = 'FINISHED' AND NEW.score_home IS NOT NULL AND NEW.score_away IS NOT NULL THEN
        match_tournament_id := NEW.tournament_id;

        IF match_tournament_id IS NULL THEN
            RAISE WARNING 'Jogo % não tem tournament_id associado. Pulando processamento de pontos.', NEW.id;
            RETURN NEW;
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

            -- Prorrogação (só Mundial; NULL nos clubes => 0)
            new_extra := calc_extra_points(prediction_record.pred_extra_result, NEW.extra_time_result);

            -- Pênaltis: por PLACAR (Mundial) ou por VENCEDOR (clubes)
            IF NEW.has_extra_time THEN
                new_pen := calc_pen_points(
                    prediction_record.pred_pen_home, prediction_record.pred_pen_away,
                    NEW.pen_home, NEW.pen_away
                );
            ELSE
                new_pen := calc_pen_winner_points(prediction_record.pred_pen_winner, NEW.pen_winner);
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
