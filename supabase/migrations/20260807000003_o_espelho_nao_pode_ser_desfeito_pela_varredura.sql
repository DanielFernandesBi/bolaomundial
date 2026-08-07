-- ============================================================================
-- `pin_crest_urls()` desfaria o espelho na varredura seguinte.
-- ============================================================================
-- Ela grava em `crest_url` o escudo que a API mandou na partida, sempre que
-- diferir do que está lá. Depois do espelhamento, o que está lá é o NOSSO
-- endereço — e ele difere. Em vinte minutos os 329 escudos voltariam a apontar
-- para o media.api-sports.io, calados, e o trabalho todo se desfaria.
--
-- Peguei isso antes de a primeira varredura rodar. A correção separa dois
-- papéis que estavam no mesmo lugar:
--
--   crest_origem_url  DE ONDE vem a imagem   -> pin_crest_urls descobre
--   crest_url         COMO O APP SERVE       -> só o espelho escreve
--
-- Com os papéis separados, a descoberta continua funcionando (é ela que nota
-- quando um clube ganha escudo novo na fonte) e a fila do espelho reage à
-- mudança, em vez de brigar com ela.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pin_crest_urls()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  -- (1) DESCOBERTA: de onde vem o escudo deste clube, segundo as partidas cuja
  -- identidade foi confirmada. Escreve em `crest_origem_url` — e em
  -- `crest_url` apenas enquanto não houver espelho, para o clube recém-visto
  -- não ficar sem imagem nenhuma até a próxima passada do espelhamento.
  WITH vistos AS (
    SELECT f.home_team_key AS k, f.home_provider_id AS pid, f.home_crest_url AS crest,
           f.league_country, f.kickoff_at
      FROM public.club_fixtures f
     WHERE f.home_team_key IS NOT NULL AND f.home_crest_url IS NOT NULL
       AND f.home_crest_url NOT LIKE '%/public/escudos/%'
    UNION ALL
    SELECT f.away_team_key, f.away_provider_id, f.away_crest_url, f.league_country, f.kickoff_at
      FROM public.club_fixtures f
     WHERE f.away_team_key IS NOT NULL AND f.away_crest_url IS NOT NULL
       AND f.away_crest_url NOT LIKE '%/public/escudos/%'
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
    SELECT DISTINCT ON (c.k) c.k, c.crest
      FROM confiaveis c
     ORDER BY c.k, (c.api_football_id IS NOT NULL) DESC, c.kickoff_at DESC
  )
  UPDATE public.club_source_ids c
     SET crest_origem_url = e.crest,
         -- Só encosta em crest_url se ele ainda não for nosso.
         crest_url = CASE WHEN c.crest_url LIKE '%/public/escudos/%'
                          THEN c.crest_url ELSE e.crest END
    FROM escolhido e
   WHERE e.k = c.team_key
     AND (c.crest_origem_url IS DISTINCT FROM e.crest
          OR (c.crest_url IS DISTINCT FROM e.crest
              AND c.crest_url NOT LIKE '%/public/escudos/%'));

  -- (2) Escudo que, na verdade, é de outro time. Apaga a ORIGEM e, com ela, o
  -- espelho: uma imagem errada servida por nós é pior que servida por eles,
  -- porque parece nossa. Sem escudo, a tela cai no placeholder.
  UPDATE public.club_source_ids c
     SET crest_url = NULL, crest_origem_url = NULL, crest_espelhado_em = NULL
   WHERE c.crest_origem_url IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.provider_teams pt
        WHERE pt.crest_url = c.crest_origem_url
          AND pt.team_key IS DISTINCT FROM c.team_key
     );
END;
$function$;

COMMENT ON FUNCTION public.pin_crest_urls() IS
  'Descobre a ORIGEM do escudo de cada clube (crest_origem_url) a partir das partidas confirmadas. Nunca sobrescreve crest_url quando ele já aponta para o nosso Storage — quem escreve ali é só o espelhamento.';

-- ── A fila passa a ler a origem que a descoberta gravou ─────────────────────
CREATE OR REPLACE FUNCTION public.escudos_a_espelhar()
RETURNS TABLE (team_key TEXT, origem TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH do_cadastro AS (
    SELECT public.club_resolve(t.nome) AS k, min(t.url) AS url
      FROM (SELECT team_home AS nome, home_iso AS url FROM public.matches
             WHERE home_iso LIKE 'http%' AND home_iso NOT LIKE '%/public/escudos/%'
            UNION ALL
            SELECT team_away, away_iso FROM public.matches
             WHERE away_iso LIKE 'http%' AND away_iso NOT LIKE '%/public/escudos/%') t
     WHERE public.club_resolve(t.nome) IS NOT NULL
     GROUP BY 1
  ),
  alvo AS (
    -- A origem sai da descoberta (pin_crest_urls) e, na falta dela, do que o
    -- admin cadastrou — que é o único caminho para clube do bolão que ainda
    -- não entrou em campo.
    SELECT c.team_key,
           COALESCE(c.crest_origem_url,
                    CASE WHEN c.crest_url NOT LIKE '%/public/escudos/%' THEN c.crest_url END,
                    dc.url) AS origem,
           c.crest_espelhado_em, c.crest_url, c.is_bolao_team, c.canonical_name
      FROM public.club_source_ids c
      LEFT JOIN do_cadastro dc ON dc.k = c.team_key
  )
  SELECT a.team_key, a.origem
    FROM alvo a
   WHERE a.origem IS NOT NULL
     AND a.origem NOT LIKE '%/public/escudos/%'
     -- Espelhar quando: nunca foi espelhado, ou a origem mudou desde então.
     AND (a.crest_espelhado_em IS NULL
          OR a.crest_url IS NULL
          OR a.crest_url NOT LIKE '%/public/escudos/%')
   ORDER BY a.is_bolao_team DESC, a.canonical_name;
$$;

REVOKE ALL ON FUNCTION public.escudos_a_espelhar() FROM PUBLIC, anon, authenticated;

-- ── Verificação imediata: a descoberta não pode ter mexido no espelho ───────
SELECT public.pin_crest_urls();
