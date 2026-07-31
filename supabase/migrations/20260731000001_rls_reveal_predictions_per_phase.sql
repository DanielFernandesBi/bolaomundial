-- ============================================================================
-- Transparência por FASE: revelar os palpites quando a fase começa
-- ============================================================================
-- ANTES (migração 20260728000008): o palpite de outro jogador só ficava visível
-- quando AQUELA partida começava.
--
-- Isso deixou de fazer sentido com a trava por fase (20260730000001): os
-- palpites já estão congelados desde o primeiro jogo da fase, então esconder os
-- demais não protege mais nada — só adia a conferência. E a transparência existe
-- justamente para provar que ninguém alterou nada depois que a bola rolou.
--
-- AGORA: assim que o primeiro jogo de uma fase começa, todos os palpites daquela
-- fase (mesma competição, mesma `ties.round`) ficam visíveis — inclusive os de
-- jogos que ainda nem têm data.
--
-- Reaproveita `public.phase_already_started`, criada em 20260730000001, para que
-- exista UMA definição de "a fase começou" — a mesma que decide a trava.
--
-- O QUE NÃO MUDA:
--   • o usuário sempre vê o próprio palpite;
--   • admin vê tudo;
--   • anônimo (não logado) não vê nada;
--   • partida sem competição/fase (Mundial, grupos) segue revelando no início
--     dela mesma — `phase_already_started` já trata esse caso;
--   • o pódio segue com a regra dele (1º jogo da competição), intocado.
--
-- ORDEM DAS CONDIÇÕES: as baratas primeiro (FINISHED, match_date <= now). O `OR`
-- do Postgres faz curto-circuito, então a função só é chamada nas partidas que
-- ainda não começaram — que são justamente as poucas que precisam da checagem de
-- fase.
-- ============================================================================

DROP POLICY IF EXISTS "Predictions visible after kickoff or own" ON public.predictions;
DROP POLICY IF EXISTS "Predictions visible after phase start or own" ON public.predictions;

CREATE POLICY "Predictions visible after phase start or own"
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
                          OR public.phase_already_started(m.id)
                      )
                )
            )
        )
    );

-- ---------------------------------------------------------------------------
-- Verificação:
--   -- logado como A, palpite de B num jogo de fase que AINDA NÃO começou → 0 linhas
--   -- depois que o 1º jogo da fase começa, a mesma consulta devolve os palpites
--   --   de TODOS os jogos daquela fase, inclusive os que ainda não começaram.
-- ---------------------------------------------------------------------------
