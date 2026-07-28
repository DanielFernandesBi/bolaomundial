-- ============================================================================
-- SEED: Bolão unificado MATA-MATA DE CLUBES 2026
-- (Copa do Brasil + CONMEBOL Sul-Americana + CONMEBOL Libertadores)
-- ============================================================================
-- Pré-requisito: rodar antes as migrações 20260728000001..04.
--
-- Como funciona:
--   1) Cria o torneio unificado.
--   2) A função seed_knockout_competition() monta TODO o esqueleto do chaveamento
--      de uma competição a partir dos 8 confrontos das oitavas:
--        - cria os confrontos vazios de quartas (4), semi (2) e final (1), já
--          ligados por next_tie_id/next_slot_side;
--        - cria os 8 confrontos das oitavas com os times;
--        - cria os 16 jogos (ida/volta) das oitavas.
--   3) Você chama a função 1x por competição, passando os 8 confrontos.
--
-- Ida  = mandante é o time "a" (placar simples, is_knockout=false).
-- Volta = mandante é o time "b" (placar + pênaltis, is_knockout=true, has_extra_time=false).
-- Datas em BRASÍLIA (use o offset -03). Deixe "" (vazio) para "data a definir".
-- As fases seguintes (quartas em diante) são criadas AUTOMATICAMENTE pelo sistema
-- quando as duas pernas de cada confronto terminam (data a definir até o admin publicar).
-- Idempotente no torneio; NÃO rode a mesma competição duas vezes (duplicaria os jogos).
-- ============================================================================

-- 1) Torneio unificado -------------------------------------------------------
INSERT INTO public.tournaments (name, slug, active, format, has_simulator, logo_url)
VALUES ('Mata-Mata dos Clubes 2026', 'mata-mata-clubes-2026', true, 'knockout', false, NULL)
ON CONFLICT (slug) DO UPDATE SET format = 'knockout', active = true, has_simulator = false;

-- 2) Função geradora do chaveamento de uma competição ------------------------
CREATE OR REPLACE FUNCTION seed_knockout_competition(
    p_tournament_id INTEGER,
    p_competition   TEXT,      -- 'copa_do_brasil' | 'sudamericana' | 'libertadores'
    p_oitavas       JSONB      -- array de 8 objetos: {a,a_iso,b,b_iso,ida,volta}
) RETURNS VOID AS $$
DECLARE
    final_id   INT;
    semi_id    INT[] := ARRAY[]::INT[];
    quartas_id INT[] := ARRAY[]::INT[];
    tie_id     INT;
    ida_id     INT;
    volta_id   INT;
    i INT;
    j INT;
    o JSONB;
BEGIN
    -- Final (slot 0)
    INSERT INTO public.ties (tournament_id, competition, round, slot)
    VALUES (p_tournament_id, p_competition, 'final', 0)
    RETURNING id INTO final_id;

    -- Semifinais (2) → final
    FOR j IN 0..1 LOOP
        INSERT INTO public.ties (tournament_id, competition, round, slot, next_tie_id, next_slot_side)
        VALUES (p_tournament_id, p_competition, 'semi', j, final_id, CASE WHEN j % 2 = 0 THEN 'a' ELSE 'b' END)
        RETURNING id INTO tie_id;
        semi_id[j] := tie_id;
    END LOOP;

    -- Quartas (4) → semis
    FOR j IN 0..3 LOOP
        INSERT INTO public.ties (tournament_id, competition, round, slot, next_tie_id, next_slot_side)
        VALUES (p_tournament_id, p_competition, 'quartas', j, semi_id[j / 2], CASE WHEN j % 2 = 0 THEN 'a' ELSE 'b' END)
        RETURNING id INTO tie_id;
        quartas_id[j] := tie_id;
    END LOOP;

    -- Oitavas (8) → quartas, com os jogos de ida e volta
    FOR i IN 0..7 LOOP
        o := p_oitavas -> i;

        INSERT INTO public.ties
            (tournament_id, competition, round, slot, team_a, team_a_iso, team_b, team_b_iso, next_tie_id, next_slot_side)
        VALUES
            (p_tournament_id, p_competition, 'oitavas', i,
             o->>'a', o->>'a_iso', o->>'b', o->>'b_iso',
             quartas_id[i / 2], CASE WHEN i % 2 = 0 THEN 'a' ELSE 'b' END)
        RETURNING id INTO tie_id;

        -- Ida: "a" manda
        INSERT INTO public.matches
            (tournament_id, competition, tie_id, leg, is_knockout, has_extra_time, status, phase,
             team_home, home_iso, team_away, away_iso, match_date)
        VALUES
            (p_tournament_id, p_competition, tie_id, 'ida', false, false, 'SCHEDULED', 'Oitavas de final – ida',
             o->>'a', o->>'a_iso', o->>'b', o->>'b_iso', NULLIF(o->>'ida', '')::timestamptz)
        RETURNING id INTO ida_id;

        -- Volta: "b" manda; pode ir aos pênaltis (agregado empatado)
        INSERT INTO public.matches
            (tournament_id, competition, tie_id, leg, is_knockout, has_extra_time, status, phase,
             team_home, home_iso, team_away, away_iso, match_date)
        VALUES
            (p_tournament_id, p_competition, tie_id, 'volta', true, false, 'SCHEDULED', 'Oitavas de final – volta',
             o->>'b', o->>'b_iso', o->>'a', o->>'a_iso', NULLIF(o->>'volta', '')::timestamptz)
        RETURNING id INTO volta_id;

        UPDATE public.ties SET ida_match_id = ida_id, volta_match_id = volta_id WHERE id = tie_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 3) Preencha e rode 1x por competição --------------------------------------
