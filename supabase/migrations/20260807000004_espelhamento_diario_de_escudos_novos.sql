-- ============================================================================
-- Clube novo entra com escudo espelhado, sem ninguém precisar lembrar.
-- ============================================================================
-- A captura descobre clube novo o tempo todo — 403 já mapeados, e a lista
-- cresce a cada liga que entra em campo. Sem isto, cada um deles voltaria a
-- ser um link para o media.api-sports.io, e o problema reapareceria devagar,
-- um clube por vez, até alguém notar de novo.
--
-- Uma vez por dia basta: escudo de clube não muda, e o que muda é a LISTA de
-- clubes. A fila é idempotente e devolve vazio quando não há nada — nos dias
-- sem clube novo, a chamada custa alguns milissegundos e nada mais.
--
-- A chave usada é a ANON, a mesma que já vai no bundle do app; ela está no
-- Vault para não ficar escrita no comando do cron, não por ser secreta.
-- Antes de aplicar num ambiente novo:
--   SELECT vault.create_secret('<anon key>', 'SUPABASE_ANON_KEY', '...');
-- ============================================================================

CREATE OR REPLACE FUNCTION public.espelhar_escudos_pendentes(p_limite INTEGER DEFAULT 100)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_chave TEXT; v_pendentes INT; r RECORD;
BEGIN
  SELECT count(*) INTO v_pendentes FROM public.escudos_a_espelhar();
  IF v_pendentes = 0 THEN
    RETURN 'nada a espelhar';
  END IF;

  SELECT decrypted_secret INTO v_chave
    FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY';
  IF v_chave IS NULL THEN
    RAISE WARNING 'SUPABASE_ANON_KEY ausente no Vault: espelhamento não rodou';
    RETURN 'sem chave';
  END IF;

  -- Teto generoso: o padrão de 5s do http estoura com lote grande, e aqui
  -- estamos esperando download de dezenas de imagens.
  PERFORM extensions.http_set_curlopt('CURLOPT_TIMEOUT','180');

  SELECT * INTO r FROM extensions.http((
    'POST',
    'https://gdkndouervhxmjlwxdft.supabase.co/functions/v1/espelhar-escudos?limite=' || p_limite,
    ARRAY[extensions.http_header('Authorization', 'Bearer ' || v_chave)],
    'application/json', '{}')::extensions.http_request);

  RETURN format('%s pendentes · HTTP %s · %s', v_pendentes, r.status, left(r.content, 500));
EXCEPTION WHEN OTHERS THEN
  -- Nunca derruba quem chamou: espelho é melhoria, não pré-requisito.
  RAISE WARNING 'espelhar_escudos_pendentes falhou: %', SQLERRM;
  RETURN 'erro: ' || SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.espelhar_escudos_pendentes(INTEGER) IS
  'Chama a Edge Function espelhar-escudos para os clubes que ainda não têm o escudo no nosso Storage. Devolve sem gastar nada quando a fila está vazia.';

REVOKE ALL ON FUNCTION public.espelhar_escudos_pendentes(INTEGER) FROM PUBLIC, anon, authenticated;

-- 08:00 UTC = 05:00 BRT, longe da janela de jogos (14h–02h BRT), onde a cota
-- da API-Football e a atenção do cron estão ocupadas com resultado.
SELECT cron.schedule('espelhar-escudos', '0 8 * * *',
                     $c$SELECT public.espelhar_escudos_pendentes(100)$c$);

-- ---------------------------------------------------------------------------
-- Verificação:
--   SELECT * FROM public.escudos_a_espelhar();          -- quem falta
--   SELECT public.espelhar_escudos_pendentes(100);      -- rodar na hora
--   SELECT canonical_name, crest_url, crest_origem_url
--     FROM public.club_source_ids WHERE is_bolao_team ORDER BY canonical_name;
-- ---------------------------------------------------------------------------
