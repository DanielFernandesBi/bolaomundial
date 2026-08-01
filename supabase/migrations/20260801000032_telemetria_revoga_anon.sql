-- ============================================================================
-- Tira o `anon` das funções de uso.
--
-- O `REVOKE ... FROM PUBLIC` da migração original não bastou: o Supabase dá um
-- GRANT EXPLÍCITO de EXECUTE para `anon` e `authenticated` em toda função nova
-- do schema public (default privileges), e revogar de PUBLIC não mexe em
-- concessão nominal. Resultado: as seis apareciam no linter como chamáveis sem
-- login, via /rest/v1/rpc/....
--
-- Não havia vazamento — sem sessão, auth.uid() é nulo, a checagem de admin
-- falha e a chamada morre com exceção. Mas função de painel não tem por que
-- estar exposta a quem nem entrou.
-- ============================================================================

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['uso_resumo','uso_por_dia','uso_por_area','uso_por_usuario','uso_por_hora','uso_dispositivos']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(INT) FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(INT) TO authenticated', f);
  END LOOP;
END $$;
