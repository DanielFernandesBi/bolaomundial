-- ============================================================================
-- O escudo do cadastro também passa a ser servido por nós.
-- ============================================================================
-- `club_source_ids.crest_url` já aponta para o nosso Storage, e isso resolve
-- Projeção e Resultados. Mas Partidas, Transparência, Desempenho e o detalhe da
-- partida NÃO leem de lá: eles leem `matches.home_iso` / `away_iso`, que é a
-- URL que o admin colou ao montar a chave — hoje, do Wikipedia.
--
-- Foram justamente essas que começaram a sumir também ("até os cadastrados
-- ficam sumindo"). Trocar a leitura em cinco componentes seria o caminho
-- longo para o mesmo lugar; trocar o VALOR resolve os cinco de uma vez.
--
-- O que o admin digitou não se perde: vai para `*_iso_origem` antes da troca, e
-- continua sendo a procedência do arquivo que estamos servindo. Se um dia o
-- espelho for desligado, é de lá que se volta.
--
-- Só toca em linha cujo valor é URL e cujo clube tem espelho. Nos torneios de
-- seleções a mesma coluna guarda código de país ("br"), e essas ficam
-- intocadas — é o mesmo cuidado que /resultados já tinha ao ler a coluna.
-- ============================================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_iso_origem TEXT,
  ADD COLUMN IF NOT EXISTS away_iso_origem TEXT;

COMMENT ON COLUMN public.matches.home_iso_origem IS
  'URL do escudo como o admin cadastrou, antes de passarmos a servir o arquivo espelhado. Guardada para não perder a procedência nem a possibilidade de voltar atrás.';

CREATE OR REPLACE FUNCTION public.apontar_cadastro_para_o_espelho()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_afetados INT := 0; v_n INT;
BEGIN
  -- Mandante
  UPDATE public.matches m
     SET home_iso_origem = COALESCE(m.home_iso_origem, m.home_iso),
         home_iso        = c.crest_url
    FROM public.club_source_ids c
   WHERE c.team_key = public.club_resolve(m.team_home)
     AND c.crest_url LIKE '%/public/escudos/%'
     AND m.home_iso LIKE 'http%'
     AND m.home_iso NOT LIKE '%/public/escudos/%';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_afetados := v_afetados + v_n;

  -- Visitante
  UPDATE public.matches m
     SET away_iso_origem = COALESCE(m.away_iso_origem, m.away_iso),
         away_iso        = c.crest_url
    FROM public.club_source_ids c
   WHERE c.team_key = public.club_resolve(m.team_away)
     AND c.crest_url LIKE '%/public/escudos/%'
     AND m.away_iso LIKE 'http%'
     AND m.away_iso NOT LIKE '%/public/escudos/%';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_afetados := v_afetados + v_n;

  RETURN v_afetados;
END;
$$;

COMMENT ON FUNCTION public.apontar_cadastro_para_o_espelho() IS
  'Faz matches.home_iso/away_iso apontarem para o escudo espelhado no nosso Storage, guardando a URL original em *_iso_origem. Idempotente: quem já aponta para o espelho não é tocado.';

REVOKE ALL ON FUNCTION public.apontar_cadastro_para_o_espelho() FROM PUBLIC, anon, authenticated;

-- ── A fila deixa de se alimentar do próprio espelho ─────────────────────────
-- Depois da troca acima, `matches` passa a conter URLs do nosso Storage. Se a
-- fila continuasse aceitando essas como "origem", um clube sem escudo na API
-- ficaria espelhando o próprio espelho para sempre.
CREATE OR REPLACE FUNCTION public.escudos_a_espelhar()
RETURNS TABLE (team_key TEXT, origem TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH da_partida AS (
    SELECT f.home_team_key AS k, f.home_crest_url AS url, f.kickoff_at FROM public.club_fixtures f
     WHERE f.home_team_key IS NOT NULL AND f.home_crest_url LIKE 'http%'
       AND f.home_crest_url NOT LIKE '%/public/escudos/%'
    UNION ALL
    SELECT f.away_team_key, f.away_crest_url, f.kickoff_at FROM public.club_fixtures f
     WHERE f.away_team_key IS NOT NULL AND f.away_crest_url LIKE 'http%'
       AND f.away_crest_url NOT LIKE '%/public/escudos/%'
  ),
  melhor_da_partida AS (
    SELECT DISTINCT ON (k) k, url FROM da_partida ORDER BY k, kickoff_at DESC
  ),
  do_cadastro AS (
    SELECT public.club_resolve(t.nome) AS k, min(t.url) AS url
      FROM (SELECT team_home AS nome, home_iso AS url FROM public.matches
             WHERE home_iso LIKE 'http%' AND home_iso NOT LIKE '%/public/escudos/%'
            UNION ALL
            SELECT team_away, away_iso FROM public.matches
             WHERE away_iso LIKE 'http%' AND away_iso NOT LIKE '%/public/escudos/%') t
     WHERE public.club_resolve(t.nome) IS NOT NULL
     GROUP BY 1
  )
  SELECT c.team_key,
         COALESCE(
           CASE WHEN c.crest_url LIKE 'http%' AND c.crest_url NOT LIKE '%/public/escudos/%'
                THEN c.crest_url END,
           mp.url, dc.url) AS origem
    FROM public.club_source_ids c
    LEFT JOIN melhor_da_partida mp ON mp.k = c.team_key
    LEFT JOIN do_cadastro       dc ON dc.k = c.team_key
   WHERE COALESCE(
           CASE WHEN c.crest_url LIKE 'http%' AND c.crest_url NOT LIKE '%/public/escudos/%'
                THEN c.crest_url END,
           mp.url, dc.url) IS NOT NULL
     AND (c.crest_espelhado_em IS NULL
          OR c.crest_origem_url IS DISTINCT FROM COALESCE(
               CASE WHEN c.crest_url LIKE 'http%' AND c.crest_url NOT LIKE '%/public/escudos/%'
                    THEN c.crest_url END,
               mp.url, dc.url))
   ORDER BY c.is_bolao_team DESC, c.canonical_name;
$$;

REVOKE ALL ON FUNCTION public.escudos_a_espelhar() FROM PUBLIC, anon, authenticated;

-- ── Roda agora ──────────────────────────────────────────────────────────────
SELECT public.apontar_cadastro_para_o_espelho();

-- ── E a cada varredura, para clube e partida novos ──────────────────────────
CREATE OR REPLACE FUNCTION public.concluir_varredura()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Primeiro a identidade: o auto-lançamento depende do pareamento, e o
  -- pareamento depende da chave. Nunca ao contrário.
  PERFORM public.reconciliar_identidades();

  -- O escudo espelhado alcança as telas que leem `matches`. Barato e
  -- idempotente: só mexe em linha que ainda aponta para fora.
  PERFORM public.apontar_cadastro_para_o_espelho();

  -- E o lançamento num bloco que engole o próprio erro. A coleta é o que não
  -- dá para refazer depois — a janela do plano gratuito é de três dias —,
  -- então uma falha aqui não pode derrubar o que já foi guardado.
  BEGIN
    PERFORM public.auto_lancar_resultados();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_lancar_resultados falhou: %', SQLERRM;
  END;
END;
$$;
