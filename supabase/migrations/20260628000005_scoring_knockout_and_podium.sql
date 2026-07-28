-- ============================================
-- MATA-MATA: pontuação de prorrogação, pênaltis e pódio
-- ============================================
-- SEGURO aplicar a qualquer momento: prorrogação/pênaltis só afetam jogos
-- is_knockout (que ainda não existem) e o pódio só é pontuado quando o admin
-- lança o resultado. Os VALORES do tempo normal NÃO mudam aqui (empate=12,
-- vitória=9) — a mudança para 15/10 está na migração 20260628000006, que deve
-- ser rodada só após o torneio atual encerrar.

-- ============================================
-- Pontos da prorrogação (acertar resultado = 5)
-- ============================================
CREATE OR REPLACE FUNCTION calc_extra_points(
    pred_extra TEXT,        -- 'home' / 'draw' / 'away'
    actual_extra TEXT       -- 'home' / 'draw' / 'away' / NULL (não houve)
)
RETURNS INTEGER AS $$
BEGIN
    IF actual_extra IS NULL OR pred_extra IS NULL THEN
        RETURN 0;
    END IF;
    IF pred_extra = actual_extra THEN
        RETURN 5;
    END IF;
    RETURN 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- Pontos dos pênaltis (vencedor = 5, placar exato = 10)
-- ============================================
CREATE OR REPLACE FUNCTION calc_pen_points(
    pred_h INTEGER, pred_a INTEGER,
    actual_h INTEGER, actual_a INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    pred_winner TEXT;
    actual_winner TEXT;
BEGIN
    IF actual_h IS NULL OR actual_a IS NULL OR pred_h IS NULL OR pred_a IS NULL THEN
        RETURN 0;
    END IF;

    -- Placar exato dos pênaltis
    IF pred_h = actual_h AND pred_a = actual_a THEN
        RETURN 10;
    END IF;

    -- Apenas o vencedor (pênaltis sempre têm vencedor)
    pred_winner   := CASE WHEN pred_h > pred_a THEN 'home'
                          WHEN pred_a > pred_h THEN 'away' ELSE 'draw' END;
    actual_winner := CASE WHEN actual_h > actual_a THEN 'home'
                          WHEN actual_a > actual_h THEN 'away' ELSE 'draw' END;

    IF pred_winner <> 'draw' AND pred_winner = actual_winner THEN
        RETURN 5;
    END IF;

    RETURN 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- Processar pontuação quando o jogo termina (com prorrogação/pênaltis)
-- ============================================
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
                   p.pred_extra_result, p.pred_pen_home, p.pred_pen_away,
                   p.points_earned AS old_total_earned,
                   p.points_regular AS old_regular
            FROM public.predictions p
            WHERE p.match_id = NEW.id
        LOOP
            new_regular := calculate_prediction_points(
                prediction_record.pred_home, prediction_record.pred_away,
                NEW.score_home, NEW.score_away
            );

            -- Prorrogação e pênaltis só contam se o jogo realmente foi a essas fases
            new_extra := calc_extra_points(prediction_record.pred_extra_result, NEW.extra_time_result);
            new_pen   := calc_pen_points(
                prediction_record.pred_pen_home, prediction_record.pred_pen_away,
                NEW.pen_home, NEW.pen_away
            );

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

-- ============================================
-- Pontuação do pódio (campeão 40, vice 20, terceiro 25, consolação +10)
-- ============================================
-- Consolação: +10 por time escalado que chegou ao pódio em posição diferente da
-- apostada. Contado uma vez por time (picks duplicados são ignorados).
CREATE OR REPLACE FUNCTION calc_podium_points(
    pick_champ TEXT, pick_runner TEXT, pick_third TEXT,
    real_champ TEXT, real_runner TEXT, real_third TEXT
)
RETURNS INTEGER AS $$
DECLARE
    pts INTEGER := 0;
    c TEXT := NULLIF(lower(trim(pick_champ)), '');
    r TEXT := NULLIF(lower(trim(pick_runner)), '');
    t TEXT := NULLIF(lower(trim(pick_third)), '');
    rc TEXT := NULLIF(lower(trim(real_champ)), '');
    rr TEXT := NULLIF(lower(trim(real_runner)), '');
    rt TEXT := NULLIF(lower(trim(real_third)), '');
BEGIN
    IF rc IS NULL THEN
        RETURN 0; -- pódio real ainda não definido
    END IF;

    -- Campeão
    IF c IS NOT NULL THEN
        IF c = rc THEN pts := pts + 40;
        ELSIF c = rr OR c = rt THEN pts := pts + 10;
        END IF;
    END IF;

    -- Vice (ignora se for o mesmo time já contado como campeão)
    IF r IS NOT NULL AND r IS DISTINCT FROM c THEN
        IF r = rr THEN pts := pts + 20;
        ELSIF r = rc OR r = rt THEN pts := pts + 10;
        END IF;
    END IF;

    -- Terceiro (ignora se for o mesmo time já contado)
    IF t IS NOT NULL AND t IS DISTINCT FROM c AND t IS DISTINCT FROM r THEN
        IF t = rt THEN pts := pts + 25;
        ELSIF t = rc OR t = rr THEN pts := pts + 10;
        END IF;
    END IF;

    RETURN pts;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Recalcula o pódio de todos os usuários do torneio (idempotente)
CREATE OR REPLACE FUNCTION process_tournament_podium()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec RECORD;
    new_podium INTEGER;
    old_podium INTEGER;
BEGIN
    FOR rec IN
        SELECT pp.user_id, pp.champion_team, pp.runner_up_team, pp.third_place_team
        FROM public.podium_predictions pp
        WHERE pp.tournament_id = NEW.id
    LOOP
        new_podium := calc_podium_points(
            rec.champion_team, rec.runner_up_team, rec.third_place_team,
            NEW.champion_team, NEW.runner_up_team, NEW.third_place_team
        );

        INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, podium_points)
        VALUES (rec.user_id, NEW.id, new_podium, 0, new_podium)
        ON CONFLICT (user_id, tournament_id) DO UPDATE
        SET total_points  = tournament_rankings.total_points - tournament_rankings.podium_points + new_podium,
            podium_points = new_podium,
            updated_at = NOW();
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_process_tournament_podium ON public.tournaments;
CREATE TRIGGER trigger_process_tournament_podium
    AFTER UPDATE ON public.tournaments
    FOR EACH ROW
    WHEN (
        NEW.champion_team IS DISTINCT FROM OLD.champion_team
        OR NEW.runner_up_team IS DISTINCT FROM OLD.runner_up_team
        OR NEW.third_place_team IS DISTINCT FROM OLD.third_place_team
    )
    EXECUTE FUNCTION process_tournament_podium();

