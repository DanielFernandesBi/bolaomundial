-- ============================================================================
-- A agenda enxergava um balde à frente — e a tela mostra dois dias.
-- ============================================================================
-- MEDIDO em 05/08/2026, 00:24 BRT. A Copa do Brasil tinha 4 jogos no dia e a
-- tela mostrava 2. Os outros dois (21:30) e os dois de amanhã (20:00) estavam
-- todos no MESMO balde UTC — 2026-08-06 —, que não existia no banco:
--
--   balde 2026-08-05  ->  04/08 21:00 BRT ... 05/08 20:30 BRT   (tinha)
--   balde 2026-08-06  ->  05/08 21:00 BRT ... 06/08 20:30 BRT   (faltava)
--   balde 2026-08-07  ->  06/08 21:00 BRT ... 07/08 20:30 BRT   (faltava)
--
-- A causa é de UNIDADE, não de horário: a agenda pedia `hoje_utc + 1`, e um
-- balde UTC não é um dia de Brasília. Como o balde vira às 21:00 BRT, "um à
-- frente" nem termina o dia de HOJE — os jogos das 21:30 já são do próximo.
-- Cobrir até o fim de AMANHÃ exige, antes das 21:00, dois baldes à frente.
--
-- A correção é declarar o horizonte no fuso em que a tela pensa: "até o último
-- instante de amanhã em Brasília". A conversão desse instante para UTC diz
-- sozinha quantos baldes são — dois antes das 21:00 BRT, um depois —, sem
-- número mágico e sem depender da hora em que o cron rodar.
--
-- E a agenda passa a rodar 4×/dia, uma delas EXATAMENTE à meia-noite de
-- Brasília: é quando "amanhã" avança um dia e o horizonte precisa de um balde
-- novo. Era essa a hora em que a falha apareceu.
--
-- Custo: 1 a 2 chamadas por execução (o balde corrente já é da varredura de 20
-- em 20 minutos), 4 execuções = 4 a 8 por dia. O pico medido foi 55 de 100.
--
-- NOTA: a migração seguinte (20260805000002) apara este horizonte pelo teto do
-- plano free, descoberto ao rodar isto aqui. Leia as duas juntas.
-- ============================================================================

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

  -- ── Horizonte da agenda, medido em Brasília ──────────────────────────────
  -- A tela de resultados mostra hoje e amanhã. O último instante que ela pode
  -- exibir é 23:59:59 de amanhã em Brasília; o balde que contém esse instante
  -- é o último que precisa existir. Antes das 21:00 BRT são dois baldes à
  -- frente; depois, um. A conta se ajusta sozinha.
  IF p_incluir_amanha THEN
    fim_brt := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
               + interval '2 days' - interval '1 second';
    balde_final := ((fim_brt AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'utc')::date;

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

  -- Ordem: fixar id -> reresolver (que recomputa) -> escudo -> catálogo.
  PERFORM public.pin_provider_ids();
  PERFORM public.reresolve_fixture_keys();
  PERFORM public.pin_crest_urls();
  PERFORM public.registra_provider_teams();
END;
$function$;

-- ── Cadência da agenda: 00h, 06h, 12h e 18h de Brasília ─────────────────────
-- A das 00h não é enfeite: é à meia-noite de Brasília que "amanhã" vira outro
-- dia e o horizonte passa a exigir um balde que ainda não foi pedido. Era
-- exatamente aí que a agenda de uma vez ao dia deixava a tela sem os jogos.
SELECT cron.unschedule('sync-club-fixtures-agenda');
SELECT cron.schedule('sync-club-fixtures-agenda', '0 3,9,15,21 * * *',
                     $c$SELECT public.sync_club_fixtures_recent(true)$c$);

-- ---------------------------------------------------------------------------
-- Verificação:
--   SELECT * FROM public.sync_club_fixtures_recent(true);
--   -- e os dois dias completos, em Brasília:
--   SELECT (kickoff_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
--          count(*) FROM public.club_fixtures
--    WHERE kickoff_at >= now() GROUP BY 1 ORDER BY 1;
-- ---------------------------------------------------------------------------
