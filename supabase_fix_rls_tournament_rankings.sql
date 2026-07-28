-- ============================================
-- CORREÇÃO: Ajustar funções para contornar RLS
-- ============================================
-- Este script adiciona SECURITY DEFINER às funções que precisam
-- inserir/atualizar tournament_rankings, permitindo que contornem RLS

-- ============================================
-- 1. Função ensure_tournament_ranking_on_prediction
-- ============================================
CREATE OR REPLACE FUNCTION ensure_tournament_ranking_on_prediction()
RETURNS TRIGGER 
SECURITY DEFINER -- Executa com permissões do criador da função, ignorando RLS
SET search_path = public
AS $$
DECLARE
    match_tournament_id INTEGER;
BEGIN
    -- Buscar o tournament_id do jogo
    SELECT tournament_id INTO match_tournament_id
    FROM public.matches
    WHERE id = NEW.match_id;
    
    -- Se o jogo tem um torneio associado, criar/garantir registro em tournament_rankings
    IF match_tournament_id IS NOT NULL THEN
        INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches)
        VALUES (NEW.user_id, match_tournament_id, 0, 0)
        ON CONFLICT (user_id, tournament_id) DO NOTHING;
        -- Se já existe, não faz nada (mantém os pontos existentes)
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. Função process_match_finished
-- ============================================
CREATE OR REPLACE FUNCTION process_match_finished()
RETURNS TRIGGER 
SECURITY DEFINER -- Executa com permissões do criador da função, ignorando RLS
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
            
            -- Verificar se é cravada (placar exato)
            is_exact_match := (calculated_points = 20);
            
            -- Obter pontos antigos (se existirem)
            old_points := COALESCE(prediction_record.old_points_earned, 0);
            
            -- Atualizar points_earned na tabela predictions
            UPDATE public.predictions
            SET points_earned = calculated_points
            WHERE id = prediction_record.id;
            
            -- Atualizar (ou criar) tournament_rankings baseado no tournament_id do jogo
            -- Usar INSERT ... ON CONFLICT para garantir que o registro existe
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
                exact_matches = CASE 
                    WHEN is_exact_match AND old_points != 20 THEN tournament_rankings.exact_matches + 1
                    WHEN NOT is_exact_match AND old_points = 20 THEN tournament_rankings.exact_matches - 1
                    ELSE tournament_rankings.exact_matches
                END,
                updated_at = NOW();
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. Função recalculate_user_points
-- ============================================
CREATE OR REPLACE FUNCTION recalculate_user_points(p_user_id UUID, p_tournament_id INTEGER DEFAULT NULL)
RETURNS VOID 
SECURITY DEFINER -- Executa com permissões do criador da função, ignorando RLS
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
        
        -- Contar exact_matches (palpites com 20 pontos) do torneio
        SELECT COUNT(*) INTO exact_matches_count
        FROM public.predictions p
        INNER JOIN public.matches m ON p.match_id = m.id
        WHERE p.user_id = p_user_id 
          AND m.tournament_id = p_tournament_id 
          AND p.points_earned = 20;
        
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
-- NOTA IMPORTANTE
-- ============================================
-- SECURITY DEFINER faz com que a função execute com as permissões
-- do usuário que criou a função (geralmente o superusuário do banco),
-- ignorando as políticas RLS. Isso é necessário para que os triggers
-- possam inserir/atualizar dados em tournament_rankings mesmo com RLS ativo.
--
-- SET search_path = public garante que a função use o schema correto,
-- evitando problemas de segurança relacionados ao search_path.

