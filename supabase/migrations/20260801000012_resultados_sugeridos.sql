-- ============================================================================
-- Resultado sugerido: o que a API-Football já sabe sobre os jogos do bolão.
--
-- A sincronização horária guarda em club_fixtures os jogos da Libertadores,
-- da Sul-Americana e da Copa do Brasil — inclusive os 48 do bolão. Esta função
-- só cruza as duas tabelas e devolve o placar que o admin teria de digitar.
--
-- NÃO grava nada. A decisão de lançar continua sendo do admin, num clique, e
-- passa pelo mesmo caminho de sempre (updateMatchScore -> pontuação ->
-- progressão do chaveamento). Escrever sozinho não duplicaria pontos —
-- process_match_finished é idempotente —, mas duplicaria a chance de um
-- pareamento errado virar pontuação sem ninguém olhar.
--
-- Regras do pareamento, todas obrigatórias:
--   · a competição do jogo tem de bater com a liga da API;
--   · os dois clubes têm de resolver para as mesmas chaves, em qualquer ordem
--     (a API pode inverter mandante e visitante em relação ao nosso cadastro —
--     daí a coluna `invertido`);
--   · a diferença entre os horários tem de ser menor que 36h;
--   · a partida tem de estar encerrada na API (FT/AET/PEN).
-- Havendo mais de um candidato, vence o mais próximo no tempo.
--
-- O placar sugerido é o dos 90 MINUTOS. É o que este bolão pontua: não há
-- prorrogação no regulamento daqui. Quando a partida real teve prorrogação,
-- `teve_prorrogacao` avisa — o admin decide o que fazer, o sistema não decide
-- por ele.
--
-- O mapa competição -> liga é DERIVADO de club_competition_weights, e não
-- repetido aqui. A primeira versão desta função repetiu, e trocou Libertadores
-- (13) com Sul-Americana (11) — a liga 11 da API chama-se "CONMEBOL
-- Sudamericana". Derivar do cadastro faz o erro virar silêncio (zero linhas)
-- em vez de pareamento errado.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resultados_sugeridos(p_tournament_id BIGINT)
RETURNS TABLE (
  match_id            BIGINT,
  team_home           TEXT,
  team_away           TEXT,
  match_date          TIMESTAMPTZ,
  competition         TEXT,
  leg                 TEXT,
  status              TEXT,
  score_home          INT,
  score_away          INT,
  sug_home            INT,
  sug_away            INT,
  sug_pen_winner      TEXT,
  invertido           BOOLEAN,
  teve_prorrogacao    BOOLEAN,
  divergente          BOOLEAN,
  fonte_liga          TEXT,
  fonte_kickoff       TIMESTAMPTZ,
  fonte_status        TEXT,
  provider_fixture_id BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH liga AS (
    SELECT 'libertadores'::TEXT AS competition, w.league_id
      FROM public.club_competition_weights w WHERE w.league_name = 'CONMEBOL Libertadores'
    UNION ALL
    SELECT 'sudamericana', w.league_id
      FROM public.club_competition_weights w WHERE w.league_name = 'CONMEBOL Sudamericana'
    UNION ALL
    SELECT 'copa_do_brasil', w.league_id
      FROM public.club_competition_weights w WHERE w.league_name = 'Copa Do Brasil'
  ),
  jogos AS (
    SELECT m.id, m.team_home, m.team_away, m.match_date, m.competition, m.leg,
           m.status, m.score_home, m.score_away,
           public.club_resolve(m.team_home) AS kh,
           public.club_resolve(m.team_away) AS ka,
           l.league_id
      FROM public.matches m
      JOIN liga l ON l.competition = m.competition
     WHERE m.tournament_id = p_tournament_id
       AND m.match_date IS NOT NULL
  )
  SELECT j.id, j.team_home, j.team_away, j.match_date, j.competition, j.leg,
         j.status, j.score_home, j.score_away,
         CASE WHEN c.invertido THEN c.goals_away_90 ELSE c.goals_home_90 END,
         CASE WHEN c.invertido THEN c.goals_home_90 ELSE c.goals_away_90 END,
         CASE
           WHEN c.penalties_home IS NULL OR c.penalties_away IS NULL THEN NULL
           WHEN c.penalties_home = c.penalties_away THEN NULL
           WHEN (c.penalties_home > c.penalties_away) <> c.invertido THEN 'home'
           ELSE 'away'
         END,
         c.invertido,
         (c.goals_home_extra IS NOT NULL OR c.goals_away_extra IS NOT NULL),
         (j.status = 'FINISHED' AND (
            j.score_home IS DISTINCT FROM (CASE WHEN c.invertido THEN c.goals_away_90 ELSE c.goals_home_90 END)
         OR j.score_away IS DISTINCT FROM (CASE WHEN c.invertido THEN c.goals_home_90 ELSE c.goals_away_90 END))),
         c.league_name, c.kickoff_at, c.status, c.provider_fixture_id
    FROM jogos j
    JOIN LATERAL (
      SELECT f.*, (f.home_team_key = j.ka) AS invertido
        FROM public.club_fixtures f
       WHERE f.league_id = j.league_id
         AND f.status IN ('FT','AET','PEN')
         AND f.goals_home_90 IS NOT NULL AND f.goals_away_90 IS NOT NULL
         AND j.kh IS NOT NULL AND j.ka IS NOT NULL
         AND ((f.home_team_key = j.kh AND f.away_team_key = j.ka)
           OR (f.home_team_key = j.ka AND f.away_team_key = j.kh))
         AND abs(EXTRACT(EPOCH FROM (f.kickoff_at - j.match_date))) < 36 * 3600
       ORDER BY abs(EXTRACT(EPOCH FROM (f.kickoff_at - j.match_date)))
       LIMIT 1
    ) c ON TRUE
   ORDER BY j.match_date;
$$;

REVOKE ALL ON FUNCTION public.resultados_sugeridos(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resultados_sugeridos(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.resultados_sugeridos(BIGINT) IS
  'Cruza matches com club_fixtures e devolve o placar que a API-Football já registrou. Só leitura — quem lança é o admin.';
