-- ============================================================================
-- A sincronização passa a guardar por LIGA, além de por clube conhecido.
--
-- Duas portas de entrada, e a antiga continua aberta: clube do bolão jogando
-- em liga não cadastrada segue sendo guardado. Nada regride.
--
-- Junto vai uma trava que só passa a importar agora: a fila de apelidos
-- precisa exigir que o OUTRO lado do jogo seja um clube conhecido. Sem isso,
-- com a captura da Premier League, cada clube inglês viraria uma sugestão de
-- apelido e a tela do admin ficaria inútil.
-- ============================================================================

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
    SELECT f,
           public.club_resolve(f->'teams'->'home'->>'name') AS hk,
           public.club_resolve(f->'teams'->'away'->>'name') AS ak,
           (f->'league'->>'id')::BIGINT AS lid
    FROM jsonb_array_elements(v_json->'response') f
  ),
  -- Duas portas de entrada: a LIGA está na lista de captura, ou um dos clubes
  -- é conhecido. A segunda mantém o comportamento antigo.
  relevante AS (
    SELECT b.* FROM bruto b
     WHERE b.hk IS NOT NULL
        OR b.ak IS NOT NULL
        OR b.lid IN (SELECT c.league_id FROM capturadas c)
  ),
  gravado AS (
    INSERT INTO public.club_fixtures (
      provider_fixture_id, league_id, league_name, round_name, kickoff_at, status,
      home_team_key, away_team_key, home_provider_id, away_provider_id,
      home_team_name, away_team_name, home_crest_url, away_crest_url,
      goals_home_90, goals_away_90, goals_home_extra, goals_away_extra,
      penalties_home, penalties_away, venue_name,
      model_eligible, model_exclusion_reason, synced_at)
    SELECT
      (f->'fixture'->>'id')::BIGINT,
      lid,
      f->'league'->>'name',
      f->'league'->>'round',
      (f->'fixture'->>'date')::TIMESTAMPTZ,
      f->'fixture'->'status'->>'short',
      hk, ak,
      (f->'teams'->'home'->>'id')::BIGINT,
      (f->'teams'->'away'->>'id')::BIGINT,
      f->'teams'->'home'->>'name',
      f->'teams'->'away'->>'name',
      f->'teams'->'home'->>'logo',
      f->'teams'->'away'->>'logo',
      -- score.fulltime é o tempo regulamentar; `goals` já inclui prorrogação.
      NULLIF(f->'score'->'fulltime'->>'home','')::INT,
      NULLIF(f->'score'->'fulltime'->>'away','')::INT,
      NULLIF(f->'score'->'extratime'->>'home','')::INT,
      NULLIF(f->'score'->'extratime'->>'away','')::INT,
      NULLIF(f->'score'->'penalty'->>'home','')::INT,
      NULLIF(f->'score'->'penalty'->>'away','')::INT,
      f->'fixture'->'venue'->>'name',
      false, NULL, now()
    FROM relevante
    ON CONFLICT (provider, provider_fixture_id) DO UPDATE SET
      status           = EXCLUDED.status,
      kickoff_at       = EXCLUDED.kickoff_at,
      round_name       = EXCLUDED.round_name,
      goals_home_90    = EXCLUDED.goals_home_90,
      goals_away_90    = EXCLUDED.goals_away_90,
      goals_home_extra = EXCLUDED.goals_home_extra,
      goals_away_extra = EXCLUDED.goals_away_extra,
      penalties_home   = EXCLUDED.penalties_home,
      penalties_away   = EXCLUDED.penalties_away,
      home_team_key    = EXCLUDED.home_team_key,
      away_team_key    = EXCLUDED.away_team_key,
      home_crest_url   = COALESCE(EXCLUDED.home_crest_url, public.club_fixtures.home_crest_url),
      away_crest_url   = COALESCE(EXCLUDED.away_crest_url, public.club_fixtures.away_crest_url),
      synced_at        = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_guardados FROM gravado;

  UPDATE public.club_competition_weights w
     SET logo_url = s.logo
    FROM (
      SELECT DISTINCT ON (lid) lid, logo FROM (
        SELECT (f->'league'->>'id')::BIGINT AS lid, f->'league'->>'logo' AS logo
          FROM jsonb_array_elements(v_json->'response') f
         WHERE f->'league'->>'logo' IS NOT NULL
      ) t ORDER BY lid
    ) s
   WHERE w.league_id = s.lid AND w.logo_url IS DISTINCT FROM s.logo;

  -- A lista de trabalho do mapeamento continua sendo só quem apareceu AO LADO
  -- de um clube nosso.
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

CREATE OR REPLACE FUNCTION public.sync_club_fixtures_recent(p_incluir_amanha boolean DEFAULT false)
RETURNS TABLE(dia date, vistos integer, guardados integer, erro text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE d DATE; r RECORD; hoje DATE; dias DATE[];
BEGIN
  hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
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

-- ── A fila de apelidos não pode inchar com a captura nova ───────────────────
-- Só entra na fila o nome que apareceu AO LADO de um clube que já conhecemos —
-- que é exatamente o caso em que a partida está sendo descartada por causa
-- dele. Sem isto, cada clube europeu viraria uma sugestão.
CREATE OR REPLACE FUNCTION public.apelidos_sugeridos(p_limite INT DEFAULT 40)
RETURNS TABLE (
  nome_api       TEXT,
  provider_id    BIGINT,
  ocorrencias    INT,
  jogos_perdidos INT,
  ligas          TEXT,
  candidatos     JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH faltantes AS (
    SELECT f.home_team_name AS nome, f.home_provider_id AS pid, f.league_id, f.status
      FROM public.club_fixtures f
     WHERE f.home_team_key IS NULL AND f.home_team_name IS NOT NULL
       AND f.away_team_key IS NOT NULL
    UNION ALL
    SELECT f.away_team_name, f.away_provider_id, f.league_id, f.status
      FROM public.club_fixtures f
     WHERE f.away_team_key IS NULL AND f.away_team_name IS NOT NULL
       AND f.home_team_key IS NOT NULL
  ),
  util AS (
    SELECT n.nome, n.pid,
           count(*)::INT AS ocorrencias,
           count(*) FILTER (
             WHERE n.status IN ('FT','AET','PEN') AND COALESCE(w.model_weight, 0) > 0
           )::INT AS jogos_perdidos,
           string_agg(DISTINCT COALESCE(w.league_name, 'liga ' || n.league_id::TEXT), ', ') AS ligas
      FROM faltantes n
      LEFT JOIN public.club_competition_weights w ON w.league_id = n.league_id
     WHERE public.club_resolve(n.nome) IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.club_alias_ignored i
          WHERE i.alias = public.club_key_normalize(n.nome)
       )
     GROUP BY n.nome, n.pid
  )
  SELECT u.nome, u.pid, u.ocorrencias, u.jogos_perdidos, u.ligas, c.candidatos
    FROM util u
    JOIN LATERAL (
      SELECT jsonb_agg(x ORDER BY (x->>'similaridade')::NUMERIC DESC) AS candidatos
        FROM (
          SELECT jsonb_build_object(
                   'team_key', s.team_key,
                   'nome', s.canonical_name,
                   'similaridade', round(extensions.similarity(
                     public.club_key_normalize(s.canonical_name),
                     public.club_key_normalize(u.nome))::NUMERIC, 2),
                   'id_conflitante', (s.api_football_id IS NOT NULL
                                      AND u.pid IS NOT NULL
                                      AND s.api_football_id <> u.pid)
                 ) AS x
            FROM public.club_source_ids s
           ORDER BY extensions.similarity(
                      public.club_key_normalize(s.canonical_name),
                      public.club_key_normalize(u.nome)) DESC
           LIMIT 3
        ) t
       WHERE (x->>'similaridade')::NUMERIC >= 0.30
    ) c ON c.candidatos IS NOT NULL
   ORDER BY u.jogos_perdidos DESC, u.ocorrencias DESC, u.nome
   LIMIT p_limite;
$$;
