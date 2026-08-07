-- ============================================================================
-- O extrato: o que eu palpitei, quando gravei, e tudo que mudei desde então.
-- ============================================================================
-- Uma linha por palpite, com a linha do tempo dele ao lado. É o que responde à
-- queixa de frente — ou mostra que a pessoa alterou e esqueceu, ou mostra que
-- nunca houve alteração nenhuma, com a hora da única gravação.
--
-- O CÓDIGO é por COMPETIÇÃO + FASE, e não pelo torneio inteiro. A razão é que
-- ele precisa ser estável: o conjunto de palpites de uma fase para de mudar
-- quando a fase fecha, então o código daquela fase fica congelado para sempre.
-- Um código do torneio inteiro mudaria toda vez que uma fase nova fosse
-- palpitada, e acusaria alteração onde não houve.
--
-- ATENÇÃO: esta versão é CORRIGIDA pela migração seguinte (20260807000007).
-- Ela caía em `predictions.updated_at` quando a partida era anterior à trilha,
-- e aquele campo também é mexido pelo recálculo de pontos — o que fazia o
-- extrato acusar alteração que o jogador não fez. Leia as duas juntas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.meu_extrato(p_tournament_id INTEGER)
RETURNS TABLE (
  match_id          INTEGER,
  competition       TEXT,
  phase             TEXT,
  team_home         TEXT,
  team_away         TEXT,
  match_date        TIMESTAMPTZ,
  is_knockout       BOOLEAN,
  pred_home         INTEGER,
  pred_away         INTEGER,
  pred_extra_result TEXT,
  pred_pen_home     INTEGER,
  pred_pen_away     INTEGER,
  pred_pen_winner   TEXT,
  salvo_em          TIMESTAMPTZ,
  alterado_em       TIMESTAMPTZ,
  alteracoes        JSONB,
  na_trilha         BOOLEAN,
  codigo_da_fase    TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH meus AS (
    SELECT pr.*, m.competition, m.phase, m.team_home, m.team_away,
           m.match_date, m.is_knockout
      FROM public.predictions pr
      JOIN public.matches m ON m.id = pr.match_id
     WHERE pr.user_id = (SELECT auth.uid())
       AND m.tournament_id = p_tournament_id
  ),
  eventos AS (
    SELECT (a.registro->>'match_id')::int AS mid,
           a.occurred_at, a.operacao, a.antes, a.depois
      FROM public.audit_log a
     WHERE a.entidade = 'predictions'
       AND a.actor_id = (SELECT auth.uid())
       AND (a.registro->>'user_id')::uuid = (SELECT auth.uid())
  ),
  resumo AS (
    SELECT e.mid,
           min(e.occurred_at) FILTER (WHERE e.operacao = 'INSERT') AS primeiro,
           max(e.occurred_at) FILTER (WHERE e.operacao = 'UPDATE') AS ultimo,
           jsonb_agg(jsonb_build_object(
             'quando', e.occurred_at, 'operacao', e.operacao,
             'antes', e.antes, 'depois', e.depois)
             ORDER BY e.occurred_at) AS linha_do_tempo
      FROM eventos e GROUP BY e.mid
  ),
  com_codigo AS (
    SELECT m.competition, m.phase,
           upper(left(encode(sha256(convert_to(string_agg(
             concat_ws(':', m.match_id, m.pred_home, m.pred_away,
                       COALESCE(m.pred_extra_result,'-'),
                       COALESCE(m.pred_pen_home::text,'-'),
                       COALESCE(m.pred_pen_away::text,'-'),
                       COALESCE(m.pred_pen_winner,'-')),
             '|' ORDER BY m.match_id), 'UTF8')), 'hex'), 8)) AS codigo
      FROM meus m GROUP BY m.competition, m.phase
  )
  SELECT m.match_id, m.competition, m.phase, m.team_home, m.team_away,
         m.match_date, m.is_knockout,
         m.pred_home, m.pred_away, m.pred_extra_result,
         m.pred_pen_home, m.pred_pen_away, m.pred_pen_winner,
         COALESCE(r.primeiro, m.created_at) AS salvo_em,
         COALESCE(r.ultimo,
                  CASE WHEN m.updated_at > m.created_at THEN m.updated_at END) AS alterado_em,
         COALESCE(r.linha_do_tempo, '[]'::jsonb) AS alteracoes,
         (r.mid IS NOT NULL)                  AS na_trilha,
         c.codigo
    FROM meus m
    LEFT JOIN resumo r ON r.mid = m.match_id
    LEFT JOIN com_codigo c ON c.competition IS NOT DISTINCT FROM m.competition
                          AND c.phase       IS NOT DISTINCT FROM m.phase
   ORDER BY m.match_date NULLS LAST, m.match_id;
$$;

REVOKE ALL ON FUNCTION public.meu_extrato(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meu_extrato(INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.meu_extrato_podio(p_tournament_id INTEGER)
RETURNS TABLE (
  competition      TEXT,
  champion_team    TEXT,
  runner_up_team   TEXT,
  third_place_team TEXT,
  salvo_em         TIMESTAMPTZ,
  alterado_em      TIMESTAMPTZ,
  alteracoes       JSONB,
  na_trilha        BOOLEAN,
  codigo           TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH meus AS (
    SELECT pp.* FROM public.podium_predictions pp
     WHERE pp.user_id = (SELECT auth.uid()) AND pp.tournament_id = p_tournament_id
  ),
  eventos AS (
    SELECT a.registro->>'competition' AS comp, a.occurred_at, a.operacao, a.antes, a.depois
      FROM public.audit_log a
     WHERE a.entidade = 'podium_predictions'
       AND a.actor_id = (SELECT auth.uid())
       AND (a.registro->>'user_id')::uuid = (SELECT auth.uid())
       AND (a.registro->>'tournament_id')::int = p_tournament_id
  ),
  resumo AS (
    SELECT e.comp,
           min(e.occurred_at) FILTER (WHERE e.operacao='INSERT') AS primeiro,
           max(e.occurred_at) FILTER (WHERE e.operacao='UPDATE') AS ultimo,
           jsonb_agg(jsonb_build_object('quando', e.occurred_at, 'operacao', e.operacao,
                                        'antes', e.antes, 'depois', e.depois)
                     ORDER BY e.occurred_at) AS linha_do_tempo
      FROM eventos e GROUP BY e.comp
  )
  SELECT m.competition, m.champion_team, m.runner_up_team, m.third_place_team,
         COALESCE(r.primeiro, m.created_at) AS salvo_em,
         r.ultimo                            AS alterado_em,
         COALESCE(r.linha_do_tempo, '[]'::jsonb) AS alteracoes,
         (r.comp IS NOT NULL)                AS na_trilha,
         upper(left(encode(sha256(convert_to(
           concat_ws('|', m.competition, COALESCE(m.champion_team,'-'),
                     COALESCE(m.runner_up_team,'-'), COALESCE(m.third_place_team,'-')),
           'UTF8')), 'hex'), 8)) AS codigo
    FROM meus m
    LEFT JOIN resumo r ON r.comp = m.competition
   ORDER BY m.competition;
$$;

REVOKE ALL ON FUNCTION public.meu_extrato_podio(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meu_extrato_podio(INTEGER) TO authenticated;
