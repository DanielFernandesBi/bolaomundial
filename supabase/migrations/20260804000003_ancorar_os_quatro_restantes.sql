-- ============================================================================
-- Os quatro últimos clubes do bolão sem âncora — e um deles ia falhar dia 12.
-- ============================================================================
-- Depois do caso Athletico-PR, sobraram quatro clubes do bolão sem
-- `api_football_id`: Botafogo, Bragantino, Flamengo e São Paulo. Nenhum deles
-- tinha aparecido em partida coletada, porque o Brasileirão está parado pela
-- Copa do Brasil — então não havia de onde tirar o id, e eles dependiam
-- exclusivamente de o nome da API bater com o nosso cadastro.
--
-- Três jogos do bolão dependiam disso, com data marcada:
--
--   11/08 21:30  Bolívar × São Paulo        (Sul-Americana)
--   12/08 19:00  Bragantino × Atlético-MG   (Sul-Americana)
--   12/08 21:30  Cruzeiro × Flamengo        (Libertadores)
--
-- Consultei `/teams?search=` (funciona no plano gratuito; o bloqueio é só para
-- `?season=`) e confirmei que UM DELES IA FALHAR:
--
--   Flamengo    -> "Flamengo"       #127   bate com a chave
--   Botafogo    -> "Botafogo"       #120   bate (o de 1904; há PB, SP, BA, DF)
--   São Paulo   -> "Sao Paulo"      #126   bate
--   Bragantino  -> "RB Bragantino"  #794   NÃO BATE  <-- repetiria o Athletico
--
-- `club_key_normalize('RB Bragantino')` = 'rb bragantino', e a nossa chave é
-- 'bragantino'. Sem isto, Bragantino × Atlético-MG teria sumido do painel
-- exatamente como Athletico-PR × Vitória.
--
-- Com o id fixado, `club_resolve_id` resolve pelo ID antes do nome — então a
-- grafia deixa de importar para os quatro, e some também o risco dos homônimos
-- brasileiros (Botafogo PB/SP/BA/DF, São Paulo RS), que a regra de país não
-- separa por serem todos do mesmo país.
--
-- NOTA sobre `api_football_get`: o caminho não passa por URL-encode, então um
-- termo com espaço ("?search=sao paulo") faz a extensão http recusar a URL.
-- Nada no caminho automático usa espaço — a varredura só monta datas —, mas
-- fica o registro para quem for chamar à mão.
-- ============================================================================

-- ── 1. As quatro âncoras ────────────────────────────────────────────────────
UPDATE public.club_source_ids SET api_football_id = 127 WHERE team_key = 'flamengo'   AND api_football_id IS NULL;
UPDATE public.club_source_ids SET api_football_id = 120 WHERE team_key = 'botafogo'   AND api_football_id IS NULL;
UPDATE public.club_source_ids SET api_football_id = 126 WHERE team_key = 'sao paulo'  AND api_football_id IS NULL;
UPDATE public.club_source_ids SET api_football_id = 794 WHERE team_key = 'bragantino' AND api_football_id IS NULL;

-- O apelido é redundante com o pino (o id resolve primeiro), mas mantém a fila
-- do admin limpa e o nome legível se o id um dia mudar de mãos.
INSERT INTO public.club_aliases (alias, team_key, origem)
VALUES (public.club_key_normalize('RB Bragantino'), 'bragantino', 'provider')
ON CONFLICT (alias) DO UPDATE SET team_key = EXCLUDED.team_key;

-- ── 2. O aviso passa a chegar ANTES do jogo ─────────────────────────────────
-- A primeira versão só enxergava partida ENCERRADA — ou seja, avisava depois de
-- o estrago estar feito, com o jogo já perdido e os pontos não distribuídos.
--
-- Mas o sinal existe muito antes: assim que a agenda do dia seguinte é
-- coletada, a partida entra em `club_fixtures` com o nome não reconhecido e a
-- chave nula. Dá para avisar com um dia de antecedência, e aí o mapeamento é
-- feito com o jogo ainda por acontecer.
--
-- `sug_home`/`sug_away` passam a poder vir nulos (jogo não começou); quem lê
-- decide o que mostrar a partir de `fonte_status`.
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
         CASE WHEN c.home_team_key IS NULL THEN c.home_team_name ELSE c.away_team_name END,
         CASE WHEN c.lado_ok = j.kh THEN j.ka ELSE j.kh END,
         CASE WHEN c.lado_ok = j.kh THEN j.team_away ELSE j.team_home END
    FROM jogos j
    JOIN LATERAL (
      SELECT f.*,
             CASE WHEN f.home_team_key IN (j.kh, j.ka) THEN f.home_team_key ELSE f.away_team_key END AS lado_ok
        FROM public.club_fixtures f
       WHERE f.league_id = j.league_id
         -- SEM exigir encerramento: o objetivo é avisar antes da bola rolar.
         -- exatamente um lado reconhecido é o que permite deduzir o outro
         AND (f.home_team_key IS NULL) <> (f.away_team_key IS NULL)
         AND (f.home_team_key IN (j.kh, j.ka) OR f.away_team_key IN (j.kh, j.ka))
         AND abs(EXTRACT(EPOCH FROM (f.kickoff_at - j.match_date))) < 36 * 3600
       ORDER BY abs(EXTRACT(EPOCH FROM (f.kickoff_at - j.match_date)))
       LIMIT 1
    ) c ON TRUE
   ORDER BY j.match_date;
$$;

COMMENT ON FUNCTION public.resultados_nao_pareados(BIGINT) IS
  'Jogo do bolão cuja partida na API tem um clube não reconhecido — encerrada ou não. Deduz a chave certa pelo confronto: o lado que resolveu identifica o outro. Avisa antes do jogo, não depois.';

-- ── 3. Reconciliar com as âncoras novas ─────────────────────────────────────
SELECT public.reconciliar_identidades();

-- ---------------------------------------------------------------------------
-- Verificação: nenhum clube do bolão deve sobrar sem âncora.
--   SELECT canonical_name FROM public.club_source_ids
--    WHERE is_bolao_team AND api_football_id IS NULL;   -- 0 linhas
-- ---------------------------------------------------------------------------
