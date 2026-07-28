-- ============================================================================
-- BOLÃO MATA-MATA DE CLUBES: chaveamento (confrontos) para auto-progressão
-- ============================================================================
-- Um "tie" (confronto) = 2 pernas (ida + volta) entre team_a e team_b.
-- O esqueleto do chaveamento é pré-cadastrado (slots ligados por next_tie_id);
-- ao finalizar a volta, o backend calcula o vencedor (agregado; empate = pênaltis)
-- e, quando o próximo confronto tem os dois times, cria a ida/volta da fase seguinte.
-- Seguro aplicar a qualquer momento (aditivo).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ties (
    id SERIAL PRIMARY KEY,
    tournament_id  INTEGER NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    competition    TEXT NOT NULL
        CHECK (competition IN ('copa_do_brasil', 'sudamericana', 'libertadores')),
    round          TEXT NOT NULL
        CHECK (round IN ('oitavas', 'quartas', 'semi', 'final')),
    slot           INTEGER NOT NULL,           -- posição na rodada/competição (0-based)
    label          TEXT,                        -- rótulo opcional ("Confronto 1")

    team_a         TEXT, team_a_iso TEXT,       -- nulos até o time ser conhecido
    team_b         TEXT, team_b_iso TEXT,

    ida_match_id   INTEGER REFERENCES public.matches(id) ON DELETE SET NULL,
    volta_match_id INTEGER REFERENCES public.matches(id) ON DELETE SET NULL,

    winner_team    TEXT, winner_iso TEXT,
    winner_side    TEXT CHECK (winner_side IS NULL OR winner_side IN ('a', 'b')),
    decided_by     TEXT CHECK (decided_by IS NULL OR decided_by IN ('aggregate', 'penalties')),

    -- Para onde o vencedor avança:
    next_tie_id    INTEGER REFERENCES public.ties(id) ON DELETE SET NULL,
    next_slot_side TEXT CHECK (next_slot_side IS NULL OR next_slot_side IN ('a', 'b')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

    UNIQUE (tournament_id, competition, round, slot)
);

CREATE INDEX IF NOT EXISTS idx_ties_tournament ON public.ties(tournament_id);
CREATE INDEX IF NOT EXISTS idx_ties_next_tie   ON public.ties(next_tie_id);

-- Cada jogo pode apontar para seu confronto
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS tie_id INTEGER REFERENCES public.ties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_matches_tie ON public.matches(tie_id);

-- updated_at automático
DROP TRIGGER IF EXISTS trigger_update_ties_updated_at ON public.ties;
CREATE TRIGGER trigger_update_ties_updated_at
    BEFORE UPDATE ON public.ties
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- RLS: leitura pública, escrita só admin (espelha a política de tournaments)
-- ============================================
ALTER TABLE public.ties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ties are viewable by everyone" ON public.ties;
CREATE POLICY "Ties are viewable by everyone"
    ON public.ties FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can insert ties" ON public.ties;
CREATE POLICY "Admins can insert ties"
    ON public.ties FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admins can update ties" ON public.ties;
CREATE POLICY "Admins can update ties"
    ON public.ties FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admins can delete ties" ON public.ties;
CREATE POLICY "Admins can delete ties"
    ON public.ties FOR DELETE
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

COMMENT ON TABLE public.ties IS 'Confrontos (ida/volta) do chaveamento; base da auto-progressão do mata-mata';
COMMENT ON COLUMN public.ties.next_tie_id IS 'Confronto da fase seguinte que recebe o vencedor';
COMMENT ON COLUMN public.ties.next_slot_side IS 'Lado (a/b) que o vencedor ocupa no confronto seguinte';
COMMENT ON COLUMN public.ties.decided_by IS 'Como o confronto foi decidido: aggregate (agregado) ou penalties (pênaltis)';
