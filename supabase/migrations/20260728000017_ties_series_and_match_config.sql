-- ============================================================================
-- Modelo genérico de confrontos: séries (ida/volta ou jogo único), modo de
-- pênaltis desacoplado da prorrogação, estádio e participantes pendentes.
-- ============================================================================
-- Tudo ADITIVO. Defaults escolhidos para NÃO alterar o comportamento atual:
--   • ties.series_type default 'two_leg' (Mundial e clubes de ida/volta continuam iguais).
--   • matches.penalty_prediction_mode default 'score' (Mundial legado = por placar).
--   • matches.extra_prediction_enabled default true (Mundial legado tem prorrogação).
-- Como o torneio de clubes está VAZIO e o Mundial usa esses defaults, nenhum
-- backfill é necessário (ADD COLUMN ... DEFAULT não dispara triggers de linha).
-- Os jogos/ties dos clubes definem os valores explicitamente (seed/RPCs).
-- ============================================================================

-- ---- ties: tipo de série + rótulos de participante pendente --------------
ALTER TABLE public.ties
  ADD COLUMN IF NOT EXISTS series_type TEXT NOT NULL DEFAULT 'two_leg'
  CHECK (series_type IN ('two_leg', 'single'));

ALTER TABLE public.ties ADD COLUMN IF NOT EXISTS team_a_source_label TEXT;
ALTER TABLE public.ties ADD COLUMN IF NOT EXISTS team_b_source_label TEXT;

COMMENT ON COLUMN public.ties.series_type IS 'two_leg (ida+volta) ou single (jogo único, ex.: finais de clubes)';
COMMENT ON COLUMN public.ties.team_a_source_label IS 'Rótulo do participante pendente do lado A (ex.: "Vencedor de Boca x O''Higgins"); NULL quando o time real está definido';
COMMENT ON COLUMN public.ties.team_b_source_label IS 'Rótulo do participante pendente do lado B; NULL quando o time real está definido';

-- ---- matches: leg 'single', modo de pênaltis, flag de prorrogação, estádio -
-- Expandir o CHECK de leg para incluir 'single'
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_leg_check;
ALTER TABLE public.matches
  ADD CONSTRAINT matches_leg_check CHECK (leg IS NULL OR leg IN ('ida', 'volta', 'single'));

-- Modo do palpite de pênaltis, DESACOPLADO de has_extra_time:
--   'score'  = palpita o placar dos pênaltis (Mundial: 5 vencedor / 10 exato)
--   'winner' = palpita só o vencedor (clubes: 7)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS penalty_prediction_mode TEXT NOT NULL DEFAULT 'score'
  CHECK (penalty_prediction_mode IN ('score', 'winner'));

-- Se o usuário tem uma MODALIDADE de palpite de prorrogação (Mundial=true; clubes=false).
-- Registrar uma prorrogação real (has_extra_time) NÃO implica dar essa modalidade.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS extra_prediction_enabled BOOLEAN NOT NULL DEFAULT true;

-- Estádio (nunca usado em pontuação)
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS venue TEXT;

COMMENT ON COLUMN public.matches.penalty_prediction_mode IS 'Modo do palpite de pênaltis: score (placar) ou winner (só vencedor). NÃO derivar de has_extra_time.';
COMMENT ON COLUMN public.matches.extra_prediction_enabled IS 'Se há modalidade de palpite de prorrogação para o usuário (Mundial=true; clubes=false).';
COMMENT ON COLUMN public.matches.venue IS 'Estádio/local do jogo (apenas informativo).';
