-- ============================================================================
-- 🔴 P0 CONFIDENCIALIDADE: esconder palpites até o início (no BANCO, via RLS)
-- ============================================================================
-- PROBLEMA (auditoria item 4): predictions e podium_predictions tinham
-- `SELECT USING (true)`. A interface só mostra os palpites de terceiros depois do
-- início do jogo, mas qualquer um podia ler TODOS os palpites direto pela Data API
-- (anon key). O segredo do palpite antes do jogo não existia de fato.
--
-- CORREÇÃO: RLS de SELECT passa a revelar o palpite de OUTRO usuário apenas quando
-- a partida (ou, no pódio, a competição) já começou. O próprio usuário sempre vê o
-- seu; admin vê tudo; anon (não logado) não vê nada.
--
-- Compatível com o app:
--   • getMatchesWithPredictions lê só o próprio palpite (.eq user_id) → ok.
--   • Transparência (getMatchesInProgressWithAllPredictions) só consulta partidas
--     já iniciadas → a regra libera.
--   • Detalhe de encerradas (getMatchResultDetail) → partidas FINISHED → libera.
--   • Desempenho usa jogos FINISHED → libera.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- predictions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Predictions are viewable by everyone" ON public.predictions;

CREATE POLICY "Predictions visible after kickoff or own"
    ON public.predictions
    FOR SELECT
    USING (
        auth.uid() = user_id
        OR (
            auth.uid() IS NOT NULL
            AND (
                EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.is_admin = true)
                OR EXISTS (
                    SELECT 1 FROM public.matches m
                    WHERE m.id = predictions.match_id
                      AND (
                          m.status = 'FINISHED'
                          OR (m.match_date IS NOT NULL AND m.match_date <= now())
                      )
                )
            )
        )
    );

-- ---------------------------------------------------------------------------
-- podium_predictions (revela após o 1º jogo da competição; NULL = Mundial: 1º jogo do torneio)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Podium predictions are viewable by everyone" ON public.podium_predictions;

CREATE POLICY "Podium predictions visible after competition start or own"
    ON public.podium_predictions
    FOR SELECT
    USING (
        auth.uid() = user_id
        OR (
            auth.uid() IS NOT NULL
            AND (
                EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.is_admin = true)
                OR EXISTS (
                    SELECT 1 FROM public.matches m
                    WHERE m.tournament_id = podium_predictions.tournament_id
                      AND (podium_predictions.competition IS NULL OR m.competition = podium_predictions.competition)
                      AND m.match_date IS NOT NULL
                      AND m.match_date <= now()
                )
            )
        )
    );

-- ---------------------------------------------------------------------------
-- Verificação:
--   -- logado como usuário A, tentando ver o palpite de B num jogo FUTURO → 0 linhas:
--   SELECT * FROM public.predictions WHERE user_id = '<id_de_B>';
--   -- após o horário do jogo, a mesma consulta retorna as linhas daquele jogo.
-- ---------------------------------------------------------------------------
