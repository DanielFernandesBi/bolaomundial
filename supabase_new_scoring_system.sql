-- ============================================
-- NOVO SISTEMA DE PONTUAÇÃO - 7 CATEGORIAS
-- ============================================
-- Este script implementa o novo sistema de pontuação hierárquico
-- com 7 categorias (A-G) conforme especificado

-- ============================================
-- FUNÇÃO: Calcular pontuação de um palpite (NOVO SISTEMA)
-- ============================================
CREATE OR REPLACE FUNCTION calculate_prediction_points(
    pred_home INTEGER,
    pred_away INTEGER,
    score_home INTEGER,
    score_away INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    points INTEGER := 0;
    pred_result TEXT; -- 'HOME_WIN', 'AWAY_WIN', 'DRAW'
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
    -- Verificar se os placares são válidos
    IF score_home IS NULL OR score_away IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Determinar resultado do palpite
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
    
    -- Determinar resultado real
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
    
    -- Verificar acertos básicos
    home_goals_correct := (pred_home = score_home);
    away_goals_correct := (pred_away = score_away);
    winner_correct := (pred_result = actual_result);
    
    -- Verificar acertos específicos do novo sistema
    IF winner_correct AND pred_result != 'DRAW' THEN
        winner_goals_correct := (pred_winner_goals = actual_winner_goals);
        loser_goals_correct := (pred_loser_goals = actual_loser_goals);
        goal_diff_correct := (pred_goal_diff = actual_goal_diff);
    ELSE
        winner_goals_correct := FALSE;
        loser_goals_correct := FALSE;
        goal_diff_correct := FALSE;
    END IF;
    
    -- ============================================
    -- REGRAS DE PONTUAÇÃO (ordem de prioridade - maior para menor)
    -- ============================================
    
    -- A. 30 pontos: Placar Exato (Cravada)
    IF home_goals_correct AND away_goals_correct THEN
        points := 30;
        RETURN points;
    END IF;
    
    -- E. 12 pontos: Empate Seco (REGRA DE SOBERANIA DO EMPATE)
    -- Se apostou em empate e o jogo terminou empatado, sempre 12 pontos
    IF pred_result = 'DRAW' AND actual_result = 'DRAW' THEN
        points := 12;
        RETURN points;
    END IF;
    
    -- Se acertou o vencedor, aplicar categorias B, C, D ou F
    IF winner_correct THEN
        -- B. 17 pontos: Vencedor + Gols do Vencedor
        -- Acertou quem venceu e o nº exato de gols desse time
        IF winner_goals_correct AND NOT loser_goals_correct AND NOT goal_diff_correct THEN
            points := 17;
            RETURN points;
        END IF;
        
        -- C. 15 pontos: Vencedor + Saldo de Gols
        -- Acertou quem venceu e a diferença exata de gols
        IF goal_diff_correct AND NOT winner_goals_correct AND NOT loser_goals_correct THEN
            points := 15;
            RETURN points;
        END IF;
        
        -- D. 12 pontos: Vencedor + Gols do Perdedor
        -- Acertou quem venceu e o nº exato de gols do time derrotado
        IF loser_goals_correct AND NOT winner_goals_correct AND NOT goal_diff_correct THEN
            points := 12;
            RETURN points;
        END IF;
        
        -- F. 9 pontos: Vencedor Seco
        -- Acertou apenas quem venceu (errou saldo e gols de ambos os times)
        -- REGRA DE PRIORIDADE DO VENCEDOR: nunca cai para categoria G se acertou o vencedor
        points := 9;
        RETURN points;
    END IF;
    
    -- G. 3 pontos: Consolação (Gols Avulsos)
    -- Errou o resultado (quem ganhou ou se foi empate), mas acertou a quantidade de gols de um dos times
    IF home_goals_correct OR away_goals_correct THEN
        points := 3;
        RETURN points;
    END IF;
    
    -- 0 pontos: Qualquer outro caso
    points := 0;
    RETURN points;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- FUNÇÃO: Processar pontuação quando jogo termina (ATUALIZADA)
-- ============================================
CREATE OR REPLACE FUNCTION process_match_finished()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    prediction_record RECORD;
    calculated_points INTEGER;
    is_exact_match BOOLEAN;
    old_points INTEGER;
    match_tournament_id INTEGER;
BEGIN
    -- Só processa se o status mudou para 'FINISHED' e o placar está definido
    IF NEW.status = 'FINISHED' AND NEW.score_home IS NOT NULL AND NEW.score_away IS NOT NULL THEN
        -- Obter o tournament_id do jogo
        match_tournament_id := NEW.tournament_id;
        
        -- Verificar se o jogo tem um torneio associado
        IF match_tournament_id IS NULL THEN
            RAISE WARNING 'Jogo % não tem tournament_id associado. Pulando processamento de pontos.', NEW.id;
            RETURN NEW;
        END IF;
        
        -- Processar cada palpite deste jogo
        FOR prediction_record IN
            SELECT 
                p.id,
                p.user_id,
                p.pred_home,
                p.pred_away,
                p.points_earned as old_points_earned
            FROM public.predictions p
            WHERE p.match_id = NEW.id
        LOOP
            -- Calcular pontos do palpite
            calculated_points := calculate_prediction_points(
                prediction_record.pred_home,
                prediction_record.pred_away,
                NEW.score_home,
                NEW.score_away
            );
            
            -- Verificar se é cravada (placar exato) - agora 30 pontos
            is_exact_match := (calculated_points = 30);
            
            -- Obter pontos antigos (se existirem)
            old_points := COALESCE(prediction_record.old_points_earned, 0);
            
            -- Atualizar points_earned na tabela predictions
            UPDATE public.predictions
            SET points_earned = calculated_points
            WHERE id = prediction_record.id;
            
            -- Atualizar (ou criar) tournament_rankings baseado no tournament_id do jogo
            INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches)
            VALUES (
                prediction_record.user_id,
                match_tournament_id,
                calculated_points, -- Se for novo registro, começa com os pontos deste palpite
                CASE WHEN is_exact_match THEN 1 ELSE 0 END
            )
            ON CONFLICT (user_id, tournament_id) DO UPDATE
            SET 
                -- Ajustar pontos: subtrair os pontos antigos e adicionar os novos
                total_points = tournament_rankings.total_points - old_points + calculated_points,
                -- Ajustar exact_matches: incrementar se ganhou uma cravada, decrementar se perdeu uma
                -- Considera tanto 20 (sistema antigo) quanto 25 (sistema novo) como cravada
                exact_matches = CASE
                    WHEN is_exact_match AND old_points != 30 AND old_points != 25 AND old_points != 20 THEN tournament_rankings.exact_matches + 1
                    WHEN NOT is_exact_match AND (old_points = 30 OR old_points = 25 OR old_points = 20) THEN tournament_rankings.exact_matches - 1
                    ELSE tournament_rankings.exact_matches
                END,
                updated_at = NOW();
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNÇÃO AUXILIAR: Recalcular todos os pontos de um usuário (ATUALIZADA)
-- ============================================
CREATE OR REPLACE FUNCTION recalculate_user_points(p_user_id UUID, p_tournament_id INTEGER DEFAULT NULL)
RETURNS VOID 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    total_points_sum INTEGER := 0;
    exact_matches_count INTEGER := 0;
    tournament_record RECORD;
