-- ============================================================================
-- Chaveamento genérico: séries de ida/volta (two_leg) OU jogo único (single)
-- ============================================================================
-- Generaliza advance_tie e a criação da próxima fase. Mantém atomicidade,
-- idempotência, proteção contra duplicação (índice único tie_id,leg) e
-- propagação segura de correção. NÃO muda regras de pontuação.
--
-- Config das partidas de um confronto fica no PRÓPRIO tie (para não hardcodear
-- por nome de competição): match_penalty_mode / match_has_extra_time / match_extra_enabled.
-- Defaults = regra dos clubes (winner / sem prorrogação). O seed pode sobrescrever
-- (ex.: final da Libertadores single com has_extra_time=true, mode=winner).
-- ============================================================================

ALTER TABLE public.ties ADD COLUMN IF NOT EXISTS match_penalty_mode TEXT NOT NULL DEFAULT 'winner'
  CHECK (match_penalty_mode IN ('score', 'winner'));
ALTER TABLE public.ties ADD COLUMN IF NOT EXISTS match_has_extra_time BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.ties ADD COLUMN IF NOT EXISTS match_extra_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ties.match_penalty_mode IS 'Modo de pênaltis dos jogos deste confronto (copiado para matches ao criar)';
COMMENT ON COLUMN public.ties.match_has_extra_time IS 'Se o jogo único deste confronto tem prorrogação real (ex.: final)';
COMMENT ON COLUMN public.ties.match_extra_enabled IS 'Se há modalidade de palpite de prorrogação (clubes=false)';

