-- ============================================
-- BOLÃO DO MUNDIAL - LÓGICA DE PONTUAÇÃO
-- ============================================

-- ============================================
-- FUNÇÃO: Calcular pontuação de um palpite
-- ============================================
-- Esta função calcula os pontos baseado nas regras de pontuação
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
BEGIN
    -- Verificar se os placares são válidos
    IF score_home IS NULL OR score_away IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Determinar resultado do palpite
    IF pred_home > pred_away THEN
        pred_result := 'HOME_WIN';
    ELSIF pred_away > pred_home THEN
        pred_result := 'AWAY_WIN';
    ELSE
        pred_result := 'DRAW';
    END IF;
    
    -- Determinar resultado real
    IF score_home > score_away THEN
        actual_result := 'HOME_WIN';
    ELSIF score_away > score_home THEN
        actual_result := 'AWAY_WIN';
    ELSE
        actual_result := 'DRAW';
    END IF;
    
    -- Verificar acertos de gols
    home_goals_correct := (pred_home = score_home);
    away_goals_correct := (pred_away = score_away);
    winner_correct := (pred_result = actual_result);
    
    -- ============================================
    -- REGRAS DE PONTUAÇÃO (ordem de prioridade)
    -- ============================================
    
    -- 20 pontos: Cravada (placar exato)
    IF home_goals_correct AND away_goals_correct THEN
        points := 20;
        RETURN points;
    END IF;
    
    -- 12 pontos: Vencedor + Gols (acertou vencedor/empate E acertou gols de pelo menos um time)
    IF winner_correct AND (home_goals_correct OR away_goals_correct) THEN
        points := 12;
        RETURN points;
    END IF;
    
    -- 12 pontos: Empate (acertou que seria empate, mas errou o placar exato e não acertou gols de nenhum time)
    -- Nota: Se acertou empate E acertou gols de um time, já caiu na regra anterior (Vencedor + Gols)
    IF pred_result = 'DRAW' AND actual_result = 'DRAW' AND NOT home_goals_correct AND NOT away_goals_correct THEN
        points := 12;
        RETURN points;
    END IF;
    
    -- 10 pontos: Vencedor (acertou apenas quem ganhou, errando os gols dos dois times)
    IF winner_correct AND NOT home_goals_correct AND NOT away_goals_correct THEN
        points := 10;
        RETURN points;
    END IF;
    
    -- 5 pontos: Gols (errou quem ganhou, mas acertou a quantidade de gols de um dos times)
    IF NOT winner_correct AND (home_goals_correct OR away_goals_correct) THEN
        points := 5;
        RETURN points;
    END IF;
    
    -- 0 pontos: Qualquer outro caso
    points := 0;
    RETURN points;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- FUNÇÃO: Processar pontuação quando jogo termina
-- ============================================
CREATE OR REPLACE FUNCTION process_match_finished()
RETURNS TRIGGER AS $$
DECLARE
    prediction_record RECORD;
    calculated_points INTEGER;
    is_exact_match BOOLEAN;
    old_points INTEGER;
BEGIN
    -- Só processa se o status mudou para 'FINISHED' e o placar está definido
    IF NEW.status = 'FINISHED' AND NEW.score_home IS NOT NULL AND NEW.score_away IS NOT NULL THEN
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
            
            -- Verificar se é cravada (placar exato)
            is_exact_match := (calculated_points = 20);
            
            -- Obter pontos antigos (se existirem)
            old_points := COALESCE(prediction_record.old_points_earned, 0);
            
            -- Atualizar pontos_earned na tabela predictions
            UPDATE public.predictions
            SET points_earned = calculated_points
            WHERE id = prediction_record.id;
            
            -- Recalcular total_points e exact_matches no perfil do usuário
            -- Primeiro, subtrair os pontos antigos e adicionar os novos
            UPDATE public.profiles
            SET 
                total_points = total_points - old_points + calculated_points,
                exact_matches = CASE 
                    WHEN is_exact_match AND old_points != 20 THEN exact_matches + 1
                    WHEN NOT is_exact_match AND old_points = 20 THEN exact_matches - 1
                    ELSE exact_matches
                END
            WHERE id = prediction_record.user_id;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: Acionar cálculo de pontuação
