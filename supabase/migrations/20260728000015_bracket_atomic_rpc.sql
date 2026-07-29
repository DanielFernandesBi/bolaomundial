-- ============================================================================
-- 🔴 Chaveamento atômico + propagação de correção + anti-duplicação
-- (auditoria itens 17, 18, 19)
-- ============================================================================
-- (17) A auto-progressão estava em lib/bracket.ts como várias chamadas Supabase
--      separadas (sem transação). Falha no meio deixava estado parcial e ainda
--      podia reportar sucesso. Agora tudo roda numa ÚNICA função plpgsql (atômica:
--      qualquer RAISE reverte todas as escrituras da função).
-- (18) Corrigir um resultado que INVERTE o classificado deixava os jogos da fase
--      seguinte já criados com o time antigo. Agora a função PROPAGA a correção aos
--      jogos seguintes SE eles ainda não começaram nem receberam palpites; caso
--      contrário, BLOQUEIA com mensagem pedindo correção manual (e reverte tudo).
-- (19) Duas chamadas concorrentes podiam criar ida/volta duplicados. Índice único
--      (tie_id, leg) impede a duplicação; a criação trata unique_violation.
-- ============================================================================

-- (19) Um confronto tem no máximo uma ida e uma volta -------------------------
CREATE UNIQUE INDEX IF NOT EXISTS matches_tie_leg_uidx
    ON public.matches (tie_id, leg)
    WHERE tie_id IS NOT NULL AND leg IS NOT NULL;

-- Núcleo atômico: processa um confronto (tie) -------------------------------
CREATE OR REPLACE FUNCTION advance_tie(p_tie_id INTEGER)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t     public.ties%ROWTYPE;
    ida   public.matches%ROWTYPE;
    volta public.matches%ROWTYPE;
    nt    public.ties%ROWTYPE;
    nt_ida public.matches%ROWTYPE;
    a_goals INTEGER;
    b_goals INTEGER;
    w_side TEXT;
    decided TEXT;
    w_team TEXT; w_iso TEXT; l_team TEXT; l_iso TEXT;
    pen_team TEXT;
    cur_side_team TEXT;
    v_ida_id INTEGER; v_volta_id INTEGER;
    unsafe BOOLEAN;
    v_round_label TEXT;
