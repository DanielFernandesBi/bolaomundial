-- ============================================================================
-- Sincronização das partidas e cálculo de elegibilidade para o modelo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recompute_fixture_eligibility()
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  -- A regra de elegibilidade fica NUM lugar só. Espalhá-la entre o insert e o
  -- motor é como ela começa a divergir de si mesma.
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
           ) AS ok,
           CASE
             WHEN c.home_team_key IS NULL OR c.away_team_key IS NULL THEN 'OPPONENT_NOT_MAPPED'
             WHEN rh.opta_contestant_id IS NULL OR ra.opta_contestant_id IS NULL THEN 'NO_OPTA_RATING'
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

CREATE OR REPLACE FUNCTION public.sync_club_fixtures(p_data DATE)
RETURNS TABLE (vistos INT, guardados INT, sem_mapa TEXT[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_json JSONB; v_log_id BIGINT;
  v_vistos INT := 0; v_guardados INT := 0; v_sem_mapa TEXT[] := '{}';
BEGIN
  INSERT INTO public.club_sync_log (target_date) VALUES (p_data) RETURNING id INTO v_log_id;

  v_json := public.api_football_get('/fixtures?date=' || to_char(p_data, 'YYYY-MM-DD'), true);

  IF jsonb_typeof(v_json->'errors') = 'object' AND v_json->'errors' <> '{}'::JSONB THEN
    UPDATE public.club_sync_log SET status='erro', finished_at=now(),
           error_message = v_json->>'errors' WHERE id = v_log_id;
    RAISE EXCEPTION 'API-Football recusou a chamada: %', v_json->'errors';
  END IF;

  v_vistos := COALESCE((v_json->>'results')::INT, 0);

  WITH bruto AS (
    SELECT f, public.club_resolve(f->'teams'->'home'->>'name') AS hk,
              public.club_resolve(f->'teams'->'away'->>'name') AS ak
    FROM jsonb_array_elements(v_json->'response') f
  ),
  -- Guarda a partida em que ao menos UM lado é clube conhecido. Jogo entre dois
  -- desconhecidos é o resto do mundo, e são centenas por dia.
  relevante AS (SELECT * FROM bruto WHERE hk IS NOT NULL OR ak IS NOT NULL),
  gravado AS (
    INSERT INTO public.club_fixtures (
      provider_fixture_id, league_id, league_name, round_name, kickoff_at, status,
      home_team_key, away_team_key, home_provider_id, away_provider_id,
      home_team_name, away_team_name, goals_home_90, goals_away_90,
      goals_home_extra, goals_away_extra, penalties_home, penalties_away,
      venue_name, model_eligible, model_exclusion_reason, synced_at)
    SELECT (f->'fixture'->>'id')::BIGINT, (f->'league'->>'id')::BIGINT,
           f->'league'->>'name', f->'league'->>'round',
           (f->'fixture'->>'date')::TIMESTAMPTZ, f->'fixture'->'status'->>'short',
           hk, ak, (f->'teams'->'home'->>'id')::BIGINT, (f->'teams'->'away'->>'id')::BIGINT,
           f->'teams'->'home'->>'name', f->'teams'->'away'->>'name',
           NULLIF(f->'score'->'fulltime'->>'home','')::INT,
           NULLIF(f->'score'->'fulltime'->>'away','')::INT,
           NULLIF(f->'score'->'extratime'->>'home','')::INT,
           NULLIF(f->'score'->'extratime'->>'away','')::INT,
           NULLIF(f->'score'->'penalty'->>'home','')::INT,
           NULLIF(f->'score'->'penalty'->>'away','')::INT,
           f->'fixture'->'venue'->>'name', false, NULL, now()
    FROM relevante
    ON CONFLICT (provider, provider_fixture_id) DO UPDATE SET
      status=EXCLUDED.status, kickoff_at=EXCLUDED.kickoff_at, round_name=EXCLUDED.round_name,
      goals_home_90=EXCLUDED.goals_home_90, goals_away_90=EXCLUDED.goals_away_90,
      goals_home_extra=EXCLUDED.goals_home_extra, goals_away_extra=EXCLUDED.goals_away_extra,
      penalties_home=EXCLUDED.penalties_home, penalties_away=EXCLUDED.penalties_away,
      home_team_key=EXCLUDED.home_team_key, away_team_key=EXCLUDED.away_team_key,
      synced_at=now()
    RETURNING 1)
  SELECT count(*) INTO v_guardados FROM gravado;

  -- Nome que apareceu ao lado de um clube nosso e não resolveu: é a lista de
  -- trabalho do mapeamento manual, não um erro.
  SELECT COALESCE(array_agg(DISTINCT nome), '{}') INTO v_sem_mapa FROM (
    SELECT f->'teams'->'home'->>'name' AS nome,
           public.club_resolve(f->'teams'->'home'->>'name') AS k,
           public.club_resolve(f->'teams'->'away'->>'name') AS outro
    FROM jsonb_array_elements(v_json->'response') f
    UNION ALL
    SELECT f->'teams'->'away'->>'name',
           public.club_resolve(f->'teams'->'away'->>'name'),
           public.club_resolve(f->'teams'->'home'->>'name')
    FROM jsonb_array_elements(v_json->'response') f
  ) x WHERE k IS NULL AND outro IS NOT NULL;

  PERFORM public.recompute_fixture_eligibility();

  UPDATE public.club_sync_log SET status='ok', finished_at=now(), fixtures_seen=v_vistos,
         fixtures_kept=v_guardados, requests_used=1, unmapped_teams=v_sem_mapa
   WHERE id = v_log_id;

  RETURN QUERY SELECT v_vistos, v_guardados, v_sem_mapa;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Janela de 3 dias do plano gratuito: não existe backfill. Roda 2×/dia e
-- sempre reprocessa ontem, porque placar sai depois do apito e o status muda
-- de NS para FT horas depois. Custo: 4 chamadas/dia contra a cota de 100.
CREATE OR REPLACE FUNCTION public.sync_club_fixtures_recent()
RETURNS TABLE (dia DATE, vistos INT, guardados INT, erro TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE d DATE; r RECORD;
BEGIN
  FOREACH d IN ARRAY ARRAY[(now() AT TIME ZONE 'America/Sao_Paulo')::date - 1,
                           (now() AT TIME ZONE 'America/Sao_Paulo')::date]
  LOOP
    BEGIN
      SELECT * INTO r FROM public.sync_club_fixtures(d);
      dia := d; vistos := r.vistos; guardados := r.guardados; erro := NULL;
    EXCEPTION WHEN OTHERS THEN
      -- Um dia recusado não pode derrubar o outro: a borda da janela de 3 dias
      -- muda conforme o fuso do fornecedor.
      dia := d; vistos := NULL; guardados := NULL; erro := SQLERRM;
    END;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_club_fixtures(DATE)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_club_fixtures_recent()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_fixture_eligibility()  FROM PUBLIC, anon, authenticated;

-- 09:00 e 23:30 de Brasília = 12:00 e 02:30 UTC.
SELECT cron.schedule('sync-club-fixtures-manha', '0 12 * * *', $c$SELECT public.sync_club_fixtures_recent()$c$);
SELECT cron.schedule('sync-club-fixtures-noite', '30 2 * * *', $c$SELECT public.sync_club_fixtures_recent()$c$);
