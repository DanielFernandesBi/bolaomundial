-- ============================================================================
-- Trava do palpite por COMPETIÇÃO + FASE (1º jogo daquela fase)
-- ============================================================================
-- REGRA NOVA: num bolão de competições, todos os palpites de uma FASE de uma
-- competição — ida e volta juntos — fecham no horário do PRIMEIRO jogo daquela
-- fase. Cada competição tem o seu prazo, e cada fase abre um prazo novo:
-- as oitavas fecham no 1º jogo das oitavas; quando as quartas forem definidas,
-- elas ganham um prazo próprio, no 1º jogo das quartas.
--
-- POR QUE FASE E NÃO SÓ COMPETIÇÃO: se o prazo fosse a competição inteira, os
-- jogos das quartas em diante — criados só depois, pela fase anterior — já
-- nasceriam com o prazo vencido, e NINGUÉM poderia palpitar deles.
--
-- POR QUE `ties.round` E NÃO `matches.phase`: `phase` é rótulo de texto e separa
-- ida de volta ("Oitavas de final – ida" / "– volta"). Agrupar por ele daria dois
-- prazos diferentes para o mesmo confronto. A fase de verdade é `ties.round`.
-- `matches` não tem coluna `round`; chega-se nela por `matches.tie_id`.
--
-- COMPATIBILIDADE: partida sem competição (Mundial, torneios de grupos) ou sem
-- confronto associado mantém a regra antiga, por partida.
--
-- ----------------------------------------------------------------------------
-- CORREÇÃO DE SEGURANÇA EMBUTIDA (furo pré-existente, confirmado em produção)
-- ----------------------------------------------------------------------------
-- A versão anterior liberava o UPDATE sem checar prazo quando "nenhum campo do
-- palpite mudou" — mas a lista comparada NÃO incluía pred_pen_winner. Como
-- `authenticated` tem UPDATE nessa coluna e no bolão de clubes ela É o palpite de
-- pênaltis (penalty_prediction_mode = 'winner'), dava para trocar o vencedor dos
-- pênaltis DEPOIS do jogo começar, já sabendo o resultado, pela Data API.
-- Verificado em produção com rollback:
--   A) alterar pred_home após o início  -> BLOQUEADO
--   B) alterar só pred_pen_winner       -> PASSOU   ← o furo
-- pred_pen_winner entra na comparação abaixo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Fonte ÚNICA da regra de prazo. O gatilho usa esta função, e o app a consulta
-- por RPC no momento de salvar — para não existirem duas definições do prazo
-- que possam divergir com o tempo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prediction_deadline(p_match_id INT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_comp       TEXT;
    v_tournament INT;
    v_own_date   TIMESTAMPTZ;
    v_round      TEXT;
    v_deadline   TIMESTAMPTZ;
BEGIN
    SELECT m.competition, m.tournament_id, m.match_date, t.round
      INTO v_comp, v_tournament, v_own_date, v_round
      FROM public.matches m
      LEFT JOIN public.ties t ON t.id = m.tie_id
     WHERE m.id = p_match_id;

    -- Sem competição ou sem fase conhecida: regra antiga, o próprio jogo.
    IF v_comp IS NULL OR v_round IS NULL THEN
        RETURN v_own_date;
    END IF;

    SELECT MIN(m2.match_date) INTO v_deadline
      FROM public.matches m2
      JOIN public.ties t2 ON t2.id = m2.tie_id
     WHERE m2.tournament_id = v_tournament
       AND m2.competition = v_comp
       AND t2.round = v_round
       AND m2.match_date IS NOT NULL;

    RETURN v_deadline;
END;
$function$;

COMMENT ON FUNCTION public.prediction_deadline IS
  'Instante em que o palpite de uma partida fecha: 1º jogo da mesma competição E fase (ties.round). Sem competição/fase, o início da própria partida. NULL = sem prazo.';

GRANT EXECUTE ON FUNCTION public.prediction_deadline(INT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Gatilho
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_prediction_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    deadline  TIMESTAMPTZ;
    tem_fase  BOOLEAN;
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

    deadline := public.prediction_deadline(NEW.match_id);

    -- Sem data conhecida (fase ainda sem calendário): permite.
    IF deadline IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOW() > deadline THEN
        SELECT m.competition IS NOT NULL AND t.round IS NOT NULL INTO tem_fase
          FROM public.matches m
          LEFT JOIN public.ties t ON t.id = m.tie_id
         WHERE m.id = NEW.match_id;

        IF tem_fase THEN
            RAISE EXCEPTION 'Os palpites desta fase já encerraram (o prazo era o primeiro jogo da fase).';
        ELSE
            RAISE EXCEPTION 'A partida já começou. Palpites encerrados.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.check_prediction_window IS
  'Trava do palpite pela regra de public.prediction_deadline (competição + fase). Inclui pred_pen_winner na comparação de "nada mudou".';

-- ---------------------------------------------------------------------------
-- Verificação (depois do 1º jogo das oitavas de uma competição):
--   -- as duas devem FALHAR, mesmo no jogo de volta, que ainda não começou:
--   UPDATE public.predictions SET pred_home = 9          WHERE id = <id_oitavas>;
--   UPDATE public.predictions SET pred_pen_winner='home' WHERE id = <id_oitavas>;
--   -- esta deve PASSAR (gatilho de pontuação, não mexe no palpite):
--   UPDATE public.predictions SET points_earned = points_earned WHERE id = <id>;
--   -- e as quartas, quando existirem com data futura, devem ACEITAR palpite.
-- ---------------------------------------------------------------------------
