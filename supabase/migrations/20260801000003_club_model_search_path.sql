-- ============================================================================
-- search_path fixo nas duas funções do modelo de clubes.
--
-- Sem isto, quem chama pode alterar o search_path e fazer a função enxergar
-- outra tabela com o mesmo nome. Ambas já usam nomes qualificados
-- (public.club_aliases, public.club_source_ids) e, fora isso, só funções de
-- pg_catalog — então search_path vazio basta.
--
-- Apontado pelo linter do Supabase (0011_function_search_path_mutable).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.club_key_normalize(p_nome TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        translate(
          lower(COALESCE(p_nome, '')),
          'áàâãäéèêëíìîïóòôõöúùûüçñý',
          'aaaaaeeeeiiiiooooouuuucny'
        ),
        '[^a-z0-9]+', ' ', 'g'
      )
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.club_resolve(p_nome TEXT)
RETURNS TEXT LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT a.team_key FROM public.club_aliases a
      WHERE a.alias = public.club_key_normalize(p_nome)),
    (SELECT c.team_key FROM public.club_source_ids c
      WHERE c.team_key = public.club_key_normalize(p_nome))
  );
$$;
