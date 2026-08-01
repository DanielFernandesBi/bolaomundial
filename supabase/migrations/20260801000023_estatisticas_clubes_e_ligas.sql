-- ============================================================================
-- Estatísticas agregadas, em SQL.
--
-- Estavam sendo calculadas no cliente sobre a lista de partidas já carregada.
-- Funcionava com 94 linhas; com a captura por liga o volume cresce e a conta
-- passaria a dizer "dos últimos N carregados" sem avisar. Aqui é exata por
-- construção.
--
-- Convenção de resultado, a mesma da tela: vale o tempo normal MAIS a
-- prorrogação, e jogo decidido nos pênaltis é EMPATE (convenção FIFA/CBF).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.estatisticas_clubes()
RETURNS TABLE (
  team_key TEXT, nome TEXT, crest_url TEXT, is_bolao BOOLEAN,
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
    -- Cada partida vira duas linhas, uma por clube. Simplifica tudo que vem
    -- depois: não há mais "se for mandante então".
    SELECT f.home_team_key AS k, TRUE AS em_casa, f.kickoff_at,
           COALESCE(f.goals_home_90,0) + COALESCE(f.goals_home_extra,0) AS meus,
           COALESCE(f.goals_away_90,0) + COALESCE(f.goals_away_extra,0) AS deles,
           f.goals_home_ht AS meus_ht, f.goals_away_ht AS deles_ht
      FROM public.club_fixtures f
     WHERE f.home_team_key IS NOT NULL AND f.status IN ('FT','AET','PEN')
       AND f.goals_home_90 IS NOT NULL AND f.goals_away_90 IS NOT NULL
    UNION ALL
    SELECT f.away_team_key, FALSE, f.kickoff_at,
           COALESCE(f.goals_away_90,0) + COALESCE(f.goals_away_extra,0),
           COALESCE(f.goals_home_90,0) + COALESCE(f.goals_home_extra,0),
           f.goals_away_ht, f.goals_home_ht
      FROM public.club_fixtures f
     WHERE f.away_team_key IS NOT NULL AND f.status IN ('FT','AET','PEN')
       AND f.goals_home_90 IS NOT NULL AND f.goals_away_90 IS NOT NULL
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
    SELECT m.k,
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
           -- Virou: perdia no intervalo e terminou vencendo.
           count(*) FILTER (WHERE m.no_intervalo='atras' AND m.res='V')::INT AS virou,
           -- Entregou: vencia no intervalo e não venceu.
           count(*) FILTER (WHERE m.no_intervalo='na frente' AND m.res<>'V')::INT AS entregou,
           max(m.kickoff_at) AS ultimo_jogo
      FROM marcado m GROUP BY m.k
  ),
  forma AS (
    SELECT k, string_agg(res, '' ORDER BY rn) AS ultimos FROM (
      SELECT m.k, m.res, row_number() OVER (PARTITION BY m.k ORDER BY m.kickoff_at DESC) AS rn
        FROM marcado m
    ) t WHERE rn <= 5 GROUP BY k
  )
  SELECT c.team_key, c.canonical_name, c.crest_url, c.is_bolao_team,
         COALESCE(a.jogos,0), COALESCE(a.v,0), COALESCE(a.e,0), COALESCE(a.d,0),
         COALESCE(a.gols_pro,0), COALESCE(a.gols_contra,0),
         COALESCE(a.sem_sofrer,0), COALESCE(a.nao_marcou,0),
         COALESCE(a.casa_v,0), COALESCE(a.casa_e,0), COALESCE(a.casa_d,0),
         COALESCE(a.fora_v,0), COALESCE(a.fora_e,0), COALESCE(a.fora_d,0),
         COALESCE(a.ht_pro,0), COALESCE(a.ht_contra,0),
         COALESCE(a.virou,0), COALESCE(a.entregou,0),
         COALESCE(f.ultimos,''), a.ultimo_jogo
    FROM public.club_source_ids c
    LEFT JOIN agregado a ON a.k = c.team_key
    LEFT JOIN forma    f ON f.k = c.team_key
   WHERE c.is_bolao_team OR a.jogos > 0
   ORDER BY c.is_bolao_team DESC, COALESCE(a.jogos,0) DESC, c.canonical_name;
$$;

-- ── Por liga ────────────────────────────────────────────────────────────────
-- Os clubes saem de uma subconsulta PRÓPRIA. A primeira versão contava jogos e
-- clubes no mesmo GROUP BY, com um LATERAL unnest dos dois provider_id — o que
-- duplica cada partida e fazia 17 jogos da Primera Nacional virarem 34. Contar
-- duas coisas de cardinalidades diferentes na mesma consulta é o erro.
CREATE OR REPLACE FUNCTION public.estatisticas_ligas()
RETURNS TABLE (
  league_id BIGINT, nome TEXT, pais TEXT, logo_url TEXT, flag_url TEXT,
  categoria TEXT, model_weight NUMERIC,
  jogos INT, encerrados INT, agendados INT, gols INT, media_gols NUMERIC,
  vitorias_casa INT, empates INT, vitorias_fora INT, clubes INT,
  ultimo_jogo TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH agregado AS (
    SELECT f.league_id,
           count(*)::INT AS jogos,
           count(*) FILTER (WHERE f.status IN ('FT','AET','PEN'))::INT AS encerrados,
           count(*) FILTER (WHERE f.status = 'NS')::INT AS agendados,
           COALESCE(sum(f.goals_home_90 + f.goals_away_90)
                    FILTER (WHERE f.status IN ('FT','AET','PEN')), 0)::INT AS gols,
           count(*) FILTER (WHERE f.status IN ('FT','AET','PEN') AND f.goals_home_90 > f.goals_away_90)::INT AS vc,
           count(*) FILTER (WHERE f.status IN ('FT','AET','PEN') AND f.goals_home_90 = f.goals_away_90)::INT AS emp,
           count(*) FILTER (WHERE f.status IN ('FT','AET','PEN') AND f.goals_home_90 < f.goals_away_90)::INT AS vf,
           max(f.kickoff_at) AS ultimo
      FROM public.club_fixtures f GROUP BY f.league_id
  ),
  times AS (
    SELECT league_id, count(DISTINCT pid)::INT AS clubes FROM (
      SELECT league_id, home_provider_id AS pid FROM public.club_fixtures WHERE home_provider_id IS NOT NULL
      UNION ALL
      SELECT league_id, away_provider_id     FROM public.club_fixtures WHERE away_provider_id IS NOT NULL
    ) t GROUP BY league_id
  )
  SELECT w.league_id, w.league_name, w.country, w.logo_url, w.flag_url,
         w.categoria, w.model_weight,
         COALESCE(a.jogos,0), COALESCE(a.encerrados,0), COALESCE(a.agendados,0),
         COALESCE(a.gols,0),
         ROUND(a.gols::NUMERIC / NULLIF(a.encerrados,0), 2),
         COALESCE(a.vc,0), COALESCE(a.emp,0), COALESCE(a.vf,0),
         COALESCE(t.clubes,0), a.ultimo
    FROM public.club_competition_weights w
    LEFT JOIN agregado a ON a.league_id = w.league_id
    LEFT JOIN times    t ON t.league_id = w.league_id
   WHERE w.capturar AND w.active
   ORDER BY COALESCE(a.jogos,0) DESC, w.league_name;
$$;

REVOKE ALL ON FUNCTION public.estatisticas_clubes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.estatisticas_ligas()  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.estatisticas_clubes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.estatisticas_ligas()  TO authenticated;
