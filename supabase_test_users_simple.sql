-- ============================================
-- USUÁRIOS FICTÍCIOS PARA TESTES - VERSÃO SIMPLES
-- ============================================
-- 
-- INSTRUÇÕES:
-- 1. Primeiro, crie os usuários no Supabase Dashboard:
--    - Vá em Authentication > Users > Add User
--    - Crie os 7 usuários com os emails abaixo
--    - Use a senha: teste123 para todos
--    - Marque "Auto Confirm User"
--
-- 2. Depois, execute este script SQL no Supabase SQL Editor
--    para atualizar os perfis com os dados de teste
--
-- ============================================
-- DADOS DOS USUÁRIOS DE TESTE
-- ============================================

-- Remover função existente se houver (pode ter tipo de retorno diferente)
DROP FUNCTION IF EXISTS update_test_profile(TEXT, TEXT, INTEGER, INTEGER);

-- Função auxiliar para atualizar perfil baseado no email
CREATE OR REPLACE FUNCTION update_test_profile(
    p_email TEXT,
    p_username TEXT,
    p_total_points INTEGER,
    p_exact_matches INTEGER
)
RETURNS TEXT AS $$
DECLARE
    v_user_id UUID;
    v_profile_exists BOOLEAN;
BEGIN
    -- Buscar ID do usuário pelo email
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = p_email;

    IF v_user_id IS NULL THEN
        RETURN 'ERRO: Usuário ' || p_email || ' não encontrado. Crie primeiro no Dashboard.';
    END IF;

    -- Verificar se o perfil já existe
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = v_user_id) INTO v_profile_exists;

    -- Criar ou atualizar perfil
    IF v_profile_exists THEN
        -- Atualizar perfil existente
        UPDATE public.profiles
        SET
            username = p_username,
            total_points = p_total_points,
            exact_matches = p_exact_matches,
            updated_at = NOW()
        WHERE id = v_user_id;
        
        RETURN 'OK: Perfil de ' || p_username || ' atualizado com sucesso! (ID: ' || v_user_id || ')';
    ELSE
        -- Inserir novo perfil (caso o trigger não tenha criado)
        INSERT INTO public.profiles (id, username, total_points, exact_matches)
        VALUES (v_user_id, p_username, p_total_points, p_exact_matches);
        
        RETURN 'OK: Perfil de ' || p_username || ' criado com sucesso! (ID: ' || v_user_id || ')';
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RETURN 'ERRO ao processar ' || p_email || ': ' || SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VERIFICAR USUÁRIOS EXISTENTES
-- ============================================
-- Execute esta query primeiro para ver quais usuários já existem:
SELECT 
    email,
    id,
    created_at
FROM auth.users
WHERE email IN (
    'joao.silva@teste.com',
    'maria.santos@teste.com',
    'pedro.oliveira@teste.com',
    'ana.costa@teste.com',
    'carlos.ferreira@teste.com',
    'juliana.lima@teste.com',
    'roberto.alves@teste.com'
)
ORDER BY email;

-- ============================================
-- EXECUTAR: Criar/Atualizar perfis de teste
-- ============================================
-- Execute estas linhas após criar os usuários no Dashboard:

SELECT update_test_profile('joao.silva@teste.com', 'joaosilva', 150, 5) AS resultado;
SELECT update_test_profile('maria.santos@teste.com', 'mariasantos', 120, 3) AS resultado;
SELECT update_test_profile('pedro.oliveira@teste.com', 'pedrooliveira', 100, 2) AS resultado;
SELECT update_test_profile('ana.costa@teste.com', 'anacosta', 85, 1) AS resultado;
SELECT update_test_profile('carlos.ferreira@teste.com', 'carlosferreira', 70, 1) AS resultado;
SELECT update_test_profile('juliana.lima@teste.com', 'julianalima', 55, 0) AS resultado;
SELECT update_test_profile('roberto.alves@teste.com', 'robertoalves', 40, 0) AS resultado;

-- ============================================
-- VERIFICAR PERFIS CRIADOS
-- ============================================
-- Execute esta query para verificar se os perfis foram criados:
SELECT 
    p.id,
    p.username,
    p.total_points,
    p.exact_matches,
    u.email
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
WHERE u.email IN (
    'joao.silva@teste.com',
    'maria.santos@teste.com',
    'pedro.oliveira@teste.com',
    'ana.costa@teste.com',
    'carlos.ferreira@teste.com',
    'juliana.lima@teste.com',
    'roberto.alves@teste.com'
)
ORDER BY p.total_points DESC, p.exact_matches DESC;

-- ============================================
-- LISTA DE USUÁRIOS PARA CRIAR NO DASHBOARD
-- ============================================
-- 
-- 1. joao.silva@teste.com / teste123
--    Username: joaosilva | Pontos: 150 | Cravadas: 5
--
-- 2. maria.santos@teste.com / teste123
--    Username: mariasantos | Pontos: 120 | Cravadas: 3
--
-- 3. pedro.oliveira@teste.com / teste123
--    Username: pedrooliveira | Pontos: 100 | Cravadas: 2
--
-- 4. ana.costa@teste.com / teste123
--    Username: anacosta | Pontos: 85 | Cravadas: 1
--
-- 5. carlos.ferreira@teste.com / teste123
--    Username: carlosferreira | Pontos: 70 | Cravadas: 1
--
-- 6. juliana.lima@teste.com / teste123
--    Username: julianalima | Pontos: 55 | Cravadas: 0
--
-- 7. roberto.alves@teste.com / teste123
--    Username: robertoalves | Pontos: 40 | Cravadas: 0
--
-- ============================================
