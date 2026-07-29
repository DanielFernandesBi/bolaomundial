-- ============================================================================
-- pgTAP: fluxo do chaveamento (advance_tie / ensure_tie_matches)
--   A) bracket fixo: 2 vencedores -> 1 QF gera exatamente 1 ida + 1 volta (sem dup)
--   B) barreira de sorteio: oitavas sem next não cria QF
--   C) participante pendente: source_label não cria jogo; ao completar, cria
--   D) final single: gera 1 match 'single' (nunca volta); campeão gravado
--   E) pênaltis decidem no agregado empatado
-- (Os wrappers com checagem de admin — resolve_tie_participant/apply_round_draw —
--  usam este mesmo núcleo; o caminho de auth é exercido pelo app.)
-- ============================================================================
BEGIN;
SELECT plan(12);

INSERT INTO public.tournaments (name, slug, active, format)
VALUES ('pgtap clubs2', '__pgtap_clubs2__', false, 'mixed');

-- helper: insere um jogo FINISHED ligado a um tie
CREATE FUNCTION _leg(p_tie INT, p_leg TEXT, p_home TEXT, p_away TEXT, p_sh INT, p_sa INT, p_pen TEXT DEFAULT NULL)
RETURNS INT AS $$
DECLARE v_t INT; v_id INT; v_ko BOOLEAN;
BEGIN
    SELECT tournament_id INTO v_t FROM public.ties WHERE id = p_tie;
    v_ko := (p_leg <> 'ida');
    INSERT INTO public.matches
        (tournament_id, competition, tie_id, leg, is_knockout, has_extra_time, penalty_prediction_mode,
         extra_prediction_enabled, status, team_home, team_away, score_home, score_away, pen_winner, match_date)
    VALUES (v_t, 'libertadores', p_tie, p_leg, v_ko, false, 'winner', false, 'FINISHED',
            p_home, p_away, p_sh, p_sa, p_pen, now())
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$ LANGUAGE plpgsql;

DO $$
DECLARE
    tid INT; qf INT; o0 INT; o1 INT; fin INT; pend INT; agg INT;
    a INT; b INT;
BEGIN
    SELECT id INTO tid FROM public.tournaments WHERE slug = '__pgtap_clubs2__';

    -- QF vazio (two_leg)
    INSERT INTO public.ties (tournament_id, competition, round, slot, series_type) VALUES (tid,'libertadores','quartas',0,'two_leg') RETURNING id INTO qf;
    -- Oitavas O0/O1 ligadas ao QF (lados a/b)
    INSERT INTO public.ties (tournament_id, competition, round, slot, series_type, team_a, team_b, next_tie_id, next_slot_side)
      VALUES (tid,'libertadores','oitavas',0,'two_leg','T1','T2',qf,'a') RETURNING id INTO o0;
    INSERT INTO public.ties (tournament_id, competition, round, slot, series_type, team_a, team_b, next_tie_id, next_slot_side)
      VALUES (tid,'libertadores','oitavas',1,'two_leg','T3','T4',qf,'b') RETURNING id INTO o1;

    -- O0: ida T1 2x0 T2, volta T2 0x0 T1 -> agg T1 2x0 -> T1 avança
    UPDATE public.ties SET ida_match_id=_leg(o0,'ida','T1','T2',2,0), volta_match_id=_leg(o0,'volta','T2','T1',0,0) WHERE id=o0;
    -- O1: ida T3 1x0 T4, volta T4 0x0 T3 -> T3 avança
    UPDATE public.ties SET ida_match_id=_leg(o1,'ida','T3','T4',1,0), volta_match_id=_leg(o1,'volta','T4','T3',0,0) WHERE id=o1;

    PERFORM advance_tie(o0);
    PERFORM advance_tie(o1);

    -- barreira: oitava sem next não cria QF (não há next_tie_id) — validamos com um tie solto
    INSERT INTO public.ties (tournament_id, competition, round, slot, series_type, team_a, team_b)
      VALUES (tid,'copa_do_brasil','oitavas',0,'two_leg','C1','C2') RETURNING id INTO agg;
    UPDATE public.ties SET ida_match_id=_leg(agg,'ida','C1','C2',1,1), volta_match_id=_leg(agg,'volta','C2','C1',1,1) WHERE id=agg;
    -- agregado 2x2 empatado, sem pênaltis -> advance retorna warning (não classifica)

    -- final single
    INSERT INTO public.ties (tournament_id, competition, round, slot, series_type, team_a, team_b, match_penalty_mode, match_has_extra_time)
      VALUES (tid,'libertadores','final',0,'single','FX','FY','winner',true) RETURNING id INTO fin;
    PERFORM ensure_tie_matches(fin);

    -- pendente
    INSERT INTO public.ties (tournament_id, competition, round, slot, series_type, team_b, team_a_source_label)
      VALUES (tid,'sudamericana','oitavas',0,'two_leg','SB','Vencedor de X x Y') RETURNING id INTO pend;
