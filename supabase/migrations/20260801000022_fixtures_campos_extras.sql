-- ============================================================================
-- O que a resposta da API já traz e a gente jogava fora.
--
-- Nada aqui custa chamada: é o mesmo JSON de /fixtures que a varredura baixa
-- de hora em hora. Estava sendo lido pela metade.
--
--   halftime  — placar do INTERVALO. O mais valioso do lote: permite ver quem
--               vira jogo e quem entrega vantagem.
--   season    — sem isso não dá para separar temporadas quando o histórico
--               passar de um ano.
--   country   — país da liga, para filtrar sem depender de join.
--   city      — cidade do estádio.
--   referee   — árbitro.
--   elapsed   — minuto de jogo, para quem está ao vivo.
-- ============================================================================

ALTER TABLE public.club_fixtures
  ADD COLUMN IF NOT EXISTS goals_home_ht  INT,
  ADD COLUMN IF NOT EXISTS goals_away_ht  INT,
  ADD COLUMN IF NOT EXISTS season         INT,
  ADD COLUMN IF NOT EXISTS league_country TEXT,
  ADD COLUMN IF NOT EXISTS venue_city     TEXT,
  ADD COLUMN IF NOT EXISTS referee        TEXT,
  ADD COLUMN IF NOT EXISTS elapsed        INT;

ALTER TABLE public.club_competition_weights
  ADD COLUMN IF NOT EXISTS country  TEXT,
  ADD COLUMN IF NOT EXISTS flag_url TEXT;

COMMENT ON COLUMN public.club_fixtures.goals_home_ht IS
  'Placar do intervalo. Vem em score.halftime da mesma resposta que já baixamos.';

CREATE OR REPLACE FUNCTION public.absorve_extras_do_cache()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE n INT;
BEGIN
  WITH jogos AS (
    SELECT (f->'fixture'->>'id')::BIGINT AS fid,
           NULLIF(f->'score'->'halftime'->>'home','')::INT   AS ht_h,
           NULLIF(f->'score'->'halftime'->>'away','')::INT   AS ht_a,
           NULLIF(f->'league'->>'season','')::INT            AS season,
           f->'league'->>'country'                           AS pais,
           f->'fixture'->'venue'->>'city'                    AS cidade,
           f->'fixture'->>'referee'                          AS arbitro,
           NULLIF(f->'fixture'->'status'->>'elapsed','')::INT AS elapsed
      FROM public.api_football_cache c,
           LATERAL jsonb_array_elements(COALESCE(c.payload->'response','[]'::JSONB)) f
     WHERE f->'fixture'->>'id' IS NOT NULL
  ),
  unico AS (SELECT DISTINCT ON (fid) * FROM jogos ORDER BY fid)
  UPDATE public.club_fixtures cf
     SET goals_home_ht  = COALESCE(cf.goals_home_ht, u.ht_h),
         goals_away_ht  = COALESCE(cf.goals_away_ht, u.ht_a),
         season         = COALESCE(cf.season, u.season),
         league_country = COALESCE(cf.league_country, u.pais),
         venue_city     = COALESCE(cf.venue_city, u.cidade),
         referee        = COALESCE(cf.referee, u.arbitro),
         elapsed        = COALESCE(cf.elapsed, u.elapsed)
    FROM unico u
   WHERE cf.provider_fixture_id = u.fid;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.club_competition_weights w
     SET country = pl.country, flag_url = pl.flag_url
    FROM public.provider_leagues pl
   WHERE pl.league_id = w.league_id
     AND (w.country IS DISTINCT FROM pl.country OR w.flag_url IS DISTINCT FROM pl.flag_url);

  RETURN n;
END;
$$;

SELECT public.absorve_extras_do_cache();
