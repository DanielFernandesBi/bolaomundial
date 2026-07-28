-- ============================================
-- TRIGGER: Criar registro em tournament_rankings
-- automaticamente quando um palpite é criado
-- ============================================
-- Este trigger garante que, quando um usuário faz um palpite,
-- um registro é criado em tournament_rankings para aquele torneio
-- (com 0 pontos inicialmente, se o jogo ainda não foi finalizado)

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

-- Criar trigger para INSERT
DROP TRIGGER IF EXISTS trigger_ensure_tournament_ranking_on_prediction_insert ON public.predictions;
CREATE TRIGGER trigger_ensure_tournament_ranking_on_prediction_insert
    AFTER INSERT ON public.predictions
    FOR EACH ROW
    EXECUTE FUNCTION ensure_tournament_ranking_on_prediction();

-- Criar trigger para UPDATE (caso o match_id mude, embora seja raro)
DROP TRIGGER IF EXISTS trigger_ensure_tournament_ranking_on_prediction_update ON public.predictions;
CREATE TRIGGER trigger_ensure_tournament_ranking_on_prediction_update
    AFTER UPDATE OF match_id ON public.predictions
    FOR EACH ROW
    WHEN (OLD.match_id IS DISTINCT FROM NEW.match_id)
    EXECUTE FUNCTION ensure_tournament_ranking_on_prediction();

-- ============================================
-- NOTA
-- ============================================
-- Este trigger garante que:
-- 1. Quando um usuário faz um palpite, um registro é criado em tournament_rankings
-- 2. O registro começa com 0 pontos (será atualizado quando o jogo for finalizado)
-- 3. Se o registro já existe, não é sobrescrito (mantém os pontos existentes)
-- 4. Todos os usuários que fizeram palpites aparecerão no ranking, mesmo sem pontos ainda

