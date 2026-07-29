-- ============================================================================
-- Ajustes de núcleo: pênaltis em jogo único, tolerância de mandos, inverter mandos
-- ============================================================================
-- (1) process_match_finished + advance_tie: em series_type='single', pênaltis só
--     valem/decidem quando o confronto REALMENTE vai a eles:
--       - tempo normal com vencedor  -> pen_winner residual IGNORADO (points_pen=0);
--       - empate sem prorrogação     -> pen_winner decide;
--       - empate com prorrogação:
--            extra_time_result home/away -> decide, pen residual IGNORADO;
--            extra_time_result 'draw'    -> pen_winner decide.
--     Mundial legado (tie_id NULL) permanece intacto.
-- (2) ensure_tie_matches: NÃO desfaz uma inversão de mandos (mesmos dois clubes em
--     qualquer orientação é aceito). Só corrige quando aparece um clube DIFERENTE.
-- (3) swap_tie_home_away: RPC atômica p/ inverter casa/fora de ida E volta.
-- Regras/valores de pontuação inalterados.
-- ============================================================================

-- (1) Motor -----------------------------------------------------------------
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

    -- REABERTURA: FINISHED -> não-FINISHED => reverter pontos
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'FINISHED' AND NEW.status <> 'FINISHED' AND match_tournament_id IS NOT NULL THEN
            FOR prediction_record IN
                SELECT p.id, p.user_id, p.points_earned, p.points_regular
                FROM public.predictions p WHERE p.match_id = NEW.id
            LOOP
                was_exact := (COALESCE(prediction_record.points_regular, 0) = 30);
                UPDATE public.tournament_rankings
                SET total_points  = total_points - COALESCE(prediction_record.points_earned, 0),
                    exact_matches = exact_matches - (CASE WHEN was_exact THEN 1 ELSE 0 END),
                    updated_at    = NOW()
                WHERE user_id = prediction_record.user_id AND tournament_id = match_tournament_id;
                UPDATE public.predictions
                SET points_regular = 0, points_extra = 0, points_pen = 0, points_earned = 0
                WHERE id = prediction_record.id;
            END LOOP;
            RETURN NEW;
        END IF;
    END IF;

    IF NEW.status = 'FINISHED' AND NEW.score_home IS NOT NULL AND NEW.score_away IS NOT NULL THEN
        IF match_tournament_id IS NULL THEN
            RAISE WARNING 'Jogo % sem tournament_id. Pulando pontos.', NEW.id;
            RETURN NEW;
        END IF;

        -- Gate de pênaltis
        IF NEW.tie_id IS NOT NULL AND NEW.leg = 'volta' THEN
            -- volta de série two_leg: só se o agregado empatar
            pens_valid := tie_aggregate_tied(NEW.tie_id);
        ELSIF NEW.tie_id IS NOT NULL AND NEW.leg = 'single' THEN
            -- jogo único: empate no tempo normal E (sem prorrogação OU prorrogação empatada)
            pens_valid := (NEW.score_home = NEW.score_away)
                          AND (NEW.has_extra_time = false OR NEW.extra_time_result = 'draw');
        ELSE
            -- Mundial legado / jogo fora de confronto (comportamento inalterado)
            pens_valid := true;
        END IF;

        FOR prediction_record IN
            SELECT p.id, p.user_id, p.pred_home, p.pred_away,
                   p.pred_extra_result, p.pred_pen_home, p.pred_pen_away, p.pred_pen_winner,
                   p.points_earned AS old_total_earned, p.points_regular AS old_regular
            FROM public.predictions p WHERE p.match_id = NEW.id
        LOOP
            new_regular := calculate_prediction_points(
                prediction_record.pred_home, prediction_record.pred_away, NEW.score_home, NEW.score_away);

            IF NEW.extra_prediction_enabled THEN
                new_extra := calc_extra_points(prediction_record.pred_extra_result, NEW.extra_time_result);
            ELSE
                new_extra := 0;
            END IF;

            IF pens_valid THEN
                IF NEW.penalty_prediction_mode = 'score' THEN
                    new_pen := calc_pen_points(prediction_record.pred_pen_home, prediction_record.pred_pen_away, NEW.pen_home, NEW.pen_away);
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
            SET points_regular = new_regular, points_extra = new_extra, points_pen = new_pen, points_earned = new_total
            WHERE id = prediction_record.id;

            INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches)
            VALUES (prediction_record.user_id, match_tournament_id, new_total, CASE WHEN is_exact THEN 1 ELSE 0 END)
            ON CONFLICT (user_id, tournament_id) DO UPDATE
            SET total_points = tournament_rankings.total_points - old_total + new_total,
                exact_matches = tournament_rankings.exact_matches
                                + (CASE WHEN is_exact THEN 1 ELSE 0 END) - (CASE WHEN was_exact THEN 1 ELSE 0 END),
                updated_at = NOW();
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- (1) advance_tie: ordem prorrogação -> pênaltis no jogo único ---------------
CREATE OR REPLACE FUNCTION advance_tie(p_tie_id INTEGER)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t public.ties%ROWTYPE;
    ida public.matches%ROWTYPE;
    volta public.matches%ROWTYPE;
    single public.matches%ROWTYPE;
    a_goals INT; b_goals INT;
    w_side TEXT; decided TEXT; pen_team TEXT;
    w_team TEXT; w_iso TEXT; l_team TEXT; l_iso TEXT;
    created TEXT;