BEGIN
    SELECT * INTO t FROM public.ties WHERE id = p_tie_id;
    IF t.id IS NULL OR t.ida_match_id IS NULL OR t.volta_match_id IS NULL THEN
        RETURN jsonb_build_object('advanced', false);
    END IF;
    IF t.team_a IS NULL OR t.team_b IS NULL THEN
        RETURN jsonb_build_object('advanced', false);
    END IF;

    SELECT * INTO ida   FROM public.matches WHERE id = t.ida_match_id;
    SELECT * INTO volta FROM public.matches WHERE id = t.volta_match_id;

    IF ida.status <> 'FINISHED' OR volta.status <> 'FINISHED'
       OR ida.score_home IS NULL OR ida.score_away IS NULL
       OR volta.score_home IS NULL OR volta.score_away IS NULL THEN
        RETURN jsonb_build_object('advanced', false);
    END IF;

    -- Confere que os nomes batem com as pernas
    IF NOT ((ida.team_home = t.team_a OR ida.team_away = t.team_a)
        AND (volta.team_home = t.team_a OR volta.team_away = t.team_a)
        AND (ida.team_home = t.team_b OR ida.team_away = t.team_b)
        AND (volta.team_home = t.team_b OR volta.team_away = t.team_b)) THEN
        RETURN jsonb_build_object('advanced', false,
            'warning', 'Os nomes dos times do confronto não batem com as pernas cadastradas.');
    END IF;

    a_goals :=
        (CASE WHEN ida.team_home = t.team_a THEN ida.score_home ELSE ida.score_away END)
      + (CASE WHEN volta.team_home = t.team_a THEN volta.score_home ELSE volta.score_away END);
    b_goals :=
        (CASE WHEN ida.team_home = t.team_b THEN ida.score_home ELSE ida.score_away END)
      + (CASE WHEN volta.team_home = t.team_b THEN volta.score_home ELSE volta.score_away END);

    IF a_goals <> b_goals THEN
        w_side := CASE WHEN a_goals > b_goals THEN 'a' ELSE 'b' END;
        decided := 'aggregate';
    ELSE
        -- Empate no agregado → pênaltis da volta (vencedor por pen_winner; fallback placar)
        IF volta.pen_winner = 'home' THEN pen_team := volta.team_home;
        ELSIF volta.pen_winner = 'away' THEN pen_team := volta.team_away;
        ELSIF volta.pen_home IS NOT NULL AND volta.pen_away IS NOT NULL AND volta.pen_home <> volta.pen_away THEN
            pen_team := CASE WHEN volta.pen_home > volta.pen_away THEN volta.team_home ELSE volta.team_away END;
        ELSE
            pen_team := NULL;
        END IF;

        IF pen_team IS NULL THEN
            RETURN jsonb_build_object('advanced', false,
                'warning', 'Agregado empatado: informe o vencedor dos pênaltis da volta para definir o classificado.');
        END IF;
        w_side := CASE WHEN pen_team = t.team_a THEN 'a' WHEN pen_team = t.team_b THEN 'b' ELSE NULL END;
        IF w_side IS NULL THEN
            RETURN jsonb_build_object('advanced', false,
                'warning', 'Não consegui mapear o vencedor dos pênaltis aos times do confronto.');
        END IF;
        decided := 'penalties';
    END IF;

    w_team := CASE WHEN w_side = 'a' THEN t.team_a ELSE t.team_b END;
    w_iso  := CASE WHEN w_side = 'a' THEN t.team_a_iso ELSE t.team_b_iso END;
    l_team := CASE WHEN w_side = 'a' THEN t.team_b ELSE t.team_a END;
    l_iso  := CASE WHEN w_side = 'a' THEN t.team_b_iso ELSE t.team_a_iso END;

    UPDATE public.ties
    SET winner_team = w_team, winner_iso = w_iso, winner_side = w_side, decided_by = decided
    WHERE id = t.id;

    -- Final → campeão/vice
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

    -- Avança para o próximo confronto
    IF t.next_tie_id IS NOT NULL AND t.next_slot_side IS NOT NULL THEN
        SELECT * INTO nt FROM public.ties WHERE id = t.next_tie_id;

        cur_side_team := CASE WHEN t.next_slot_side = 'a' THEN nt.team_a ELSE nt.team_b END;

        -- (18) Se o classificado deste lado MUDOU e o próximo confronto já tem jogos,
        -- só propaga se ainda não começaram nem receberam palpites; senão bloqueia.
        IF cur_side_team IS DISTINCT FROM w_team AND (nt.ida_match_id IS NOT NULL OR nt.volta_match_id IS NOT NULL) THEN
            SELECT EXISTS (
                SELECT 1 FROM public.predictions WHERE match_id IN (nt.ida_match_id, nt.volta_match_id)
            ) OR EXISTS (
                SELECT 1 FROM public.matches
                WHERE id IN (nt.ida_match_id, nt.volta_match_id)
                  AND (status = 'FINISHED' OR (match_date IS NOT NULL AND match_date <= NOW()))
            ) INTO unsafe;

            IF unsafe THEN
                RAISE EXCEPTION 'A fase seguinte deste confronto já começou ou recebeu palpites. Ajuste o chaveamento manualmente antes de corrigir o classificado.';
            END IF;
        END IF;

        -- Grava o classificado no lado correto do próximo confronto
        IF t.next_slot_side = 'a' THEN
            UPDATE public.ties SET team_a = w_team, team_a_iso = w_iso WHERE id = nt.id;
        ELSE
            UPDATE public.ties SET team_b = w_team, team_b_iso = w_iso WHERE id = nt.id;
        END IF;

        SELECT * INTO nt FROM public.ties WHERE id = t.next_tie_id;

        -- Ambos os times definidos?
        IF nt.team_a IS NOT NULL AND nt.team_b IS NOT NULL THEN
            IF nt.ida_match_id IS NULL AND nt.volta_match_id IS NULL THEN
                v_round_label := CASE nt.round
                    WHEN 'oitavas' THEN 'Oitavas de final'
                    WHEN 'quartas' THEN 'Quartas de final'
                    WHEN 'semi'    THEN 'Semifinal'
                    WHEN 'final'   THEN 'Final'
                    ELSE nt.round END;
                -- Cria ida/volta (idempotente contra corrida via índice único)
                BEGIN
                    INSERT INTO public.matches
                        (tournament_id, competition, tie_id, leg, is_knockout, has_extra_time, status, phase,
                         team_home, home_iso, team_away, away_iso, match_date)
                    VALUES
                        (nt.tournament_id, nt.competition, nt.id, 'ida', false, false, 'SCHEDULED',
                         v_round_label || ' – ida', nt.team_a, nt.team_a_iso, nt.team_b, nt.team_b_iso, NULL)
                    RETURNING id INTO v_ida_id;

                    INSERT INTO public.matches
                        (tournament_id, competition, tie_id, leg, is_knockout, has_extra_time, status, phase,
                         team_home, home_iso, team_away, away_iso, match_date)
                    VALUES
                        (nt.tournament_id, nt.competition, nt.id, 'volta', true, false, 'SCHEDULED',
                         v_round_label || ' – volta', nt.team_b, nt.team_b_iso, nt.team_a, nt.team_a_iso, NULL)
                    RETURNING id INTO v_volta_id;

                    UPDATE public.ties SET ida_match_id = v_ida_id, volta_match_id = v_volta_id WHERE id = nt.id;

                    RETURN jsonb_build_object('advanced', true, 'createdNextMatches', true,
                        'info', w_team || ' avançou — próxima fase gerada (data a definir).');
                EXCEPTION WHEN unique_violation THEN
                    -- Outra chamada concorrente já criou os jogos: nada a fazer.
                    RETURN jsonb_build_object('advanced', true,
                        'info', w_team || ' avançou.');
                END;
            ELSE
                -- (18) Jogos já existem: mantém consistentes com o confronto (correção segura)
                SELECT * INTO nt_ida FROM public.matches WHERE id = nt.ida_match_id;
                IF nt_ida.team_home IS DISTINCT FROM nt.team_a OR nt_ida.team_away IS DISTINCT FROM nt.team_b THEN
                    UPDATE public.matches
                    SET team_home = nt.team_a, home_iso = nt.team_a_iso, team_away = nt.team_b, away_iso = nt.team_b_iso
                    WHERE id = nt.ida_match_id;
                    UPDATE public.matches
                    SET team_home = nt.team_b, home_iso = nt.team_b_iso, team_away = nt.team_a, away_iso = nt.team_a_iso
                    WHERE id = nt.volta_match_id;
                END IF;
            END IF;
        END IF;

        RETURN jsonb_build_object('advanced', true, 'info', w_team || ' avançou.');
    END IF;

    RETURN jsonb_build_object('advanced', true, 'info', w_team || ' avançou.');
END;
$$ LANGUAGE plpgsql;

-- Ponto de entrada chamado pelo app (admin): recebe a partida salva ----------
CREATE OR REPLACE FUNCTION advance_bracket_for_match(p_match_id INTEGER)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tie_id INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
        RAISE EXCEPTION 'Apenas administradores podem processar o chaveamento';
    END IF;

    SELECT tie_id INTO v_tie_id FROM public.matches WHERE id = p_match_id;
    IF v_tie_id IS NULL THEN
        RETURN jsonb_build_object('advanced', false);
    END IF;

    RETURN advance_tie(v_tie_id);
END;
$$ LANGUAGE plpgsql;

-- EXECUTE só para o app (authenticated); a função tem checagem interna de admin.
REVOKE EXECUTE ON FUNCTION public.advance_tie(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_bracket_for_match(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_bracket_for_match(integer) TO authenticated;

COMMENT ON FUNCTION advance_tie IS 'Processa um confronto de mata-mata de forma ATÔMICA: vencedor, campeão/vice na final, avanço e criação/propagação da fase seguinte.';
