-- ============================================================================
-- Catálogo do fornecedor: ligas e times descobertos.
--
-- Duas tabelas de REFERÊNCIA, separadas do que o modelo consome:
--
--   · provider_leagues — as 1239 ligas que a API conhece. Baixado numa chamada
--     só. Serve para curar a lista de captura sem adivinhar ID de liga.
--   · provider_teams   — todo time que já apareceu numa partida guardada.
--     Preenchido sozinho pela sincronização. É daqui que um bolão futuro puxa
--     o clube dele já com escudo e histórico.
--
-- Nenhuma das duas alimenta o modelo. O modelo continua exigindo rating Opta,
-- que só existe para os 384 clubes da CONMEBOL.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_leagues (
  provider     TEXT NOT NULL DEFAULT 'api_football',
  league_id    BIGINT NOT NULL,
  name         TEXT NOT NULL,
  type         TEXT,
  country      TEXT,
  country_code TEXT,
  logo_url     TEXT,
  flag_url     TEXT,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, league_id)
);

CREATE TABLE IF NOT EXISTS public.provider_teams (
  provider   TEXT NOT NULL DEFAULT 'api_football',
  team_id    BIGINT NOT NULL,
  name       TEXT NOT NULL,
  crest_url  TEXT,
  team_key   TEXT,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, team_id)
);

CREATE INDEX IF NOT EXISTS provider_teams_nome_idx  ON public.provider_teams (name);
CREATE INDEX IF NOT EXISTS provider_teams_chave_idx ON public.provider_teams (team_key) WHERE team_key IS NOT NULL;

ALTER TABLE public.provider_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_teams   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_leagues_leitura ON public.provider_leagues;
CREATE POLICY provider_leagues_leitura ON public.provider_leagues FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS provider_teams_leitura ON public.provider_teams;
CREATE POLICY provider_teams_leitura ON public.provider_teams FOR SELECT TO authenticated USING (true);

-- ── Captura por LIGA ────────────────────────────────────────────────────────
-- A regra antiga guardava a partida em que ao menos um dos clubes CONHECIDOS
-- jogasse. Isso é ovo e galinha para qualquer região nova: sem clube
-- cadastrado, nada é capturado; e o clube só apareceria se algo fosse
-- capturado. `capturar` inverte — a liga entra na lista, e os times são
-- DESCOBERTOS das partidas.
--
-- `capturar` e `model_weight` são coisas diferentes de propósito: a Premier
-- League tem captura ligada e peso zero, porque não há rating Opta para clube
-- inglês. Guardar não é a mesma coisa que acreditar.
ALTER TABLE public.club_competition_weights
  ADD COLUMN IF NOT EXISTS capturar BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.club_competition_weights.capturar IS
  'Guardar as partidas desta liga em club_fixtures, mesmo que nenhum clube conhecido jogue. Independente de model_weight.';

CREATE OR REPLACE FUNCTION public.sync_provider_leagues()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_json JSONB; n INT;
BEGIN
  v_json := public.api_football_get('/leagues', true);
  IF jsonb_typeof(v_json->'errors') = 'object' AND v_json->'errors' <> '{}'::JSONB THEN
    RAISE EXCEPTION 'API-Football recusou /leagues: %', v_json->'errors';
  END IF;

  INSERT INTO public.provider_leagues (league_id, name, type, country, country_code, logo_url, flag_url, synced_at)
  SELECT (f->'league'->>'id')::BIGINT, f->'league'->>'name', f->'league'->>'type',
         f->'country'->>'name', f->'country'->>'code',
         f->'league'->>'logo', f->'country'->>'flag', now()
    FROM jsonb_array_elements(v_json->'response') f
  ON CONFLICT (provider, league_id) DO UPDATE SET
    name = EXCLUDED.name, type = EXCLUDED.type, country = EXCLUDED.country,
    country_code = EXCLUDED.country_code, logo_url = EXCLUDED.logo_url,
    flag_url = EXCLUDED.flag_url, synced_at = now();

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.registra_provider_teams()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
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
    team_key  = COALESCE(EXCLUDED.team_key, public.provider_teams.team_key),
    last_seen = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

SELECT public.sync_provider_leagues();
SELECT public.registra_provider_teams();
