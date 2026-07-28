-- ============================================================================
-- 🔴 P0 SEGURANÇA: impedir escalada de privilégio via profiles
-- ============================================================================
-- PROBLEMA: a policy de UPDATE de profiles só checa (auth.uid() = id), e o role
-- `authenticated` tinha UPDATE na tabela inteira. Como o RLS não compara OLD/NEW,
-- qualquer usuário podia, por uma requisição direta ao PostgREST, gravar na PRÓPRIA
-- linha `is_admin = true` (ou mexer em total_money/total_points/exact_matches) e
-- assim virar admin. A correção tem de ser NO BANCO, não no frontend.
--
-- SOLUÇÃO (duas camadas independentes):
--   (1) Privilégio POR COLUNA: o role de cliente só pode gravar username/avatar_url.
--       Funções SECURITY DEFINER (pontuação, prêmios) rodam como o DONO e não são
--       afetadas — continuam escrevendo total_money/total_points normalmente.
--   (2) Trigger de defesa em profundidade: bloqueia mudança das colunas
--       administrativas quando a chamada vem dos roles de cliente (authenticated/anon),
--       mesmo que algum GRANT seja afrouxado no futuro. Também zera essas colunas
--       num INSERT feito por cliente.
--
-- Colunas que o usuário LEGITIMAMENTE edita (confirmado no código):
--   • avatar_url  (updateProfileAvatar)
--   • username    (cadastro em app/login/actions.ts)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (1) Privilégio por coluna
-- ---------------------------------------------------------------------------
-- Remove o UPDATE amplo dos roles de cliente (o dono da tabela e o service_role
-- não são afetados por isto).
REVOKE UPDATE ON public.profiles FROM PUBLIC;
REVOKE UPDATE ON public.profiles FROM anon;
REVOKE UPDATE ON public.profiles FROM authenticated;

-- Devolve o UPDATE apenas nas colunas que o usuário pode editar.
GRANT UPDATE (username, avatar_url) ON public.profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- (2) Trigger de defesa em profundidade
-- ---------------------------------------------------------------------------
-- Enforce apenas para os roles de cliente do PostgREST (authenticated/anon).
-- Chamadas de funções SECURITY DEFINER rodam como o dono (ex.: postgres) e passam.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        IF TG_OP = 'INSERT' THEN
            -- Um perfil criado por cliente nunca nasce privilegiado.
            NEW.is_admin      := false;
            NEW.total_money   := 0;
            NEW.total_points  := 0;
            NEW.exact_matches := 0;
        ELSIF TG_OP = 'UPDATE' THEN
            IF NEW.is_admin      IS DISTINCT FROM OLD.is_admin
            OR NEW.total_money   IS DISTINCT FROM OLD.total_money
            OR NEW.total_points  IS DISTINCT FROM OLD.total_points
            OR NEW.exact_matches IS DISTINCT FROM OLD.exact_matches THEN
                RAISE EXCEPTION 'Alteração de colunas administrativas do perfil não é permitida.';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trigger_protect_profile_privileged_columns
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profile_privileged_columns();

COMMENT ON FUNCTION public.protect_profile_privileged_columns IS
  'P0: impede que usuários (roles authenticated/anon) alterem is_admin/total_money/total_points/exact_matches; funções SECURITY DEFINER passam.';

-- ---------------------------------------------------------------------------
-- Verificação sugerida (rodar como um usuário comum deve FALHAR):
--   UPDATE public.profiles SET is_admin = true WHERE id = auth.uid();
-- Deve dar "permission denied for column is_admin" ou a exceção da trigger.
-- ---------------------------------------------------------------------------
