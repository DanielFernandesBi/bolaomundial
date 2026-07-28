-- ============================================
-- SEGURANÇA: Validação de Palpites com Exceção para Admins
-- ============================================
-- Este script substitui a trigger de validação de data por uma versão
-- mais robusta que permite que administradores façam alterações mesmo
-- após o início do jogo.

-- ============================================
-- FUNÇÃO: check_prediction_window
-- ============================================
-- Verifica se o palpite pode ser criado/atualizado baseado na data do jogo
-- e no status de admin do usuário.

CREATE OR REPLACE FUNCTION check_prediction_window()
RETURNS TRIGGER AS $$
DECLARE
    match_start_time TIMESTAMP WITH TIME ZONE;
    user_is_admin BOOLEAN;
    current_user_id UUID;
BEGIN
    -- Obter o ID do usuário atual (do contexto de autenticação)
    current_user_id := auth.uid();
    
    -- Se não houver usuário autenticado, bloquear
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;
    
    -- Buscar a data do jogo relacionado ao palpite
    SELECT match_date INTO match_start_time
    FROM public.matches
    WHERE id = NEW.match_id;
    
    -- Se o jogo não existir, permitir (outras validações podem tratar isso)
    IF match_start_time IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Verificar se o usuário é administrador
    SELECT COALESCE(is_admin, false) INTO user_is_admin
    FROM public.profiles
    WHERE id = current_user_id;
    
    -- Se o jogo já começou E o usuário NÃO é admin, bloquear
    IF NOW() > match_start_time AND NOT user_is_admin THEN
        RAISE EXCEPTION 'O jogo já começou. Palpites encerrados.';
    END IF;
    
    -- Permitir a alteração em todos os outros casos:
    -- 1. Jogo ainda não começou (qualquer usuário)
    -- 2. Jogo começou mas o usuário é admin
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- REMOVER TRIGGERS ANTIGAS
-- ============================================
-- Remove as triggers antigas que não verificavam status de admin

DROP TRIGGER IF EXISTS trigger_check_match_date_insert ON public.predictions;
DROP TRIGGER IF EXISTS trigger_check_match_date_update ON public.predictions;
DROP TRIGGER IF EXISTS tr_check_prediction_window ON public.predictions;

-- Remover a função antiga se existir (opcional, mas recomendado)
DROP FUNCTION IF EXISTS check_match_date();

-- ============================================
-- CRIAR NOVA TRIGGER
-- ============================================
-- Cria uma única trigger que funciona para INSERT e UPDATE

CREATE TRIGGER tr_check_prediction_window
    BEFORE INSERT OR UPDATE ON public.predictions
    FOR EACH ROW
    EXECUTE FUNCTION check_prediction_window();

-- ============================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- ============================================
COMMENT ON FUNCTION check_prediction_window() IS 
'Valida se um palpite pode ser criado ou atualizado. Bloqueia alterações após o início do jogo, exceto para administradores.';

COMMENT ON TRIGGER tr_check_prediction_window ON public.predictions IS 
'Garante que apenas admins podem criar/atualizar palpites após o início do jogo. Executa antes de INSERT e UPDATE.';

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Execute estas queries para verificar se a trigger foi criada corretamente:

-- Verificar se a função existe:
-- SELECT routine_name, routine_type 
-- FROM information_schema.routines 
-- WHERE routine_schema = 'public' 
--   AND routine_name = 'check_prediction_window';

-- Verificar se a trigger existe:
-- SELECT trigger_name, event_manipulation, event_object_table, action_statement
-- FROM information_schema.triggers
-- WHERE trigger_schema = 'public'
--   AND trigger_name = 'tr_check_prediction_window';

