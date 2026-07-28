-- ============================================
-- ADICIONAR POLÍTICA RLS PARA DELETE EM matches
-- ============================================
-- Este script adiciona uma política RLS que permite que apenas
-- administradores possam deletar partidas

-- Política para DELETE: apenas admins podem deletar partidas
DROP POLICY IF EXISTS "Only admins can delete matches" ON public.matches;
CREATE POLICY "Only admins can delete matches"
    ON public.matches
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = auth.uid()
            AND is_admin = true
        )
    );

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Execute esta query para verificar se a política foi criada:
-- SELECT policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public' 
--   AND tablename = 'matches'
--   AND cmd = 'DELETE';

