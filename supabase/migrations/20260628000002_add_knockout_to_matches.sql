-- ============================================
-- MATA-MATA: campos de mata-mata e resultado de prorrogação/pênaltis nos jogos
-- ============================================
-- Seguro aplicar a qualquer momento (aditivo/nullable).

-- Marca se o jogo é de mata-mata (mostra prorrogação/pênaltis no card de palpite)
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS is_knockout BOOLEAN NOT NULL DEFAULT false;

-- Resultado REAL da prorrogação: 'home' / 'draw' / 'away'. NULL = não houve prorrogação.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS extra_time_result TEXT
  CHECK (extra_time_result IS NULL OR extra_time_result IN ('home', 'draw', 'away'));

-- Placar REAL dos pênaltis. NULL = não houve pênaltis.
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS pen_home INTEGER;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS pen_away INTEGER;

COMMENT ON COLUMN public.matches.is_knockout IS 'Jogo de mata-mata: habilita palpites de prorrogação e pênaltis';
COMMENT ON COLUMN public.matches.extra_time_result IS 'Resultado real da prorrogação (home/draw/away); NULL se não houve';
COMMENT ON COLUMN public.matches.pen_home IS 'Gols reais do mandante nos pênaltis; NULL se não houve';
COMMENT ON COLUMN public.matches.pen_away IS 'Gols reais do visitante nos pênaltis; NULL se não houve';
