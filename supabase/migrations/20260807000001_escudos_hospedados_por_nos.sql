-- ============================================================================
-- Parar de linkar escudo para fora.
-- ============================================================================
-- MEDIDO em 07/08, 04:10 BRT: a tela de Projeção mostrava 8 dos 16 escudos e a
-- de Resultados, 2 de 10 — inclusive os do Wikipedia, que até então nunca
-- tinham falhado. Todas as URLs, pedidas do servidor no mesmo minuto,
-- devolveram 200 e o arquivo íntegro.
--
-- Ou seja: o arquivo existe, o link está certo, e mesmo assim a imagem não
-- chega. Toda visita ao app dependia de dois hosts que não são nossos
-- (media.api-sports.io e upload.wikimedia.org) responderem a dezenas de
-- requisições do aparelho do jogador. `loading="lazy"` e o placeholder de
-- reserva atacaram o SINTOMA — a tela não mostra mais ícone quebrado —, mas a
-- dependência continuava de pé.
--
-- A correção definitiva é de posse: o escudo passa a ser NOSSO arquivo. Baixado
-- uma vez, guardado no Storage, servido com cache de um ano. A API e o
-- Wikipedia deixam de ser dependência de cada visita e viram o que sempre
-- deveriam ter sido — a ORIGEM, consultada uma vez.
--
-- Tamanho: ~400 clubes a ~30KB dá ~12MB, contra 1GB do plano.
-- ============================================================================

-- ── Bucket público, como o de avatares ──────────────────────────────────────
-- Público porque escudo de clube não é dado de ninguém: é a mesma imagem para
-- todo mundo, e URL assinada só acrescentaria latência e complexidade.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('escudos', 'escudos', true, 2097152,
        ARRAY['image/png','image/jpeg','image/webp','image/svg+xml','image/gif'])
ON CONFLICT (id) DO UPDATE
   SET public = true,
       file_size_limit = EXCLUDED.file_size_limit,
       allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura para qualquer um; escrita só pelo service role (a Edge Function),
-- que não passa por RLS. Ninguém logado precisa gravar aqui.
DROP POLICY IF EXISTS "Escudos sao publicos para leitura" ON storage.objects;
CREATE POLICY "Escudos sao publicos para leitura"
  ON storage.objects FOR SELECT USING (bucket_id = 'escudos');

-- ── De onde veio o arquivo ──────────────────────────────────────────────────
-- `crest_url` passa a ser SEMPRE o nosso endereço. A origem fica guardada aqui
-- para três coisas: saber a procedência, refazer o espelho se o arquivo se
-- perder, e detectar quando a fonte troca o escudo do clube.
ALTER TABLE public.club_source_ids
  ADD COLUMN IF NOT EXISTS crest_origem_url TEXT,
  ADD COLUMN IF NOT EXISTS crest_espelhado_em TIMESTAMPTZ;

COMMENT ON COLUMN public.club_source_ids.crest_url IS
  'Endereço do escudo COMO O APP SERVE — depois do espelho, sempre o nosso Storage. Nunca um host de terceiro.';
COMMENT ON COLUMN public.club_source_ids.crest_origem_url IS
  'De onde o arquivo foi baixado (API-Football, Wikipedia). Serve para refazer o espelho e para notar quando a fonte troca o escudo.';

-- A função `escudos_a_espelhar()` nasce aqui e é reescrita duas vezes nas
-- migrações seguintes (o cadastro deixa de se autoalimentar, e a origem passa
-- a vir de pin_crest_urls). A versão final é a de 20260807000003.
CREATE OR REPLACE FUNCTION public.escudos_a_espelhar()
RETURNS TABLE (team_key TEXT, origem TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH da_partida AS (
    SELECT f.home_team_key AS k, f.home_crest_url AS url, f.kickoff_at FROM public.club_fixtures f
     WHERE f.home_team_key IS NOT NULL AND f.home_crest_url LIKE 'http%'
    UNION ALL
    SELECT f.away_team_key, f.away_crest_url, f.kickoff_at FROM public.club_fixtures f
     WHERE f.away_team_key IS NOT NULL AND f.away_crest_url LIKE 'http%'
  ),
  melhor_da_partida AS (
    SELECT DISTINCT ON (k) k, url FROM da_partida ORDER BY k, kickoff_at DESC
  ),
  do_cadastro AS (
    SELECT public.club_resolve(t.nome) AS k, min(t.url) AS url
      FROM (SELECT team_home AS nome, home_iso AS url FROM public.matches WHERE home_iso LIKE 'http%'
            UNION ALL
            SELECT team_away, away_iso FROM public.matches WHERE away_iso LIKE 'http%') t
     WHERE public.club_resolve(t.nome) IS NOT NULL
     GROUP BY 1
  )
  SELECT c.team_key,
         COALESCE(
           CASE WHEN c.crest_url LIKE 'http%' AND c.crest_url NOT LIKE '%/storage/v1/object/public/escudos/%'
                THEN c.crest_url END,
           mp.url,
           dc.url
         ) AS origem
    FROM public.club_source_ids c
    LEFT JOIN melhor_da_partida mp ON mp.k = c.team_key
    LEFT JOIN do_cadastro       dc ON dc.k = c.team_key
   WHERE COALESCE(
           CASE WHEN c.crest_url LIKE 'http%' AND c.crest_url NOT LIKE '%/storage/v1/object/public/escudos/%'
                THEN c.crest_url END,
           mp.url, dc.url) IS NOT NULL
     AND (c.crest_espelhado_em IS NULL
          OR c.crest_origem_url IS DISTINCT FROM COALESCE(
               CASE WHEN c.crest_url LIKE 'http%' AND c.crest_url NOT LIKE '%/storage/v1/object/public/escudos/%'
                    THEN c.crest_url END,
               mp.url, dc.url))
   ORDER BY c.is_bolao_team DESC, c.canonical_name;
$$;

COMMENT ON FUNCTION public.escudos_a_espelhar() IS
  'Clubes cujo escudo ainda não foi baixado para o nosso Storage, com a URL de origem. Consumida pela Edge Function espelhar-escudos.';

REVOKE ALL ON FUNCTION public.escudos_a_espelhar() FROM PUBLIC, anon, authenticated;
