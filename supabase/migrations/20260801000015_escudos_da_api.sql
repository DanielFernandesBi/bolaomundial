-- ============================================================================
-- Escudos: parar de jogar fora o que a API já manda.
--
-- Toda resposta de /fixtures traz teams.home.logo, teams.away.logo e
-- league.logo. A sincronização lia só id, nome e placar, e descartava o resto —
-- por isso a tela de resultados mostrava escudo genérico para todo adversário
-- que não fosse clube do bolão.
--
-- Guardar isso resolve o problema para SEMPRE e para TODO clube que aparecer,
-- sem lista manual: quem chega novo já chega com escudo.
--
-- O backfill não gasta chamada nenhuma: os jogos que já passaram por aqui estão
-- em api_football_cache com os logos dentro.
-- ============================================================================

ALTER TABLE public.club_fixtures
  ADD COLUMN IF NOT EXISTS home_crest_url TEXT,
  ADD COLUMN IF NOT EXISTS away_crest_url TEXT;

ALTER TABLE public.club_source_ids
  ADD COLUMN IF NOT EXISTS crest_url TEXT;

ALTER TABLE public.club_competition_weights
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.club_source_ids.crest_url IS
  'Escudo do clube na API-Football, capturado da sincronização. Fonte única para todas as telas.';

-- ── Backfill a partir do cache ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.absorve_escudos_do_cache()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE n INT;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _logos (pid BIGINT PRIMARY KEY, logo TEXT) ON COMMIT DROP;
  DELETE FROM _logos;

  INSERT INTO _logos (pid, logo)
  SELECT DISTINCT ON (pid) pid, logo FROM (
    SELECT (x.t->>'id')::BIGINT AS pid, x.t->>'logo' AS logo
      FROM public.api_football_cache c,
           LATERAL jsonb_array_elements(COALESCE(c.payload->'response', '[]'::JSONB)) f,
           LATERAL (VALUES (f->'teams'->'home'), (f->'teams'->'away')) AS x(t)
     WHERE x.t->>'id' IS NOT NULL AND x.t->>'logo' IS NOT NULL
  ) s
  ORDER BY pid;

  UPDATE public.club_fixtures cf
     SET home_crest_url = l.logo
    FROM _logos l
   WHERE cf.home_provider_id = l.pid AND cf.home_crest_url IS DISTINCT FROM l.logo;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.club_fixtures cf
     SET away_crest_url = l.logo
    FROM _logos l
   WHERE cf.away_provider_id = l.pid AND cf.away_crest_url IS DISTINCT FROM l.logo;

  -- Logo de competição: mesma fonte, mesmo estilo. Substitui as miniaturas do
  -- cache do Google que estavam no código e que expiram.
  UPDATE public.club_competition_weights w
     SET logo_url = s.logo
    FROM (
      SELECT DISTINCT ON (lid) lid, logo FROM (
        SELECT (f->'league'->>'id')::BIGINT AS lid, f->'league'->>'logo' AS logo
          FROM public.api_football_cache c,
               LATERAL jsonb_array_elements(COALESCE(c.payload->'response', '[]'::JSONB)) f
         WHERE f->'league'->>'logo' IS NOT NULL
      ) t ORDER BY lid
    ) s
   WHERE w.league_id = s.lid AND w.logo_url IS DISTINCT FROM s.logo;

  RETURN n;
END;
$$;

-- ── Escudo canônico por clube ───────────────────────────────────────────────
-- Um clube aparece em muitas partidas; a tela quer um escudo só. Vem do ID
-- fixado quando existe, senão de qualquer partida em que o clube apareceu.
CREATE OR REPLACE FUNCTION public.pin_crest_urls()
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  WITH vistos AS (
    SELECT home_team_key AS k, home_provider_id AS pid, home_crest_url AS crest
      FROM public.club_fixtures
     WHERE home_team_key IS NOT NULL AND home_crest_url IS NOT NULL
    UNION ALL
    SELECT away_team_key, away_provider_id, away_crest_url
      FROM public.club_fixtures
     WHERE away_team_key IS NOT NULL AND away_crest_url IS NOT NULL
  ),
  escolhido AS (
    SELECT DISTINCT ON (v.k) v.k, v.crest
      FROM vistos v
      LEFT JOIN public.club_source_ids s ON s.team_key = v.k
     -- Quando o ID do clube já está fixado, o escudo tem de ser o DAQUELE id.
     -- Sem esta ordenação, o "Santos" do Peru poderia doar o escudo dele para
     -- o Santos do bolão.
     ORDER BY v.k, (s.api_football_id IS NOT NULL AND s.api_football_id = v.pid) DESC
  )
  UPDATE public.club_source_ids c
     SET crest_url = e.crest
    FROM escolhido e
   WHERE e.k = c.team_key AND c.crest_url IS DISTINCT FROM e.crest;
$$;

SELECT public.absorve_escudos_do_cache();
SELECT public.pin_crest_urls();
