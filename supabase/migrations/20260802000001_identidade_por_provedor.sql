-- ============================================================================
-- Identidade do clube deixa de ser o NOME. Passa a ser nome + quem é na API.
-- ============================================================================
-- O QUE ESTAVA ACONTECENDO (medido em 01/08/2026, produção):
--
--   • "Santos" da Segunda División do Peru (id 4226) entrou como Santos-BR
--     (id 128). O pino de `api_football_id` barrou o MODELO, mas não a tela: o
--     jogo aparecia em negrito de clube do bolão e o 1×0 contava nas
--     estatísticas do Santos brasileiro, que só jogaria às 21h.
--   • "Bolívar" da Segunda División da Venezuela (id 21231) entrou como Club
--     Bolívar da Bolívia — e aí NADA barrou, porque a chave `bolivar` não
--     tinha pino. A derrota por 1×0 entrou no ajuste de força (model_eligible
--     = true) de um clube que ainda nem tinha jogado.
--   • "Universidad Catolica" da Liga Pro do Equador (id 1157) entrou como a
--     Universidad Católica do CHILE, do bolão: uma goleada de 5×0 creditada ao
--     clube errado, também dentro do modelo.
--   • "Platense" de El Salvador, "Recoleta" do Chile, "Liverpool" da Inglaterra
--     e "San Antonio" dos EUA: mesma armadilha, ainda sem placar final.
--
-- POR QUE O PINO SOZINHO NÃO BASTAVA: `pin_provider_ids` só fixava o id a
-- partir das ligas das três copas (11, 13, 73). Clube do bolão que ainda não
-- entrou em campo nelas fica sem pino — e é exatamente quem está desprotegido.
-- Eram 24 dos 40.
--
-- A CORREÇÃO, EM DUAS PARTES:
--
--   1. O pino passa a aceitar também a liga DOMÉSTICA do próprio país do clube.
--      Continua exigindo unicidade: só fixa quando todas as observações válidas
--      apontam para o mesmo id. Isso fixa 13 dos 24 imediatamente.
--
--   2. Para quem ainda não tem pino, o PAÍS decide. Liga doméstica é, por
--      definição, do país do clube: um clube boliviano não joga a segunda
--      divisão venezuelana. Competição continental e amistoso vêm com
--      `league_country = 'World'` e ficam de fora da regra — lá o pino é que
--      manda.
--
-- Resultado: a resolução deixa de ser "o nome bate" e passa a ser "o nome bate
-- E é este clube". Quando não é, a chave fica NULA — a partida continua
-- guardada e visível, com o nome que a API mandou, mas não é mais confundida
-- com clube nosso em lugar nenhum (modelo, estatísticas, negrito, escudo).
-- ============================================================================

