-- ============================================================================
-- BOLÃO MATA-MATA DE CLUBES: pódio por competição (campeão + vice)
-- ============================================================================
-- Bolão unificado tem 3 competições, cada uma com seu campeão e vice. O palpite
-- de pódio passa a ser POR competição (não há 3º lugar nessas competições).
-- Valores: campeão 40, vice 25, consolação 10 (acertou o time mas trocou a posição).
--
-- Não mexe no pódio do Mundial (função calc_podium_points / trigger antigos ficam
-- intactos; aquele torneio usa competition = NULL e o resultado real em tournaments.*).
-- ============================================================================

-- 1) Dimensão de competição no palpite de pódio -----------------------------
ALTER TABLE public.podium_predictions ADD COLUMN IF NOT EXISTS competition TEXT
  CHECK (competition IS NULL OR competition IN ('copa_do_brasil', 'sudamericana', 'libertadores'));

-- Troca a unicidade para (user, torneio, competição). O Mundial (competition NULL)
-- já tem no máximo uma linha por torneio e está encerrado, então é seguro.
ALTER TABLE public.podium_predictions
  DROP CONSTRAINT IF EXISTS podium_predictions_user_id_tournament_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'podium_predictions_user_tournament_competition_key'
  ) THEN
    ALTER TABLE public.podium_predictions
      ADD CONSTRAINT podium_predictions_user_tournament_competition_key
      UNIQUE (user_id, tournament_id, competition);
  END IF;
END $$;

-- 2) Resultado real do pódio por competição ---------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_competition_results (
    tournament_id  INTEGER NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    competition    TEXT NOT NULL
        CHECK (competition IN ('copa_do_brasil', 'sudamericana', 'libertadores')),
    champion_team  TEXT, champion_iso  TEXT,
    runner_up_team TEXT, runner_up_iso TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    PRIMARY KEY (tournament_id, competition)
);

ALTER TABLE public.tournament_competition_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Competition results are viewable by everyone" ON public.tournament_competition_results;
CREATE POLICY "Competition results are viewable by everyone"
    ON public.tournament_competition_results FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage competition results" ON public.tournament_competition_results;
CREATE POLICY "Admins manage competition results"
    ON public.tournament_competition_results FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- 3) Pontuação do pódio campeão+vice ----------------------------------------
-- Campeão exato 40, vice exato 25. Consolação 10: acertou o time no pódio mas na
-- posição trocada (campeão previsto que foi vice, ou vice previsto que foi campeão).
-- Cada acerto exato tem prioridade sobre a consolação do mesmo palpite.
CREATE OR REPLACE FUNCTION calc_podium_points_cv(
    pick_champ TEXT, pick_vice TEXT,
    real_champ TEXT, real_vice TEXT
)
RETURNS INTEGER AS $$
DECLARE
    pts INTEGER := 0;
    c  TEXT := NULLIF(lower(trim(pick_champ)), '');
    v  TEXT := NULLIF(lower(trim(pick_vice)),  '');
    rc TEXT := NULLIF(lower(trim(real_champ)), '');
    rv TEXT := NULLIF(lower(trim(real_vice)),  '');
BEGIN
    IF rc IS NULL THEN
        RETURN 0;  -- final ainda não decidida
    END IF;

    -- Palpite de campeão
    IF c IS NOT NULL THEN
        IF c = rc THEN pts := pts + 40;
        ELSIF c = rv THEN pts := pts + 10;  -- consolação (foi vice)
        END IF;
    END IF;

    -- Palpite de vice (ignora se for o mesmo time do campeão já pontuado)
    IF v IS NOT NULL AND v IS DISTINCT FROM c THEN
        IF v = rv THEN pts := pts + 25;
        ELSIF v = rc THEN pts := pts + 10;  -- consolação (foi campeão)
        END IF;
    END IF;

    RETURN pts;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calc_podium_points_cv IS 'Pódio campeão+vice: campeão 40, vice 25, consolação 10 (time no pódio em posição trocada)';

-- 4) Recalcula o pódio (todas as competições) de um torneio -----------------
-- Idempotente: soma o pódio de cada usuário sobre TODAS as competições e ajusta
-- tournament_rankings.podium_points e total_points de forma consistente.
CREATE OR REPLACE FUNCTION recompute_competition_podium(p_tournament_id INTEGER)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec RECORD;
    new_podium INTEGER;
BEGIN
    FOR rec IN
        SELECT DISTINCT user_id
        FROM public.podium_predictions
        WHERE tournament_id = p_tournament_id
    LOOP
        SELECT COALESCE(SUM(
                   calc_podium_points_cv(pp.champion_team, pp.runner_up_team,
                                         r.champion_team, r.runner_up_team)
               ), 0)
          INTO new_podium
          FROM public.podium_predictions pp
          LEFT JOIN public.tournament_competition_results r
                 ON r.tournament_id = pp.tournament_id
                AND r.competition   = pp.competition
         WHERE pp.tournament_id = p_tournament_id
           AND pp.user_id       = rec.user_id;

        INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, podium_points)
        VALUES (rec.user_id, p_tournament_id, new_podium, 0, new_podium)
        ON CONFLICT (user_id, tournament_id) DO UPDATE
        SET total_points  = tournament_rankings.total_points - tournament_rankings.podium_points + new_podium,
            podium_points = new_podium,
            updated_at    = NOW();
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 5) Trigger: ao lançar/alterar o resultado real de uma competição, recalcula --
CREATE OR REPLACE FUNCTION trg_recompute_competition_podium()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM recompute_competition_podium(NEW.tournament_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recompute_competition_podium ON public.tournament_competition_results;
CREATE TRIGGER trigger_recompute_competition_podium
    AFTER INSERT OR UPDATE ON public.tournament_competition_results
    FOR EACH ROW
    EXECUTE FUNCTION trg_recompute_competition_podium();

COMMENT ON TABLE public.tournament_competition_results IS 'Campeão/vice real de cada competição do bolão unificado';