-- Rótulo da fase -------------------------------------------------------------
CREATE OR REPLACE FUNCTION round_label(p_round TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE p_round
        WHEN 'oitavas' THEN 'Oitavas de final'
        WHEN 'quartas' THEN 'Quartas de final'
        WHEN 'semi'    THEN 'Semifinal'
        WHEN 'final'   THEN 'Final'
        ELSE p_round END;
$$;

-- ============================================================================
-- ensure_tie_matches: cria (ou corrige com segurança) os jogos de um confronto,
-- conforme series_type. Usado pelo advance_tie, resolve_tie_participant e apply_round_draw.
-- Retorna: 'created' | 'exists' | 'updated' | 'pending' | 'missing'.
-- ============================================================================
CREATE OR REPLACE FUNCTION ensure_tie_matches(p_tie_id INTEGER)
RETURNS TEXT
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    nt public.ties%ROWTYPE;
    lbl TEXT;
    m public.matches%ROWTYPE;
    v_ida INT; v_volta INT; v_single INT;
    unsafe BOOLEAN;
BEGIN
    SELECT * INTO nt FROM public.ties WHERE id = p_tie_id;
    IF nt.id IS NULL THEN RETURN 'missing'; END IF;
    IF nt.team_a IS NULL OR nt.team_b IS NULL THEN RETURN 'pending'; END IF;
    lbl := round_label(nt.round);

    IF nt.series_type = 'single' THEN
        IF nt.ida_match_id IS NULL THEN
            BEGIN
                INSERT INTO public.matches
                    (tournament_id, competition, tie_id, leg, is_knockout, has_extra_time,
                     penalty_prediction_mode, extra_prediction_enabled, status, phase,
                     team_home, home_iso, team_away, away_iso, match_date)
                VALUES
                    (nt.tournament_id, nt.competition, nt.id, 'single', true, nt.match_has_extra_time,
                     nt.match_penalty_mode, nt.match_extra_enabled, 'SCHEDULED', lbl,
                     nt.team_a, nt.team_a_iso, nt.team_b, nt.team_b_iso, NULL)
                RETURNING id INTO v_single;
                UPDATE public.ties SET ida_match_id = v_single WHERE id = nt.id;
                RETURN 'created';
            EXCEPTION WHEN unique_violation THEN
                RETURN 'exists';
            END;
        ELSE
            SELECT * INTO m FROM public.matches WHERE id = nt.ida_match_id;
            IF m.team_home IS DISTINCT FROM nt.team_a OR m.team_away IS DISTINCT FROM nt.team_b THEN
                SELECT (EXISTS (SELECT 1 FROM public.predictions WHERE match_id = nt.ida_match_id)
                        OR m.status = 'FINISHED'
                        OR (m.match_date IS NOT NULL AND m.match_date <= NOW())) INTO unsafe;
                IF unsafe THEN
                    RAISE EXCEPTION 'A fase seguinte já começou ou recebeu palpites; ajuste o chaveamento manualmente antes de corrigir.';
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
                    (tournament_id, competition, tie_id, leg, is_knockout, has_extra_time,
                     penalty_prediction_mode, extra_prediction_enabled, status, phase,
                     team_home, home_iso, team_away, away_iso, match_date)
                VALUES
                    (nt.tournament_id, nt.competition, nt.id, 'ida', false, false,
                     nt.match_penalty_mode, false, 'SCHEDULED', lbl || ' – ida',
                     nt.team_a, nt.team_a_iso, nt.team_b, nt.team_b_iso, NULL)
                RETURNING id INTO v_ida;

                INSERT INTO public.matches
                    (tournament_id, competition, tie_id, leg, is_knockout, has_extra_time,
                     penalty_prediction_mode, extra_prediction_enabled, status, phase,
                     team_home, home_iso, team_away, away_iso, match_date)
                VALUES
                    (nt.tournament_id, nt.competition, nt.id, 'volta', true, false,
                     nt.match_penalty_mode, false, 'SCHEDULED', lbl || ' – volta',
                     nt.team_b, nt.team_b_iso, nt.team_a, nt.team_a_iso, NULL)
                RETURNING id INTO v_volta;

                UPDATE public.ties SET ida_match_id = v_ida, volta_match_id = v_volta WHERE id = nt.id;
                RETURN 'created';
            EXCEPTION WHEN unique_violation THEN
                RETURN 'exists';
            END;
        ELSE
            SELECT * INTO m FROM public.matches WHERE id = nt.ida_match_id;
            IF m.id IS NOT NULL AND (m.team_home IS DISTINCT FROM nt.team_a OR m.team_away IS DISTINCT FROM nt.team_b) THEN
                SELECT (EXISTS (SELECT 1 FROM public.predictions WHERE match_id IN (nt.ida_match_id, nt.volta_match_id))
                        OR EXISTS (SELECT 1 FROM public.matches WHERE id IN (nt.ida_match_id, nt.volta_match_id)
                                   AND (status = 'FINISHED' OR (match_date IS NOT NULL AND match_date <= NOW())))) INTO unsafe;
                IF unsafe THEN
                    RAISE EXCEPTION 'A fase seguinte já começou ou recebeu palpites; ajuste o chaveamento manualmente antes de corrigir.';
                END IF;
                UPDATE public.matches
                SET team_home = nt.team_a, home_iso = nt.team_a_iso, team_away = nt.team_b, away_iso = nt.team_b_iso
                WHERE id = nt.ida_match_id;
                UPDATE public.matches
                SET team_home = nt.team_b, home_iso = nt.team_b_iso, team_away = nt.team_a, away_iso = nt.team_a_iso
                WHERE id = nt.volta_match_id;
                RETURN 'updated';
            END IF;
            RETURN 'exists';
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- advance_tie: processa um confronto (single ou two_leg) de forma atômica.
-- ============================================================================
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
    nt public.ties%ROWTYPE;
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
            -- empate no tempo normal: prorrogação (vencedor) ou pênaltis
            IF single.pen_winner IS NOT NULL THEN
                pen_team := CASE WHEN single.pen_winner = 'home' THEN single.team_home ELSE single.team_away END;
                decided := 'penalties';
            ELSIF single.extra_time_result IN ('home', 'away') THEN
                pen_team := CASE WHEN single.extra_time_result = 'home' THEN single.team_home ELSE single.team_away END;
                decided := 'aggregate';
            ELSE
                RETURN jsonb_build_object('advanced', false,
                    'warning', 'Jogo único empatado: informe o vencedor da prorrogação ou dos pênaltis para definir o classificado.');
            END IF;
            w_side := CASE WHEN pen_team = t.team_a THEN 'a' ELSE 'b' END;
        END IF;

    ELSE -- two_leg
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
            RETURN jsonb_build_object('advanced', false, 'warning', 'Os nomes dos times do confronto não batem com as pernas cadastradas.');
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
                RETURN jsonb_build_object('advanced', false,
                    'warning', 'Agregado empatado: informe o vencedor dos pênaltis da volta para definir o classificado.');
            END IF;
            w_side := CASE WHEN pen_team = t.team_a THEN 'a' WHEN pen_team = t.team_b THEN 'b' ELSE NULL END;
            IF w_side IS NULL THEN
                RETURN jsonb_build_object('advanced', false, 'warning', 'Não consegui mapear o vencedor dos pênaltis aos times do confronto.');
            END IF;
            decided := 'penalties';
        END IF;
    END IF;

    w_team := CASE WHEN w_side = 'a' THEN t.team_a ELSE t.team_b END;
    w_iso  := CASE WHEN w_side = 'a' THEN t.team_a_iso ELSE t.team_b_iso END;
    l_team := CASE WHEN w_side = 'a' THEN t.team_b ELSE t.team_a END;
    l_iso  := CASE WHEN w_side = 'a' THEN t.team_b_iso ELSE t.team_a_iso END;

    UPDATE public.ties
    SET winner_team = w_team, winner_iso = w_iso, winner_side = w_side, decided_by = decided
    WHERE id = t.id;

    IF t.round = 'final' THEN
        INSERT INTO public.tournament_competition_results
            (tournament_id, competition, champion_team, champion_iso, runner_up_team, runner_up_iso, updated_at)
        VALUES (t.tournament_id, t.competition, w_team, w_iso, l_team, l_iso, NOW())
        ON CONFLICT (tournament_id, competition) DO UPDATE
        SET champion_team = EXCLUDED.champion_team, champion_iso = EXCLUDED.champion_iso,
            runner_up_team = EXCLUDED.runner_up_team, runner_up_iso = EXCLUDED.runner_up_iso,
            updated_at = NOW();
        RETURN jsonb_build_object('advanced', true, 'championSet', true,
            'info', w_team || ' é campeão — pódio atualizado.');
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

-- EXECUTE de cliente: apenas advance_bracket_for_match (já concedido na 000015).
REVOKE EXECUTE ON FUNCTION public.ensure_tie_matches(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_tie(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.round_label(text) FROM PUBLIC, anon, authenticated;
