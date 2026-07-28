-- ============================================================================
-- SEED: Torneio MATA-MATA 2026 (Oitavas de final)
-- ============================================================================
-- Pré-requisito: rodar antes as migrações 20260628000001..05 (format, is_knockout, etc.)
-- Regime 'knockout' => todos os jogos já entram com is_knockout = true
-- (habilita os palpites de prorrogação, pênaltis e o card de pódio).
--
-- Horários em BRASÍLIA (UTC-3): os literais usam o offset -03 explicitamente.
-- Idempotente: pode rodar mais de uma vez sem duplicar.
-- ============================================================================

DO $$
DECLARE
    v_tournament_id INTEGER;
    v_existing INTEGER;
BEGIN
    -- 1) Criar (ou reutilizar) o torneio
    INSERT INTO public.tournaments (name, slug, active, format, logo_url)
    VALUES ('Mundial Mata-Mata 2026', 'mundial-mata-mata-2026', true, 'knockout', NULL)
    ON CONFLICT (slug) DO UPDATE SET format = 'knockout', active = true
    RETURNING id INTO v_tournament_id;

    IF v_tournament_id IS NULL THEN
        SELECT id INTO v_tournament_id FROM public.tournaments WHERE slug = 'mundial-mata-mata-2026';
    END IF;

    -- 2) Evitar duplicar os jogos se o seed já foi rodado
    SELECT COUNT(*) INTO v_existing FROM public.matches WHERE tournament_id = v_tournament_id;
    IF v_existing > 0 THEN
        RAISE NOTICE 'Jogos já existem para este torneio (%). Nada a inserir.', v_tournament_id;
        RETURN;
    END IF;

    -- 3) Inserir as oitavas (is_knockout = true)
    INSERT INTO public.matches
        (tournament_id, team_home, home_iso, team_away, away_iso, match_date, status, phase, is_knockout)
    VALUES
        (v_tournament_id, 'Alemanha',        'de',     'Paraguai',     'py',     '2026-06-29 17:30:00-03', 'SCHEDULED', 'Oitavas de final', true),
        (v_tournament_id, 'França',          'fr',     'Suécia',       'se',     '2026-06-30 18:00:00-03', 'SCHEDULED', 'Oitavas de final', true),
        (v_tournament_id, 'África do Sul',   'za',     'Canadá',       'ca',     '2026-06-28 16:00:00-03', 'SCHEDULED', 'Oitavas de final', true),
        (v_tournament_id, 'Holanda',         'nl',     'Marrocos',     'ma',     '2026-06-29 22:00:00-03', 'SCHEDULED', 'Oitavas de final', true),
        (v_tournament_id, 'Portugal',        'pt',     'Croácia',      'hr',     '2026-07-02 20:00:00-03', 'SCHEDULED', 'Oitavas de final', true),
        (v_tournament_id, 'Espanha',         'es',     'Áustria',      'at',     '2026-07-02 16:00:00-03', 'SCHEDULED', 'Oitavas de final', true),
        (v_tournament_id, 'Estados Unidos',  'us',     'Bósnia',       'ba',     '2026-07-01 21:00:00-03', 'SCHEDULED', 'Oitavas de final', true),
        (v_tournament_id, 'Bélgica',         'be',     'Senegal',      'sn',     '2026-07-01 17:00:00-03', 'SCHEDULED', 'Oitavas de final', true),
        (v_tournament_id, 'Brasil',          'br',     'Japão',        'jp',     '2026-06-29 14:00:00-03', 'SCHEDULED', 'Oitavas de final', true),
        (v_tournament_id, 'Costa do Marfim', 'ci',     'Noruega',      'no',     '2026-06-30 14:00:00-03', 'SCHEDULED', 'Oitavas de final', true),
        (v_tournament_id, 'México',          'mx',     'Equador',      'ec',     '2026-06-30 22:00:00-03', 'SCHEDULED', 'Oitavas de final', true),
        (v_tournament_id, 'Inglaterra',      'gb-eng', 'Congo',        'cg',     '2026-07-01 13:00:00-03', 'SCHEDULED', 'Oitavas de final', true),
        (v_tournament_id, 'Argentina',       'ar',     'Cabo Verde',   'cv',     '2026-07-03 19:00:00-03', 'SCHEDULED', 'Oitavas de final', true),
        (v_tournament_id, 'Austrália',       'au',     'Egito',        'eg',     '2026-07-03 15:00:00-03', 'SCHEDULED', 'Oitavas de final', true),
        (v_tournament_id, 'Suíça',           'ch',     'Argélia',      'dz',     '2026-07-03 00:00:00-03', 'SCHEDULED', 'Oitavas de final', true),
        (v_tournament_id, 'Colômbia',        'co',     'Gana',         'gh',     '2026-07-03 22:30:00-03', 'SCHEDULED', 'Oitavas de final', true);

    RAISE NOTICE 'Torneio "Mundial Mata-Mata 2026" criado (id %) com 16 jogos de oitavas.', v_tournament_id;
END $$;A

-- Verificação:
-- SELECT m.team_home, m.home_iso, m.team_away, m.away_iso, m.match_date, m.is_knockout
-- FROM public.matches m
-- JOIN public.tournaments t ON t.id = m.tournament_id
-- WHERE t.slug = 'mundial-mata-mata-2026'
-- ORDER BY m.match_date;