BEGIN
    -- Se p_tournament_id foi fornecido, recalcular apenas para aquele torneio
    -- Caso contrário, recalcular para todos os torneios
    IF p_tournament_id IS NOT NULL THEN
        -- Recalcular total_points somando todos os points_earned do torneio
        SELECT COALESCE(SUM(p.points_earned), 0) INTO total_points_sum
        FROM public.predictions p
        INNER JOIN public.matches m ON p.match_id = m.id
        WHERE p.user_id = p_user_id AND m.tournament_id = p_tournament_id;
        
        -- Contar exact_matches (palpites com 30 pontos - sistema atual, 25 ou 20 - sistemas antigos)
        SELECT COUNT(*) INTO exact_matches_count
        FROM public.predictions p
        INNER JOIN public.matches m ON p.match_id = m.id
        WHERE p.user_id = p_user_id
          AND m.tournament_id = p_tournament_id
          AND (p.points_earned = 30 OR p.points_earned = 25 OR p.points_earned = 20);
        
        -- Atualizar ou criar ranking do torneio
        INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches)
        VALUES (p_user_id, p_tournament_id, total_points_sum, exact_matches_count)
        ON CONFLICT (user_id, tournament_id) DO UPDATE
        SET 
            total_points = total_points_sum,
            exact_matches = exact_matches_count,
            updated_at = NOW();
    ELSE
        -- Recalcular para todos os torneios
        FOR tournament_record IN
            SELECT DISTINCT m.tournament_id
            FROM public.matches m
            INNER JOIN public.predictions p ON m.id = p.match_id
            WHERE p.user_id = p_user_id AND m.tournament_id IS NOT NULL
        LOOP
            PERFORM recalculate_user_points(p_user_id, tournament_record.tournament_id);
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMENTÁRIOS
-- ============================================
COMMENT ON FUNCTION calculate_prediction_points IS 'Calcula a pontuação de um palpite baseado no novo sistema hierárquico com 7 categorias (A-G)';
COMMENT ON FUNCTION process_match_finished IS 'Processa todos os palpites quando um jogo é finalizado e atualiza as pontuações usando o novo sistema';
COMMENT ON FUNCTION recalculate_user_points IS 'Recalcula todos os pontos de um usuário usando o novo sistema de pontuação';

