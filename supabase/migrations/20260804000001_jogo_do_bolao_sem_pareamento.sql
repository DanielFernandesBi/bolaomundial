-- ============================================================================
-- Athletico-PR × Vitória encerrou 2×0 e não apareceu em lugar nenhum.
-- ============================================================================
-- A partida FOI coletada (fixture 1546843, Copa do Brasil, 03/08 21:00, FT
-- 2×0). O que falhou foi o nome: a API-Football chama o clube de **"Atletico
-- Paranaense"**, e o nosso cadastro diz "Athletico-PR".
--
--   club_key_normalize('Atletico Paranaense') -> 'atletico paranaense'
--   club_key_normalize('Athletico-PR')        -> 'athletico pr'
--
-- Sem apelido ligando os dois, `home_team_key` ficou NULO. E
-- `resultados_sugeridos` exige as DUAS chaves resolvidas para parear — então o
-- jogo não virou sugestão, não apareceu no admin, e o automático não teve o que
-- lançar. Silêncio completo.
--
-- ----------------------------------------------------------------------------
-- O SISTEMA SABIA — E NÃO CONSEGUIU AVISAR
-- ----------------------------------------------------------------------------
-- "Atletico Paranaense" estava na fila de apelidos, no topo, com
-- jogos_perdidos = 1. Só que a fila é outra aba, e nada liga "jogo que sumiu" a
-- "nome não mapeado". O admin teria de adivinhar a conexão.
--
-- Pior: os candidatos que a fila oferecia eram TODOS ERRADOS — Atlético
-- Goianiense (0,43), Atlético FC, Atlético-MG. O certo, `athletico pr`, nem
-- aparecia, porque a similaridade de texto entre "atletico paranaense" e
-- "athletico pr" é baixa demais para entrar no corte de 0,30. Olhar a fila não
-- teria resolvido: ela ofereceria três clubes errados e nenhum certo.
--
-- ----------------------------------------------------------------------------
-- A CORREÇÃO ESTRUTURAL: deduzir o clube pelo CONFRONTO, não pelo texto
-- ----------------------------------------------------------------------------
-- Quando um jogo do bolão não pareia, quase sempre sobra uma pista decisiva: a
-- partida da API tem um lado que RESOLVEU para um dos nossos dois times. Se
-- "Vitoria" bate com o nosso Vitória, e o confronto é Athletico-PR × Vitória,
-- então o outro nome — seja ele qual for — só pode ser o Athletico-PR.
--
-- Isso não é semelhança de texto: é dedução pelo contexto, e acerta onde o
-- trigrama erra. `resultados_nao_pareados` devolve o jogo, o nome que a API
-- usou e a chave deduzida, pronta para virar apelido num clique.
-- ============================================================================

-- ── 1. Os apelidos que faltavam ─────────────────────────────────────────────
-- Cinco são clubes DO BOLÃO, todos sem id fixado — e sem id fixado não há como
-- o pino proteger. Cada um conferido pelo par liga+país no catálogo do
-- provedor, nunca por semelhança de nome:
--
--   Athletico-PR            <- "Atletico Paranaense" #134   (Copa do Brasil/BR)
--   Independiente Rivadavia <- "Independ. Rivadavia" #473   (Liga Profesional/AR)
--   LDU Quito               <- "LDU de Quito"        #1158  (Liga Pro/EC)
--   Recoleta (PAR)          <- "Deportivo Recoleta"  #10476 (Div. Profesional/PY)
--   Universidad Católica    <- "U. Catolica"         #2994  (Primera División/CL)
--
-- Os dois Recoleta e as duas Universidad Católica merecem atenção: o "Recoleta
-- #5644" é o CHILENO (já é `recoleta chile`) e a "Universidad Catolica #1157" é
-- a EQUATORIANA (já é `universidad catolica quito`). Mapear pelo nome teria
-- pegado o clube errado nos dois casos.
INSERT INTO public.club_aliases (alias, team_key, origem)
SELECT public.club_key_normalize(v.nome), v.chave, 'provider'
FROM (VALUES
  -- clubes do bolão
  ('Atletico Paranaense',      'athletico pr'),
  ('Independ. Rivadavia',      'independiente rivadavia'),
  ('LDU de Quito',             'ldu quito'),
  ('Deportivo Recoleta',       'recoleta'),
  ('U. Catolica',              'universidad catolica'),
  -- adversários: não mudam o bolão, mas cada um é uma partida a mais no modelo
  ('Talleres Cordoba',         'talleres de cordoba'),
  ('Instituto Cordoba',        'instituto'),
  ('Cucuta',                   'cucuta deportivo'),
  ('Defensores de Vilelas',    'defensores vilelas'),
  ('Paraguari AC',             'paraguari'),
  ('Universidad de Concepcion','universidad concepcion'),
  ('Club Sp. San Lorenzo',     'sportivo san lorenzo')
) AS v(nome, chave)
ON CONFLICT (alias) DO UPDATE SET team_key = EXCLUDED.team_key;

