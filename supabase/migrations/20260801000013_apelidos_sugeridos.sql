-- ============================================================================
-- Rodada de apelidos: transformar em rotina o que era garimpo manual.
--
-- A elegibilidade exige os DOIS lados mapeados, então um nome que a
-- API-Football escreve diferente do nosso cadastro joga fora a partida
-- inteira. Foi assim que 12 dos 21 primeiros jogos encerrados sumiram — um
-- deles do Montevideo City Torque, que a API chama de "Atlético Torque".
--
-- Esta migration não adivinha apelido nenhum. Ela mede o estrago (quantos
-- jogos elegíveis cada nome desconhecido custou), propõe candidatos por
-- semelhança e marca os casos em que o candidato COM CERTEZA é outro clube.
-- Quem decide é o admin — a lição do "Santos" do Peru é que nome não é chave.
-- ============================================================================

ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- ── Nomes que não são para mapear ───────────────────────────────────────────
-- Sem isto a mesma lista reaparece para sempre: "Sport Huancayo 2" é o time B
-- e nunca vai ter apelido; "Independiente" da liga argentina é o de
-- Avellaneda, que não está entre os 384 clubes com rating Opta.
CREATE TABLE IF NOT EXISTS public.club_alias_ignored (
  alias      TEXT PRIMARY KEY,
  nome_visto TEXT NOT NULL,
  motivo     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.club_alias_ignored ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_alias_ignored_admin ON public.club_alias_ignored;
CREATE POLICY club_alias_ignored_admin ON public.club_alias_ignored
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_admin));

-- ── Re-resolução periódica ──────────────────────────────────────────────────
-- A sincronização só reprocessa a janela de três dias. Partida mais antiga que
-- isso nunca mais é revisitada, então um apelido novo não a alcançaria. Esta
-- função varre tudo que ficou com chave nula — são poucas dezenas de linhas.
CREATE OR REPLACE FUNCTION public.reresolve_fixture_keys()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE n INT;
BEGIN
  UPDATE public.club_fixtures f
     SET home_team_key = COALESCE(f.home_team_key, public.club_resolve(f.home_team_name)),
         away_team_key = COALESCE(f.away_team_key, public.club_resolve(f.away_team_name))
   WHERE f.home_team_key IS NULL OR f.away_team_key IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public.recompute_fixture_eligibility();
  RETURN n;
END;
$$;

