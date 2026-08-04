-- ============================================================================
-- A ordem estava invertida: o pino nasce da chave, não o contrário.
-- ============================================================================
-- Ao corrigir o caso do Athletico-PR, o apelido resolveu o pareamento mas o
-- `api_football_id` continuou NULO — e sem id fixado o clube segue dependendo
-- só do nome, que é justamente o que falhou.
--
-- A causa é a sequência, que eu tinha deixado assim:
--
--     pin_provider_ids()      -- procura ids nas partidas JÁ com chave
--     reresolve_fixture_keys() -- só agora atribui as chaves novas
--
-- Quando o pino roda, o apelido recém-criado ainda não foi aplicado às
-- partidas: elas continuam com `team_key` nulo, e o pino não tem de onde tirar
-- o id. Depois a reresolução preenche a chave — tarde demais, porque o pino já
-- passou. O id só apareceria na varredura seguinte.
--
-- A dependência real é: NOME -> CHAVE -> ID. E, com `club_resolve_id` tentando
-- o id antes do nome, vale também o caminho de volta: ID -> CHAVE, para as
-- partidas em que a API escreveu o nome de outro jeito.
--
-- Daí a sequência correta ter três passos, e não dois:
--
--     reresolve  -- nome -> chave (usa os apelidos novos)
--     pin        -- chave -> id   (agora há de onde tirar)
--     reresolve  -- id -> chave   (pega o que o nome não pegaria)
--
-- Dois passes convergem: o segundo só muda algo se o primeiro tiver revelado
-- um id novo, e um id novo não cria outro id.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reconciliar_identidades()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM public.reresolve_fixture_keys();  -- nome -> chave
  PERFORM public.pin_provider_ids();        -- chave -> id
  PERFORM public.reresolve_fixture_keys();  -- id -> chave (e recomputa a elegibilidade)
  PERFORM public.pin_crest_urls();
  PERFORM public.registra_provider_teams();
END;
$$;

COMMENT ON FUNCTION public.reconciliar_identidades() IS
  'Sequência única de reconciliação: nome -> chave -> id -> chave. A ordem importa: o pino nasce da chave, então reresolver antes é o que permite fixar o id.';

REVOKE ALL ON FUNCTION public.reconciliar_identidades() FROM PUBLIC, anon, authenticated;

-- ── Quem chamava a sequência à mão passa a chamar a função ──────────────────
CREATE OR REPLACE FUNCTION public.aplicar_apelido(p_nome text, p_team_key text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
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

  SELECT public.reresolve_fixture_keys() INTO v_afetados;
  PERFORM public.reconciliar_identidades();
  RETURN v_afetados;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_club_fixtures_recent(p_incluir_amanha boolean DEFAULT false)
RETURNS TABLE(dia date, vistos integer, guardados integer, erro text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE d DATE; r RECORD; hoje_utc DATE; dias DATE[];
BEGIN
  hoje_utc := (now() AT TIME ZONE 'utc')::date;
  dias := ARRAY[hoje_utc];

  IF EXISTS (
    SELECT 1 FROM public.club_fixtures f
     WHERE (f.kickoff_at AT TIME ZONE 'utc')::date = hoje_utc - 1
       AND f.status NOT IN ('FT','AET','PEN','PST','CANC','ABD','AWD','WO')
       AND f.kickoff_at > now() - interval '12 hours'
  ) THEN
    dias := ARRAY[hoje_utc - 1] || dias;
  END IF;

  IF p_incluir_amanha THEN dias := dias || (hoje_utc + 1); END IF;

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

  PERFORM public.reconciliar_identidades();

  -- Depois da identidade estar resolvida, nunca antes: o auto-lançamento
  -- depende do pareamento, e o pareamento depende da chave.
  BEGIN
    PERFORM public.auto_lancar_resultados();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto_lancar_resultados falhou: %', SQLERRM;
  END;
END;
$function$;

SELECT public.reconciliar_identidades();

-- ---------------------------------------------------------------------------
-- Verificação: o Athletico-PR deve passar a ter id fixado.
--   SELECT team_key, api_football_id FROM public.club_source_ids
--    WHERE team_key IN ('athletico pr','ldu quito','recoleta','universidad catolica',
--                       'independiente rivadavia');
-- ---------------------------------------------------------------------------
