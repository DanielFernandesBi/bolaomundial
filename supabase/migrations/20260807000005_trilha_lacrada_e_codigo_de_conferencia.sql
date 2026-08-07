-- ============================================================================
-- O jogador precisa poder provar o próprio palpite — para si mesmo.
-- ============================================================================
-- A transparência foi feita para provar que o ADMIN não mexe: uma vez público,
-- mexer seria visto por todos. Mas a queixa que apareceu é outra, e mais
-- difícil: "eu apostei 2x1 e na transparência apareceu 2x2".
--
-- Ninguém está mentindo. A pessoa acredita mesmo. E contra a memória de alguém
-- não adianta afirmar que o banco não erra — afirmação nossa é exatamente o
-- que está em dúvida. Só resolve prova que o próprio jogador possa conferir.
--
-- Os dados já existem: a trilha de auditoria (01/08) grava toda gravação e
-- toda alteração, com antes, depois e horário. Nos 11 UPDATEs registrados até
-- agora, gente REALMENTE trocou de palpite — inclusive três que mudaram só o
-- vencedor dos pênaltis, mantendo o placar. É o tipo de alteração que se
-- esquece com facilidade.
--
-- O que faltava é de posse e de conferência, não de dado:
--
--   1. LACRE — a trilha vira encadeada: cada linha carrega o hash da anterior.
--      Sem isso a trilha prova pouco, porque uma trilha que pode ser reescrita
--      não é prova de nada. Agora reescrever uma linha antiga quebra todas as
--      seguintes, e `conferir_trilha()` mostra exatamente onde.
--
--   2. CÓDIGO DE CONFERÊNCIA — oito caracteres derivados dos palpites do
--      jogador (ver a migração seguinte). Se um único número mudar, o código
--      muda. É o que transforma "conferir 36 placares" em "comparar um código".
--
-- O código é o que fecha a lógica: o jogador guarda o comprovante (no grupo do
-- WhatsApp, no rolo da câmera) no momento em que aposta. Depois, se duvidar,
-- compara o código de então com o de agora. Iguais, nada mudou — e a
-- verificação não passa por acreditar em nós, passa pelo que ele mesmo tem na
-- mão.
-- ============================================================================

-- ── 1. Lacre encadeado ──────────────────────────────────────────────────────
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS hash_anterior TEXT,
  ADD COLUMN IF NOT EXISTS hash          TEXT;

COMMENT ON COLUMN public.audit_log.hash IS
  'sha256 do conteúdo desta linha somado ao hash da anterior. Encadeia a trilha: alterar ou apagar uma linha antiga invalida todas as posteriores.';

-- Conteúdo canônico de uma linha. jsonb::text já sai com chaves ordenadas.
CREATE OR REPLACE FUNCTION public.audit_conteudo(
  p_occurred_at TIMESTAMPTZ, p_actor UUID, p_entidade TEXT,
  p_operacao TEXT, p_registro JSONB, p_antes JSONB, p_depois JSONB)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT concat_ws('|',
    to_char(p_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    COALESCE(p_actor::text, ''), p_entidade, p_operacao,
    p_registro::text, COALESCE(p_antes::text, ''), COALESCE(p_depois::text, ''));
$$;

CREATE OR REPLACE FUNCTION public.lacra_auditoria()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_anterior TEXT;
BEGIN
  SELECT a.hash INTO v_anterior FROM public.audit_log a ORDER BY a.id DESC LIMIT 1;
  NEW.hash_anterior := COALESCE(v_anterior, 'genese');
  NEW.hash := encode(sha256(convert_to(
    NEW.hash_anterior || '|' || public.audit_conteudo(
      NEW.occurred_at, NEW.actor_id, NEW.entidade, NEW.operacao,
      NEW.registro, NEW.antes, NEW.depois), 'UTF8')), 'hex');
  RETURN NEW;
END;
$$;

-- ── Fecha a corrente sobre o que já está lá ────────────────────────────────
-- Antes de proibir escrita, senão o próprio backfill seria barrado.
DO $$
DECLARE r RECORD; v_anterior TEXT := 'genese'; v_hash TEXT;
BEGIN
  FOR r IN SELECT * FROM public.audit_log ORDER BY id LOOP
    v_hash := encode(sha256(convert_to(
      v_anterior || '|' || public.audit_conteudo(
        r.occurred_at, r.actor_id, r.entidade, r.operacao,
        r.registro, r.antes, r.depois), 'UTF8')), 'hex');
    UPDATE public.audit_log SET hash_anterior = v_anterior, hash = v_hash WHERE id = r.id;
    v_anterior := v_hash;
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_lacra_auditoria ON public.audit_log;
CREATE TRIGGER trg_lacra_auditoria
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.lacra_auditoria();

-- ── Append-only de verdade ──────────────────────────────────────────────────
-- O RLS já negava escrita a quem faz login, mas o service role passa por cima
-- do RLS — e é ele que roda cron e ações de admin. Um gatilho não tem essa
-- exceção: vale para todo mundo que fale com o banco.
CREATE OR REPLACE FUNCTION public.trilha_nao_se_reescreve()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'A trilha de auditoria é somente-acréscimo: % foi recusado.', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_trilha_nao_se_reescreve ON public.audit_log;
CREATE TRIGGER trg_trilha_nao_se_reescreve
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.trilha_nao_se_reescreve();

-- ── Conferência da corrente ─────────────────────────────────────────────────
-- Recalcula tudo do começo. Devolve a primeira linha que não fecha — ou nada,
-- se a trilha está inteira.
CREATE OR REPLACE FUNCTION public.conferir_trilha()
RETURNS TABLE (linhas BIGINT, intacta BOOLEAN, primeira_quebra BIGINT, lacre TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE r RECORD; v_anterior TEXT := 'genese'; v_hash TEXT;
BEGIN
  linhas := 0; intacta := TRUE; primeira_quebra := NULL;
  FOR r IN SELECT * FROM public.audit_log ORDER BY id LOOP
    linhas := linhas + 1;
    v_hash := encode(sha256(convert_to(
      v_anterior || '|' || public.audit_conteudo(
        r.occurred_at, r.actor_id, r.entidade, r.operacao,
        r.registro, r.antes, r.depois), 'UTF8')), 'hex');
    IF intacta AND (r.hash IS DISTINCT FROM v_hash OR r.hash_anterior IS DISTINCT FROM v_anterior) THEN
      intacta := FALSE; primeira_quebra := r.id;
    END IF;
    v_anterior := v_hash;
  END LOOP;
  lacre := upper(left(v_anterior, 12));
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.conferir_trilha() IS
  'Recalcula a corrente de hashes da trilha inteira. intacta = FALSE aponta a primeira linha adulterada ou removida.';

GRANT EXECUTE ON FUNCTION public.conferir_trilha() TO authenticated;

-- ---------------------------------------------------------------------------
-- Verificação (feita na aplicação):
--   SELECT * FROM public.conferir_trilha();
--     -> 165 linhas, intacta = true, lacre 5CE67833F6F1
--   UPDATE public.audit_log SET depois = '{}' WHERE id = 1;  -> recusado
--   DELETE FROM public.audit_log WHERE id = 1;               -> recusado
-- ---------------------------------------------------------------------------
