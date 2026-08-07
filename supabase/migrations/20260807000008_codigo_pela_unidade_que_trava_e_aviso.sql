-- ============================================================================
-- O código tem de ser da unidade que TRAVA — e precisa chegar antes do
-- relógio fechar.
-- ============================================================================
-- Duas correções que vêm da mesma observação: "apostou 1x0 e deixou assim;
-- quando fechou o relógio, mudou para 1x1, e o jogador não tem como se
-- proteger disso".
--
-- Está certo, e é o furo que faltava. O print da transparência prova o que
-- estava NO FECHAMENTO — não prova o que o jogador deixou gravado antes. A
-- janela cega é justamente entre apostar e fechar. Um comprovante que só pode
-- ser tirado DEPOIS não cobre essa janela; ele tem de estar na mão do jogador
-- ANTES.
--
-- 1. AGRUPAMENTO. O código estava por `matches.phase`, que separa ida e volta.
--    Mas quem trava é `ties.round`: as oitavas inteiras (ida E volta) fecham
--    juntas, no primeiro jogo da fase — conferido, 16 palpites por round e não
--    8 por phase. Um código por `phase` mostraria dois códigos para uma trava
--    só e não seria a fronteira em que o conjunto congela. Agora é por
--    competição + round, a mesma unidade de `prediction_deadline`.
--
-- 2. PRAZO. O extrato passa a dizer quando cada fase fecha e se já fechou, para
--    a tela avisar enquanto ainda dá tempo. Sem isso o aviso chegaria quando
--    não adianta mais.
-- ============================================================================

-- O tipo de retorno muda (ganha round, fecha_em, ja_fechou).
DROP FUNCTION IF EXISTS public.meu_extrato(INTEGER);

CREATE OR REPLACE FUNCTION public.meu_extrato(p_tournament_id INTEGER)
RETURNS TABLE (
  match_id          INTEGER,
  competition       TEXT,
  phase             TEXT,
  round             TEXT,
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
  fecha_em          TIMESTAMPTZ,
  ja_fechou         BOOLEAN,
  codigo_da_fase    TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH trilha_desde AS (
    SELECT min(a.occurred_at) AS quando FROM public.audit_log a
  ),
  meus AS (
    SELECT pr.*, m.competition, m.phase, t.round, m.team_home, m.team_away,
           m.match_date, m.is_knockout,
           public.prediction_deadline(m.id)   AS fecha_em,
           public.phase_already_started(m.id) AS ja_fechou
      FROM public.predictions pr
      JOIN public.matches m ON m.id = pr.match_id
      LEFT JOIN public.ties t ON t.id = m.tie_id
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
    -- Por competição + ROUND: é a fronteira em que o conjunto para de mudar.
    SELECT m.competition, m.round,
           upper(left(encode(sha256(convert_to(string_agg(
             concat_ws(':', m.match_id, m.pred_home, m.pred_away,
                       COALESCE(m.pred_extra_result,'-'),
                       COALESCE(m.pred_pen_home::text,'-'),
                       COALESCE(m.pred_pen_away::text,'-'),
                       COALESCE(m.pred_pen_winner,'-')),
             '|' ORDER BY m.match_id), 'UTF8')), 'hex'), 8)) AS codigo
      FROM meus m GROUP BY m.competition, m.round
  )
  SELECT m.match_id, m.competition, m.phase, m.round, m.team_home, m.team_away,
         m.match_date, m.is_knockout,
         m.pred_home, m.pred_away, m.pred_extra_result,
         m.pred_pen_home, m.pred_pen_away, m.pred_pen_winner,
         COALESCE(r.primeiro, m.created_at) AS salvo_em,
         -- Só a trilha: updated_at também é mexido pelo recálculo de pontos.
         r.ultimo                            AS alterado_em,
         COALESCE(r.linha_do_tempo, '[]'::jsonb) AS alteracoes,
         (COALESCE(r.primeiro, m.created_at) >= (SELECT quando FROM trilha_desde))
                                             AS cobertura_completa,
         m.fecha_em, m.ja_fechou,
         c.codigo
    FROM meus m
    LEFT JOIN resumo r ON r.mid = m.match_id
    LEFT JOIN com_codigo c ON c.competition IS NOT DISTINCT FROM m.competition
                          AND c.round       IS NOT DISTINCT FROM m.round
   ORDER BY m.match_date NULLS LAST, m.match_id;
$$;

COMMENT ON FUNCTION public.meu_extrato(INTEGER) IS
  'Extrato dos palpites de quem chama, com prazo da fase e código por competição+round — a mesma unidade que trava.';

REVOKE ALL ON FUNCTION public.meu_extrato(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meu_extrato(INTEGER) TO authenticated;

-- ── O que ainda dá tempo de guardar ────────────────────────────────────────
-- Uma linha por fase AINDA ABERTA em que o jogador tem palpite. É o que o
-- aviso precisa saber para aparecer só quando serve para alguma coisa.
CREATE OR REPLACE FUNCTION public.meus_comprovantes_a_guardar(p_tournament_id INTEGER)
RETURNS TABLE (
  competition TEXT,
  round       TEXT,
  palpites    BIGINT,
  fecha_em    TIMESTAMPTZ,
  codigo      TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT e.competition, e.round, count(*) AS palpites,
         min(e.fecha_em) AS fecha_em, min(e.codigo_da_fase) AS codigo
    FROM public.meu_extrato(p_tournament_id) e
   WHERE NOT e.ja_fechou
   GROUP BY e.competition, e.round
   ORDER BY min(e.fecha_em) NULLS LAST;
$$;

COMMENT ON FUNCTION public.meus_comprovantes_a_guardar(INTEGER) IS
  'Fases ainda abertas em que quem chama tem palpite, com o prazo e o código. Alimenta o aviso que pede para guardar o comprovante ANTES do fechamento — depois dele, a transparência só mostra o que estava no fechamento.';

REVOKE ALL ON FUNCTION public.meus_comprovantes_a_guardar(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meus_comprovantes_a_guardar(INTEGER) TO authenticated;
