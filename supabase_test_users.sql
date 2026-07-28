-- ============================================
-- USUÁRIOS FICTÍCIOS PARA TESTES
-- ============================================
-- Este script cria 7 contas de teste no Supabase
-- 
-- IMPORTANTE: No Supabase, você precisa criar os usuários primeiro via Dashboard
-- ou usar a API. Este script cria os perfis correspondentes.
-- 
-- Alternativa: Execute este script APÓS criar os usuários manualmente no Dashboard
-- ou use a função abaixo para criar usuários programaticamente.

-- ============================================
-- FUNÇÃO AUXILIAR: Criar usuário e perfil
-- ============================================
-- Esta função cria um usuário e seu perfil correspondente
-- Use apenas se tiver permissões de administrador
CREATE OR REPLACE FUNCTION create_test_user(
    p_email TEXT,
    p_password TEXT,
    p_username TEXT,
    p_total_points INTEGER DEFAULT 0,
    p_exact_matches INTEGER DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Criar usuário na tabela auth.users
    -- NOTA: Isso requer permissões especiais. Se não funcionar,
    -- crie os usuários manualmente no Dashboard do Supabase
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        p_email,
        crypt(p_password, gen_salt('bf')),
        NOW(),
        jsonb_build_object('username', p_username),
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    )
    RETURNING id INTO v_user_id;

    -- O trigger handle_new_user() criará o perfil automaticamente
    -- Mas vamos atualizar os pontos e cravadas
    UPDATE public.profiles
    SET 
        total_points = p_total_points,
        exact_matches = p_exact_matches
    WHERE id = v_user_id;

    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- MÉTODO ALTERNATIVO: Inserir perfis diretamente
-- ============================================
-- Se você já criou os usuários no Dashboard do Supabase,
-- use este método para criar os perfis com dados de teste:

-- Primeiro, obtenha os IDs dos usuários criados e substitua nos INSERTs abaixo
-- ou use esta função para buscar por email:

-- ============================================
-- DADOS DOS USUÁRIOS DE TESTE
-- ============================================
-- Usuário 1: João Silva (Top do ranking)
-- Email: joao.silva@teste.com
-- Senha: teste123
-- Username: joaosilva
-- Pontos: 150, Cravadas: 5

-- Usuário 2: Maria Santos (2º lugar)
-- Email: maria.santos@teste.com
-- Senha: teste123
-- Username: mariasantos
-- Pontos: 120, Cravadas: 3

-- Usuário 3: Pedro Oliveira (3º lugar)
-- Email: pedro.oliveira@teste.com
-- Senha: teste123
-- Username: pedrooliveira
-- Pontos: 100, Cravadas: 2

-- Usuário 4: Ana Costa
-- Email: ana.costa@teste.com
-- Senha: teste123
-- Username: anacosta
-- Pontos: 85, Cravadas: 1

-- Usuário 5: Carlos Ferreira
-- Email: carlos.ferreira@teste.com
-- Senha: teste123
-- Username: carlosferreira
-- Pontos: 70, Cravadas: 1

-- Usuário 6: Juliana Lima
-- Email: juliana.lima@teste.com
-- Senha: teste123
-- Username: julianalima
-- Pontos: 55, Cravadas: 0

-- Usuário 7: Roberto Alves
-- Email: roberto.alves@teste.com
-- Senha: teste123
-- Username: robertoalves
-- Pontos: 40, Cravadas: 0

-- ============================================
-- SCRIPT PARA INSERIR PERFIS (após criar usuários)
-- ============================================
-- Execute este bloco APÓS criar os usuários no Dashboard do Supabase
-- Substitua os UUIDs pelos IDs reais dos usuários criados

-- Remover função existente se houver (pode ter tipo de retorno diferente)
DROP FUNCTION IF EXISTS update_test_profile(TEXT, TEXT, INTEGER, INTEGER);

-- Função para atualizar perfis baseado no email do usuário
CREATE OR REPLACE FUNCTION update_test_profile(
    p_email TEXT,
    p_username TEXT,
    p_total_points INTEGER,
    p_exact_matches INTEGER
)
RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Buscar ID do usuário pelo email
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = p_email;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário com email % não encontrado. Crie o usuário primeiro no Dashboard.', p_email;
    END IF;

    -- Atualizar ou inserir perfil
    INSERT INTO public.profiles (id, username, total_points, exact_matches)
    VALUES (v_user_id, p_username, p_total_points, p_exact_matches)
    ON CONFLICT (id) 
    DO UPDATE SET
        username = EXCLUDED.username,
        total_points = EXCLUDED.total_points,
        exact_matches = EXCLUDED.exact_matches;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- EXECUTAR: Atualizar perfis de teste
-- ============================================
-- Descomente e execute após criar os usuários no Dashboard:

/*
SELECT update_test_profile('joao.silva@teste.com', 'joaosilva', 150, 5);
SELECT update_test_profile('maria.santos@teste.com', 'mariasantos', 120, 3);
SELECT update_test_profile('pedro.oliveira@teste.com', 'pedrooliveira', 100, 2);
SELECT update_test_profile('ana.costa@teste.com', 'anacosta', 85, 1);
SELECT update_test_profile('carlos.ferreira@teste.com', 'carlosferreira', 70, 1);
SELECT update_test_profile('juliana.lima@teste.com', 'julianalima', 55, 0);
SELECT update_test_profile('roberto.alves@teste.com', 'robertoalves', 40, 0);
*/

-- ============================================
-- INSTRUÇÕES DE USO
-- ============================================
-- 
-- OPÇÃO 1: Criar usuários manualmente no Dashboard
-- 1. Vá para Authentication > Users no Supabase Dashboard
-- 2. Clique em "Add User" e crie os 7 usuários com os emails acima
-- 3. Depois execute as funções update_test_profile() acima
--
-- OPÇÃO 2: Usar a API do Supabase (recomendado)
-- Use o código abaixo em uma função server-side ou script Node.js:
--
-- const { createClient } = require('@supabase/supabase-js');
-- const supabase = createClient(url, serviceKey);
--
-- const users = [
--   { email: 'joao.silva@teste.com', password: 'teste123', username: 'joaosilva', points: 150, exact: 5 },
--   { email: 'maria.santos@teste.com', password: 'teste123', username: 'mariasantos', points: 120, exact: 3 },
--   { email: 'pedro.oliveira@teste.com', password: 'teste123', username: 'pedrooliveira', points: 100, exact: 2 },
--   { email: 'ana.costa@teste.com', password: 'teste123', username: 'anacosta', points: 85, exact: 1 },
--   { email: 'carlos.ferreira@teste.com', password: 'teste123', username: 'carlosferreira', points: 70, exact: 1 },
--   { email: 'juliana.lima@teste.com', password: 'teste123', username: 'julianalima', points: 55, exact: 0 },
--   { email: 'roberto.alves@teste.com', password: 'teste123', username: 'robertoalves', points: 40, exact: 0 },
-- ];
--
-- for (const user of users) {
--   const { data, error } = await supabase.auth.admin.createUser({
--     email: user.email,
--     password: user.password,
--     email_confirm: true,
--     user_metadata: { username: user.username }
--   });
--   
--   if (data?.user) {
--     await supabase
--       .from('profiles')
--       .update({ total_points: user.points, exact_matches: user.exact })
--       .eq('id', data.user.id);
--   }
-- }

