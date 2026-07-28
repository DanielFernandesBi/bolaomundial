-- ============================================
-- CONFIGURAÇÃO DE ADMINISTRADORES
-- ============================================
-- Este script adiciona suporte a administradores no sistema
-- e configura políticas RLS para permitir que apenas admins
-- possam atualizar jogos

-- ============================================
-- ADICIONAR COLUNA is_admin NA TABELA profiles
-- ============================================
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false NOT NULL;

-- Índice para melhorar performance nas consultas de admin
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin)
WHERE is_admin = true;

-- Comentário na coluna
COMMENT ON COLUMN public.profiles.is_admin IS 'Indica se o usuário é administrador do sistema';

-- ============================================
-- ATUALIZAR POLÍTICAS RLS: matches
-- ============================================

-- Manter leitura pública (já existe, mas garantimos que está ativa)
DROP POLICY IF EXISTS "Matches are viewable by everyone" ON public.matches;
CREATE POLICY "Matches are viewable by everyone"
    ON public.matches
    FOR SELECT
    USING (true);

-- Substituir policy de INSERT para admins
DROP POLICY IF EXISTS "Only admins can insert matches" ON public.matches;
CREATE POLICY "Only admins can insert matches"
    ON public.matches
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = auth.uid()
            AND is_admin = true
        )
    );

-- Substituir policy de UPDATE para admins
DROP POLICY IF EXISTS "Only admins can update matches" ON public.matches;
CREATE POLICY "Only admins can update matches"
    ON public.matches
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = auth.uid()
            AND is_admin = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = auth.uid()
            AND is_admin = true
        )
    );

-- ============================================
-- BÔNUS: Tornar usuário atual admin
-- ============================================
-- Descomente e execute a linha abaixo para tornar o usuário logado atual um administrador
-- IMPORTANTE: Execute apenas se você estiver logado como o usuário que deseja tornar admin

-- UPDATE public.profiles
-- SET is_admin = true
-- WHERE id = auth.uid();

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Execute estas queries para verificar a configuração:

-- Verificar se a coluna foi criada:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public' 
--   AND table_name = 'profiles' 
--   AND column_name = 'is_admin';

-- Verificar usuários admin:
-- SELECT id, username, is_admin
-- FROM public.profiles
-- WHERE is_admin = true;

-- Verificar políticas RLS na tabela matches:
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' 
--   AND tablename = 'matches';

