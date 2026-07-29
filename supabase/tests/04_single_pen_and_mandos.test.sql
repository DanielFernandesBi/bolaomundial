-- ============================================================================
-- pgTAP: pênaltis em jogo único (ordem prorrogação->pênaltis) e tolerância de mandos
-- ============================================================================
BEGIN;
SELECT plan(7);

INSERT INTO public.tournaments (name, slug, active, format)
VALUES ('pgtap clubs3', '__pgtap_clubs3__', false, 'mixed');

-- cria um confronto SINGLE finalizado e devolve o tie (para checar o classificado)
CREATE FUNCTION _mk_single(p_comp TEXT, p_slot INT, p_a TEXT, p_b TEXT,
    p_sh INT, p_sa INT, p_has_et BOOLEAN, p_et TEXT, p_pen TEXT)
RETURNS INT AS $$
DECLARE v_t INT; v_tie INT; v_m INT;
BEGIN
    SELECT id INTO v_t FROM public.tournaments WHERE slug='__pgtap_clubs3__';
    INSERT INTO public.ties (tournament_id, competition, round, slot, series_type, team_a, team_b, match_has_extra_time)
    VALUES (v_t, p_comp, 'final', p_slot, 'single', p_a, p_b, p_has_et) RETURNING id INTO v_tie;
    INSERT INTO public.matches
        (tournament_id, competition, tie_id, leg, is_knockout, has_extra_time, penalty_prediction_mode,
         extra_prediction_enabled, status, team_home, team_away, score_home, score_away, extra_time_result, pen_winner, match_date)
    VALUES (v_t, p_comp, v_tie, 'single', true, p_has_et, 'winner', false, 'FINISHED',
            p_a, p_b, p_sh, p_sa, p_et, p_pen, now())
    RETURNING id INTO v_m;
    UPDATE public.ties SET ida_match_id = v_m WHERE id = v_tie;
    PERFORM advance_tie(v_tie);
    RETURN v_tie;
END; $$ LANGUAGE plpgsql;

-- 1) tempo normal com vencedor -> ignora pen_winner residual (vence quem ganhou)
SELECT is((SELECT winner_team FROM public.ties WHERE id = _mk_single('libertadores',0,'X','Y', 2,1, false, NULL, 'away')),
          'X', 'single: vencedor no tempo normal ignora pen_winner residual');

-- 2) empate sem prorrogação -> pen_winner decide
SELECT is((SELECT winner_team FROM public.ties WHERE id = _mk_single('sudamericana',0,'X','Y', 1,1, false, NULL, 'away')),
          'Y', 'single: empate sem prorrogação decidido pelos pênaltis');

-- 3) empate com prorrogação vencida -> ET decide, pen residual ignorado
SELECT is((SELECT winner_team FROM public.ties WHERE id = _mk_single('copa_do_brasil',0,'X','Y', 1,1, true, 'home', 'away')),
          'X', 'single: prorrogação (home) decide e ignora pênaltis residuais');

-- 4) empate com prorrogação também empatada -> pen_winner decide
SELECT is((SELECT winner_team FROM public.ties WHERE id = _mk_single('libertadores',1,'X','Y', 1,1, true, 'draw', 'away')),
          'Y', 'single: prorrogação empatada -> pênaltis decidem');

-- ---- Mandos: ensure_tie_matches não desfaz inversão; corrige clube diferente ----
DO $$
DECLARE v_t INT; qf INT; m_ida INT; m_volta INT;
BEGIN
    SELECT id INTO v_t FROM public.tournaments WHERE slug='__pgtap_clubs3__';
    INSERT INTO public.ties (tournament_id, competition, round, slot, series_type, team_a, team_b)
    VALUES (v_t, 'libertadores', 'quartas', 0, 'two_leg', 'A', 'B') RETURNING id INTO qf;
    -- Cria os jogos com MANDOS INVERTIDOS (ida com B em casa, volta com A em casa)
    INSERT INTO public.matches (tournament_id, competition, tie_id, leg, is_knockout, status, team_home, team_away, match_date)
    VALUES (v_t,'libertadores',qf,'ida',false,'SCHEDULED','B','A',NULL) RETURNING id INTO m_ida;
    INSERT INTO public.matches (tournament_id, competition, tie_id, leg, is_knockout, status, team_home, team_away, match_date)
    VALUES (v_t,'libertadores',qf,'volta',true,'SCHEDULED','A','B',NULL) RETURNING id INTO m_volta;
    UPDATE public.ties SET ida_match_id=m_ida, volta_match_id=m_volta WHERE id=qf;
END $$;

-- 5) ensure_tie_matches NÃO desfaz a inversão de mandos (mesmos clubes)
SELECT is(ensure_tie_matches((SELECT id FROM public.ties WHERE competition='libertadores' AND round='quartas' AND slot=0)),
          'exists', 'ensure_tie_matches não desfaz inversão de mandos');

-- 6) a inversão continua (ida com o time B em casa)
SELECT is((SELECT m.team_home FROM public.matches m JOIN public.ties t ON t.id=m.tie_id
           WHERE t.competition='libertadores' AND t.round='quartas' AND t.slot=0 AND m.leg='ida'),
          'B', 'mandos invertidos preservados');

-- 7) se aparecer um clube DIFERENTE, ensure corrige (rebuild padrão)
SELECT is(
    (WITH upd AS (
        UPDATE public.ties SET team_a='Z', team_a_iso=NULL
        WHERE competition='libertadores' AND round='quartas' AND slot=0 RETURNING id)
     SELECT ensure_tie_matches(id) FROM upd),
    'updated', 'ensure corrige quando aparece clube diferente');

SELECT * FROM finish();
ROLLBACK;
