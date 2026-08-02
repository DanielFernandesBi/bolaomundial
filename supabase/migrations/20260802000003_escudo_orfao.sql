-- ============================================================================
-- O escudo do homônimo continuava colado no clube, mesmo depois da correção.
-- ============================================================================
-- `pin_crest_urls` (na forma de 20260802000001) só sabia SOBRESCREVER: para
-- cada clube com uma partida confiável, grava o escudo dela. Um clube cuja
-- ÚNICA partida era do homônimo ficou sem partida confiável nenhuma — e o
-- escudo errado, já gravado, simplesmente permaneceu:
--
--   Platense (Argentina, bolão)             ← escudo do Platense de El Salvador
--   Recoleta (Paraguai, bolão)              ← escudo do Recoleta do Chile
--   Universidad Católica (Chile, bolão)     ← escudo da U. Católica do Equador
--   Liverpool (Uruguai)                     ← escudo do Liverpool inglês
--   San Antonio (Equador)                   ← escudo do San Antonio dos EUA
--
-- A função ganha o passo que faltava: apagar o escudo que comprovadamente
-- pertence a OUTRO time do provedor. A prova vem de `provider_teams`, que
-- guarda o escudo por id: se a URL guardada é a de um time cujo `team_key` não
-- é este clube, ela não é nossa.
--
-- Apagar é seguro: `club_source_ids.crest_url` é só o cache do escudo que a API
-- manda. Sem ele, a tela cai no escudo que o admin cadastrou em `matches` ao
-- montar a chave — que é justamente o certo para os clubes do bolão. Escudo
-- errado é pior do que escudo ausente.
--
-- Conservador de propósito: só apaga o que tem contraprova em provider_teams.
-- Escudo sem origem conhecida fica onde está.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pin_crest_urls()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  -- (1) Gravar o escudo das partidas cuja identidade foi confirmada.
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

  -- (2) Apagar o que sobrou de um time que não é este clube.
  UPDATE public.club_source_ids c
     SET crest_url = NULL
   WHERE c.crest_url IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.provider_teams pt
        WHERE pt.crest_url = c.crest_url
          AND pt.team_key IS DISTINCT FROM c.team_key
     );
END;
$function$;

SELECT public.pin_crest_urls();

-- ---------------------------------------------------------------------------
-- Verificação: deve devolver 0 linhas.
--   SELECT c.team_key, c.crest_url
--     FROM public.club_source_ids c
--     JOIN public.provider_teams pt ON pt.crest_url = c.crest_url
--    WHERE pt.team_key IS DISTINCT FROM c.team_key;
-- ---------------------------------------------------------------------------
