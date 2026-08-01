-- ============================================================================
-- A estatística por clube passa a valer para TODO time que jogou.
--
-- A versão de 20260801000023 partia de club_source_ids — os 384 clubes com
-- rating Opta. Consequência: com a captura por liga, um clube inglês entra no
-- banco, os jogos dele aparecem na aba Jogos, e ele nunca ganha ficha. Isso
-- derruba metade do motivo de capturar liga nova — "bolão futuro já começa com
-- estatística" só vale se o time tiver onde a estatística aparecer.
--
-- A identidade passa a ser:
--   · team_key            — quando o clube está no mapa (mantém a fusão de
--                           nomes: "Vasco" e "Vasco da Gama" são um só);
--   · '#' || provider_id  — quando não está, para cada time da API virar uma
--                           linha própria em vez de sumir.
--
-- provider_id vai no retorno porque é por ele que a tela filtra os jogos de um
-- time que ainda não tem chave no nosso mapa.
--
-- Efeito medido: 78 -> 102 linhas, sendo 23 de times descobertos pela captura.
-- ============================================================================

DROP FUNCTION IF EXISTS public.estatisticas_clubes();

CREATE FUNCTION public.estatisticas_clubes()
RETURNS TABLE (
  id TEXT, team_key TEXT, provider_id BIGINT,
  nome TEXT, crest_url TEXT, is_bolao BOOLEAN, mapeado BOOLEAN,
  jogos INT, v INT, e INT, d INT,
  gols_pro INT, gols_contra INT, sem_sofrer INT, nao_marcou INT,
  casa_v INT, casa_e INT, casa_d INT,
  fora_v INT, fora_e INT, fora_d INT,
  ht_pro INT, ht_contra INT, virou INT, entregou INT,
  ultimos TEXT, ultimo_jogo TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH lados AS (
    SELECT COALESCE(f.home_team_key, '#' || f.home_provider_id::TEXT) AS ident,
           f.home_team_key AS chave, f.home_provider_id AS pid,
           TRUE AS em_casa, f.kickoff_at,
           COALESCE(f.goals_home_90,0) + COALESCE(f.goals_home_extra,0) AS meus,
           COALESCE(f.goals_away_90,0) + COALESCE(f.goals_away_extra,0) AS deles,
           f.goals_home_ht AS meus_ht, f.goals_away_ht AS deles_ht
      FROM public.club_fixtures f
     WHERE f.status IN ('FT','AET','PEN')
       AND f.goals_home_90 IS NOT NULL AND f.goals_away_90 IS NOT NULL
       AND (f.home_team_key IS NOT NULL OR f.home_provider_id IS NOT NULL)
    UNION ALL
    SELECT COALESCE(f.away_team_key, '#' || f.away_provider_id::TEXT),
           f.away_team_key, f.away_provider_id, FALSE, f.kickoff_at,
           COALESCE(f.goals_away_90,0) + COALESCE(f.goals_away_extra,0),
           COALESCE(f.goals_home_90,0) + COALESCE(f.goals_home_extra,0),
           f.goals_away_ht, f.goals_home_ht
      FROM public.club_fixtures f
     WHERE f.status IN ('FT','AET','PEN')
       AND f.goals_home_90 IS NOT NULL AND f.goals_away_90 IS NOT NULL
       AND (f.away_team_key IS NOT NULL OR f.away_provider_id IS NOT NULL)
  ),
  marcado AS (
    SELECT l.*,
           CASE WHEN l.meus > l.deles THEN 'V' WHEN l.meus < l.deles THEN 'D' ELSE 'E' END AS res,
           CASE WHEN l.meus_ht IS NULL OR l.deles_ht IS NULL THEN NULL
                WHEN l.meus_ht < l.deles_ht THEN 'atras'
                WHEN l.meus_ht > l.deles_ht THEN 'na frente'
                ELSE 'igual' END AS no_intervalo
      FROM lados l
  ),
  agregado AS (
    SELECT m.ident, max(m.chave) AS chave, max(m.pid) AS pid,
           count(*)::INT AS jogos,
           count(*) FILTER (WHERE m.res='V')::INT AS v,
           count(*) FILTER (WHERE m.res='E')::INT AS e,
           count(*) FILTER (WHERE m.res='D')::INT AS d,
           sum(m.meus)::INT  AS gols_pro,
           sum(m.deles)::INT AS gols_contra,
           count(*) FILTER (WHERE m.deles = 0)::INT AS sem_sofrer,
           count(*) FILTER (WHERE m.meus  = 0)::INT AS nao_marcou,
           count(*) FILTER (WHERE m.em_casa AND m.res='V')::INT AS casa_v,
           count(*) FILTER (WHERE m.em_casa AND m.res='E')::INT AS casa_e,
           count(*) FILTER (WHERE m.em_casa AND m.res='D')::INT AS casa_d,
           count(*) FILTER (WHERE NOT m.em_casa AND m.res='V')::INT AS fora_v,
           count(*) FILTER (WHERE NOT m.em_casa AND m.res='E')::INT AS fora_e,
           count(*) FILTER (WHERE NOT m.em_casa AND m.res='D')::INT AS fora_d,
           sum(m.meus_ht)::INT  AS ht_pro,
           sum(m.deles_ht)::INT AS ht_contra,
           count(*) FILTER (WHERE m.no_intervalo='atras'     AND m.res='V')::INT  AS virou,
           count(*) FILTER (WHERE m.no_intervalo='na frente' AND m.res<>'V')::INT AS entregou,
           max(m.kickoff_at) AS ultimo_jogo
      FROM marcado m GROUP BY m.ident
  ),
  forma AS (
    SELECT ident, string_agg(res, '' ORDER BY rn) AS ultimos FROM (
      SELECT m.ident, m.res, row_number() OVER (PARTITION BY m.ident ORDER BY m.kickoff_at DESC) AS rn
        FROM marcado m
    ) t WHERE rn <= 5 GROUP BY ident
  ),
  -- Os clubes do bolão entram mesmo sem jogo nenhum: a ficha deles existe
  -- desde antes de a bola rolar, e sumi-la seria pior do que mostrar zeros.
  universo AS (
    SELECT c.team_key AS ident, c.team_key AS chave, c.api_football_id AS pid,
           c.canonical_name AS nome, c.crest_url, c.is_bolao_team AS is_bolao, TRUE AS mapeado
      FROM public.club_source_ids c
     WHERE c.is_bolao_team
    UNION
    SELECT a.ident, a.chave, a.pid,
           COALESCE(cs.canonical_name, pt.name, 'time ' || a.pid::TEXT),
           COALESCE(cs.crest_url, pt.crest_url),
           COALESCE(cs.is_bolao_team, FALSE),
           (a.chave IS NOT NULL)
      FROM agregado a
      LEFT JOIN public.club_source_ids cs ON cs.team_key = a.chave
      LEFT JOIN public.provider_teams  pt ON pt.team_id  = a.pid
  )
  SELECT u.ident, u.chave, u.pid, u.nome, u.crest_url, u.is_bolao, u.mapeado,
         COALESCE(a.jogos,0), COALESCE(a.v,0), COALESCE(a.e,0), COALESCE(a.d,0),
         COALESCE(a.gols_pro,0), COALESCE(a.gols_contra,0),
         COALESCE(a.sem_sofrer,0), COALESCE(a.nao_marcou,0),
         COALESCE(a.casa_v,0), COALESCE(a.casa_e,0), COALESCE(a.casa_d,0),
         COALESCE(a.fora_v,0), COALESCE(a.fora_e,0), COALESCE(a.fora_d,0),
         COALESCE(a.ht_pro,0), COALESCE(a.ht_contra,0),
         COALESCE(a.virou,0), COALESCE(a.entregou,0),
         COALESCE(f.ultimos,''), a.ultimo_jogo
    FROM universo u
    LEFT JOIN agregado a ON a.ident = u.ident
    LEFT JOIN forma    f ON f.ident = u.ident
   ORDER BY u.is_bolao DESC, COALESCE(a.jogos,0) DESC, u.nome;
$$;

REVOKE ALL ON FUNCTION public.estatisticas_clubes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estatisticas_clubes() TO authenticated;