-- ⚠️ SUBSTITUA os times/escudos/datas de EXEMPLO abaixo pelos sorteios reais.
--    Ordene os 8 confrontos na ordem do chaveamento (confronto 0 e 1 se cruzam
--    nas quartas, 2 e 3 se cruzam, etc.).
DO $$
DECLARE
    v_tid INTEGER;
BEGIN
    SELECT id INTO v_tid FROM public.tournaments WHERE slug = 'mata-mata-clubes-2026';

    -- Evita reinserir se já houver jogos (rode a limpeza manual se quiser refazer)
    IF EXISTS (SELECT 1 FROM public.matches WHERE tournament_id = v_tid) THEN
        RAISE NOTICE 'Já existem jogos para o bolão de clubes. Nada a inserir.';
        RETURN;
    END IF;

    -- ===================== LIBERTADORES (EXEMPLO) =====================
    PERFORM seed_knockout_competition(v_tid, 'libertadores', '[
      {"a":"Time L1","a_iso":"br","b":"Time L2","b_iso":"ar","ida":"2026-08-11 21:30:00-03","volta":"2026-08-18 21:30:00-03"},
      {"a":"Time L3","a_iso":"br","b":"Time L4","b_iso":"uy","ida":"2026-08-12 21:30:00-03","volta":"2026-08-19 21:30:00-03"},
      {"a":"Time L5","a_iso":"br","b":"Time L6","b_iso":"co","ida":"2026-08-11 19:00:00-03","volta":"2026-08-18 19:00:00-03"},
      {"a":"Time L7","a_iso":"ar","b":"Time L8","b_iso":"br","ida":"2026-08-12 19:00:00-03","volta":"2026-08-19 19:00:00-03"},
      {"a":"Time L9","a_iso":"br","b":"Time L10","b_iso":"ec","ida":"2026-08-13 21:30:00-03","volta":"2026-08-20 21:30:00-03"},
      {"a":"Time L11","a_iso":"br","b":"Time L12","b_iso":"py","ida":"2026-08-13 19:00:00-03","volta":"2026-08-20 19:00:00-03"},
      {"a":"Time L13","a_iso":"cl","b":"Time L14","b_iso":"br","ida":"2026-08-14 21:30:00-03","volta":"2026-08-21 21:30:00-03"},
      {"a":"Time L15","a_iso":"br","b":"Time L16","b_iso":"ar","ida":"2026-08-14 19:00:00-03","volta":"2026-08-21 19:00:00-03"}
    ]'::jsonb);

    -- ===================== SUL-AMERICANA (EXEMPLO) ====================
    -- PERFORM seed_knockout_competition(v_tid, 'sudamericana', '[ ...8 confrontos... ]'::jsonb);

    -- ===================== COPA DO BRASIL (EXEMPLO) ===================
    -- PERFORM seed_knockout_competition(v_tid, 'copa_do_brasil', '[ ...8 confrontos... ]'::jsonb);

    RAISE NOTICE 'Chaveamento(s) semeado(s) para o bolão de clubes (torneio %).', v_tid;
END $$;

-- Verificação:
-- SELECT competition, round, slot, team_a, team_b, ida_match_id, volta_match_id, next_tie_id, next_slot_side
-- FROM public.ties WHERE tournament_id = (SELECT id FROM tournaments WHERE slug='mata-mata-clubes-2026')
-- ORDER BY competition, round, slot;
