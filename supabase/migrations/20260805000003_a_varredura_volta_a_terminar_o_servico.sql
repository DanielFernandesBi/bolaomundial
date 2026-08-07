-- ============================================================================
-- Eu derrubei o lançamento automático ao consertar o horizonte da agenda.
-- ============================================================================
-- `sync_club_fixtures_recent` termina com DUAS coisas que não são coleta:
--
--   reconciliar_identidades()   -- nome -> chave -> id -> chave
--   auto_lancar_resultados()    -- o placar que a API confirma entra sozinho
--
-- Elas foram acrescentadas por migrações posteriores (000007 do dia 02 e a da
-- ordem da reconciliação, do dia 04). Ao reescrever a função para corrigir o
-- horizonte, parti da versão de `coleta_por_balde_utc`, que é anterior às
-- duas — e as apaguei sem perceber. Desde 05/08 00:28 BRT nada era lançado
-- sozinho: o resultado ficava na aba do admin esperando clique, que é
-- exatamente o sintoma relatado.
--
-- O último lançamento automático antes disso foi a volta Juventude 0x1
-- Atlético-MG, em 04/08 22:05, que avançou o chaveamento corretamente. Os dois
-- jogos retidos pela falha (Vitória 4x0 Athletico-PR e Corinthians 2x1
-- Internacional) foram lançados na aplicação desta migração, pelo próprio
-- motor e passando por todas as travas.
--
-- A causa de fundo é que esta função já foi reescrita inteira cinco vezes, e
-- cada reescrita precisa LEMBRAR de recolocar um rabicho que não tem nada a
-- ver com o assunto de quem está mexendo. Então o rabicho vira função com
-- nome: `concluir_varredura()`. Continua sendo possível esquecer uma linha,
-- mas agora é UMA linha, e o nome dela diz que a varredura não acabou sem ela.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.concluir_varredura()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Primeiro a identidade: o auto-lançamento depende do pareamento, e o
  -- pareamento depende da chave. Nunca ao contrário.
  PERFORM public.reconciliar_identidades();

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

COMMENT ON FUNCTION public.concluir_varredura() IS
  'O que toda varredura faz DEPOIS de guardar as partidas: reconcilia identidades e lança o que a API confirma. Existe como função para não ser esquecida na próxima vez que sync_club_fixtures_recent for reescrita.';

REVOKE ALL ON FUNCTION public.concluir_varredura() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_club_fixtures_recent(p_incluir_amanha boolean DEFAULT false)
RETURNS TABLE(dia date, vistos integer, guardados integer, erro text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  d DATE; r RECORD; hoje_utc DATE; dias DATE[];
  fim_brt TIMESTAMP; balde_final DATE; proximo DATE;
BEGIN
  -- O balde que contém "agora" é a data UTC de agora. Com data de Brasília,
  -- todo jogo das 21h caía no balde de amanhã.
  hoje_utc := (now() AT TIME ZONE 'utc')::date;
  dias := ARRAY[hoje_utc];

  -- Balde anterior: só quando ainda há jogo dele por encerrar. A janela de 12h
  -- evita que uma partida travada num status estranho peça esta chamada extra
  -- para sempre.
  IF EXISTS (
    SELECT 1 FROM public.club_fixtures f
     WHERE (f.kickoff_at AT TIME ZONE 'utc')::date = hoje_utc - 1
       AND f.status NOT IN ('FT','AET','PEN','PST','CANC','ABD','AWD','WO')
       AND f.kickoff_at > now() - interval '12 hours'
  ) THEN
    dias := ARRAY[hoje_utc - 1] || dias;
  END IF;

  -- ── Horizonte da agenda ──────────────────────────────────────────────────
  -- Declarado em Brasília, porque é assim que a tela pensa: ela mostra hoje e
  -- amanhã, e o último instante possível é 23:59:59 de amanhã em Brasília.
  -- Aparado pelo teto do plano free, que só entrega até hoje_utc + 1.
  IF p_incluir_amanha THEN
    fim_brt := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
               + interval '2 days' - interval '1 second';
    balde_final := LEAST(
      ((fim_brt AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'utc')::date,
      hoje_utc + 1
    );

    proximo := hoje_utc + 1;
    WHILE proximo <= balde_final LOOP
      dias := dias || proximo;
      proximo := proximo + 1;
    END LOOP;
  END IF;

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

  -- Identidade e lançamento. Uma linha, de propósito: ver o cabeçalho.
  PERFORM public.concluir_varredura();
END;
$function$;

-- `sync_se_bolao_ao_vivo()` (varredura extra dos minutos 15/35/55) delega a
-- esta função, então herda a correção sem precisar ser tocada.

-- ---------------------------------------------------------------------------
-- Verificação:
--   SELECT * FROM public.auto_lancar_resultados(true);   -- modo sombra
--   SELECT * FROM public.resultado_automatico_log ORDER BY aplicado_em DESC;
-- ---------------------------------------------------------------------------
