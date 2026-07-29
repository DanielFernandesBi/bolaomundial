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
-- clube nas 3 competições). Enquanto '' , o seed aborta.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION club_crest(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE u TEXT;
BEGIN
    u := CASE p_name
        -- Libertadores
        WHEN 'Estudiantes'              THEN ''
        WHEN 'Universidad Católica'     THEN ''
        WHEN 'Rosario Central'          THEN ''
        WHEN 'Corinthians'              THEN ''
        WHEN 'Cruzeiro'                 THEN ''
        WHEN 'Flamengo'                 THEN ''
        WHEN 'Deportes Tolima'          THEN ''
        WHEN 'Independiente del Valle'  THEN ''
        WHEN 'Mirassol'                 THEN ''
        WHEN 'LDU Quito'                THEN ''
        WHEN 'Palmeiras'                THEN ''
        WHEN 'Cerro Porteño'            THEN ''
        WHEN 'Platense'                 THEN ''
        WHEN 'Coquimbo Unido'           THEN ''
        WHEN 'Fluminense'               THEN ''
        WHEN 'Independiente Rivadavia'  THEN ''
        -- Copa do Brasil (adicionais)
        WHEN 'Vasco'                    THEN ''
        WHEN 'Internacional'            THEN ''
        WHEN 'Grêmio'                   THEN ''
        WHEN 'Athletico-PR'             THEN ''
        WHEN 'Vitória'                  THEN ''
        WHEN 'Atlético-MG'              THEN ''
        WHEN 'Juventude'                THEN ''
        WHEN 'Santos'                   THEN ''
        WHEN 'Remo'                     THEN ''
        WHEN 'Chapecoense'              THEN ''
        WHEN 'Fortaleza'                THEN ''
        -- Sul-Americana (clubes já definidos de um dos lados)
        WHEN 'Recoleta'                 THEN ''
        WHEN 'São Paulo'                THEN ''
        WHEN 'River Plate'              THEN ''
        WHEN 'Olimpia'                  THEN ''
        WHEN 'Macará'                   THEN ''
        WHEN 'Montevideo City Torque'   THEN ''
        WHEN 'Botafogo'                 THEN ''
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

    -- Jogos das oitavas (datas em -03; venues oficiais a preencher se desejado)
    PERFORM seed_v2_legs(o[1], '2026-08-11 21:30:00-03', NULL, '2026-08-18 21:30:00-03', NULL);
    PERFORM seed_v2_legs(o[2], '2026-08-13 21:30:00-03', NULL, '2026-08-20 21:30:00-03', NULL);
    PERFORM seed_v2_legs(o[3], '2026-08-12 21:30:00-03', NULL, '2026-08-19 21:30:00-03', NULL);
    PERFORM seed_v2_legs(o[4], '2026-08-11 21:30:00-03', NULL, '2026-08-18 21:30:00-03', NULL);
    PERFORM seed_v2_legs(o[5], '2026-08-13 19:00:00-03', NULL, '2026-08-20 19:00:00-03', NULL);
    PERFORM seed_v2_legs(o[6], '2026-08-12 19:00:00-03', NULL, '2026-08-19 19:00:00-03', NULL);
    PERFORM seed_v2_legs(o[7], '2026-08-12 19:00:00-03', NULL, '2026-08-19 19:00:00-03', NULL);
    PERFORM seed_v2_legs(o[8], '2026-08-11 19:00:00-03', NULL, '2026-08-18 19:00:00-03', NULL);

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
    PERFORM seed_v2_tie(tid, comp, 'final', 0, 'single', NULL,NULL,NULL, NULL,NULL,NULL, NULL,NULL,NULL, 'winner', true, false);
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
    PERFORM seed_v2_legs(o[4], '2026-08-03 21:00:00-03', 'Arena da Baixada',            '2026-08-06 20:00:00-03', 'Barradão');
    PERFORM seed_v2_legs(o[5], '2026-08-01 19:30:00-03', 'Arena MRV',                   '2026-08-04 19:30:00-03', 'Alfredo Jaconi');
    PERFORM seed_v2_legs(o[6], '2026-08-01 21:00:00-03', 'Vila Belmiro',               '2026-08-04 21:30:00-03', 'Mangueirão');
    PERFORM seed_v2_legs(o[7], '2026-08-02 18:30:00-03', 'Arena Condá',                 '2026-08-05 19:00:00-03', 'Mineirão');
    PERFORM seed_v2_legs(o[8], '2026-08-02 16:00:00-03', 'Nubank Parque (Allianz)',     '2026-08-05 21:30:00-03', 'Arena Pantanal');

    RAISE NOTICE 'Copa do Brasil semeada (oitavas SEM ligação com as quartas).';
END $$;

-- ===========================================================================
-- SUL-AMERICANA — bracket fixo; oitavas com participantes PENDENTES (source_label)
-- ===========================================================================
DO $$
DECLARE tid INT; comp TEXT := 'sudamericana';
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

    -- Oitavas: lado A pendente (source_label, time NULL), lado B já definido. Sem datas (TBC).
    PERFORM seed_v2_tie(tid, comp, 'oitavas', 0, 'two_leg', NULL, NULL, 'Vencedor de Boca Juniors x O''Higgins', 'Recoleta', club_crest('Recoleta'), NULL, 'quartas', 0, 'a');
    PERFORM seed_v2_tie(tid, comp, 'oitavas', 1, 'two_leg', NULL, NULL, 'Vencedor de Bolívar x Grêmio', 'São Paulo', club_crest('São Paulo'), NULL, 'quartas', 0, 'b');
    PERFORM seed_v2_tie(tid, comp, 'oitavas', 2, 'two_leg', NULL, NULL, 'Vencedor de Santa Fe x Caracas', 'River Plate', club_crest('River Plate'), NULL, 'quartas', 1, 'a');
    PERFORM seed_v2_tie(tid, comp, 'oitavas', 3, 'two_leg', NULL, NULL, 'Vencedor de Independiente Medellín x Vasco', 'Olimpia', club_crest('Olimpia'), NULL, 'quartas', 1, 'b');
    PERFORM seed_v2_tie(tid, comp, 'oitavas', 4, 'two_leg', NULL, NULL, 'Vencedor de Sporting Cristal x RB Bragantino', 'Atlético-MG', club_crest('Atlético-MG'), NULL, 'quartas', 2, 'a');
    PERFORM seed_v2_tie(tid, comp, 'oitavas', 5, 'two_leg', NULL, NULL, 'Vencedor de UCV x Santos', 'Macará', club_crest('Macará'), NULL, 'quartas', 2, 'b');
    PERFORM seed_v2_tie(tid, comp, 'oitavas', 6, 'two_leg', NULL, NULL, 'Vencedor de Nacional x Tigre', 'Montevideo City Torque', club_crest('Montevideo City Torque'), NULL, 'quartas', 3, 'a');
    PERFORM seed_v2_tie(tid, comp, 'oitavas', 7, 'two_leg', NULL, NULL, 'Vencedor de Lanús x Cienciano', 'Botafogo', club_crest('Botafogo'), NULL, 'quartas', 3, 'b');

    -- Sem jogos ainda: os dois lados precisam existir. Use resolveTieParticipant quando
    -- os playoffs terminarem (confirmar cada classificado antes de virar clube real).
    RAISE NOTICE 'Sul-Americana semeada (oitavas com participantes pendentes; sem jogos até resolver).';
END $$;

-- ---------------------------------------------------------------------------
-- Verificação:
-- SELECT competition, round, slot, series_type, team_a, team_b,
--        team_a_source_label, team_b_source_label, next_tie_id
-- FROM public.ties
-- WHERE tournament_id = (SELECT id FROM tournaments WHERE slug='mata-mata-clubes-2026')
-- ORDER BY competition, round, slot;
-- ---------------------------------------------------------------------------
