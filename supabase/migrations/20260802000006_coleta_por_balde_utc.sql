-- ============================================================================
-- A varredura buscava o dia errado — e por isso os jogos das 21h só chegavam
-- depois da meia-noite.
-- ============================================================================
-- MEDIDO nos payloads em cache: a API-Football agrupa as partidas por data
-- **UTC**. Cada balde vai de 21:00 BRT do dia anterior até 20:30 BRT do dia:
--
--   /fixtures?date=2026-08-01  ->  31/07 21:00 BRT  ...  01/08 20:30 BRT
--   /fixtures?date=2026-08-02  ->  01/08 21:00 BRT  ...  02/08 20:30 BRT
--
-- Conferido partida a partida: Vasco × Fluminense (01/08, 17:30 BRT) está em
-- `date=2026-08-01`; Santos × Remo (01/08, 21:00 BRT) está em `date=2026-08-02`.
--
-- A função pedia `[ontem, hoje]` em data de BRASÍLIA. Às 22h de 01/08 ela pedia
-- 31/07 e 01/08 — e nenhum dos dois contém o Santos × Remo. Aquele jogo só
-- seria coletado à 01:00, quando "hoje" virasse 02/08: mais de duas horas
-- depois do apito, no horário mais comum do futebol brasileiro.
--
-- A CORREÇÃO é de fuso, não de horário do cron: o balde que contém "agora" é
-- simplesmente a data UTC de agora.
--
-- E o balde ANTERIOR passa a ser pedido só quando ainda há jogo dele por
-- encerrar — uma partida que começa 20:30 BRT termina já dentro do balde
-- seguinte. Essa checagem é local e não custa chamada; é ela que paga a
-- cadência de 20 em 20 minutos sem estourar a cota de 100/dia.
-- ============================================================================

-- ── Quando vimos esta partida encerrada pela primeira vez ───────────────────
-- Serve à confirmação do auto-lançamento: a perna que decide o confronto só é
-- lançada sozinha depois de uma varredura de carência, porque avançar o
-- chaveamento é o passo que não se desfaz.
ALTER TABLE public.club_fixtures
  ADD COLUMN IF NOT EXISTS finalizado_visto_em TIMESTAMPTZ;

COMMENT ON COLUMN public.club_fixtures.finalizado_visto_em IS
  'Instante da PRIMEIRA vez que a partida apareceu encerrada (FT/AET/PEN). Zerado se ela voltar a não estar. Base da carência do auto-lançamento.';

CREATE OR REPLACE FUNCTION public.marca_finalizado_visto()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('FT','AET','PEN') THEN
    -- Mantém o primeiro instante; só nasce agora se ainda não existia.
    NEW.finalizado_visto_em := COALESCE(
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.finalizado_visto_em END,
      NEW.finalizado_visto_em,
      now());
  ELSE
    -- Deixou de estar encerrada (correção do fornecedor): a carência recomeça.
    NEW.finalizado_visto_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marca_finalizado_visto ON public.club_fixtures;
CREATE TRIGGER trg_marca_finalizado_visto
  BEFORE INSERT OR UPDATE ON public.club_fixtures
  FOR EACH ROW EXECUTE FUNCTION public.marca_finalizado_visto();

-- Retroativo: o que já está encerrado herda o instante da última sincronização.
UPDATE public.club_fixtures
   SET finalizado_visto_em = synced_at
 WHERE status IN ('FT','AET','PEN') AND finalizado_visto_em IS NULL;

-- ── A varredura, agora no balde certo ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_club_fixtures_recent(p_incluir_amanha boolean DEFAULT false)
RETURNS TABLE(dia date, vistos integer, guardados integer, erro text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE d DATE; r RECORD; hoje_utc DATE; dias DATE[];
BEGIN
  -- O balde que contém "agora" é a data UTC de agora. Ver o cabeçalho: com
  -- data de Brasília, todo jogo das 21h caía no balde de amanhã.
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

  -- Agenda do dia seguinte: uma vez por dia basta, para conhecer os horários.
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

  -- Ordem: fixar id -> reresolver (que recomputa) -> escudo -> catálogo.
  PERFORM public.pin_provider_ids();
  PERFORM public.reresolve_fixture_keys();
  PERFORM public.pin_crest_urls();
  PERFORM public.registra_provider_teams();
END;
$function$;

-- ── Cadência: de 20 em 20 minutos, nos minutos 05/25/45 ─────────────────────
-- Os jogos começam em hora cheia; somando 90 minutos, intervalo e acréscimos,
-- o apito cai poucos minutos DEPOIS da hora seguinte. Varrer em :00 fazia o
-- resultado esperar quase o ciclo inteiro.
--
-- Cota: janela de 13 horas (14h–02h BRT = 17h–05h UTC) × 3 varreduras = 39, a
-- 1 chamada cada na maioria das vezes (o balde anterior é condicional), mais a
-- agenda diária. Fica em torno de 50 das 100 diárias.
SELECT cron.unschedule('sync-club-fixtures-janela');
SELECT cron.unschedule('sync-club-fixtures-agenda');

SELECT cron.schedule('sync-club-fixtures-janela', '5,25,45 17-23,0-5 * * *',
                     $c$SELECT public.sync_club_fixtures_recent(false)$c$);
SELECT cron.schedule('sync-club-fixtures-agenda', '0 12 * * *',
                     $c$SELECT public.sync_club_fixtures_recent(true)$c$);

-- ---------------------------------------------------------------------------
-- Verificação:
--   SELECT jobname, schedule FROM cron.job;
--   -- e, depois da próxima varredura noturna, um jogo de 21h deve aparecer
--   -- ainda na mesma noite:
--   SELECT provider_fixture_id, kickoff_at AT TIME ZONE 'America/Sao_Paulo',
--          status, synced_at AT TIME ZONE 'America/Sao_Paulo'
--     FROM public.club_fixtures
--    WHERE kickoff_at::time >= '23:30' ORDER BY kickoff_at DESC LIMIT 5;
-- ---------------------------------------------------------------------------
