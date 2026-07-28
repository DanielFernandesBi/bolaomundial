-- ============================================
-- MATA-MATA: regime do torneio + resultado do pódio
-- ============================================
-- Seguro aplicar a qualquer momento (tudo aditivo/nullable, com defaults).

-- Regime do torneio: 'groups' (atual), 'knockout' (mata-mata) ou 'mixed'
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'groups'
  CHECK (format IN ('groups', 'knockout', 'mixed'));

-- Resultado real do pódio (lançado pelo admin no fim do torneio)
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS champion_team    TEXT;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS champion_iso     TEXT;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS runner_up_team   TEXT;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS runner_up_iso    TEXT;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS third_place_team TEXT;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS third_place_iso  TEXT;

COMMENT ON COLUMN public.tournaments.format IS 'Regime do torneio: groups (fase de grupos), knockout (mata-mata) ou mixed';
COMMENT ON COLUMN public.tournaments.champion_team IS 'Time campeão real (definido pelo admin ao encerrar o torneio)';

-- Garantir RLS + leitura pública (consistente com matches/predictions)
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tournaments are viewable by everyone" ON public.tournaments;
CREATE POLICY "Tournaments are viewable by everyone"
  ON public.tournaments
  FOR SELECT
  USING (true);

-- Política RLS para o admin atualizar torneios (resultado do pódio / criação)
DROP POLICY IF EXISTS "Admins can update tournaments" ON public.tournaments;
CREATE POLICY "Admins can update tournaments"
  ON public.tournaments
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admins can insert tournaments" ON public.tournaments;
CREATE POLICY "Admins can insert tournaments"
  ON public.tournaments
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