-- Entra na rotina, e não só no clique do admin: apelido novo pode vir de
-- qualquer lugar (migration, correção manual), e partida fora da janela de
-- três dias nunca mais seria revisitada.
CREATE OR REPLACE FUNCTION public.sync_club_fixtures_recent(p_incluir_amanha boolean DEFAULT false)
RETURNS TABLE(dia date, vistos integer, guardados integer, erro text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE d DATE; r RECORD; hoje DATE; dias DATE[];
BEGIN
  hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  -- Ontem sempre entra: placar e status só ficam definitivos algum tempo
  -- depois do apito, e a janela do plano gratuito não permite voltar depois.
  dias := ARRAY[hoje - 1, hoje];
  IF p_incluir_amanha THEN dias := dias || (hoje + 1); END IF;

  FOREACH d IN ARRAY dias
  LOOP
    BEGIN
      SELECT * INTO r FROM public.sync_club_fixtures(d);
      dia := d; vistos := r.vistos; guardados := r.guardados; erro := NULL;
    EXCEPTION WHEN OTHERS THEN
      dia := d; vistos := NULL; guardados := NULL; erro := SQLERRM;
    END;
    RETURN NEXT;
  END LOOP;

  PERFORM public.pin_provider_ids();
  PERFORM public.reresolve_fixture_keys();
END;
$function$;

-- ── A lista de trabalho ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apelidos_sugeridos(p_limite INT DEFAULT 40)
RETURNS TABLE (
  nome_api       TEXT,
  provider_id    BIGINT,
  ocorrencias    INT,
  jogos_perdidos INT,
  ligas          TEXT,
  candidatos     JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH faltantes AS (
    SELECT f.home_team_name AS nome, f.home_provider_id AS pid, f.league_id, f.status
      FROM public.club_fixtures f WHERE f.home_team_key IS NULL AND f.home_team_name IS NOT NULL
    UNION ALL
    SELECT f.away_team_name, f.away_provider_id, f.league_id, f.status
      FROM public.club_fixtures f WHERE f.away_team_key IS NULL AND f.away_team_name IS NOT NULL
  ),
  util AS (
    SELECT n.nome, n.pid,
           count(*)::INT AS ocorrencias,
           -- Só conta como prejuízo o jogo que VIRARIA evidência: encerrado e
           -- em competição com peso. Amistoso e liga não cadastrada não custam
           -- nada, e não devem subir na fila de trabalho.
           count(*) FILTER (
             WHERE n.status IN ('FT','AET','PEN') AND COALESCE(w.model_weight, 0) > 0
           )::INT AS jogos_perdidos,
           string_agg(DISTINCT COALESCE(w.league_name, 'liga ' || n.league_id::TEXT), ', ') AS ligas
      FROM faltantes n
      LEFT JOIN public.club_competition_weights w ON w.league_id = n.league_id
     WHERE public.club_resolve(n.nome) IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.club_alias_ignored i
          WHERE i.alias = public.club_key_normalize(n.nome)
       )
     GROUP BY n.nome, n.pid
  )
  SELECT u.nome, u.pid, u.ocorrencias, u.jogos_perdidos, u.ligas, c.candidatos
    FROM util u
    JOIN LATERAL (
      SELECT jsonb_agg(x ORDER BY (x->>'similaridade')::NUMERIC DESC) AS candidatos
        FROM (
          SELECT jsonb_build_object(
                   'team_key', s.team_key,
                   'nome', s.canonical_name,
                   'similaridade', round(extensions.similarity(
                     public.club_key_normalize(s.canonical_name),
                     public.club_key_normalize(u.nome))::NUMERIC, 2),
                   -- O clube candidato já tem ID fixado na API e é OUTRO ID:
                   -- então este nome é de um clube diferente com nome parecido.
                   -- É exatamente o caso "Santos" do Brasil x "Santos" do Peru.
                   'id_conflitante', (s.api_football_id IS NOT NULL
                                      AND u.pid IS NOT NULL
                                      AND s.api_football_id <> u.pid)
                 ) AS x
            FROM public.club_source_ids s
           ORDER BY extensions.similarity(
                      public.club_key_normalize(s.canonical_name),
                      public.club_key_normalize(u.nome)) DESC
           LIMIT 3
        ) t
       WHERE (x->>'similaridade')::NUMERIC >= 0.30
    ) c ON c.candidatos IS NOT NULL
   ORDER BY u.jogos_perdidos DESC, u.ocorrencias DESC, u.nome
   LIMIT p_limite;
$$;

REVOKE ALL ON FUNCTION public.apelidos_sugeridos(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apelidos_sugeridos(INT) TO authenticated;

COMMENT ON FUNCTION public.apelidos_sugeridos(INT) IS
  'Nomes que a API-Football usa e o nosso mapa não conhece, ordenados pelo prejuízo (jogos elegíveis descartados), com até 3 candidatos por semelhança.';

-- ── Aplicar / ignorar ───────────────────────────────────────────────────────
-- A trava de admin fica DENTRO da função: a RPC é chamável por qualquer
-- autenticado, e a checagem na server action é só para dar erro legível.
CREATE OR REPLACE FUNCTION public.aplicar_apelido(p_nome TEXT, p_team_key TEXT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_alias TEXT; v_afetados INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_admin) THEN
    RAISE EXCEPTION 'Apenas administradores podem mapear clubes.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.club_source_ids s WHERE s.team_key = p_team_key) THEN
    RAISE EXCEPTION 'Clube desconhecido: %', p_team_key;
  END IF;

  v_alias := public.club_key_normalize(p_nome);
  IF v_alias IS NULL OR v_alias = '' THEN
    RAISE EXCEPTION 'Nome vazio.';
  END IF;

  INSERT INTO public.club_aliases (alias, team_key, origem)
  VALUES (v_alias, p_team_key, 'provider')
  ON CONFLICT (alias) DO UPDATE SET team_key = EXCLUDED.team_key;

  DELETE FROM public.club_alias_ignored WHERE alias = v_alias;

  -- Reprocessa: o apelido novo não vale nada se as partidas antigas
  -- continuarem com a chave nula.
  SELECT public.reresolve_fixture_keys() INTO v_afetados;
  PERFORM public.pin_provider_ids();
  RETURN v_afetados;
END;
$$;

CREATE OR REPLACE FUNCTION public.ignorar_apelido(p_nome TEXT, p_motivo TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_admin) THEN
    RAISE EXCEPTION 'Apenas administradores podem ignorar nomes.';
  END IF;
  INSERT INTO public.club_alias_ignored (alias, nome_visto, motivo)
  VALUES (public.club_key_normalize(p_nome), p_nome, p_motivo)
  ON CONFLICT (alias) DO UPDATE SET motivo = EXCLUDED.motivo;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_apelido(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ignorar_apelido(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aplicar_apelido(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ignorar_apelido(TEXT, TEXT) TO authenticated;
