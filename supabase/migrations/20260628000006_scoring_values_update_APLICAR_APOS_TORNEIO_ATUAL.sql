-- ============================================================================
-- ⚠️  APLICAR SOMENTE DEPOIS QUE O ÚLTIMO JOGO DO TORNEIO ATUAL FOR FINALIZADO
-- ============================================================================
-- Esta migração altera os VALORES de pontuação do tempo normal:
--   • Empate seco (empate não cravado): 12 -> 15
--   • Vitória seca (vencedor sem mais nenhum critério): 9 -> 10
--
-- Como vale "daqui pra frente", rodar isto no meio de um torneio faria o jogo
-- restante pontuar diferente do resto -> inconsistência. Rode só com o torneio
-- atual 100% encerrado. NÃO recalcular torneios antigos.
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_prediction_points(
    pred_home INTEGER,
    pred_away INTEGER,
    score_home INTEGER,
    score_away INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    points INTEGER := 0;
    pred_result TEXT;
    actual_result TEXT;
    home_goals_correct BOOLEAN;
    away_goals_correct BOOLEAN;
    winner_correct BOOLEAN;
    pred_winner_goals INTEGER;
    pred_loser_goals INTEGER;
    actual_winner_goals INTEGER;
    actual_loser_goals INTEGER;
    pred_goal_diff INTEGER;
    actual_goal_diff INTEGER;
    winner_goals_correct BOOLEAN;
    loser_goals_correct BOOLEAN;
    goal_diff_correct BOOLEAN;
BEGIN
    IF score_home IS NULL OR score_away IS NULL THEN
        RETURN 0;
    END IF;

    IF pred_home > pred_away THEN
        pred_result := 'HOME_WIN';
        pred_winner_goals := pred_home;
        pred_loser_goals := pred_away;
        pred_goal_diff := pred_home - pred_away;
    ELSIF pred_away > pred_home THEN
        pred_result := 'AWAY_WIN';
        pred_winner_goals := pred_away;
        pred_loser_goals := pred_home;
        pred_goal_diff := pred_away - pred_home;
    ELSE
        pred_result := 'DRAW';
        pred_winner_goals := NULL;
        pred_loser_goals := NULL;
        pred_goal_diff := 0;
    END IF;

    IF score_home > score_away THEN
        actual_result := 'HOME_WIN';
        actual_winner_goals := score_home;
        actual_loser_goals := score_away;
        actual_goal_diff := score_home - score_away;
    ELSIF score_away > score_home THEN
        actual_result := 'AWAY_WIN';
        actual_winner_goals := score_away;
        actual_loser_goals := score_home;
        actual_goal_diff := score_away - score_home;
    ELSE
        actual_result := 'DRAW';
        actual_winner_goals := NULL;
        actual_loser_goals := NULL;
        actual_goal_diff := 0;
    END IF;

    home_goals_correct := (pred_home = score_home);
    away_goals_correct := (pred_away = score_away);
    winner_correct := (pred_result = actual_result);

    IF winner_correct AND pred_result != 'DRAW' THEN
        winner_goals_correct := (pred_winner_goals = actual_winner_goals);
        loser_goals_correct := (pred_loser_goals = actual_loser_goals);
        goal_diff_correct := (pred_goal_diff = actual_goal_diff);
    ELSE
        winner_goals_correct := FALSE;
        loser_goals_correct := FALSE;
        goal_diff_correct := FALSE;
    END IF;

    -- A. 30 pontos: Placar Exato (Cravada)
    IF home_goals_correct AND away_goals_correct THEN
        RETURN 30;
    END IF;

    -- E. Empate Seco -> AGORA 15 (era 12)
    IF pred_result = 'DRAW' AND actual_result = 'DRAW' THEN
        RETURN 15;
    END IF;

    IF winner_correct THEN
        -- B. 17 pontos: Vencedor + Gols do Vencedor
        IF winner_goals_correct AND NOT loser_goals_correct AND NOT goal_diff_correct THEN
            RETURN 17;
        END IF;

        -- C. 15 pontos: Vencedor + Saldo de Gols
        IF goal_diff_correct AND NOT winner_goals_correct AND NOT loser_goals_correct THEN
            RETURN 15;
        END IF;

        -- D. 12 pontos: Vencedor + Gols do Perdedor
        IF loser_goals_correct AND NOT winner_goals_correct AND NOT goal_diff_correct THEN
            RETURN 12;
        END IF;

        -- F. Vencedor Seco -> AGORA 10 (era 9)
        RETURN 10;
    END IF;

    -- G. 3 pontos: Consolação (Gols Avulsos)
    IF home_goals_correct OR away_goals_correct THEN
        RETURN 3;
    END IF;

    RETURN 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