-- ── 1. Resolução ciente do provedor ─────────────────────────────────────────
-- `club_resolve` (só nome) continua existindo e serve para o que é nosso: os
-- nomes da tabela `matches`, digitados pelo admin, onde não há provedor nem
-- ambiguidade entre países. Para o que vem da API, usa-se esta.
CREATE OR REPLACE FUNCTION public.club_resolve_id(
  p_nome           TEXT,
  p_provider_id    BIGINT,
  p_league_country TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_key   TEXT;
  v_pino  BIGINT;
  v_pais  TEXT;
BEGIN
  v_key := public.club_resolve(p_nome);
  IF v_key IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.api_football_id, c.country INTO v_pino, v_pais
    FROM public.club_source_ids c WHERE c.team_key = v_key;

  -- Com pino, o id é soberano: é a evidência mais forte que temos.
  IF v_pino IS NOT NULL THEN
    IF p_provider_id IS NOT NULL AND p_provider_id <> v_pino THEN
      RETURN NULL;
    END IF;
    RETURN v_key;
  END IF;

  -- Sem pino, o país da liga decide — mas só quando a liga TEM país. As
  -- continentais e os amistosos vêm como 'World' e não dizem nada sobre a
  -- identidade do clube.
  IF p_league_country IS NOT NULL
     AND p_league_country <> 'World'
     AND v_pais IS NOT NULL
     AND p_league_country <> v_pais THEN
    RETURN NULL;
  END IF;

  RETURN v_key;
END;
$$;

COMMENT ON FUNCTION public.club_resolve_id(TEXT, BIGINT, TEXT) IS
  'Nome da API -> team_key, só quando o id do provedor (ou, sem pino, o país da liga) confirma que é o MESMO clube. NULL quando é homônimo.';

REVOKE ALL ON FUNCTION public.club_resolve_id(TEXT, BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_resolve_id(TEXT, BIGINT, TEXT) TO authenticated;

-- ── 2. Pino: as copas E a liga doméstica do país do clube ───────────────────
CREATE OR REPLACE FUNCTION public.pin_provider_ids()
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  -- Duas fontes de evidência para dizer "este id é este clube":
  --   a) as três copas do bolão — Libertadores (13), Sul-Americana (11) e
  --      Copa do Brasil (73), onde o clube joga sob o nome que conhecemos;
  --   b) qualquer liga do PRÓPRIO PAÍS do clube — liga doméstica não recebe
  --      time de fora, então o "Bolívar" que joga na Bolívia é o nosso.
  -- A unicidade é a trava: havendo dois ids candidatos, não se fixa nada.
  WITH vistos AS (
    SELECT f.home_team_key AS k, f.home_provider_id AS pid, f.league_id, f.league_country
      FROM public.club_fixtures f
     WHERE f.home_team_key IS NOT NULL AND f.home_provider_id IS NOT NULL
    UNION ALL
    SELECT f.away_team_key, f.away_provider_id, f.league_id, f.league_country
      FROM public.club_fixtures f
     WHERE f.away_team_key IS NOT NULL AND f.away_provider_id IS NOT NULL
  ),
  confiaveis AS (
    SELECT v.k, v.pid
      FROM vistos v
      JOIN public.club_source_ids c ON c.team_key = v.k
     WHERE v.league_id IN (11, 13, 73)
        OR (v.league_country IS NOT NULL AND v.league_country = c.country)
  ),
  unicos AS (
    SELECT k, min(pid) AS pid FROM confiaveis GROUP BY k HAVING count(DISTINCT pid) = 1
  )
  UPDATE public.club_source_ids c
     SET api_football_id = u.pid
    FROM unicos u
   WHERE u.k = c.team_key AND c.api_football_id IS NULL;
$$;

COMMENT ON FUNCTION public.pin_provider_ids() IS
  'Fixa o id do clube na API a partir das três copas (11/13/73) ou de liga doméstica do próprio país. Só fixa quando o id é único; nunca sobrescreve pino existente.';

