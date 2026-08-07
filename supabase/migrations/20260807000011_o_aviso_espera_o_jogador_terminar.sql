-- ============================================================================
-- O aviso aparecia a cada palpite. Quem tem 32 para dar via 32 avisos.
-- ============================================================================
-- A regra que eu tinha escrito era: o aviso volta sempre que o código muda,
-- porque o comprovante guardado ficou desatualizado. O raciocínio está certo
-- para quem JÁ TERMINOU de apostar — e é péssimo para quem está apostando.
-- Cada gravação muda o código, `savePrediction` revalida a página, e o aviso
-- reaparece. Trinta e duas vezes.
--
-- O que faltava era distinguir dois momentos que eu tratei como um só:
--
--   ENCHENDO   — o jogador está no meio da tarefa. Avisar aqui é interromper
--                alguém que ainda nem terminou o que veio fazer. E não há
--                comprovante a guardar: o conjunto ainda vai mudar.
--   TERMINOU   — não falta palpite na fase. Agora sim: é o momento exato em
--                que guardar faz sentido, e qualquer alteração posterior torna
--                o guardado obsoleto.
--
-- Então a fase só entra na lista quando não falta palpite nela.
--
-- COM UMA EXCEÇÃO, que existe para não deixar ninguém desprotegido: se faltam
-- menos de 24h para a fase fechar, ela entra mesmo com buraco. Quem deixou
-- jogos sem palpite nunca chegaria a zero pendente e, sem isso, nunca seria
-- avisado — justamente quem mais precisa, porque o prazo está acabando. Nesse
-- caso a tela mostra quantos faltam, que é a notícia mais urgente da caixa.
-- ============================================================================

-- O tipo de retorno ganha `faltando`.
DROP FUNCTION IF EXISTS public.meus_comprovantes_a_guardar(INTEGER);

CREATE OR REPLACE FUNCTION public.meus_comprovantes_a_guardar(p_tournament_id INTEGER)
RETURNS TABLE (
  competition TEXT,
  round       TEXT,
  palpites    BIGINT,
  -- Jogos da fase que este jogador ainda não palpitou.
  faltando    BIGINT,
  fecha_em    TIMESTAMPTZ,
  codigo      TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH meus AS (
    SELECT e.competition, e.round, count(*) AS palpites,
           min(e.fecha_em) AS fecha_em, min(e.codigo_da_fase) AS codigo
      FROM public.meu_extrato(p_tournament_id) e
     WHERE NOT e.ja_fechou
     GROUP BY e.competition, e.round
  ),
  total_da_fase AS (
    SELECT m.competition, t.round, count(*) AS jogos
      FROM public.matches m
      LEFT JOIN public.ties t ON t.id = m.tie_id
     WHERE m.tournament_id = p_tournament_id
     GROUP BY m.competition, t.round
  )
  SELECT x.competition, x.round, x.palpites,
         GREATEST(COALESCE(tf.jogos, 0) - x.palpites, 0) AS faltando,
         x.fecha_em, x.codigo
    FROM meus x
    LEFT JOIN total_da_fase tf
           ON tf.competition IS NOT DISTINCT FROM x.competition
          AND tf.round       IS NOT DISTINCT FROM x.round
   WHERE COALESCE(tf.jogos, 0) - x.palpites <= 0
      OR x.fecha_em <= now() + interval '24 hours'
   ORDER BY x.fecha_em NULLS LAST;
$$;

COMMENT ON FUNCTION public.meus_comprovantes_a_guardar(INTEGER) IS
  'Fases abertas em que o jogador JÁ TERMINOU de palpitar (ou que fecham em menos de 24h). Alimenta o aviso de guardar o comprovante — que não pode aparecer no meio do preenchimento, sob pena de surgir uma vez por jogo.';

REVOKE ALL ON FUNCTION public.meus_comprovantes_a_guardar(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meus_comprovantes_a_guardar(INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- Verificação (07/08, com 32 jogos em aberto):
--   jogador com 16+16 palpites  -> 2 fases, faltando 0   (aviso aparece)
--   jogador com 0 palpites      -> 0 fases               (nada a guardar)
--   jogador enchendo (1..31)    -> 0 fases, pois falta e o prazo é 11/08
-- ---------------------------------------------------------------------------
