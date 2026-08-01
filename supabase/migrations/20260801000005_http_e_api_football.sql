-- ============================================================================
-- Acesso HTTP a partir do banco + cliente da API-Football.
--
-- POR QUE A PARTIR DO BANCO, e não de uma rota Next: o ambiente onde este
-- projeto é desenvolvido não tem egress para api-sports.io, e o cron vai
-- precisar do mesmo mecanismo de qualquer forma. Concentrar aqui evita duas
-- implementações do mesmo cliente.
--
-- A chave vive no Vault (`vault.create_secret('...', 'API_FOOTBALL_KEY', ...)`),
-- nunca em arquivo do repositório nem em variável do Next.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- HTTP a partir do banco é SSRF na mão de quem puder chamar. O schema
-- `extensions` não é exposto pela Data API, mas revogar é explícito e barato.
REVOKE ALL ON SCHEMA extensions FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA extensions FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.api_football_cache (
  endpoint   TEXT PRIMARY KEY,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.api_football_cache ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.api_football_get(p_path TEXT, p_force BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cache JSONB;
  v_key   TEXT;
  v_resp  extensions.http_response;
  v_json  JSONB;
BEGIN
  -- Cota de 100 chamadas/dia: nunca repetir uma chamada já feita.
  SELECT payload INTO v_cache FROM public.api_football_cache WHERE endpoint = p_path;
  IF v_cache IS NOT NULL AND NOT p_force THEN
    RETURN v_cache;
  END IF;

  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'API_FOOTBALL_KEY';
  IF v_key IS NULL THEN RAISE EXCEPTION 'API_FOOTBALL_KEY ausente no Vault'; END IF;

  SELECT * INTO v_resp FROM extensions.http((
    'GET', 'https://v3.football.api-sports.io' || p_path,
    ARRAY[extensions.http_header('x-apisports-key', v_key)], NULL, NULL
  )::extensions.http_request);

  IF v_resp.status <> 200 THEN
    RAISE EXCEPTION 'API-Football devolveu % em %', v_resp.status, p_path;
  END IF;

  v_json := v_resp.content::JSONB;

  -- Resposta com `errors` NÃO entra no cache. A API devolve 200 com
  -- {"errors":{"rateLimit":...}} ou {"errors":{"plan":...}}; cachear isso faria
  -- um limite momentâneo virar "não existe" para sempre, e a cota gasta não
  -- volta. `errors` vem como [] quando está tudo bem.
  IF jsonb_typeof(v_json->'errors') = 'object' AND v_json->'errors' <> '{}'::JSONB THEN
    RETURN v_json;
  END IF;

  INSERT INTO public.api_football_cache (endpoint, payload) VALUES (p_path, v_json)
    ON CONFLICT (endpoint) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now();
  RETURN v_json;
END;
$$;

REVOKE ALL ON FUNCTION public.api_football_get(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
