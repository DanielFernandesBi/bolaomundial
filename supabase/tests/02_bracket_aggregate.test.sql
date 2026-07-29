-- ============================================================================
-- pgTAP: agregado do confronto (tie_aggregate_tied) — base da decisão de pênaltis
-- ============================================================================
BEGIN;
SELECT plan(4);

-- Torneio de fixture (rollback no fim)
INSERT INTO public.tournaments (name, slug, active, format)
VALUES ('pgtap clubes', '__pgtap_clubes__', false, 'knockout');

-- Cria um confronto (ida + volta) e devolve o tie_id.
CREATE FUNCTION _mk_tie(
    p_team_a TEXT, p_team_b TEXT,
    p_ida_home TEXT, p_ida_sh INT, p_ida_sa INT,
    p_volta_home TEXT, p_volta_sh INT, p_volta_sa INT,
    p_finished BOOLEAN DEFAULT true
) RETURNS INT AS $$
DECLARE
    v_t INT; v_ida INT; v_volta INT; v_tie INT; v_status TEXT;
BEGIN
    v_status := CASE WHEN p_finished THEN 'FINISHED' ELSE 'SCHEDULED' END;
    SELECT id INTO v_t FROM public.tournaments WHERE slug = '__pgtap_clubes__';

    INSERT INTO public.matches
        (tournament_id, team_home, team_away, match_date, score_home, score_away, status, is_knockout, has_extra_time, leg)
    VALUES
        (v_t, p_ida_home, CASE WHEN p_ida_home = p_team_a THEN p_team_b ELSE p_team_a END,
         now(), p_ida_sh, p_ida_sa, v_status, false, false, 'ida')
    RETURNING id INTO v_ida;

    INSERT INTO public.matches
        (tournament_id, team_home, team_away, match_date, score_home, score_away, status, is_knockout, has_extra_time, leg)
    VALUES
        (v_t, p_volta_home, CASE WHEN p_volta_home = p_team_a THEN p_team_b ELSE p_team_a END,
         now(), p_volta_sh, p_volta_sa, v_status, true, false, 'volta')
    RETURNING id INTO v_volta;

    INSERT INTO public.ties
        (tournament_id, competition, round, slot, team_a, team_b, ida_match_id, volta_match_id)
    VALUES
        (v_t, 'libertadores', 'quartas', floor(random() * 1000000)::int, p_team_a, p_team_b, v_ida, v_volta)
    RETURNING id INTO v_tie;

    RETURN v_tie;
END;
$$ LANGUAGE plpgsql;

-- Empate no agregado (1-1 + 1-1 = 2-2)
SELECT is(tie_aggregate_tied(_mk_tie('A','B','A',1,1,'B',1,1)), true,
          'agregado empatado (2-2) => true');

-- Não empatado (ida 2-1, volta A vence fora 1-0 => 3-1)
SELECT is(tie_aggregate_tied(_mk_tie('A','B','A',2,1,'B',0,1)), false,
          'agregado 3-1 => false');

-- Mandantes invertidos (Y manda a ida, X manda a volta), agregado 1-1
SELECT is(tie_aggregate_tied(_mk_tie('X','Y','Y',0,1,'X',0,1)), true,
          'empate com mandantes invertidos => true');

-- Pernas não finalizadas => false
SELECT is(tie_aggregate_tied(_mk_tie('A','B','A',1,1,'B',1,1, false)), false,
          'pernas não finalizadas => false');

SELECT * FROM finish();
ROLLBACK;