-- ── 2. O jogo do bolão que a API tem e nós não conseguimos parear ───────────
CREATE OR REPLACE FUNCTION public.resultados_nao_pareados(p_tournament_id BIGINT)
RETURNS TABLE (
  match_id            BIGINT,
  team_home           TEXT,
  team_away           TEXT,
  match_date          TIMESTAMPTZ,
  competition         TEXT,
  leg                 TEXT,
  provider_fixture_id BIGINT,
  fonte_status        TEXT,
  fonte_kickoff       TIMESTAMPTZ,
  sug_home            INT,
  sug_away            INT,
  nome_na_api         TEXT,
  team_key_deduzida   TEXT,
  nome_do_clube       TEXT
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
           public.club_resolve(m.team_home) AS kh,
           public.club_resolve(m.team_away) AS ka,
           l.league_id
      FROM public.matches m
      JOIN liga l ON l.competition = m.competition
     WHERE m.tournament_id = p_tournament_id
       AND m.status <> 'FINISHED'
       AND m.match_date IS NOT NULL
  )
  SELECT j.id, j.team_home, j.team_away, j.match_date, j.competition, j.leg,
         c.provider_fixture_id, c.status, c.kickoff_at,
         c.goals_home_90, c.goals_away_90,
         -- o lado que a API trouxe e não reconhecemos
         CASE WHEN c.home_team_key IS NULL THEN c.home_team_name ELSE c.away_team_name END,
         -- dedução: dos nossos dois times, o que NÃO foi o lado reconhecido
         CASE WHEN c.lado_ok = j.kh THEN j.ka ELSE j.kh END,
         CASE WHEN c.lado_ok = j.kh THEN j.team_away ELSE j.team_home END
    FROM jogos j
    JOIN LATERAL (
      SELECT f.*,
             CASE WHEN f.home_team_key IN (j.kh, j.ka) THEN f.home_team_key ELSE f.away_team_key END AS lado_ok
        FROM public.club_fixtures f
       WHERE f.league_id = j.league_id
         AND f.status IN ('FT','AET','PEN')
         AND f.goals_home_90 IS NOT NULL AND f.goals_away_90 IS NOT NULL
         -- exatamente um lado reconhecido: é o que permite deduzir o outro
         AND (f.home_team_key IS NULL) <> (f.away_team_key IS NULL)
         AND (f.home_team_key IN (j.kh, j.ka) OR f.away_team_key IN (j.kh, j.ka))
         AND abs(EXTRACT(EPOCH FROM (f.kickoff_at - j.match_date))) < 36 * 3600
       ORDER BY abs(EXTRACT(EPOCH FROM (f.kickoff_at - j.match_date)))
       LIMIT 1
    ) c ON TRUE
   ORDER BY j.match_date;
$$;

REVOKE ALL ON FUNCTION public.resultados_nao_pareados(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resultados_nao_pareados(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.resultados_nao_pareados(BIGINT) IS
  'Jogo do bolão que a API tem encerrado mas que não pareou porque um dos clubes não foi reconhecido. Deduz a chave certa pelo confronto — o lado que resolveu identifica o outro.';

-- ── 3. Aplicar ──────────────────────────────────────────────────────────────
SELECT public.pin_provider_ids();
SELECT public.reresolve_fixture_keys();
SELECT public.pin_crest_urls();
SELECT public.registra_provider_teams();

-- ---------------------------------------------------------------------------
-- Verificação:
--   -- deve ficar vazio depois dos apelidos acima:
--   SELECT * FROM public.resultados_nao_pareados(16);
--   -- e o Athletico deve passar a parear:
--   SELECT match_id, team_home, team_away, sug_home, sug_away
--     FROM public.resultados_sugeridos(16) WHERE status <> 'FINISHED';
-- ---------------------------------------------------------------------------