-- ============================================
DROP TRIGGER IF EXISTS trigger_process_match_finished ON public.matches;
CREATE TRIGGER trigger_process_match_finished
    AFTER UPDATE OF status, score_home, score_away ON public.matches
    FOR EACH ROW
    WHEN (
        -- Só aciona se o status mudou para FINISHED ou se os placares foram atualizados em um jogo FINISHED
        (NEW.status = 'FINISHED' AND OLD.status != 'FINISHED')
        OR 
        (NEW.status = 'FINISHED' AND OLD.status = 'FINISHED' AND 
         (OLD.score_home IS DISTINCT FROM NEW.score_home OR OLD.score_away IS DISTINCT FROM NEW.score_away))
    )
    EXECUTE FUNCTION process_match_finished();

-- ============================================
-- FUNÇÃO AUXILIAR: Recalcular todos os pontos de um usuário
-- ============================================
-- Útil para recalcular pontos caso haja alguma inconsistência
CREATE OR REPLACE FUNCTION recalculate_user_points(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    total_points_sum INTEGER := 0;
    exact_matches_count INTEGER := 0;
BEGIN
    -- Recalcular total_points somando todos os points_earned
    SELECT COALESCE(SUM(points_earned), 0) INTO total_points_sum
    FROM public.predictions
    WHERE user_id = p_user_id;
    
    -- Contar exact_matches (palpites com 20 pontos)
    SELECT COUNT(*) INTO exact_matches_count
    FROM public.predictions
    WHERE user_id = p_user_id AND points_earned = 20;
    
    -- Atualizar perfil
    UPDATE public.profiles
    SET 
        total_points = total_points_sum,
        exact_matches = exact_matches_count
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- DADOS DE EXEMPLO: Jogos da Primeira Fase
-- ============================================
-- Inserindo jogos fictícios da primeira fase de uma Copa do Mundo

-- Limpar jogos existentes (opcional - descomente se quiser limpar antes de inserir)
-- DELETE FROM public.matches WHERE id > 0;

-- Grupo A
INSERT INTO public.matches (team_home, team_away, match_date, status) VALUES
('Brasil', 'Sérvia', '2024-11-20 16:00:00+00', 'SCHEDULED'),
('Suíça', 'Camarões', '2024-11-20 19:00:00+00', 'SCHEDULED'),
('Brasil', 'Suíça', '2024-11-24 13:00:00+00', 'SCHEDULED'),
('Camarões', 'Sérvia', '2024-11-24 16:00:00+00', 'SCHEDULED'),
('Camarões', 'Brasil', '2024-11-28 16:00:00+00', 'SCHEDULED'),
('Sérvia', 'Suíça', '2024-11-28 16:00:00+00', 'SCHEDULED');

-- Grupo B
INSERT INTO public.matches (team_home, team_away, match_date, status) VALUES
('Inglaterra', 'Irã', '2024-11-21 13:00:00+00', 'SCHEDULED'),
('Estados Unidos', 'País de Gales', '2024-11-21 19:00:00+00', 'SCHEDULED'),
('Inglaterra', 'Estados Unidos', '2024-11-25 19:00:00+00', 'SCHEDULED'),
('País de Gales', 'Irã', '2024-11-25 13:00:00+00', 'SCHEDULED');

-- ============================================
-- COMENTÁRIOS
-- ============================================
COMMENT ON FUNCTION calculate_prediction_points IS 'Calcula a pontuação de um palpite baseado nas regras do bolão';
COMMENT ON FUNCTION process_match_finished IS 'Processa todos os palpites quando um jogo é finalizado e atualiza as pontuações';
COMMENT ON FUNCTION recalculate_user_points IS 'Recalcula todos os pontos de um usuário (útil para correções)';

