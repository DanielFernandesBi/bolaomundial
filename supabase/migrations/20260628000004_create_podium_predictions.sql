-- ============================================
-- MATA-MATA: palpites de pódio (campeão / vice / terceiro)
-- ============================================
-- Seguro aplicar a qualquer momento.

-- Coluna para guardar os pontos do pódio de forma idempotente (recalculável)
ALTER TABLE public.tournament_rankings
  ADD COLUMN IF NOT EXISTS podium_points INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tournament_rankings.podium_points IS 'Pontos do palpite de pódio (separados para recálculo idempotente)';

-- Tabela de palpites de pódio: um por usuário/torneio
CREATE TABLE IF NOT EXISTS public.podium_predictions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    tournament_id INTEGER NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    champion_team    TEXT,
    champion_iso     TEXT,
    runner_up_team   TEXT,
    runner_up_iso    TEXT,
    third_place_team TEXT,
    third_place_iso  TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, tournament_id)
);

CREATE INDEX IF NOT EXISTS idx_podium_predictions_user ON public.podium_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_podium_predictions_tournament ON public.podium_predictions(tournament_id);

-- updated_at automático
DROP TRIGGER IF EXISTS trigger_update_podium_predictions_updated_at ON public.podium_predictions;
CREATE TRIGGER trigger_update_podium_predictions_updated_at
    BEFORE UPDATE ON public.podium_predictions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Garante uma linha em tournament_rankings quando o usuário palpita o pódio
CREATE OR REPLACE FUNCTION ensure_tournament_ranking_on_podium()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches)
    VALUES (NEW.user_id, NEW.tournament_id, 0, 0)
    ON CONFLICT (user_id, tournament_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ensure_ranking_on_podium ON public.podium_predictions;
CREATE TRIGGER trigger_ensure_ranking_on_podium
    AFTER INSERT ON public.podium_predictions
    FOR EACH ROW
    EXECUTE FUNCTION ensure_tournament_ranking_on_podium();

-- ============================================
-- RLS
-- ============================================
ALTER TABLE public.podium_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Podium predictions are viewable by everyone" ON public.podium_predictions;
CREATE POLICY "Podium predictions are viewable by everyone"
    ON public.podium_predictions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own podium prediction" ON public.podium_predictions;
CREATE POLICY "Users can insert their own podium prediction"
    ON public.podium_predictions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own podium prediction" ON public.podium_predictions;
CREATE POLICY "Users can update their own podium prediction"
    ON public.podium_predictions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own podium prediction" ON public.podium_predictions;
CREATE POLICY "Users can delete their own podium prediction"
    ON public.podium_predictions FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.podium_predictions IS 'Palpites de pódio (campeão/vice/terceiro) por usuário e torneio';