-- ── 3. Elegibilidade: a mesma regra, como segunda linha de defesa ───────────
-- Com a resolução corrigida, a chave errada nem chega aqui. A checagem fica
-- assim mesmo: se um dia uma linha entrar por outro caminho, ela não vira
-- evidência silenciosamente.
CREATE OR REPLACE FUNCTION public.recompute_fixture_eligibility()
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  UPDATE public.club_fixtures f SET
    model_eligible = m.ok, model_exclusion_reason = m.motivo
  FROM (
    SELECT c.id,
           (c.home_team_key IS NOT NULL AND c.away_team_key IS NOT NULL
            AND rh.opta_contestant_id IS NOT NULL AND ra.opta_contestant_id IS NOT NULL
            AND c.status IN ('FT','AET','PEN')
            AND c.goals_home_90 IS NOT NULL AND c.goals_away_90 IS NOT NULL
            AND COALESCE(w.model_weight, 0) > 0
            AND c.kickoff_at > (SELECT s.snapshot_at::TIMESTAMPTZ FROM public.opta_snapshots s WHERE s.is_active)
            -- Pino de identidade: conhecendo o id do clube, o time em campo tem
            -- de ser ele.
            AND (sh.api_football_id IS NULL OR sh.api_football_id = c.home_provider_id)
            AND (sa.api_football_id IS NULL OR sa.api_football_id = c.away_provider_id)
            -- Sem pino, o país da liga tem de ser o do clube (exceto 'World',
            -- que é continental/amistoso e não diz nada).
            AND (sh.api_football_id IS NOT NULL OR c.league_country IS NULL
                 OR c.league_country = 'World' OR c.league_country = sh.country)
            AND (sa.api_football_id IS NOT NULL OR c.league_country IS NULL
                 OR c.league_country = 'World' OR c.league_country = sa.country)
           ) AS ok,
           CASE
             WHEN c.home_team_key IS NULL OR c.away_team_key IS NULL THEN 'OPPONENT_NOT_MAPPED'
             WHEN rh.opta_contestant_id IS NULL OR ra.opta_contestant_id IS NULL THEN 'NO_OPTA_RATING'
             WHEN (sh.api_football_id IS NOT NULL AND sh.api_football_id <> c.home_provider_id)
               OR (sa.api_football_id IS NOT NULL AND sa.api_football_id <> c.away_provider_id)
               THEN 'PROVIDER_ID_MISMATCH'
             WHEN (sh.api_football_id IS NULL AND c.league_country IS NOT NULL
                   AND c.league_country <> 'World' AND c.league_country <> sh.country)
               OR (sa.api_football_id IS NULL AND c.league_country IS NOT NULL
                   AND c.league_country <> 'World' AND c.league_country <> sa.country)
               THEN 'PROVIDER_COUNTRY_MISMATCH'
             WHEN c.status NOT IN ('FT','AET','PEN') THEN 'NOT_FINISHED'
             WHEN c.goals_home_90 IS NULL OR c.goals_away_90 IS NULL THEN 'NO_90MIN_SCORE'
             WHEN w.league_id IS NULL THEN 'COMPETITION_NOT_WEIGHTED'
             WHEN w.model_weight = 0 THEN 'ZERO_WEIGHT_COMPETITION'
             WHEN c.kickoff_at <= (SELECT s.snapshot_at::TIMESTAMPTZ FROM public.opta_snapshots s WHERE s.is_active)
               THEN 'BEFORE_SNAPSHOT'
             ELSE NULL
           END AS motivo
    FROM public.club_fixtures c
    LEFT JOIN public.club_source_ids sh ON sh.team_key = c.home_team_key
    LEFT JOIN public.club_source_ids sa ON sa.team_key = c.away_team_key
    LEFT JOIN public.opta_club_ratings rh ON rh.opta_contestant_id = sh.opta_contestant_id
      AND rh.snapshot_id = (SELECT s.id FROM public.opta_snapshots s WHERE s.is_active)
    LEFT JOIN public.opta_club_ratings ra ON ra.opta_contestant_id = sa.opta_contestant_id
      AND ra.snapshot_id = (SELECT s.id FROM public.opta_snapshots s WHERE s.is_active)
    LEFT JOIN public.club_competition_weights w ON w.league_id = c.league_id AND w.active
  ) m
  WHERE m.id = f.id;
$$;

-- ── 4. Reresolução: preenche o que falta E LIMPA o que está errado ──────────
-- A versão anterior só preenchia chave nula (`COALESCE`), então uma chave
-- errada já gravada era definitiva. Agora a chave é recalculada do zero: é a
-- única forma de a correção alcançar o que já está no banco, e de um apelido
-- removido deixar de valer.
CREATE OR REPLACE FUNCTION public.reresolve_fixture_keys()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE n INT;
BEGIN
  UPDATE public.club_fixtures f
     SET home_team_key = public.club_resolve_id(f.home_team_name, f.home_provider_id, f.league_country),
         away_team_key = public.club_resolve_id(f.away_team_name, f.away_provider_id, f.league_country)
   WHERE f.home_team_key IS DISTINCT FROM public.club_resolve_id(f.home_team_name, f.home_provider_id, f.league_country)
      OR f.away_team_key IS DISTINCT FROM public.club_resolve_id(f.away_team_name, f.away_provider_id, f.league_country);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public.recompute_fixture_eligibility();
  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.reresolve_fixture_keys() IS
  'Recalcula as chaves de club_fixtures com club_resolve_id: preenche as que faltam e limpa as de homônimo. Recomputa a elegibilidade ao fim.';