END $$;

-- A) QF recebeu os dois classificados e gerou 1 ida + 1 volta
SELECT is((SELECT team_a FROM public.ties WHERE competition='libertadores' AND round='quartas' AND slot=0), 'T1', 'QF lado A = T1 (agregado)');
SELECT is((SELECT team_b FROM public.ties WHERE competition='libertadores' AND round='quartas' AND slot=0), 'T3', 'QF lado B = T3');
SELECT is((SELECT count(*)::int FROM public.matches m JOIN public.ties t ON t.id=m.tie_id WHERE t.round='quartas' AND t.competition='libertadores'), 2, 'QF gerou exatamente 2 jogos (ida+volta)');
SELECT is((SELECT count(*)::int FROM public.matches m JOIN public.ties t ON t.id=m.tie_id WHERE t.round='quartas' AND m.leg='volta'), 1, 'QF tem exatamente 1 volta');

-- anti-duplicação: re-advançar não cria jogos novos
SELECT lives_ok($$ SELECT advance_tie((SELECT id FROM public.ties WHERE competition='libertadores' AND round='oitavas' AND slot=0)) $$, 're-advance idempotente');
SELECT is((SELECT count(*)::int FROM public.matches m JOIN public.ties t ON t.id=m.tie_id WHERE t.round='quartas' AND t.competition='libertadores'), 2, 'sem duplicar após re-advance');

-- B) barreira: agregado empatado sem pênaltis não classifica
SELECT is((SELECT (advance_tie((SELECT id FROM public.ties WHERE competition='copa_do_brasil' AND round='oitavas' AND slot=0))->>'advanced')), 'false', 'agregado empatado sem pênaltis não classifica');

-- D) final single gerou exatamente 1 jogo 'single', sem volta
SELECT is((SELECT count(*)::int FROM public.matches m JOIN public.ties t ON t.id=m.tie_id WHERE t.round='final' AND t.competition='libertadores'), 1, 'final single = 1 jogo');
SELECT is((SELECT leg FROM public.matches m JOIN public.ties t ON t.id=m.tie_id WHERE t.round='final' AND t.competition='libertadores'), 'single', 'jogo da final tem leg single');

-- Finaliza a final e confere campeão/vice
SELECT lives_ok($$
  DO $inner$
  DECLARE fmid INT; ftie INT;
  BEGIN
    SELECT id, ida_match_id INTO ftie, fmid FROM public.ties WHERE competition='libertadores' AND round='final' AND slot=0;
    UPDATE public.matches SET status='FINISHED', score_home=2, score_away=1 WHERE id=fmid;
    PERFORM advance_tie(ftie);
  END $inner$;
$$, 'finaliza a final');
SELECT is((SELECT champion_team FROM public.tournament_competition_results WHERE competition='libertadores'), 'FX', 'campeão gravado (jogo único)');

-- C) participante pendente não cria jogos
SELECT is((SELECT ensure_tie_matches((SELECT id FROM public.ties WHERE competition='sudamericana' AND round='oitavas' AND slot=0))), 'pending', 'lado pendente não cria jogos');

SELECT * FROM finish();
ROLLBACK;