BEGIN
    SELECT * INTO t FROM public.ties WHERE id = p_tie_id;
    IF t.id IS NULL THEN RETURN jsonb_build_object('advanced', false); END IF;
    IF t.team_a IS NULL OR t.team_b IS NULL THEN RETURN jsonb_build_object('advanced', false); END IF;

    IF t.series_type = 'single' THEN
        IF t.ida_match_id IS NULL THEN RETURN jsonb_build_object('advanced', false); END IF;
        SELECT * INTO single FROM public.matches WHERE id = t.ida_match_id;
        IF single.status <> 'FINISHED' OR single.score_home IS NULL OR single.score_away IS NULL THEN
            RETURN jsonb_build_object('advanced', false);
        END IF;
        IF NOT ((single.team_home = t.team_a OR single.team_away = t.team_a)
            AND (single.team_home = t.team_b OR single.team_away = t.team_b)) THEN
            RETURN jsonb_build_object('advanced', false, 'warning', 'Os times do jogo único não batem com o confronto.');
        END IF;

        IF single.score_home > single.score_away THEN
            w_side := CASE WHEN single.team_home = t.team_a THEN 'a' ELSE 'b' END; decided := 'aggregate';
        ELSIF single.score_away > single.score_home THEN
            w_side := CASE WHEN single.team_away = t.team_a THEN 'a' ELSE 'b' END; decided := 'aggregate';
        ELSE
            -- empate no tempo normal: prorrogação decide antes dos pênaltis
            IF single.has_extra_time AND single.extra_time_result IN ('home', 'away') THEN
                pen_team := CASE WHEN single.extra_time_result = 'home' THEN single.team_home ELSE single.team_away END;
                decided := 'aggregate';
            ELSIF single.pen_winner IS NOT NULL
                  AND (single.has_extra_time = false OR single.extra_time_result = 'draw') THEN
                pen_team := CASE WHEN single.pen_winner = 'home' THEN single.team_home ELSE single.team_away END;
                decided := 'penalties';
            ELSE
                RETURN jsonb_build_object('advanced', false,
                    'warning', 'Jogo único empatado: informe o vencedor da prorrogação ou dos pênaltis para definir o classificado.');
            END IF;
            w_side := CASE WHEN pen_team = t.team_a THEN 'a' ELSE 'b' END;
        END IF;

    ELSE -- two_leg (inalterado)
        IF t.ida_match_id IS NULL OR t.volta_match_id IS NULL THEN RETURN jsonb_build_object('advanced', false); END IF;
        SELECT * INTO ida   FROM public.matches WHERE id = t.ida_match_id;
        SELECT * INTO volta FROM public.matches WHERE id = t.volta_match_id;
        IF ida.status <> 'FINISHED' OR volta.status <> 'FINISHED'
           OR ida.score_home IS NULL OR ida.score_away IS NULL
           OR volta.score_home IS NULL OR volta.score_away IS NULL THEN
            RETURN jsonb_build_object('advanced', false);
        END IF;
        IF NOT ((ida.team_home = t.team_a OR ida.team_away = t.team_a)
            AND (volta.team_home = t.team_a OR volta.team_away = t.team_a)
            AND (ida.team_home = t.team_b OR ida.team_away = t.team_b)
            AND (volta.team_home = t.team_b OR volta.team_away = t.team_b)) THEN
            RETURN jsonb_build_object('advanced', false, 'warning', 'Os nomes dos times do confronto não batem com as pernas.');
        END IF;
        a_goals := (CASE WHEN ida.team_home = t.team_a THEN ida.score_home ELSE ida.score_away END)
                 + (CASE WHEN volta.team_home = t.team_a THEN volta.score_home ELSE volta.score_away END);
        b_goals := (CASE WHEN ida.team_home = t.team_b THEN ida.score_home ELSE ida.score_away END)
                 + (CASE WHEN volta.team_home = t.team_b THEN volta.score_home ELSE volta.score_away END);
        IF a_goals <> b_goals THEN
            w_side := CASE WHEN a_goals > b_goals THEN 'a' ELSE 'b' END; decided := 'aggregate';
        ELSE
            IF volta.pen_winner = 'home' THEN pen_team := volta.team_home;
            ELSIF volta.pen_winner = 'away' THEN pen_team := volta.team_away;
            ELSIF volta.pen_home IS NOT NULL AND volta.pen_away IS NOT NULL AND volta.pen_home <> volta.pen_away THEN
                pen_team := CASE WHEN volta.pen_home > volta.pen_away THEN volta.team_home ELSE volta.team_away END;
            ELSE pen_team := NULL; END IF;
            IF pen_team IS NULL THEN
                RETURN jsonb_build_object('advanced', false, 'warning', 'Agregado empatado: informe o vencedor dos pênaltis da volta.');
            END IF;
            w_side := CASE WHEN pen_team = t.team_a THEN 'a' WHEN pen_team = t.team_b THEN 'b' ELSE NULL END;
            IF w_side IS NULL THEN
                RETURN jsonb_build_object('advanced', false, 'warning', 'Não consegui mapear o vencedor dos pênaltis.');
            END IF;
            decided := 'penalties';
        END IF;
    END IF;

    w_team := CASE WHEN w_side = 'a' THEN t.team_a ELSE t.team_b END;
    w_iso  := CASE WHEN w_side = 'a' THEN t.team_a_iso ELSE t.team_b_iso END;
    l_team := CASE WHEN w_side = 'a' THEN t.team_b ELSE t.team_a END;
    l_iso  := CASE WHEN w_side = 'a' THEN t.team_b_iso ELSE t.team_a_iso END;

    UPDATE public.ties SET winner_team = w_team, winner_iso = w_iso, winner_side = w_side, decided_by = decided WHERE id = t.id;

    IF t.round = 'final' THEN
        INSERT INTO public.tournament_competition_results
            (tournament_id, competition, champion_team, champion_iso, runner_up_team, runner_up_iso, updated_at)
        VALUES (t.tournament_id, t.competition, w_team, w_iso, l_team, l_iso, NOW())
        ON CONFLICT (tournament_id, competition) DO UPDATE
        SET champion_team = EXCLUDED.champion_team, champion_iso = EXCLUDED.champion_iso,
            runner_up_team = EXCLUDED.runner_up_team, runner_up_iso = EXCLUDED.runner_up_iso, updated_at = NOW();
        RETURN jsonb_build_object('advanced', true, 'championSet', true, 'info', w_team || ' é campeão — pódio atualizado.');
    END IF;

    IF t.next_tie_id IS NOT NULL AND t.next_slot_side IS NOT NULL THEN
        IF t.next_slot_side = 'a' THEN
            UPDATE public.ties SET team_a = w_team, team_a_iso = w_iso WHERE id = t.next_tie_id;
        ELSE
            UPDATE public.ties SET team_b = w_team, team_b_iso = w_iso WHERE id = t.next_tie_id;
        END IF;
        created := ensure_tie_matches(t.next_tie_id);
        RETURN jsonb_build_object('advanced', true, 'createdNextMatches', created = 'created',
            'info', w_team || CASE WHEN created = 'created' THEN ' avançou — próxima fase gerada (data a definir).' ELSE ' avançou.' END);
    END IF;

    RETURN jsonb_build_object('advanced', true, 'info', w_team || ' avançou.');
