-- ============================================================================
-- 🔒 HARDENING: EXECUTE de funções não é concedido a cliente por padrão
-- ============================================================================
-- Motivo (auditoria, item 3): no Postgres, toda função criada recebe EXECUTE para
-- PUBLIC por padrão. Isso já expôs backdoors (create_test_user/update_test_profile,
-- removidos na migração 000006) e funções de manutenção (recalculate_user_points,
-- recompute_competition_podium, revogadas na 000006). Esta migração generaliza a
-- proteção: NENHUM role de cliente (PUBLIC/anon/authenticated) executa funções do
-- schema public por padrão; só é reconcedido o que o app realmente chama.
--
-- Seguro porque:
--   • Triggers NÃO exigem EXECUTE do usuário (rodam pelo mecanismo de trigger).
--   • Funções chamadas DENTRO de SECURITY DEFINER rodam como o dono (têm EXECUTE).
--   • O ÚNICO rpc chamado pelo app é distribute_tournament_prizes (reconcedido abaixo;
--     tem checagem interna de admin).
--   • Funções de EXTENSÕES são excluídas (não mexemos em uuid-ossp etc.).
-- ============================================================================

-- 1) Revoga EXECUTE dos roles de cliente em todas as funções public que NÃO são de extensão
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND NOT EXISTS (
              SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e'  -- pertence a extensão
          )
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    END LOOP;
END $$;

-- 2) Reconcede apenas o que o app chama via rpc (protegida por checagem de admin interna)
GRANT EXECUTE ON FUNCTION public.distribute_tournament_prizes(integer) TO authenticated;

-- 3) Para funções FUTURAS criadas neste schema: não conceder EXECUTE a PUBLIC automaticamente
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Verificação:
--   -- como usuário comum, deve FALHAR (permission denied):
--   SELECT public.recalculate_user_points(auth.uid(), 1);
--   -- como admin, deve funcionar (checagem interna libera):
--   SELECT public.distribute_tournament_prizes(<id_torneio>);
-- Listar quem ainda tem EXECUTE em funções public:
--   SELECT p.proname, r.rolname
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   CROSS JOIN LATERAL aclexplode(p.proacl) a
--   JOIN pg_roles r ON r.oid = a.grantee
--   WHERE n.nspname='public' AND a.privilege_type='EXECUTE'
--   ORDER BY 1,2;
-- ---------------------------------------------------------------------------
