-- ============================================================================
-- Lacre do dia: um número curto, para ancorar a trilha FORA daqui.
-- ============================================================================
-- A corrente de hashes prova que nenhuma linha existente foi mexida. Ela não
-- prova nada contra quem pode reescrever a corrente inteira — quem controla o
-- servidor recalcula tudo e o lacre novo fecha certinho.
--
-- O que quebra esse laço é ter, do lado de fora, o lacre de uma data. Se o
-- lacre publicado no grupo em 07/08 não bate com o que o sistema recalcula
-- depois para aquela data, a história foi reescrita — e o carimbo de hora
-- daquela mensagem no grupo não é nosso, está no celular de todo mundo.
--
-- Esta tabela guarda o lacre de cada dia para haver o que comparar. Ela mora
-- aqui e portanto também é nossa; o valor não está nela, está na cópia que sai
-- daqui. Ela existe para que sair daqui seja um toque, não uma consulta.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trilha_lacre_diario (
  dia        DATE PRIMARY KEY,
  linhas     BIGINT      NOT NULL,
  lacre      TEXT        NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.trilha_lacre_diario IS
  'Lacre da trilha ao fim de cada dia. Serve para ser PUBLICADO fora do sistema — é a cópia externa que dá valor ao registro, não esta tabela.';

ALTER TABLE public.trilha_lacre_diario ENABLE ROW LEVEL SECURITY;

-- Todo mundo lê: um lacre só serve se puder ser conferido por qualquer um.
DROP POLICY IF EXISTS "Lacres sao publicos" ON public.trilha_lacre_diario;
CREATE POLICY "Lacres sao publicos" ON public.trilha_lacre_diario
  FOR SELECT TO authenticated, anon USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.trilha_lacre_diario FROM authenticated, anon;

-- Mesma proteção da trilha: o lacre de ontem não se corrige.
CREATE OR REPLACE FUNCTION public.lacre_nao_se_reescreve()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'O lacre publicado não se altera: % foi recusado.', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_lacre_nao_se_reescreve ON public.trilha_lacre_diario;
CREATE TRIGGER trg_lacre_nao_se_reescreve
  BEFORE UPDATE OR DELETE ON public.trilha_lacre_diario
  FOR EACH STATEMENT EXECUTE FUNCTION public.lacre_nao_se_reescreve();

CREATE OR REPLACE FUNCTION public.publicar_lacre_do_dia()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE r RECORD; v_dia DATE;
BEGIN
  v_dia := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  IF EXISTS (SELECT 1 FROM public.trilha_lacre_diario t WHERE t.dia = v_dia) THEN
    RETURN 'lacre de ' || v_dia || ' já publicado';
  END IF;

  SELECT * INTO r FROM public.conferir_trilha();

  -- Trilha quebrada não vira lacre: publicar um lacre de história adulterada
  -- daria aparência de normalidade justamente no dia em que algo aconteceu.
  IF NOT r.intacta THEN
    RAISE WARNING 'Trilha quebrada na linha %: lacre do dia NÃO publicado', r.primeira_quebra;
    RETURN 'trilha quebrada na linha ' || r.primeira_quebra;
  END IF;

  INSERT INTO public.trilha_lacre_diario (dia, linhas, lacre)
  VALUES (v_dia, r.linhas, r.lacre);

  RETURN format('%s · %s registros · lacre %s', v_dia, r.linhas, r.lacre);
END;
$$;

COMMENT ON FUNCTION public.publicar_lacre_do_dia() IS
  'Grava o lacre da trilha do dia. Recusa publicar se a corrente estiver quebrada — um lacre publicado no dia da adulteração daria aparência de normalidade.';

REVOKE ALL ON FUNCTION public.publicar_lacre_do_dia() FROM PUBLIC, anon, authenticated;

-- 02:50 BRT (05:50 UTC): depois do último jogo da noite e antes de o dia
-- seguinte começar a gravar palpite.
SELECT cron.schedule('publicar-lacre-diario', '50 5 * * *',
                     $c$SELECT public.publicar_lacre_do_dia()$c$);

-- O de hoje, para já haver o que publicar.
SELECT public.publicar_lacre_do_dia();
