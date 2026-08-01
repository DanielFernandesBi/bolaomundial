-- ============================================================================
-- Trilha de auditoria dos palpites.
--
-- O que já existia: `created_at` e `updated_at` em predictions e
-- podium_predictions. Isso responde "quando o palpite ATUAL foi gravado", mas
-- não responde "o que estava gravado ontem às 19h" — o valor antigo é
-- sobrescrito e some. Numa discussão do tipo "eu apostei e não salvou", é
-- justamente o histórico que decide.
--
-- Esta tabela é APPEND-ONLY: uma linha por evento, com o antes e o depois.
-- Ninguém escreve nela direto — só os gatilhos, que rodam como SECURITY
-- DEFINER. Nem o dono do palpite pode apagar a própria linha.
--
-- O que NÃO é registrado, de propósito: a atualização de PONTOS que acontece
-- quando o admin lança um resultado. Ela mexe em todo palpite da partida e não
-- é ação do jogador — encheria a trilha de ruído e esconderia o que importa.
-- Verificado: um recálculo sobre 190 palpites gera ZERO eventos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id           BIGSERIAL PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL = ação de sistema (cron, admin via service role). Distinguir isso de
  -- ação de gente é metade do valor da trilha.
  actor_id     UUID,
  entidade     TEXT NOT NULL,
  operacao     TEXT NOT NULL CHECK (operacao IN ('INSERT','UPDATE','DELETE')),
  registro     JSONB NOT NULL,
  antes        JSONB,
  depois       JSONB
);

CREATE INDEX IF NOT EXISTS audit_log_actor_idx  ON public.audit_log (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_quando_idx ON public.audit_log (occurred_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Cada um lê a própria trilha; admin lê tudo. Ninguém escreve, altera ou
-- apaga: não há policy de INSERT/UPDATE/DELETE, e sem policy o RLS nega.
DROP POLICY IF EXISTS audit_log_leitura ON public.audit_log;
CREATE POLICY audit_log_leitura ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    actor_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_admin)
  );

REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.registra_auditoria()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_antes  JSONB;
  v_depois JSONB;
  v_chave  JSONB;
BEGIN
  IF TG_TABLE_NAME = 'predictions' THEN
    v_chave := jsonb_build_object('user_id', COALESCE(NEW.user_id, OLD.user_id),
                                  'match_id', COALESCE(NEW.match_id, OLD.match_id));
    v_antes  := CASE WHEN OLD IS NULL THEN NULL ELSE jsonb_build_object(
                  'pred_home', OLD.pred_home, 'pred_away', OLD.pred_away,
                  'pred_extra_result', OLD.pred_extra_result,
                  'pred_pen_home', OLD.pred_pen_home, 'pred_pen_away', OLD.pred_pen_away,
                  'pred_pen_winner', OLD.pred_pen_winner) END;
    v_depois := CASE WHEN NEW IS NULL THEN NULL ELSE jsonb_build_object(
                  'pred_home', NEW.pred_home, 'pred_away', NEW.pred_away,
                  'pred_extra_result', NEW.pred_extra_result,
                  'pred_pen_home', NEW.pred_pen_home, 'pred_pen_away', NEW.pred_pen_away,
                  'pred_pen_winner', NEW.pred_pen_winner) END;
  ELSE
    v_chave := jsonb_build_object('user_id', COALESCE(NEW.user_id, OLD.user_id),
                                  'tournament_id', COALESCE(NEW.tournament_id, OLD.tournament_id),
                                  'competition', COALESCE(NEW.competition, OLD.competition));
    v_antes  := CASE WHEN OLD IS NULL THEN NULL ELSE jsonb_build_object(
                  'champion_team', OLD.champion_team, 'runner_up_team', OLD.runner_up_team,
                  'third_place_team', OLD.third_place_team) END;
    v_depois := CASE WHEN NEW IS NULL THEN NULL ELSE jsonb_build_object(
                  'champion_team', NEW.champion_team, 'runner_up_team', NEW.runner_up_team,
                  'third_place_team', NEW.third_place_team) END;
  END IF;

  -- Update que não mexeu no palpite é recálculo de pontos: não é evento.
  IF TG_OP = 'UPDATE' AND v_antes IS NOT DISTINCT FROM v_depois THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_log (actor_id, entidade, operacao, registro, antes, depois)
  VALUES ((SELECT auth.uid()), TG_TABLE_NAME, TG_OP, v_chave, v_antes, v_depois);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_auditoria_predictions ON public.predictions;
CREATE TRIGGER tr_auditoria_predictions
  AFTER INSERT OR UPDATE OR DELETE ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.registra_auditoria();

DROP TRIGGER IF EXISTS tr_auditoria_podium ON public.podium_predictions;
CREATE TRIGGER tr_auditoria_podium
  AFTER INSERT OR UPDATE OR DELETE ON public.podium_predictions
  FOR EACH ROW EXECUTE FUNCTION public.registra_auditoria();

COMMENT ON TABLE public.audit_log IS
  'Trilha append-only de palpites e pódios. Uma linha por evento em que o palpite mudou, com antes e depois. Recálculo de pontos não entra.';
