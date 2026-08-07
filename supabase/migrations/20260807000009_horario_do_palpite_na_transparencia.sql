-- ============================================================================
-- A hora de cada palpite, à vista de todos.
-- ============================================================================
-- O comprovante protege quem GUARDA o comprovante. Isso é pouco: exige
-- disciplina de cada jogador, todo mês, para uma desconfiança que talvez nunca
-- apareça. Quem não guardou continua sem nada.
--
-- Isto aqui não exige nada de ninguém. A Transparência já mostra O QUE cada um
-- palpitou quando a fase fecha; passa a mostrar também QUANDO aquilo foi
-- gravado. Um palpite alterado depois do fechamento apareceria com um horário
-- impossível — para todo mundo, ao mesmo tempo, sem ninguém precisar ter
-- salvado imagem nenhuma. A fiscalização deixa de ser individual e vira
-- coletiva.
--
-- E o horário impossível não deveria existir: `check_prediction_window` já
-- recusa alteração depois do prazo. É justamente por isso que ele vale como
-- alarme — se aparecer, alguma coisa passou por fora do caminho normal.
-- Conferido na aplicação: 256 palpites revelados, 5 com alteração, ZERO depois
-- do fechamento.
--
-- SOBRE PRIVACIDADE: a trilha tem RLS (cada um lê a sua). Esta função é
-- SECURITY DEFINER e devolve horário de todos — então ela repete, na cláusula
-- WHERE, exatamente a regra que já torna o palpite público:
-- `phase_already_started`. Fase que não começou não devolve nada. Sem isso,
-- daria para inferir quem já palpitou antes da revelação.
--
-- Devolve HORÁRIO e CONTAGEM, nunca o conteúdo do antes/depois. Que alguém
-- mudou de ideia é informação do jogo; para o que ele havia palpitado antes,
-- só o dono tem direito, e isso continua em `meu_extrato`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.horarios_dos_palpites(p_tournament_id INTEGER)
RETURNS TABLE (
  match_id     INTEGER,
  user_id      UUID,
  salvo_em     TIMESTAMPTZ,
  alterado_em  TIMESTAMPTZ,
  alteracoes   INTEGER,
  fecha_em     TIMESTAMPTZ,
  -- O alarme: alteração registrada DEPOIS do prazo da fase.
  alterado_apos_fechamento BOOLEAN,
  -- A trilha já existia quando este palpite foi gravado?
  cobertura_completa BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH trilha_desde AS (SELECT min(a.occurred_at) AS quando FROM public.audit_log a),
  reveladas AS (
    -- A MESMA regra que libera o palpite para todos. Ver o cabeçalho.
    SELECT m.id, public.prediction_deadline(m.id) AS fecha_em
      FROM public.matches m
     WHERE m.tournament_id = p_tournament_id
       AND public.phase_already_started(m.id)
  ),
  eventos AS (
    SELECT (a.registro->>'match_id')::int  AS mid,
           (a.registro->>'user_id')::uuid  AS uid,
           a.occurred_at, a.operacao
      FROM public.audit_log a
     WHERE a.entidade = 'predictions'
       AND (a.registro->>'match_id')::int IN (SELECT r.id FROM reveladas r)
  ),
  resumo AS (
    SELECT e.mid, e.uid,
           min(e.occurred_at) FILTER (WHERE e.operacao = 'INSERT') AS primeiro,
           max(e.occurred_at) FILTER (WHERE e.operacao = 'UPDATE') AS ultimo,
           count(*) FILTER (WHERE e.operacao = 'UPDATE')            AS mudancas
      FROM eventos e GROUP BY e.mid, e.uid
  )
  SELECT p.match_id, p.user_id,
         COALESCE(r.primeiro, p.created_at)      AS salvo_em,
         r.ultimo                                 AS alterado_em,
         COALESCE(r.mudancas, 0)::int             AS alteracoes,
         v.fecha_em,
         (r.ultimo IS NOT NULL AND v.fecha_em IS NOT NULL AND r.ultimo > v.fecha_em)
                                                  AS alterado_apos_fechamento,
         (COALESCE(r.primeiro, p.created_at) >= (SELECT quando FROM trilha_desde))
                                                  AS cobertura_completa
    FROM public.predictions p
    JOIN reveladas v ON v.id = p.match_id
    LEFT JOIN resumo r ON r.mid = p.match_id AND r.uid = p.user_id;
$$;

COMMENT ON FUNCTION public.horarios_dos_palpites(INTEGER) IS
  'Quando cada palpite foi gravado e alterado, para as fases JÁ REVELADAS — a mesma regra que torna o palpite público. Devolve horário e contagem, nunca o conteúdo anterior: esse continua só no extrato do dono.';

REVOKE ALL ON FUNCTION public.horarios_dos_palpites(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.horarios_dos_palpites(INTEGER) TO authenticated;