END;
$$ LANGUAGE plpgsql;

-- (2) ensure_tie_matches: tolerante a inversão de mandos ---------------------
CREATE OR REPLACE FUNCTION ensure_tie_matches(p_tie_id INTEGER)
RETURNS TEXT
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    nt public.ties%ROWTYPE;
    lbl TEXT;
    m public.matches%ROWTYPE;
    mv public.matches%ROWTYPE;
    v_ida INT; v_volta INT; v_single INT;
    unsafe BOOLEAN;
    wrong BOOLEAN;
BEGIN
    SELECT * INTO nt FROM public.ties WHERE id = p_tie_id;
    IF nt.id IS NULL THEN RETURN 'missing'; END IF;
    IF nt.team_a IS NULL OR nt.team_b IS NULL THEN RETURN 'pending'; END IF;
    lbl := round_label(nt.round);

    IF nt.series_type = 'single' THEN
        IF nt.ida_match_id IS NULL THEN
            BEGIN
                INSERT INTO public.matches
                    (tournament_id, competition, tie_id, leg, is_knockout, has_extra_time, penalty_prediction_mode,
                     extra_prediction_enabled, status, phase, team_home, home_iso, team_away, away_iso, match_date)
                VALUES
                    (nt.tournament_id, nt.competition, nt.id, 'single', true, nt.match_has_extra_time,
                     nt.match_penalty_mode, nt.match_extra_enabled, 'SCHEDULED', lbl,
                     nt.team_a, nt.team_a_iso, nt.team_b, nt.team_b_iso, NULL)
                RETURNING id INTO v_single;
                UPDATE public.ties SET ida_match_id = v_single WHERE id = nt.id;
                RETURN 'created';
            EXCEPTION WHEN unique_violation THEN RETURN 'exists'; END;
        ELSE
            SELECT * INTO m FROM public.matches WHERE id = nt.ida_match_id;
            -- "wrong" só se NÃO contém exatamente os dois clubes do tie (qualquer orientação é ok)
            wrong := NOT ((m.team_home = nt.team_a AND m.team_away = nt.team_b)
                       OR (m.team_home = nt.team_b AND m.team_away = nt.team_a));
            IF wrong THEN
                SELECT (EXISTS (SELECT 1 FROM public.predictions WHERE match_id = nt.ida_match_id)
                        OR m.status = 'FINISHED'
                        OR (m.match_date IS NOT NULL AND m.match_date <= NOW())) INTO unsafe;
                IF unsafe THEN
                    RAISE EXCEPTION 'A fase seguinte já começou ou recebeu palpites; ajuste manualmente antes de corrigir.';
                END IF;
                UPDATE public.matches
                SET team_home = nt.team_a, home_iso = nt.team_a_iso, team_away = nt.team_b, away_iso = nt.team_b_iso
                WHERE id = nt.ida_match_id;
                RETURN 'updated';
            END IF;
            RETURN 'exists';
        END IF;

    ELSE -- two_leg
        IF nt.ida_match_id IS NULL AND nt.volta_match_id IS NULL THEN
            BEGIN
                INSERT INTO public.matches
                    (tournament_id, competition, tie_id, leg, is_knockout, has_extra_time, penalty_prediction_mode,
                     extra_prediction_enabled, status, phase, team_home, home_iso, team_away, away_iso, match_date)
                VALUES
                    (nt.tournament_id, nt.competition, nt.id, 'ida', false, false, nt.match_penalty_mode, false,
                     'SCHEDULED', lbl || ' – ida', nt.team_a, nt.team_a_iso, nt.team_b, nt.team_b_iso, NULL)
                RETURNING id INTO v_ida;
                INSERT INTO public.matches
                    (tournament_id, competition, tie_id, leg, is_knockout, has_extra_time, penalty_prediction_mode,
                     extra_prediction_enabled, status, phase, team_home, home_iso, team_away, away_iso, match_date)
                VALUES
                    (nt.tournament_id, nt.competition, nt.id, 'volta', true, false, nt.match_penalty_mode, false,
                     'SCHEDULED', lbl || ' – volta', nt.team_b, nt.team_b_iso, nt.team_a, nt.team_a_iso, NULL)
                RETURNING id INTO v_volta;
                UPDATE public.ties SET ida_match_id = v_ida, volta_match_id = v_volta WHERE id = nt.id;
                RETURN 'created';
            EXCEPTION WHEN unique_violation THEN RETURN 'exists'; END;
        ELSE
            SELECT * INTO m  FROM public.matches WHERE id = nt.ida_match_id;
            SELECT * INTO mv FROM public.matches WHERE id = nt.volta_match_id;
            -- "wrong" só se alguma perna NÃO contém exatamente os dois clubes (orientação é livre)
            wrong := (m.id IS NOT NULL AND NOT ((m.team_home = nt.team_a AND m.team_away = nt.team_b) OR (m.team_home = nt.team_b AND m.team_away = nt.team_a)))
                  OR (mv.id IS NOT NULL AND NOT ((mv.team_home = nt.team_a AND mv.team_away = nt.team_b) OR (mv.team_home = nt.team_b AND mv.team_away = nt.team_a)));
            IF wrong THEN
                SELECT (EXISTS (SELECT 1 FROM public.predictions WHERE match_id IN (nt.ida_match_id, nt.volta_match_id))
                        OR EXISTS (SELECT 1 FROM public.matches WHERE id IN (nt.ida_match_id, nt.volta_match_id)
                                   AND (status = 'FINISHED' OR (match_date IS NOT NULL AND match_date <= NOW())))) INTO unsafe;
                IF unsafe THEN
                    RAISE EXCEPTION 'A fase seguinte já começou ou recebeu palpites; ajuste manualmente antes de corrigir.';
                END IF;
                UPDATE public.matches
                SET team_home = nt.team_a, home_iso = nt.team_a_iso, team_away = nt.team_b, away_iso = nt.team_b_iso WHERE id = nt.ida_match_id;
                UPDATE public.matches
                SET team_home = nt.team_b, home_iso = nt.team_b_iso, team_away = nt.team_a, away_iso = nt.team_a_iso WHERE id = nt.volta_match_id;
                RETURN 'updated';
            END IF;
            RETURN 'exists';
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- (3) Inverter mandos (ida e volta) de um confronto two_leg ------------------
CREATE OR REPLACE FUNCTION swap_tie_home_away(p_tie_id INTEGER)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t public.ties%ROWTYPE;
    unsafe BOOLEAN;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
        RAISE EXCEPTION 'Apenas administradores podem inverter mandos';
    END IF;

    SELECT * INTO t FROM public.ties WHERE id = p_tie_id;
    IF t.id IS NULL THEN RAISE EXCEPTION 'Confronto não encontrado'; END IF;
    IF t.series_type <> 'two_leg' THEN RAISE EXCEPTION 'Inversão de mandos só se aplica a confrontos de ida e volta'; END IF;
    IF t.ida_match_id IS NULL OR t.volta_match_id IS NULL THEN RAISE EXCEPTION 'O confronto ainda não tem os dois jogos'; END IF;

    SELECT (EXISTS (SELECT 1 FROM public.predictions WHERE match_id IN (t.ida_match_id, t.volta_match_id))
            OR EXISTS (SELECT 1 FROM public.matches WHERE id IN (t.ida_match_id, t.volta_match_id)
                       AND (status = 'FINISHED' OR (match_date IS NOT NULL AND match_date <= NOW())))) INTO unsafe;
    IF unsafe THEN
        RAISE EXCEPTION 'Não é possível inverter: já há palpites ou algum jogo começou/terminou.';
    END IF;

    UPDATE public.matches
    SET team_home = team_away, team_away = team_home, home_iso = away_iso, away_iso = home_iso
    WHERE id IN (t.ida_match_id, t.volta_match_id);

    RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.swap_tie_home_away(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.swap_tie_home_away(integer) TO authenticated;
