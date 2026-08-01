-- A sincronização passa a guardar os escudos que já vinham na resposta, e a
-- logo da competição junto. Sem chamada extra: é o mesmo JSON.
--
-- Também entra pin_crest_urls() na rotina de fim de sincronização, ao lado do
-- pino de ID e da re-resolução de apelidos.
--
-- O corpo é o de 20260801000008, com quatro acréscimos marcados: as duas
-- colunas de escudo no INSERT, o COALESCE no ON CONFLICT (para uma resposta
-- sem logo não apagar o que já havia) e o UPDATE da logo de competição.


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

  WITH bruto AS (
    SELECT f,
           public.club_resolve(f->'teams'->'home'->>'name') AS hk,
           public.club_resolve(f->'teams'->'away'->>'name') AS ak
    FROM jsonb_array_elements(v_json->'response') f
  ),
  -- Interessa a partida em que pelo menos um lado é clube que conhecemos.
  -- Jogo entre dois desconhecidos é ruído do resto do mundo.
  relevante AS (
    SELECT * FROM bruto WHERE hk IS NOT NULL OR ak IS NOT NULL
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
      (f->'league'->>'id')::BIGINT,
      f->'league'->>'name',
      f->'league'->>'round',
      (f->'fixture'->>'date')::TIMESTAMPTZ,
      f->'fixture'->'status'->>'short',
      hk, ak,
      (f->'teams'->'home'->>'id')::BIGINT,
      (f->'teams'->'away'->>'id')::BIGINT,
      f->'teams'->'home'->>'name',
      f->'teams'->'away'->>'name',
      f->'teams'->'home'->>'logo',   -- novo
      f->'teams'->'away'->>'logo',   -- novo
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
      -- COALESCE e não substituição direta: resposta sem logo não apaga o que
      -- já estava guardado.
      home_crest_url   = COALESCE(EXCLUDED.home_crest_url, public.club_fixtures.home_crest_url),
      away_crest_url   = COALESCE(EXCLUDED.away_crest_url, public.club_fixtures.away_crest_url),
      synced_at        = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_guardados FROM gravado;

  -- Logo da competição, mesma fonte. Barato e mantém o cadastro atualizado.
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

  -- Nomes que apareceram ao lado de um clube nosso e não resolveram: é a
  -- lista de trabalho do mapeamento manual, não um erro.
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
END;
$function$;
