-- ============================================================================
-- Homônimo entre países: o nome não é chave.
--
-- A API-Football tem "Santos" no Brasil (id 128) e "Santos" na segunda divisão
-- peruana (id 4226). Nossa resolução é por nome, então o jogo
-- "Santos x Comerciantes" da Liga 2 do Peru foi gravado como jogo do Santos do
-- bolão. Ainda não corrompeu o modelo só porque a partida não terminou — ao
-- terminar, entraria no ajuste de força como se fosse o Santos brasileiro.
--
-- A correção não mexe na resolução por nome (que serve à exibição): ela fixa o
-- ID do provedor para os clubes que já vimos nas competições do bolão e passa
-- a EXIGIR esse ID na hora de decidir se a partida alimenta o modelo. Clube
-- sem ID fixado segue como antes — o pino só aperta onde há certeza.
-- ============================================================================

ALTER TABLE public.club_source_ids
  ADD COLUMN IF NOT EXISTS api_football_id BIGINT;

COMMENT ON COLUMN public.club_source_ids.api_football_id IS
  'ID do time na API-Football, fixado a partir das partidas das competições do bolão. Quando presente, vira condição de elegibilidade — protege contra homônimos entre países.';

-- Fixa IDs novos a cada sincronização: cada rodada das copas revela mais um
-- punhado dos 40, e o pino só protege quem já está fixado.
CREATE OR REPLACE FUNCTION public.pin_provider_ids()
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  -- Libertadores (11), Sul-Americana (13) e Copa do Brasil (73). São as
  -- competições onde os 40 clubes do bolão jogam, e onde o nome não é ambíguo.
  WITH vistos AS (
    SELECT home_team_key AS k, home_provider_id AS pid
      FROM public.club_fixtures
     WHERE league_id IN (11, 13, 73) AND home_team_key IS NOT NULL AND home_provider_id IS NOT NULL
    UNION ALL
    SELECT away_team_key, away_provider_id
      FROM public.club_fixtures
     WHERE league_id IN (11, 13, 73) AND away_team_key IS NOT NULL AND away_provider_id IS NOT NULL
  ),
  unicos AS (
    SELECT k, min(pid) AS pid FROM vistos GROUP BY k HAVING count(DISTINCT pid) = 1
  )
  UPDATE public.club_source_ids c
     SET api_football_id = u.pid
    FROM unicos u
   WHERE u.k = c.team_key AND c.api_football_id IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.recompute_fixture_eligibility()
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  -- A regra de elegibilidade fica NUM lugar só. Espalhá-la entre o insert e o
  -- motor é como ela começa a divergir de si mesma.
  UPDATE public.club_fixtures f SET
    model_eligible = m.ok, model_exclusion_reason = m.motivo
  FROM (
    SELECT c.id,
           (c.home_team_key IS NOT NULL AND c.away_team_key IS NOT NULL
            AND rh.opta_contestant_id IS NOT NULL AND ra.opta_contestant_id IS NOT NULL
            AND c.status IN ('FT','AET','PEN')
            AND c.goals_home_90 IS NOT NULL AND c.goals_away_90 IS NOT NULL
            AND COALESCE(w.model_weight, 0) > 0
            AND c.kickoff_at > (SELECT s.snapshot_at::TIMESTAMPTZ FROM public.opta_snapshots s WHERE s.is_active)
            -- Pino de identidade: se conhecemos o ID do clube na API, o time
            -- em campo tem de ser ele. Protege contra homônimo entre países.
            AND (sh.api_football_id IS NULL OR sh.api_football_id = c.home_provider_id)
            AND (sa.api_football_id IS NULL OR sa.api_football_id = c.away_provider_id)
           ) AS ok,
           CASE
             WHEN c.home_team_key IS NULL OR c.away_team_key IS NULL THEN 'OPPONENT_NOT_MAPPED'
             WHEN rh.opta_contestant_id IS NULL OR ra.opta_contestant_id IS NULL THEN 'NO_OPTA_RATING'
             WHEN (sh.api_football_id IS NOT NULL AND sh.api_football_id <> c.home_provider_id)
               OR (sa.api_football_id IS NOT NULL AND sa.api_football_id <> c.away_provider_id)
               THEN 'PROVIDER_ID_MISMATCH'
             WHEN c.status NOT IN ('FT','AET','PEN') THEN 'NOT_FINISHED'
             WHEN c.goals_home_90 IS NULL OR c.goals_away_90 IS NULL THEN 'NO_90MIN_SCORE'
             WHEN w.league_id IS NULL THEN 'COMPETITION_NOT_WEIGHTED'
             WHEN w.model_weight = 0 THEN 'ZERO_WEIGHT_COMPETITION'
             WHEN c.kickoff_at <= (SELECT s.snapshot_at::TIMESTAMPTZ FROM public.opta_snapshots s WHERE s.is_active)
               THEN 'BEFORE_SNAPSHOT'
             ELSE NULL
           END AS motivo
    FROM public.club_fixtures c
    LEFT JOIN public.club_source_ids sh ON sh.team_key = c.home_team_key
    LEFT JOIN public.club_source_ids sa ON sa.team_key = c.away_team_key
    LEFT JOIN public.opta_club_ratings rh ON rh.opta_contestant_id = sh.opta_contestant_id
      AND rh.snapshot_id = (SELECT s.id FROM public.opta_snapshots s WHERE s.is_active)
    LEFT JOIN public.opta_club_ratings ra ON ra.opta_contestant_id = sa.opta_contestant_id
      AND ra.snapshot_id = (SELECT s.id FROM public.opta_snapshots s WHERE s.is_active)
    LEFT JOIN public.club_competition_weights w ON w.league_id = c.league_id AND w.active
  ) m
  WHERE m.id = f.id;
$$;

-- O pino só protege quem já está fixado; fixar ao fim de cada sincronização
-- mantém a proteção crescendo sozinha.
CREATE OR REPLACE FUNCTION public.sync_club_fixtures_recent(p_incluir_amanha boolean DEFAULT false)
RETURNS TABLE(dia date, vistos integer, guardados integer, erro text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE d DATE; r RECORD; hoje DATE; dias DATE[];
BEGIN
  hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  -- Ontem sempre entra: placar e status só ficam definitivos algum tempo
  -- depois do apito, e a janela do plano gratuito não permite voltar depois.
  dias := ARRAY[hoje - 1, hoje];
  IF p_incluir_amanha THEN dias := dias || (hoje + 1); END IF;

  FOREACH d IN ARRAY dias
  LOOP
    BEGIN
      SELECT * INTO r FROM public.sync_club_fixtures(d);
      dia := d; vistos := r.vistos; guardados := r.guardados; erro := NULL;
    EXCEPTION WHEN OTHERS THEN
      dia := d; vistos := NULL; guardados := NULL; erro := SQLERRM;
    END;
    RETURN NEXT;
  END LOOP;

  PERFORM public.pin_provider_ids();
  PERFORM public.recompute_fixture_eligibility();
END;
$function$;

SELECT public.pin_provider_ids();
SELECT public.recompute_fixture_eligibility();
