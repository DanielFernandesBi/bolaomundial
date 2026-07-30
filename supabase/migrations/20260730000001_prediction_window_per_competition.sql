-- ============================================================================
-- Trava do palpite por COMPETIÇÃO (1º jogo das oitavas), não mais por partida
-- ============================================================================
-- REGRA NOVA: num bolão de competições (matches.competition preenchido), o prazo
-- de TODOS os palpites daquela competição — ida e volta, todas as fases — é o
-- horário do PRIMEIRO jogo com data daquela competição. Cada competição tem seu
-- próprio prazo, então Copa do Brasil, Libertadores e Sul-Americana fecham em
-- datas diferentes.
--
-- COMPATIBILIDADE: partidas SEM competição (Mundial, torneios de grupos) mantêm
-- a regra antiga, por partida. Trocar isso travaria uma Copa do Mundo inteira no
-- primeiro jogo, que não é o que se pediu e mudaria torneios já em andamento.
--
-- Esta regra é a MESMA que o pódio já usa (check_podium_window, migração
-- 20260728000009). Depois desta migração, palpite de placar e palpite de pódio
-- fecham no mesmo instante — antes o pódio fechava antes.
--
-- ----------------------------------------------------------------------------
-- CORREÇÃO DE SEGURANÇA EMBUTIDA (furo pré-existente, confirmado em produção)
-- ----------------------------------------------------------------------------
-- A versão anterior liberava o UPDATE sem checar prazo quando "nenhum campo do
-- palpite mudou" — mas a lista de campos comparados NÃO incluía pred_pen_winner.
-- Como `authenticated` tem UPDATE nessa coluna e no bolão de clubes ela É o
-- palpite de pênaltis (penalty_prediction_mode = 'winner'), dava para trocar o
-- vencedor dos pênaltis DEPOIS do jogo começar — inclusive depois de conhecer o
-- resultado — direto pela Data API. Verificado em produção com rollback:
--   A) alterar pred_home após o início  -> BLOQUEADO
--   B) alterar só pred_pen_winner       -> PASSOU   ← o furo
-- pred_pen_winner entra na comparação abaixo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_prediction_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    match_comp       TEXT;
    match_tournament INT;
    match_start_time TIMESTAMPTZ;
    deadline         TIMESTAMPTZ;
BEGIN
    -- Em UPDATE, se nenhum campo do PALPITE mudou (só pontos/sistema), libera.
    -- É o que permite ao gatilho de pontuação gravar points_* depois do jogo.
    IF TG_OP = 'UPDATE' THEN
        IF NEW.match_id          IS NOT DISTINCT FROM OLD.match_id
           AND NEW.pred_home         IS NOT DISTINCT FROM OLD.pred_home
           AND NEW.pred_away         IS NOT DISTINCT FROM OLD.pred_away
           AND NEW.pred_extra_result IS NOT DISTINCT FROM OLD.pred_extra_result
           AND NEW.pred_pen_home     IS NOT DISTINCT FROM OLD.pred_pen_home
           AND NEW.pred_pen_away     IS NOT DISTINCT FROM OLD.pred_pen_away
           AND NEW.pred_pen_winner   IS NOT DISTINCT FROM OLD.pred_pen_winner
        THEN
            RETURN NEW;
        END IF;
    END IF;

    SELECT m.competition, m.tournament_id, m.match_date
      INTO match_comp, match_tournament, match_start_time
      FROM public.matches m
     WHERE m.id = NEW.match_id;

    IF match_comp IS NOT NULL THEN
        -- Prazo da COMPETIÇÃO: primeiro jogo com data.
        SELECT MIN(m.match_date) INTO deadline
          FROM public.matches m
         WHERE m.tournament_id = match_tournament
           AND m.competition = match_comp
           AND m.match_date IS NOT NULL;
    ELSE
        -- Sem competição: regra antiga, o horário da própria partida.
        deadline := match_start_time;
    END IF;

    -- Sem data conhecida (competição ainda sem calendário): permite.
    IF deadline IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOW() > deadline THEN
        IF match_comp IS NOT NULL THEN
            RAISE EXCEPTION 'Os palpites desta competição já encerraram (o prazo era o primeiro jogo).';
        ELSE
            RAISE EXCEPTION 'A partida já começou. Palpites encerrados.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.check_prediction_window IS
  'Trava do palpite: com competição, prazo = 1º jogo da competição; sem competição, prazo = início da própria partida. Inclui pred_pen_winner na comparação de "nada mudou".';

-- ---------------------------------------------------------------------------
-- Verificação (esperado: as duas FALHAM depois do 1º jogo da competição):
--   UPDATE public.predictions SET pred_home = 9        WHERE id = <id>;
--   UPDATE public.predictions SET pred_pen_winner='home' WHERE id = <id>;
-- E esta continua PASSANDO (é o gatilho de pontuação, não mexe no palpite):
--   UPDATE public.predictions SET points_earned = points_earned WHERE id = <id>;
-- ---------------------------------------------------------------------------