-- ============================================
-- Recalcular pontos de um usuário (inclui breakdown + pódio)
-- ============================================
CREATE OR REPLACE FUNCTION recalculate_user_points(p_user_id UUID, p_tournament_id INTEGER DEFAULT NULL)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    total_points_sum INTEGER := 0;
    exact_matches_count INTEGER := 0;
    podium_sum INTEGER := 0;
    tournament_record RECORD;
BEGIN
    IF p_tournament_id IS NOT NULL THEN
        SELECT COALESCE(SUM(p.points_earned), 0) INTO total_points_sum
        FROM public.predictions p
        INNER JOIN public.matches m ON p.match_id = m.id
        WHERE p.user_id = p_user_id AND m.tournament_id = p_tournament_id;

        SELECT COUNT(*) INTO exact_matches_count
        FROM public.predictions p
        INNER JOIN public.matches m ON p.match_id = m.id
        WHERE p.user_id = p_user_id
          AND m.tournament_id = p_tournament_id
          AND p.points_regular = 30;

        SELECT COALESCE(podium_points, 0) INTO podium_sum
        FROM public.tournament_rankings
        WHERE user_id = p_user_id AND tournament_id = p_tournament_id;

        INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, podium_points)
        VALUES (p_user_id, p_tournament_id, total_points_sum + COALESCE(podium_sum, 0), exact_matches_count, COALESCE(podium_sum, 0))
        ON CONFLICT (user_id, tournament_id) DO UPDATE
        SET total_points = total_points_sum + COALESCE(tournament_rankings.podium_points, 0),
            exact_matches = exact_matches_count,
            updated_at = NOW();
    ELSE
        FOR tournament_record IN
            SELECT DISTINCT m.tournament_id
            FROM public.matches m
            INNER JOIN public.predictions p ON m.id = p.match_id
            WHERE p.user_id = p_user_id AND m.tournament_id IS NOT NULL
        LOOP
            PERFORM recalculate_user_points(p_user_id, tournament_record.tournament_id);
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calc_extra_points IS 'Pontos da prorrogação: 5 se acertar o resultado (home/draw/away)';
COMMENT ON FUNCTION calc_pen_points IS 'Pontos dos pênaltis: 10 placar exato, 5 só o vencedor';
COMMENT ON FUNCTION calc_podium_points IS 'Pontos do pódio: campeão 40, vice 20, terceiro 25, consolação +10 (uma vez por time)';
