-- ============================================
-- MATA-MATA: palpites de prorrogação/pênaltis + breakdown de pontos
-- ============================================
-- Seguro aplicar a qualquer momento (aditivo/nullable, com defaults).

-- Palpite da prorrogação: 'home' / 'draw' / 'away' (NÃO é placar). NULL = não palpitou.
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS pred_extra_result TEXT
  CHECK (pred_extra_result IS NULL OR pred_extra_result IN ('home', 'draw', 'away'));

-- Palpite do placar de pênaltis. NULL = não palpitou.
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS pred_pen_home INTEGER;
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS pred_pen_away INTEGER;

-- Breakdown de pontos (points_earned passa a ser a SOMA destes três)
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS points_regular INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS points_extra   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS points_pen     INTEGER NOT NULL DEFAULT 0;

-- Retro-preencher points_regular nos palpites já pontuados (points_earned atual = só tempo normal).
-- A tabela predictions tem triggers que bloqueiam UPDATE fora do contexto de aposta
-- (check_match_date, check_prediction_window — este exige usuário autenticado, que é NULL no
-- SQL Editor). Desligamos os triggers de USUÁRIO só durante o backfill e religamos em seguida.
-- (DISABLE TRIGGER USER mantém os triggers de integridade/FK e não exige superusuário.)
ALTER TABLE public.predictions DISABLE TRIGGER USER;

UPDATE public.predictions
SET points_regular = points_earned
WHERE points_regular = 0 AND points_earned IS NOT NULL AND points_earned <> 0;

ALTER TABLE public.predictions ENABLE TRIGGER USER;

COMMENT ON COLUMN public.predictions.pred_extra_result IS 'Palpite do resultado da prorrogação (home/draw/away); só conta se o jogo for à prorrogação';
COMMENT ON COLUMN public.predictions.pred_pen_home IS 'Palpite de gols do mandante nos pênaltis; só conta se houver pênaltis';
COMMENT ON COLUMN public.predictions.points_regular IS 'Pontos do tempo normal';
COMMENT ON COLUMN public.predictions.points_extra IS 'Pontos ganhos na prorrogação';
COMMENT ON COLUMN public.predictions.points_pen IS 'Pontos ganhos nos pênaltis';