-- ── 5. A varredura grava a chave já conferida ───────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_club_fixtures(p_data date)
RETURNS TABLE(vistos integer, guardados integer, sem_mapa text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_json      JSONB;
  v_log_id    BIGINT;
  v_vistos    INT := 0;
  v_guardados INT := 0;
  v_sem_mapa  TEXT[] := '{}';
BEGIN
  INSERT INTO public.club_sync_log (target_date) VALUES (p_data) RETURNING id INTO v_log_id;

  v_json := public.api_football_get('/fixtures?date=' || to_char(p_data, 'YYYY-MM-DD'), true);

  IF jsonb_typeof(v_json->'errors') = 'object' AND v_json->'errors' <> '{}'::JSONB THEN
    UPDATE public.club_sync_log
       SET status='erro', finished_at=now(), error_message = v_json->>'errors'
     WHERE id = v_log_id;
    RAISE EXCEPTION 'API-Football recusou a chamada: %', v_json->'errors';
  END IF;

  v_vistos := COALESCE((v_json->>'results')::INT, 0);

  WITH capturadas AS (
    SELECT w.league_id FROM public.club_competition_weights w WHERE w.capturar AND w.active
  ),
  bruto AS (
    -- A chave sai de club_resolve_id: nome + id do time + país da liga. Um
    -- homônimo de outro país entra com chave NULA, e não como clube nosso.
    SELECT f,
           public.club_resolve_id(f->'teams'->'home'->>'name',
                                  (f->'teams'->'home'->>'id')::BIGINT,
                                  f->'league'->>'country') AS hk,
           public.club_resolve_id(f->'teams'->'away'->>'name',
                                  (f->'teams'->'away'->>'id')::BIGINT,
                                  f->'league'->>'country') AS ak,
           (f->'league'->>'id')::BIGINT AS lid
    FROM jsonb_array_elements(v_json->'response') f
  ),
  -- Duas portas: a LIGA está na lista de captura, ou um dos clubes é
  -- conhecido. A segunda mantém o comportamento anterior à captura por liga.
  relevante AS (
    SELECT b.* FROM bruto b
     WHERE b.hk IS NOT NULL OR b.ak IS NOT NULL
        OR b.lid IN (SELECT c.league_id FROM capturadas c)
  ),
  gravado AS (
    INSERT INTO public.club_fixtures (
      provider_fixture_id, league_id, league_name, league_country, season, round_name,
      kickoff_at, status, elapsed,
      home_team_key, away_team_key, home_provider_id, away_provider_id,
      home_team_name, away_team_name, home_crest_url, away_crest_url,
      goals_home_90, goals_away_90, goals_home_ht, goals_away_ht,
      goals_home_extra, goals_away_extra, penalties_home, penalties_away,
      venue_name, venue_city, referee,
      model_eligible, model_exclusion_reason, synced_at)
    SELECT
      (f->'fixture'->>'id')::BIGINT, lid,
      f->'league'->>'name', f->'league'->>'country',
      NULLIF(f->'league'->>'season','')::INT,
      f->'league'->>'round',
      (f->'fixture'->>'date')::TIMESTAMPTZ,
      f->'fixture'->'status'->>'short',
      NULLIF(f->'fixture'->'status'->>'elapsed','')::INT,
      hk, ak,
      (f->'teams'->'home'->>'id')::BIGINT, (f->'teams'->'away'->>'id')::BIGINT,
      f->'teams'->'home'->>'name', f->'teams'->'away'->>'name',
      f->'teams'->'home'->>'logo', f->'teams'->'away'->>'logo',
      -- score.fulltime é o tempo regulamentar; `goals` já inclui prorrogação.
      NULLIF(f->'score'->'fulltime'->>'home','')::INT,
      NULLIF(f->'score'->'fulltime'->>'away','')::INT,
      NULLIF(f->'score'->'halftime'->>'home','')::INT,
      NULLIF(f->'score'->'halftime'->>'away','')::INT,
      NULLIF(f->'score'->'extratime'->>'home','')::INT,
      NULLIF(f->'score'->'extratime'->>'away','')::INT,
      NULLIF(f->'score'->'penalty'->>'home','')::INT,
      NULLIF(f->'score'->'penalty'->>'away','')::INT,
      f->'fixture'->'venue'->>'name', f->'fixture'->'venue'->>'city',
      f->'fixture'->>'referee',
      false, NULL, now()
    FROM relevante
    ON CONFLICT (provider, provider_fixture_id) DO UPDATE SET
      status           = EXCLUDED.status,
      elapsed          = EXCLUDED.elapsed,
      kickoff_at       = EXCLUDED.kickoff_at,
      round_name       = EXCLUDED.round_name,
      season           = COALESCE(EXCLUDED.season, public.club_fixtures.season),
      league_country   = COALESCE(EXCLUDED.league_country, public.club_fixtures.league_country),
      goals_home_90    = EXCLUDED.goals_home_90,
      goals_away_90    = EXCLUDED.goals_away_90,
      goals_home_ht    = COALESCE(EXCLUDED.goals_home_ht, public.club_fixtures.goals_home_ht),
      goals_away_ht    = COALESCE(EXCLUDED.goals_away_ht, public.club_fixtures.goals_away_ht),
      goals_home_extra = EXCLUDED.goals_home_extra,
      goals_away_extra = EXCLUDED.goals_away_extra,
      penalties_home   = EXCLUDED.penalties_home,
      penalties_away   = EXCLUDED.penalties_away,
      home_team_key    = EXCLUDED.home_team_key,
      away_team_key    = EXCLUDED.away_team_key,
      home_crest_url   = COALESCE(EXCLUDED.home_crest_url, public.club_fixtures.home_crest_url),
      away_crest_url   = COALESCE(EXCLUDED.away_crest_url, public.club_fixtures.away_crest_url),
      venue_city       = COALESCE(EXCLUDED.venue_city, public.club_fixtures.venue_city),
      referee          = COALESCE(EXCLUDED.referee, public.club_fixtures.referee),
      synced_at        = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_guardados FROM gravado;

  UPDATE public.club_competition_weights w
     SET logo_url = s.logo, country = COALESCE(w.country, s.pais)
    FROM (
      SELECT DISTINCT ON (lid) lid, logo, pais FROM (
        SELECT (f->'league'->>'id')::BIGINT AS lid, f->'league'->>'logo' AS logo,
               f->'league'->>'country' AS pais
          FROM jsonb_array_elements(v_json->'response') f
         WHERE f->'league'->>'logo' IS NOT NULL
      ) t ORDER BY lid
    ) s
   WHERE w.league_id = s.lid AND (w.logo_url IS DISTINCT FROM s.logo OR w.country IS NULL);

  -- A fila do mapeamento continua sendo só quem apareceu AO LADO de um clube
  -- nosso. Segue usando club_resolve (só nome): um homônimo já reconhecido
  -- pelo nome não é trabalho de mapeamento — é outro clube, e mapeá-lo seria
  -- justamente o erro que esta migração corrige.
  SELECT COALESCE(array_agg(DISTINCT nome), '{}')
    INTO v_sem_mapa
  FROM (
    SELECT f->'teams'->'home'->>'name' AS nome,
           public.club_resolve(f->'teams'->'home'->>'name') AS k,
           public.club_resolve(f->'teams'->'away'->>'name') AS outro
    FROM jsonb_array_elements(v_json->'response') f
    UNION ALL
    SELECT f->'teams'->'away'->>'name',
           public.club_resolve(f->'teams'->'away'->>'name'),
           public.club_resolve(f->'teams'->'home'->>'name')
    FROM jsonb_array_elements(v_json->'response') f
  ) x
  WHERE k IS NULL AND outro IS NOT NULL;

  PERFORM public.recompute_fixture_eligibility();

  UPDATE public.club_sync_log
     SET status='ok', finished_at=now(), fixtures_seen=v_vistos,
         fixtures_kept=v_guardados, requests_used=1, unmapped_teams=v_sem_mapa
   WHERE id = v_log_id;

  RETURN QUERY SELECT v_vistos, v_guardados, v_sem_mapa;
END;
$function$;

-- ── 6. Escudo só do clube certo ─────────────────────────────────────────────
-- Sem pino, o desempate era arbitrário — e três clubes já tinham perdido o
-- escudo para o homônimo: Alianza estava com o do panamenho, Fénix com o do
-- argentino, San Marcos com o do nicaraguense. Agora só vale o escudo de uma
-- partida cuja identidade foi confirmada.
CREATE OR REPLACE FUNCTION public.pin_crest_urls()
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $function$
  WITH vistos AS (
    SELECT f.home_team_key AS k, f.home_provider_id AS pid, f.home_crest_url AS crest,
           f.league_country, f.kickoff_at
      FROM public.club_fixtures f
     WHERE f.home_team_key IS NOT NULL AND f.home_crest_url IS NOT NULL
    UNION ALL
    SELECT f.away_team_key, f.away_provider_id, f.away_crest_url, f.league_country, f.kickoff_at
      FROM public.club_fixtures f
     WHERE f.away_team_key IS NOT NULL AND f.away_crest_url IS NOT NULL
  ),
  confiaveis AS (
    SELECT v.*, s.api_football_id
      FROM vistos v
      JOIN public.club_source_ids s ON s.team_key = v.k
     WHERE (s.api_football_id IS NOT NULL AND s.api_football_id = v.pid)
        OR (s.api_football_id IS NULL AND (v.league_country IS NULL
                                           OR v.league_country = 'World'
                                           OR v.league_country = s.country))
  ),
  escolhido AS (
    -- Determinístico: pino primeiro, depois a partida mais recente.
    SELECT DISTINCT ON (c.k) c.k, c.crest
      FROM confiaveis c
     ORDER BY c.k, (c.api_football_id IS NOT NULL) DESC, c.kickoff_at DESC
  )
  UPDATE public.club_source_ids c
     SET crest_url = e.crest
    FROM escolhido e
   WHERE e.k = c.team_key AND c.crest_url IS DISTINCT FROM e.crest;
$function$;

-- ── 7. Catálogo do provedor: a chave também precisa poder ser LIMPA ─────────
-- `COALESCE(EXCLUDED.team_key, ...)` preservava para sempre a chave errada que
-- um homônimo tinha gravado. A chave da partida é a autoridade — e ela já
-- passou pela reresolução quando esta função roda.
CREATE OR REPLACE FUNCTION public.registra_provider_teams()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE n INT;
BEGIN
  INSERT INTO public.provider_teams (team_id, name, crest_url, team_key, first_seen, last_seen)
  SELECT DISTINCT ON (pid) pid, nome, crest, chave, now(), now()
    FROM (
      SELECT home_provider_id AS pid, home_team_name AS nome, home_crest_url AS crest,
             home_team_key AS chave, kickoff_at
        FROM public.club_fixtures WHERE home_provider_id IS NOT NULL
      UNION ALL
      SELECT away_provider_id, away_team_name, away_crest_url, away_team_key, kickoff_at
        FROM public.club_fixtures WHERE away_provider_id IS NOT NULL
    ) s
   ORDER BY pid, kickoff_at DESC
  ON CONFLICT (provider, team_id) DO UPDATE SET
    name      = EXCLUDED.name,
    crest_url = COALESCE(EXCLUDED.crest_url, public.provider_teams.crest_url),
    team_key  = EXCLUDED.team_key,
    last_seen = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

-- ── 8. Ordem do ciclo ───────────────────────────────────────────────────────
-- Fixar o pino DEPOIS de recomputar a elegibilidade fazia o id recém-fixado só
-- valer na rodada seguinte. A ordem agora é: coletar -> fixar id -> reresolver
-- (que recomputa) -> escudo -> catálogo.
CREATE OR REPLACE FUNCTION public.sync_club_fixtures_recent(p_incluir_amanha boolean DEFAULT false)
RETURNS TABLE(dia date, vistos integer, guardados integer, erro text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE d DATE; r RECORD; hoje DATE; dias DATE[];
BEGIN
  hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  -- Ontem sempre entra: placar e status só ficam definitivos algum tempo
  -- depois do apito, e a janela do plano gratuito não permite voltar depois.
  dias := ARRAY[hoje - 1, hoje];
  IF p_incluir_amanha THEN dias := dias || (hoje + 1); END IF;

  FOREACH d IN ARRAY dias
  LOOP
    BEGIN
      SELECT * INTO r FROM public.sync_club_fixtures(d);
      dia := d; vistos := r.vistos; guardados := r.guardados; erro := NULL;
    EXCEPTION WHEN OTHERS THEN
      dia := d; vistos := NULL; guardados := NULL; erro := SQLERRM;
    END;
    RETURN NEXT;
  END LOOP;

  PERFORM public.pin_provider_ids();
  PERFORM public.reresolve_fixture_keys();
  PERFORM public.pin_crest_urls();
  PERFORM public.registra_provider_teams();
END;
$function$;

-- ── 9. Mapear apelido: fixar o pino ANTES de reresolver ─────────────────────
CREATE OR REPLACE FUNCTION public.aplicar_apelido(p_nome text, p_team_key text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_alias TEXT; v_afetados INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_admin) THEN
    RAISE EXCEPTION 'Apenas administradores podem mapear clubes.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.club_source_ids s WHERE s.team_key = p_team_key) THEN
    RAISE EXCEPTION 'Clube desconhecido: %', p_team_key;
  END IF;

  v_alias := public.club_key_normalize(p_nome);
  IF v_alias IS NULL OR v_alias = '' THEN
    RAISE EXCEPTION 'Nome vazio.';
  END IF;

  INSERT INTO public.club_aliases (alias, team_key, origem)
  VALUES (v_alias, p_team_key, 'provider')
  ON CONFLICT (alias) DO UPDATE SET team_key = EXCLUDED.team_key;

  DELETE FROM public.club_alias_ignored WHERE alias = v_alias;

  -- Pino primeiro: o apelido novo pode ser justamente o que revela o id do
  -- clube, e a reresolução (que recomputa a elegibilidade) precisa já saber
  -- dele. Na ordem inversa, o id só passava a valer na sincronização seguinte.
  PERFORM public.pin_provider_ids();
  SELECT public.reresolve_fixture_keys() INTO v_afetados;
  PERFORM public.pin_crest_urls();
  RETURN v_afetados;
END;
$function$;

-- ── 10. Aplicar ao que já está gravado ──────────────────────────────────────
SELECT public.pin_provider_ids();
SELECT public.reresolve_fixture_keys();
SELECT public.pin_crest_urls();
SELECT public.registra_provider_teams();

-- ---------------------------------------------------------------------------
-- Verificação:
--   -- deve devolver 0 linhas (nenhum jogo de homônimo com chave de clube nosso):
--   SELECT f.provider_fixture_id, f.home_team_name, f.away_team_name
--     FROM public.club_fixtures f
--     JOIN public.club_source_ids s ON s.team_key = f.home_team_key
--    WHERE (s.api_football_id IS NOT NULL AND s.api_football_id <> f.home_provider_id)
--       OR (s.api_football_id IS NULL AND f.league_country NOT IN ('World')
--           AND f.league_country <> s.country);
--   -- e o Bolívar e a Universidad Católica devem sair do conjunto elegível:
--   SELECT count(*) FROM public.club_model_matches();
-- ---------------------------------------------------------------------------
