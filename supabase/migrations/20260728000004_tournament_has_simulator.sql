-- ============================================================================
-- Flag: o torneio tem simulador de probabilidades?
-- ============================================================================
-- O simulador (motor Monte Carlo) é específico do Mundial de seleções. Passa a
-- ser opt-in por torneio para não aparecer (nem quebrar) nos demais bolões,
-- incluindo o mata-mata de clubes.
-- ============================================================================

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS has_simulator BOOLEAN NOT NULL DEFAULT false;

-- Mantém o simulador ligado só onde ele foi feito para funcionar.
UPDATE public.tournaments
SET has_simulator = true
WHERE slug = 'mundial-mata-mata-2026';

COMMENT ON COLUMN public.tournaments.has_simulator IS 'Exibe o simulador de probabilidades (motor específico do Mundial); default false';
