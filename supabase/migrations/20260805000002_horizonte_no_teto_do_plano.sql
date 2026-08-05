-- ============================================================================
-- O horizonte certo esbarrou no teto do plano — e o teto é de um balde.
-- ============================================================================
-- MEDIDO ao rodar a agenda com o horizonte de dois dias de Brasília:
--
--   dia 2026-08-05  ->  225 vistos, 20 guardados
--   dia 2026-08-06  ->  143 vistos, 63 guardados
--   dia 2026-08-07  ->  "Free plans do not have access to this date,
--                        try from 2026-08-04 to 2026-08-06"
--
-- Ou seja: o plano free só entrega a janela [hoje_utc-1, hoje_utc+1]. Pedir o
-- balde seguinte não é caro — é impossível. Aqui isso virava uma linha de erro
-- por execução, quatro vezes ao dia, poluindo o log com uma falha que não é
-- falha.
--
-- O horizonte continua declarado em Brasília, que é como a tela pensa; o que
-- muda é que ele passa a ser aparado pelo teto do provedor. A consequência
-- honesta, que a tela herda: os jogos de amanhã DEPOIS das 20:30 BRT só ficam
-- conhecidos a partir das 21:00 BRT de hoje, quando o balde deles destrava.
--
-- Daí a execução das 21:00 BRT (00:00 UTC) na cadência: é o minuto exato em
-- que o balde novo passa a existir para o plano.
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

  -- ── Horizonte da agenda ──────────────────────────────────────────────────
  -- Declarado em Brasília, porque é assim que a tela pensa: ela mostra hoje e
  -- amanhã, e o último instante possível é 23:59:59 de amanhã em Brasília. O
  -- balde que contém esse instante é o último que precisaria existir.
  --
  -- E aparado pelo teto do plano free, que só entrega até hoje_utc + 1. Sem o
  -- LEAST isto vira uma chamada recusada por execução — barulho de log para
  -- pedir o que o provedor não tem.
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

  -- Ordem: fixar id -> reresolver (que recomputa) -> escudo -> catálogo.
  PERFORM public.pin_provider_ids();
  PERFORM public.reresolve_fixture_keys();
  PERFORM public.pin_crest_urls();
  PERFORM public.registra_provider_teams();
END;
$function$;

-- ── Cadência: 21h, 00h, 06h, 12h e 18h de Brasília ──────────────────────────
-- Duas das cinco não são enfeite:
--   21:00 BRT (00:00 UTC) — o balde de amanhã à noite destrava neste minuto;
--   00:00 BRT (03:00 UTC) — "amanhã" vira outro dia e o horizonte anda.
-- As outras três só mantêm a agenda fresca durante o dia.
-- Uma chamada por execução (o balde corrente já é da varredura de 20 em 20
-- minutos): 5 por dia, sobre um pico medido de 55 das 100 diárias.
SELECT cron.unschedule('sync-club-fixtures-agenda');
SELECT cron.schedule('sync-club-fixtures-agenda', '0 0,3,9,15,21 * * *',
                     $c$SELECT public.sync_club_fixtures_recent(true)$c$);

-- ---------------------------------------------------------------------------
-- Verificação (05/08/2026, 00:29 BRT — os 4 jogos do dia e os 2 de amanhã):
--   SELECT (kickoff_at AT TIME ZONE 'America/Sao_Paulo'), home_team_name,
--          away_team_name FROM public.club_fixtures
--    WHERE league_id = 73 AND kickoff_at >= now() ORDER BY kickoff_at;
-- ---------------------------------------------------------------------------
