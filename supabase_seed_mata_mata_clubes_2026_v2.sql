-- ============================================================================
-- SEED V2 — Mata-Mata de Clubes 2026 (Libertadores / Sul-Americana / Copa do BR)
-- ============================================================================
-- ⚠️ NÃO EXECUTAR ainda. Preparado para revisão. Pré-requisito: migrações
--    20260728000001..20260728000020 aplicadas.
--
-- REGRAS deste seed:
--   • NÃO cria/altera o torneio. Busca por slug 'mata-mata-clubes-2026' e RAISE se
--     não existir. NÃO muda format/name/active/logo/prêmio.
--   • Idempotência POR COMPETIÇÃO (semear uma não impede a outra; não reinsere a mesma).
--   • Escudos: fonte ÚNICA em club_crest() — mesmo clube = mesma URL nas 3 competições.
--     As URLs estão VAZIAS de propósito; preencha com URLs verificadas antes de rodar.
--     Enquanto vazias, o seed FALHA (guard) para não inserir escudo inválido.
--   • Participantes indefinidos (Sula) entram como team NULL + *_source_label; nunca clube falso.
--   • Config dos jogos: pênaltis por VENCEDOR, sem prorrogação (final: has_extra_time=true,
--     mas ainda pênaltis por vencedor e sem modalidade de palpite de prorrogação).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Fonte ÚNICA de escudos. PREENCHA cada URL (deixe exatamente igual para o mesmo
-- clube nas 3 competições). O guard aborta se algum clube usado ficar sem escudo.
-- TODAS as 35 entradas estão preenchidas e foram validadas via HTTP (2xx + imagem)
-- em 29/07/2026, com URLs de arquivo original em upload.wikimedia.org.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION club_crest(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE u TEXT;
BEGIN
    -- URLs em upload.wikimedia.org (arquivo original, HTTPS estável). Validadas via HTTP
    -- (2xx + content-type image/*) em 29/07/2026. Fontes: Wikipedia pageimages / Wikidata
    -- P154 / infobox (Commons e wikis pt/es). Nenhuma URL de thumbnail efêmera ou assinada.
    u := CASE p_name
        -- Libertadores
        WHEN 'Estudiantes'              THEN 'https://upload.wikimedia.org/wikipedia/commons/1/15/Estudiantes_de_la_Plata_crest_%282025%29_cropped.svg'
        WHEN 'Universidad Católica'     THEN 'https://upload.wikimedia.org/wikipedia/commons/c/ca/Escudo_Club_Deportivo_Universidad_Cat%C3%B3lica.svg'
        WHEN 'Rosario Central'          THEN 'https://upload.wikimedia.org/wikipedia/commons/2/22/RosarioCentral.png'
        WHEN 'Corinthians'              THEN 'https://upload.wikimedia.org/wikipedia/pt/b/b4/Corinthians_simbolo.png'
        WHEN 'Cruzeiro'                 THEN 'https://upload.wikimedia.org/wikipedia/commons/9/90/Cruzeiro_Esporte_Clube_%28logo%29.svg'
        WHEN 'Flamengo'                 THEN 'https://upload.wikimedia.org/wikipedia/commons/9/96/Clube_de_Regatas_do_Flamengo_logo.svg'
        WHEN 'Deportes Tolima'          THEN 'https://upload.wikimedia.org/wikipedia/commons/4/4a/Escudo_del_Deportes_Tolima.svg'
        WHEN 'Independiente del Valle'  THEN 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Escudoindependientedelvalle2023.png'
        WHEN 'Mirassol'                 THEN 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Mirassol_FC_logo.png'
        WHEN 'LDU Quito'                THEN 'https://upload.wikimedia.org/wikipedia/commons/e/e0/Liga_Deportiva_Universitaria_de_Quito.png'
        WHEN 'Palmeiras'                THEN 'https://upload.wikimedia.org/wikipedia/commons/1/10/Palmeiras_logo.svg'
        WHEN 'Cerro Porteño'            THEN 'https://upload.wikimedia.org/wikipedia/commons/4/44/Escudo_Club_Cerro_Porte%C3%B1o_2023-Actual.svg'
        WHEN 'Platense'                 THEN 'https://upload.wikimedia.org/wikipedia/commons/d/db/Club_Alt%C3%A9tico_Platense_crest_%282025%29.svg'
        WHEN 'Coquimbo Unido'           THEN 'https://upload.wikimedia.org/wikipedia/pt/3/30/CoquimboUnido.png'
        WHEN 'Fluminense'               THEN 'https://upload.wikimedia.org/wikipedia/commons/1/12/Fluminense_Football_Club.svg'
        WHEN 'Independiente Rivadavia'  THEN 'https://upload.wikimedia.org/wikipedia/commons/7/7f/Escudo_del_Club_Independiente_Rivadavia.svg'
        -- Copa do Brasil (adicionais)
        WHEN 'Vasco'                    THEN 'https://upload.wikimedia.org/wikipedia/pt/8/8b/EscudoDoVascoDaGama.svg'
        WHEN 'Internacional'            THEN 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Sport_Club_Internacional_logo.svg'
        WHEN 'Grêmio'                   THEN 'https://upload.wikimedia.org/wikipedia/commons/0/08/Gremio_logo.svg'
        WHEN 'Athletico-PR'             THEN 'https://upload.wikimedia.org/wikipedia/commons/4/43/Athletico_Paranaense_%28Logo_2019%29.svg'
        WHEN 'Vitória'                  THEN 'https://upload.wikimedia.org/wikipedia/commons/1/15/Esporte_Clube_Vit%C3%B3ria_%282024%29.svg'
        WHEN 'Atlético-MG'              THEN 'https://upload.wikimedia.org/wikipedia/commons/4/41/Logo_of_Clube_Atl%C3%A9tico_Mineiro.svg'
        WHEN 'Juventude'                THEN 'https://upload.wikimedia.org/wikipedia/commons/b/bf/Juventude_crest.png'
        WHEN 'Santos'                   THEN 'https://upload.wikimedia.org/wikipedia/commons/3/35/Santos_logo.svg'
        WHEN 'Remo'                     THEN 'https://upload.wikimedia.org/wikipedia/commons/7/70/Clube_do_Remo.svg'
        WHEN 'Chapecoense'              THEN 'https://upload.wikimedia.org/wikipedia/commons/4/4e/Logo_Associa%C3%A7%C3%A3o_Chapecoense_de_Futebol.svg'
        WHEN 'Fortaleza'                THEN 'https://upload.wikimedia.org/wikipedia/commons/6/6d/Fortaleza_Esporte_Clube_logo.png'
        -- Sul-Americana (clubes já definidos de um dos lados)
        WHEN 'Recoleta'                 THEN 'https://upload.wikimedia.org/wikipedia/commons/f/f7/Recoleta_Football_Club_logo_Paraguay_official_crest.png'
        WHEN 'São Paulo'                THEN 'https://upload.wikimedia.org/wikipedia/commons/4/4b/S%C3%A3o_Paulo_Futebol_Clube.png'
        WHEN 'River Plate'              THEN 'https://upload.wikimedia.org/wikipedia/commons/4/43/Club_Atl%C3%A9tico_River_Plate_logo.svg'
        WHEN 'Olimpia'                  THEN 'https://upload.wikimedia.org/wikipedia/commons/4/47/Escudo_original_de_Olimpia.png'
        WHEN 'Macará'                   THEN 'https://upload.wikimedia.org/wikipedia/commons/5/57/Macara_6.png'
        WHEN 'Montevideo City Torque'   THEN 'https://upload.wikimedia.org/wikipedia/pt/e/e2/Montevideo_City_Torque.png'
        WHEN 'Botafogo'                 THEN 'https://upload.wikimedia.org/wikipedia/commons/5/52/Botafogo_de_Futebol_e_Regatas_logo.svg'
        WHEN 'Tigre'                    THEN 'https://upload.wikimedia.org/wikipedia/commons/4/47/Escudo_del_Club_Atl%C3%A9tico_Tigre_-_2019.svg'
        ELSE NULL
    END;
    IF u IS NULL THEN
        RAISE EXCEPTION 'Escudo não mapeado em club_crest(): %', p_name;
    END IF;
    IF u = '' THEN
        RAISE EXCEPTION 'Escudo NÃO PREENCHIDO para % — edite club_crest() com a URL verificada.', p_name;
    END IF;
    RETURN u;
END;
$$;

-- ---------------------------------------------------------------------------
-- Helper: cria um confronto (tie) com config. next_tie_id é resolvido por
-- (competição, next_round, next_slot). Passe next_round=NULL para não ligar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_v2_tie(
    p_tid INT, p_comp TEXT, p_round TEXT, p_slot INT, p_series TEXT,
    p_team_a TEXT, p_iso_a TEXT, p_label_a TEXT,
    p_team_b TEXT, p_iso_b TEXT, p_label_b TEXT,
    p_next_round TEXT, p_next_slot INT, p_next_side TEXT,
    p_pen_mode TEXT DEFAULT 'winner', p_has_et BOOLEAN DEFAULT false, p_extra_en BOOLEAN DEFAULT false
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE v_next INT; v_id INT;
BEGIN
    IF p_next_round IS NOT NULL THEN
        SELECT id INTO v_next FROM public.ties
        WHERE tournament_id = p_tid AND competition = p_comp AND round = p_next_round AND slot = p_next_slot;
        IF v_next IS NULL THEN
            RAISE EXCEPTION 'Confronto-alvo % slot % não existe (crie as fases seguintes antes).', p_next_round, p_next_slot;
        END IF;
    END IF;

    INSERT INTO public.ties
        (tournament_id, competition, round, slot, series_type,
         team_a, team_a_iso, team_a_source_label, team_b, team_b_iso, team_b_source_label,
         next_tie_id, next_slot_side, match_penalty_mode, match_has_extra_time, match_extra_enabled)
    VALUES
        (p_tid, p_comp, p_round, p_slot, p_series,
         p_team_a, p_iso_a, p_label_a, p_team_b, p_iso_b, p_label_b,
         v_next, p_next_side, p_pen_mode, p_has_et, p_extra_en)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- Helper: cria ida/volta de um confronto two_leg com times já definidos (datas/venues).
CREATE OR REPLACE FUNCTION seed_v2_legs(
    p_tie_id INT, p_ida_dt TIMESTAMPTZ, p_ida_venue TEXT, p_volta_dt TIMESTAMPTZ, p_volta_venue TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE t public.ties%ROWTYPE; v_ida INT; v_volta INT;
BEGIN
    SELECT * INTO t FROM public.ties WHERE id = p_tie_id;
    INSERT INTO public.matches
        (tournament_id, competition, tie_id, leg, is_knockout, has_extra_time, penalty_prediction_mode,
         extra_prediction_enabled, status, phase, team_home, home_iso, team_away, away_iso, match_date, venue)
    VALUES
        (t.tournament_id, t.competition, t.id, 'ida', false, false, 'winner', false, 'SCHEDULED',
         'Oitavas de final – ida', t.team_a, t.team_a_iso, t.team_b, t.team_b_iso, p_ida_dt, p_ida_venue)
    RETURNING id INTO v_ida;
    INSERT INTO public.matches
        (tournament_id, competition, tie_id, leg, is_knockout, has_extra_time, penalty_prediction_mode,
         extra_prediction_enabled, status, phase, team_home, home_iso, team_away, away_iso, match_date, venue)
    VALUES
        (t.tournament_id, t.competition, t.id, 'volta', true, false, 'winner', false, 'SCHEDULED',
         'Oitavas de final – volta', t.team_b, t.team_b_iso, t.team_a, t.team_a_iso, p_volta_dt, p_volta_venue)
    RETURNING id INTO v_volta;
    UPDATE public.ties SET ida_match_id = v_ida, volta_match_id = v_volta WHERE id = t.id;
END;
$$;

-- ===========================================================================
-- LIBERTADORES — bracket fixo até a final (oitavas ligadas às quartas)
-- ===========================================================================
DO $$
DECLARE tid INT; comp TEXT := 'libertadores'; o INT[];
BEGIN
    SELECT id INTO tid FROM public.tournaments WHERE slug = 'mata-mata-clubes-2026';
    IF tid IS NULL THEN RAISE EXCEPTION 'Torneio mata-mata-clubes-2026 não encontrado.'; END IF;
    IF EXISTS (SELECT 1 FROM public.ties WHERE tournament_id = tid AND competition = comp) THEN
        RAISE NOTICE 'Libertadores já semeada — pulando.'; RETURN;
    END IF;

    -- Fases seguintes primeiro (final -> semis -> quartas), depois oitavas.
    PERFORM seed_v2_tie(tid, comp, 'final', 0, 'single', NULL,NULL,NULL, NULL,NULL,NULL, NULL,NULL,NULL, 'winner', true, false);
    PERFORM seed_v2_tie(tid, comp, 'semi', 0, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'final', 0, 'a');
    PERFORM seed_v2_tie(tid, comp, 'semi', 1, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'final', 0, 'b');
    PERFORM seed_v2_tie(tid, comp, 'quartas', 0, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'semi', 0, 'a');
    PERFORM seed_v2_tie(tid, comp, 'quartas', 1, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'semi', 0, 'b');
    PERFORM seed_v2_tie(tid, comp, 'quartas', 2, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'semi', 1, 'a');
    PERFORM seed_v2_tie(tid, comp, 'quartas', 3, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'semi', 1, 'b');

    -- Oitavas (slot i -> quartas floor(i/2), side i%2). Cria o tie e depois os jogos.
    o := ARRAY[
      seed_v2_tie(tid, comp, 'oitavas', 0, 'two_leg', 'Estudiantes', club_crest('Estudiantes'), NULL, 'Universidad Católica', club_crest('Universidad Católica'), NULL, 'quartas', 0, 'a'),
      seed_v2_tie(tid, comp, 'oitavas', 1, 'two_leg', 'Rosario Central', club_crest('Rosario Central'), NULL, 'Corinthians', club_crest('Corinthians'), NULL, 'quartas', 0, 'b'),
      seed_v2_tie(tid, comp, 'oitavas', 2, 'two_leg', 'Cruzeiro', club_crest('Cruzeiro'), NULL, 'Flamengo', club_crest('Flamengo'), NULL, 'quartas', 1, 'a'),
      seed_v2_tie(tid, comp, 'oitavas', 3, 'two_leg', 'Deportes Tolima', club_crest('Deportes Tolima'), NULL, 'Independiente del Valle', club_crest('Independiente del Valle'), NULL, 'quartas', 1, 'b'),
      seed_v2_tie(tid, comp, 'oitavas', 4, 'two_leg', 'Mirassol', club_crest('Mirassol'), NULL, 'LDU Quito', club_crest('LDU Quito'), NULL, 'quartas', 2, 'a'),
      seed_v2_tie(tid, comp, 'oitavas', 5, 'two_leg', 'Palmeiras', club_crest('Palmeiras'), NULL, 'Cerro Porteño', club_crest('Cerro Porteño'), NULL, 'quartas', 2, 'b'),
      seed_v2_tie(tid, comp, 'oitavas', 6, 'two_leg', 'Platense', club_crest('Platense'), NULL, 'Coquimbo Unido', club_crest('Coquimbo Unido'), NULL, 'quartas', 3, 'a'),
      seed_v2_tie(tid, comp, 'oitavas', 7, 'two_leg', 'Fluminense', club_crest('Fluminense'), NULL, 'Independiente Rivadavia', club_crest('Independiente Rivadavia'), NULL, 'quartas', 3, 'b')
    ];

    -- Jogos das oitavas (datas em -03; estádios oficiais)
    PERFORM seed_v2_legs(o[1], '2026-08-11 21:30:00-03', 'Estádio UNO Jorge Luis Hirschi', '2026-08-18 21:30:00-03', 'Claro Arena');
    PERFORM seed_v2_legs(o[2], '2026-08-13 21:30:00-03', 'Estádio Gigante de Arroyito',    '2026-08-20 21:30:00-03', 'Neo Química Arena');
    PERFORM seed_v2_legs(o[3], '2026-08-12 21:30:00-03', 'Mineirão',                        '2026-08-19 21:30:00-03', 'Maracanã');
    PERFORM seed_v2_legs(o[4], '2026-08-11 21:30:00-03', 'Estádio Manuel Murillo Toro',     '2026-08-18 21:30:00-03', 'Estádio Banco Guayaquil');
    PERFORM seed_v2_legs(o[5], '2026-08-13 19:00:00-03', 'Estádio José Maria de Campos Maia','2026-08-20 19:00:00-03', 'Estádio Rodrigo Paz Delgado');
    PERFORM seed_v2_legs(o[6], '2026-08-12 19:00:00-03', 'Allianz Parque',                  '2026-08-19 19:00:00-03', 'Estádio Ueno La Nueva Olla');
    PERFORM seed_v2_legs(o[7], '2026-08-12 19:00:00-03', 'Estádio Ciudad de Vicente López', '2026-08-19 19:00:00-03', 'Estádio Francisco Sánchez Rumoroso');
    PERFORM seed_v2_legs(o[8], '2026-08-11 19:00:00-03', 'Maracanã', '2026-08-18 19:00:00-03', 'Estádio Malvinas Argentinas');

    RAISE NOTICE 'Libertadores semeada (bracket fixo até a final).';
END $$;

-- ===========================================================================
-- COPA DO BRASIL — oitavas NÃO ligadas às quartas (novo sorteio depois)
-- ===========================================================================
DO $$
DECLARE tid INT; comp TEXT := 'copa_do_brasil'; o INT[];
BEGIN
    SELECT id INTO tid FROM public.tournaments WHERE slug = 'mata-mata-clubes-2026';
    IF tid IS NULL THEN RAISE EXCEPTION 'Torneio mata-mata-clubes-2026 não encontrado.'; END IF;
    IF EXISTS (SELECT 1 FROM public.ties WHERE tournament_id = tid AND competition = comp) THEN
        RAISE NOTICE 'Copa do Brasil já semeada — pulando.'; RETURN;
    END IF;

    -- Final -> semis -> quartas (quartas ligadas às semis; oitavas NÃO ligam)
    -- Copa do Brasil 2026 (CBF): sem prorrogação; empate vai direto aos pênaltis. has_extra_time = FALSE.
    PERFORM seed_v2_tie(tid, comp, 'final', 0, 'single', NULL,NULL,NULL, NULL,NULL,NULL, NULL,NULL,NULL, 'winner', false, false);
    PERFORM seed_v2_tie(tid, comp, 'semi', 0, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'final', 0, 'a');
    PERFORM seed_v2_tie(tid, comp, 'semi', 1, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'final', 0, 'b');
    PERFORM seed_v2_tie(tid, comp, 'quartas', 0, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'semi', 0, 'a');
    PERFORM seed_v2_tie(tid, comp, 'quartas', 1, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'semi', 0, 'b');
    PERFORM seed_v2_tie(tid, comp, 'quartas', 2, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'semi', 1, 'a');
    PERFORM seed_v2_tie(tid, comp, 'quartas', 3, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'semi', 1, 'b');

    -- Oitavas SEM next (aguardam sorteio das quartas via apply_round_draw)
    o := ARRAY[
      seed_v2_tie(tid, comp, 'oitavas', 0, 'two_leg', 'Vasco', club_crest('Vasco'), NULL, 'Fluminense', club_crest('Fluminense'), NULL, NULL,NULL,NULL),
      seed_v2_tie(tid, comp, 'oitavas', 1, 'two_leg', 'Internacional', club_crest('Internacional'), NULL, 'Corinthians', club_crest('Corinthians'), NULL, NULL,NULL,NULL),
      seed_v2_tie(tid, comp, 'oitavas', 2, 'two_leg', 'Mirassol', club_crest('Mirassol'), NULL, 'Grêmio', club_crest('Grêmio'), NULL, NULL,NULL,NULL),
      seed_v2_tie(tid, comp, 'oitavas', 3, 'two_leg', 'Athletico-PR', club_crest('Athletico-PR'), NULL, 'Vitória', club_crest('Vitória'), NULL, NULL,NULL,NULL),
      seed_v2_tie(tid, comp, 'oitavas', 4, 'two_leg', 'Atlético-MG', club_crest('Atlético-MG'), NULL, 'Juventude', club_crest('Juventude'), NULL, NULL,NULL,NULL),
      seed_v2_tie(tid, comp, 'oitavas', 5, 'two_leg', 'Santos', club_crest('Santos'), NULL, 'Remo', club_crest('Remo'), NULL, NULL,NULL,NULL),
      seed_v2_tie(tid, comp, 'oitavas', 6, 'two_leg', 'Chapecoense', club_crest('Chapecoense'), NULL, 'Cruzeiro', club_crest('Cruzeiro'), NULL, NULL,NULL,NULL),
      seed_v2_tie(tid, comp, 'oitavas', 7, 'two_leg', 'Palmeiras', club_crest('Palmeiras'), NULL, 'Fortaleza', club_crest('Fortaleza'), NULL, NULL,NULL,NULL)
    ];

    PERFORM seed_v2_legs(o[1], '2026-08-01 17:30:00-03', 'Maracanã',                    '2026-08-05 21:30:00-03', 'Maracanã');
    PERFORM seed_v2_legs(o[2], '2026-08-02 19:30:00-03', 'Beira-Rio',                   '2026-08-06 20:00:00-03', 'Neo Química Arena');
    PERFORM seed_v2_legs(o[3], '2026-08-02 18:00:00-03', 'José Maria de Campos Maia',   '2026-08-05 19:30:00-03', 'Arena do Grêmio');
    PERFORM seed_v2_legs(o[4], '2026-08-03 21:00:00-03', 'Arena da Baixada',            '2026-08-06 20:00:00-03', 'Manoel Barradas');
    PERFORM seed_v2_legs(o[5], '2026-08-01 19:30:00-03', 'Arena MRV',                   '2026-08-04 19:30:00-03', 'Alfredo Jaconi');
    PERFORM seed_v2_legs(o[6], '2026-08-01 21:00:00-03', 'Vila Belmiro',               '2026-08-04 21:30:00-03', 'Mangueirão');
    PERFORM seed_v2_legs(o[7], '2026-08-02 18:30:00-03', 'Arena Condá',                 '2026-08-05 19:00:00-03', 'Mineirão');
    PERFORM seed_v2_legs(o[8], '2026-08-02 16:00:00-03', 'Nubank Parque',               '2026-08-05 21:30:00-03', 'Arena Pantanal');

    RAISE NOTICE 'Copa do Brasil semeada (oitavas SEM ligação com as quartas).';
END $$;

-- ===========================================================================
-- SUL-AMERICANA — bracket fixo; oitavas parcialmente resolvidas (snapshot 29/07/2026)
-- ===========================================================================
DO $$
DECLARE tid INT; comp TEXT := 'sudamericana'; o5 INT; o6 INT;
BEGIN
    SELECT id INTO tid FROM public.tournaments WHERE slug = 'mata-mata-clubes-2026';
    IF tid IS NULL THEN RAISE EXCEPTION 'Torneio mata-mata-clubes-2026 não encontrado.'; END IF;
    IF EXISTS (SELECT 1 FROM public.ties WHERE tournament_id = tid AND competition = comp) THEN
        RAISE NOTICE 'Sul-Americana já semeada — pulando.'; RETURN;
    END IF;

    PERFORM seed_v2_tie(tid, comp, 'final', 0, 'single', NULL,NULL,NULL, NULL,NULL,NULL, NULL,NULL,NULL, 'winner', true, false);
    PERFORM seed_v2_tie(tid, comp, 'semi', 0, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'final', 0, 'a');
    PERFORM seed_v2_tie(tid, comp, 'semi', 1, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'final', 0, 'b');
    PERFORM seed_v2_tie(tid, comp, 'quartas', 0, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'semi', 0, 'a');
    PERFORM seed_v2_tie(tid, comp, 'quartas', 1, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'semi', 0, 'b');
    PERFORM seed_v2_tie(tid, comp, 'quartas', 2, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'semi', 1, 'a');
    PERFORM seed_v2_tie(tid, comp, 'quartas', 3, 'two_leg', NULL,NULL,NULL, NULL,NULL,NULL, 'semi', 1, 'b');

    -- Oitavas. Snapshot 29/07/2026: 6 vagas ainda pendentes (source_label, time NULL);
    -- 2 playoffs já encerrados entram resolvidos (slots 5 e 6) com seus jogos.
    PERFORM seed_v2_tie(tid, comp, 'oitavas', 0, 'two_leg', NULL, NULL, 'Vencedor de Boca Juniors x O''Higgins', 'Recoleta', club_crest('Recoleta'), NULL, 'quartas', 0, 'a');
    PERFORM seed_v2_tie(tid, comp, 'oitavas', 1, 'two_leg', NULL, NULL, 'Vencedor de Bolívar x Grêmio', 'São Paulo', club_crest('São Paulo'), NULL, 'quartas', 0, 'b');
    PERFORM seed_v2_tie(tid, comp, 'oitavas', 2, 'two_leg', NULL, NULL, 'Vencedor de Santa Fe x Caracas', 'River Plate', club_crest('River Plate'), NULL, 'quartas', 1, 'a');
    PERFORM seed_v2_tie(tid, comp, 'oitavas', 3, 'two_leg', NULL, NULL, 'Vencedor de Independiente Medellín x Vasco', 'Olimpia', club_crest('Olimpia'), NULL, 'quartas', 1, 'b');
    PERFORM seed_v2_tie(tid, comp, 'oitavas', 4, 'two_leg', NULL, NULL, 'Vencedor de Sporting Cristal x RB Bragantino', 'Atlético-MG', club_crest('Atlético-MG'), NULL, 'quartas', 2, 'a');

    -- SLOT 5 (encerrado): Santos venceu o playoff (8x3 no agregado) -> Santos x Macará
    o5 := seed_v2_tie(tid, comp, 'oitavas', 5, 'two_leg', 'Santos', club_crest('Santos'), NULL, 'Macará', club_crest('Macará'), NULL, 'quartas', 2, 'b');
    PERFORM seed_v2_legs(o5, NULL::timestamptz, NULL::text, NULL::timestamptz, NULL::text);

    -- SLOT 6 (encerrado): Tigre avançou (4x2 no agregado) -> Tigre x Montevideo City Torque
    o6 := seed_v2_tie(tid, comp, 'oitavas', 6, 'two_leg', 'Tigre', club_crest('Tigre'), NULL, 'Montevideo City Torque', club_crest('Montevideo City Torque'), NULL, 'quartas', 3, 'a');
    PERFORM seed_v2_legs(o6, NULL::timestamptz, NULL::text, NULL::timestamptz, NULL::text);

    PERFORM seed_v2_tie(tid, comp, 'oitavas', 7, 'two_leg', NULL, NULL, 'Vencedor de Lanús x Cienciano', 'Botafogo', club_crest('Botafogo'), NULL, 'quartas', 3, 'b');

    RAISE NOTICE 'Sul-Americana semeada (6 vagas pendentes; slots 5 e 6 resolvidos com jogos).';
END $$;

-- ---------------------------------------------------------------------------
-- Limpeza: remover os helpers do seed (não há dependência posterior — advance_tie/
-- ensure_tie_matches/etc. NÃO usam estes). Só roda ao final de uma execução completa.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN ('seed_v2_tie', 'seed_v2_legs', 'club_crest')
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Verificação:
-- SELECT competition, round, slot, series_type, team_a, team_b,
--        team_a_source_label, team_b_source_label, next_tie_id
-- FROM public.ties
-- WHERE tournament_id = (SELECT id FROM tournaments WHERE slug='mata-mata-clubes-2026')
-- ORDER BY competition, round, slot;
-- ---------------------------------------------------------------------------
