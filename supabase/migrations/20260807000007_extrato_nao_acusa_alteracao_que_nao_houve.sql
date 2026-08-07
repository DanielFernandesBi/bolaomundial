-- ============================================================================
-- O extrato não pode acusar alteração que não houve.
-- ============================================================================
-- Na primeira versão, `alterado_em` caía em `predictions.updated_at` quando a
-- partida era anterior à trilha. Testado com um jogador real antes de ir para
-- a tela: dois palpites apareceram como "alterados às 20:01 e 22:01 de 01/08"
-- — e ele não tocou em nenhum dos dois. Aquele horário é o do RECÁLCULO DE
-- PONTOS, que roda sobre todo palpite da partida quando o resultado é lançado.
--
-- Num recurso feito exatamente para desfazer uma acusação injusta, acusar
-- alteração inexistente seria pior que não ter recurso nenhum. `updated_at`
-- não distingue jogador de sistema; a trilha distingue. Então:
--
--   alterado_em  vem SÓ da trilha. Sem evento, é nulo — e nulo quer dizer
--                "não há registro de alteração", não "não houve".
--   salvo_em     continua caindo em created_at, que é confiável: a linha só
--                nasce uma vez, e quem a cria é o jogador.
--   cobertura_completa  substitui `na_trilha` e responde outra pergunta: a
--                trilha já existia quando este palpite foi gravado? Onde ela é
--                falsa, a tela diz que não sabe. Meia prova apresentada como
--                prova inteira é pior que nenhuma.
-- ============================================================================

-- O tipo de retorno muda (na_trilha -> cobertura_completa), e o Postgres não
-- permite trocar OUT parameters com CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.meu_extrato(INTEGER);
DROP FUNCTION IF EXISTS public.meu_extrato_podio(INTEGER);

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
  cobertura_completa BOOLEAN,
  codigo_da_fase    TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH trilha_desde AS (
    SELECT min(a.occurred_at) AS quando FROM public.audit_log a
  ),
  meus AS (
    SELECT pr.*, m.competition, m.phase, m.team_home, m.team_away,
           m.match_date, m.is_knockout
      FROM public.predictions pr
      JOIN public.matches m ON m.id = pr.match_id
     WHERE pr.user_id = (SELECT auth.uid())
       AND m.tournament_id = p_tournament_id
  ),
  eventos AS (
    -- A trilha do próprio jogador. `actor_id` é quem executou: filtrar por ele
    -- é o que garante que ninguém veja a trilha de outro.
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
         -- Só a trilha. Ver o cabeçalho: updated_at também é mexido pelo
         -- recálculo de pontos, que não é ação do jogador.
         r.ultimo                            AS alterado_em,
         COALESCE(r.linha_do_tempo, '[]'::jsonb) AS alteracoes,
         (COALESCE(r.primeiro, m.created_at) >= (SELECT quando FROM trilha_desde))
                                             AS cobertura_completa,
         c.codigo
    FROM meus m
    LEFT JOIN resumo r ON r.mid = m.match_id
    LEFT JOIN com_codigo c ON c.competition IS NOT DISTINCT FROM m.competition
                          AND c.phase       IS NOT DISTINCT FROM m.phase
   ORDER BY m.match_date NULLS LAST, m.match_id;
$$;

COMMENT ON FUNCTION public.meu_extrato(INTEGER) IS
  'Extrato dos palpites de quem chama: valor atual, quando foi gravado, e toda alteração com antes/depois. alterado_em vem SÓ da trilha — updated_at é mexido pelo recálculo de pontos e acusaria alteração que não houve.';

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
  cobertura_completa BOOLEAN,
  codigo           TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH trilha_desde AS (SELECT min(a.occurred_at) AS quando FROM public.audit_log a),
  meus AS (
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
         (COALESCE(r.primeiro, m.created_at) >= (SELECT quando FROM trilha_desde)) AS cobertura_completa,
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

-- Quando a trilha começou. A tela precisa disso para dizer, sem rodeio, a
-- partir de quando ela consegue provar.
CREATE OR REPLACE FUNCTION public.trilha_comecou_em()
RETURNS TIMESTAMPTZ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT min(occurred_at) FROM public.audit_log $$;

GRANT EXECUTE ON FUNCTION public.trilha_comecou_em() TO authenticated;
