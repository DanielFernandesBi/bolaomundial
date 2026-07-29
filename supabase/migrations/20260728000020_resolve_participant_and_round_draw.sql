-- ============================================================================
-- RPCs de admin: resolver participante pendente e aplicar sorteio de fase
-- ============================================================================
-- Ambas: SECURITY DEFINER com checagem interna de admin, atômicas (plpgsql),
-- usam ensure_tie_matches (que faz criação/idempotência/anti-dup/propagação segura).
-- ============================================================================

-- resolve_tie_participant: preenche um lado (a/b) de um confronto com o clube real,
-- limpa o source_label e cria os jogos quando os dois lados existirem.
CREATE OR REPLACE FUNCTION resolve_tie_participant(
    p_tie_id INTEGER,
    p_side   TEXT,        -- 'a' | 'b'
    p_team   TEXT,
    p_iso    TEXT         -- URL do escudo (ou código)
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t public.ties%ROWTYPE;
    v_status TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
        RAISE EXCEPTION 'Apenas administradores podem resolver participantes';
    END IF;
    IF p_side NOT IN ('a', 'b') THEN
        RAISE EXCEPTION 'Lado inválido (use a ou b)';
    END IF;
    IF p_team IS NULL OR btrim(p_team) = '' THEN
        RAISE EXCEPTION 'Informe o time';
    END IF;

    SELECT * INTO t FROM public.ties WHERE id = p_tie_id;
    IF t.id IS NULL THEN RAISE EXCEPTION 'Confronto não encontrado'; END IF;

    IF p_side = 'a' THEN
        UPDATE public.ties SET team_a = btrim(p_team), team_a_iso = NULLIF(btrim(p_iso), ''), team_a_source_label = NULL
        WHERE id = p_tie_id;
    ELSE
        UPDATE public.ties SET team_b = btrim(p_team), team_b_iso = NULLIF(btrim(p_iso), ''), team_b_source_label = NULL
        WHERE id = p_tie_id;
    END IF;

    -- Cria os jogos se ambos os lados existirem (ou corrige com segurança).
    v_status := ensure_tie_matches(p_tie_id);
    RETURN jsonb_build_object('ok', true, 'matches', v_status);
END;
$$ LANGUAGE plpgsql;

-- apply_round_draw: aplica o sorteio de uma fase, ligando os classificados de uma
-- rodada de origem aos confrontos-alvo. p_mappings = array de:
--   { "source_slot": <int>, "target_slot": <int>, "target_side": "a"|"b" }
-- O lado 'a' do alvo é o mandante da ida (ensure_tie_matches usa team_a como mandante da ida).
CREATE OR REPLACE FUNCTION apply_round_draw(
    p_tournament_id INTEGER,
    p_competition   TEXT,
    p_source_round  TEXT,
    p_target_round  TEXT,
    p_mappings      JSONB
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    mp JSONB;
    src public.ties%ROWTYPE;
    tgt public.ties%ROWTYPE;
    v_side TEXT;
    v_target_ids INTEGER[] := ARRAY[]::INTEGER[];
    v_seen_targets TEXT[] := ARRAY[]::TEXT[];
    v_seen_sources INT[] := ARRAY[]::INT[];
    v_key TEXT;
    tid INTEGER;
    v_created INT := 0;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
        RAISE EXCEPTION 'Apenas administradores podem aplicar o sorteio';
    END IF;

    FOR mp IN SELECT * FROM jsonb_array_elements(p_mappings)
    LOOP
        v_side := mp->>'target_side';
        IF v_side NOT IN ('a', 'b') THEN RAISE EXCEPTION 'target_side inválido: %', v_side; END IF;

        -- Origem
        SELECT * INTO src FROM public.ties
        WHERE tournament_id = p_tournament_id AND competition = p_competition
          AND round = p_source_round AND slot = (mp->>'source_slot')::int;
        IF src.id IS NULL THEN
            RAISE EXCEPTION 'Confronto de origem % (slot %) não encontrado', p_source_round, mp->>'source_slot';
        END IF;
        IF src.winner_team IS NULL THEN
            RAISE EXCEPTION 'O confronto de origem (slot %) ainda não tem classificado', mp->>'source_slot';
        END IF;

        -- Alvo
        SELECT * INTO tgt FROM public.ties
        WHERE tournament_id = p_tournament_id AND competition = p_competition
          AND round = p_target_round AND slot = (mp->>'target_slot')::int;
        IF tgt.id IS NULL THEN
            RAISE EXCEPTION 'Confronto-alvo % (slot %) não encontrado', p_target_round, mp->>'target_slot';
        END IF;

        -- Anti-duplicação de origem e de (alvo,lado)
        IF src.slot = ANY (v_seen_sources) THEN RAISE EXCEPTION 'Origem slot % usada mais de uma vez', src.slot; END IF;
        v_seen_sources := array_append(v_seen_sources, src.slot);
        v_key := (mp->>'target_slot') || ':' || v_side;
        IF v_key = ANY (v_seen_targets) THEN RAISE EXCEPTION 'Alvo % lado % usado mais de uma vez', mp->>'target_slot', v_side; END IF;
        v_seen_targets := array_append(v_seen_targets, v_key);

        -- Conflito: lado do alvo já preenchido com time diferente
        IF v_side = 'a' AND tgt.team_a IS NOT NULL AND tgt.team_a IS DISTINCT FROM src.winner_team THEN
            RAISE EXCEPTION 'Alvo slot % lado A já tem outro time (%).', tgt.slot, tgt.team_a;
        END IF;
        IF v_side = 'b' AND tgt.team_b IS NOT NULL AND tgt.team_b IS DISTINCT FROM src.winner_team THEN
            RAISE EXCEPTION 'Alvo slot % lado B já tem outro time (%).', tgt.slot, tgt.team_b;
        END IF;

        -- Liga origem -> alvo e preenche o lado
        UPDATE public.ties SET next_tie_id = tgt.id, next_slot_side = v_side WHERE id = src.id;
        IF v_side = 'a' THEN
            UPDATE public.ties SET team_a = src.winner_team, team_a_iso = src.winner_iso, team_a_source_label = NULL WHERE id = tgt.id;
        ELSE
            UPDATE public.ties SET team_b = src.winner_team, team_b_iso = src.winner_iso, team_b_source_label = NULL WHERE id = tgt.id;
        END IF;

        IF NOT (tgt.id = ANY (v_target_ids)) THEN
            v_target_ids := array_append(v_target_ids, tgt.id);
        END IF;
    END LOOP;

    -- Cria os jogos dos alvos que ficaram completos
    FOREACH tid IN ARRAY v_target_ids LOOP
        IF ensure_tie_matches(tid) = 'created' THEN v_created := v_created + 1; END IF;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'targets', array_length(v_target_ids, 1), 'created', v_created);
END;
$$ LANGUAGE plpgsql;

-- EXECUTE só para o app (authenticated); ambas têm checagem interna de admin.
REVOKE EXECUTE ON FUNCTION public.resolve_tie_participant(integer, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_round_draw(integer, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_tie_participant(integer, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_round_draw(integer, text, text, text, jsonb) TO authenticated;
