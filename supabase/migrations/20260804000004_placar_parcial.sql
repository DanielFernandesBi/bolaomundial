-- ============================================================================
-- Placar parcial: o dado já vinha na resposta, e a gente jogava fora.
-- ============================================================================
-- A tela de resultados mostrava "1º tempo" / "2º tempo" sem placar nenhum. Não
-- era limitação da fonte: era campo errado.
--
--   `score.fulltime`  -> o placar dos 90 minutos. É NULO até o apito final.
--   `goals`           -> o placar CORRENTE, preenchido durante o jogo.
--
-- Guardávamos só o primeiro. Conferido no payload que já estava em cache:
--
--   Guabirá × Real Tomayapo   2H 64'   goals 1×0   fulltime null
--   Minnesota × FC Juárez     1H 45'   goals 1×2   fulltime null
--
-- Ou seja: o placar ao vivo já estava pago e baixado. Zero chamada a mais.
--
-- ----------------------------------------------------------------------------
-- POR QUE EM COLUNAS SEPARADAS, e não reaproveitando goals_home_90
-- ----------------------------------------------------------------------------
-- Porque `goals` e `score.fulltime` são coisas diferentes depois do apito:
-- `goals` INCLUI a prorrogação. Este bolão pontua os 90 minutos, e
-- `resultados_sugeridos` lê `goals_home_90`. Se o placar corrente encostasse
-- nessa coluna, um jogo decidido na prorrogação passaria a sugerir o placar
-- errado — e agora que o lançamento é automático, isso viraria pontuação
-- errada sem ninguém olhar.
--
-- As colunas novas são só de exibição. Nada no caminho de pontuação as lê.
-- ============================================================================

ALTER TABLE public.club_fixtures
  ADD COLUMN IF NOT EXISTS goals_home_agora INT,
  ADD COLUMN IF NOT EXISTS goals_away_agora INT;

COMMENT ON COLUMN public.club_fixtures.goals_home_agora IS
  'Placar corrente (campo `goals` da API), válido durante a partida. SÓ EXIBIÇÃO: inclui prorrogação depois do apito, então nunca deve alimentar pontuação — para isso existe goals_home_90.';

-- ── A varredura passa a guardar o placar corrente ───────────────────────────
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
           public.club_resolve_id(f->'teams'->'home'->>'name',
                                  (f->'teams'->'home'->>'id')::BIGINT,
                                  f->'league'->>'country') AS hk,
           public.club_resolve_id(f->'teams'->'away'->>'name',
                                  (f->'teams'->'away'->>'id')::BIGINT,
                                  f->'league'->>'country') AS ak,
           (f->'league'->>'id')::BIGINT AS lid
    FROM jsonb_array_elements(v_json->'response') f
  ),
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
      goals_home_agora, goals_away_agora,
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
      -- placar corrente: é o que existe enquanto a bola rola
      NULLIF(f->'goals'->>'home','')::INT,
      NULLIF(f->'goals'->>'away','')::INT,
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
      -- sempre o valor novo: é um retrato do agora, não um acúmulo
      goals_home_agora = EXCLUDED.goals_home_agora,
      goals_away_agora = EXCLUDED.goals_away_agora,
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

-- ── Varredura extra, só quando há jogo do bolão em campo ────────────────────
-- Com a cadência de 20 minutos, o placar parcial pode estar 20 minutos velho —
-- tempo suficiente para um 0×0 já ser 2×0. Dobrar a cadência o dia inteiro
-- gastaria ~85 das 100 chamadas diárias e deixaria pouca margem.
--
-- Esta função existe para gastar a chamada extra SÓ quando ela compra algo: se
-- nenhum clube do bolão está em campo, ela devolve sem tocar na API. A conta é
-- local e não custa nada. Nos dias sem jogo do bolão, custo zero.
CREATE OR REPLACE FUNCTION public.sync_se_bolao_ao_vivo()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.club_fixtures f
      LEFT JOIN public.club_source_ids ch ON ch.team_key = f.home_team_key
      LEFT JOIN public.club_source_ids ca ON ca.team_key = f.away_team_key
     WHERE f.status IN ('1H','HT','2H','ET','BT','P','LIVE','INT')
       AND (COALESCE(ch.is_bolao_team, false) OR COALESCE(ca.is_bolao_team, false))
  ) THEN
    RETURN 'sem jogo do bolao em campo: nenhuma chamada gasta';
  END IF;

  PERFORM public.sync_club_fixtures_recent(false);
  RETURN 'sincronizado';
END;
$$;

REVOKE ALL ON FUNCTION public.sync_se_bolao_ao_vivo() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.sync_se_bolao_ao_vivo() IS
  'Varredura extra condicional: só chama a API quando há clube do bolão em campo. Serve ao placar parcial sem torrar a cota nas horas mortas.';

-- Nos minutos intermediários, entre as varreduras normais de :05/:25/:45.
SELECT cron.schedule('sync-club-fixtures-ao-vivo', '15,35,55 17-23,0-5 * * *',
                     $c$SELECT public.sync_se_bolao_ao_vivo()$c$);

-- ---------------------------------------------------------------------------
-- Verificação:
--   SELECT home_team_name, away_team_name, status, elapsed,
--          goals_home_agora, goals_away_agora, goals_home_90
--     FROM public.club_fixtures
--    WHERE status IN ('1H','HT','2H') ORDER BY kickoff_at DESC;
--   -- e a coluna de 90 minutos tem de continuar nula durante o jogo.
-- ---------------------------------------------------------------------------
