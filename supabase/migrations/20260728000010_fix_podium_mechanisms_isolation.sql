-- ============================================================================
-- 🔴 P0 FUNCIONAL: isolar os dois mecanismos de pódio (legado x por competição)
-- ============================================================================
-- PROBLEMA (auditoria item 6): coexistem dois mecanismos que gravam
-- tournament_rankings.podium_points:
--   • LEGADO (Mundial): trigger process_tournament_podium AFTER UPDATE ON tournaments,
--     usa tournaments.champion_team/runner_up_team/third_place_team e percorre
--     podium_predictions SEM filtrar competition, sobrescrevendo podium_points.
--   • NOVO (clubes): recompute_competition_podium soma as competições e é disparado
--     por tournament_competition_results.
-- Se o mecanismo legado rodar no torneio de clubes (por divergência do WHEN em prod,
-- ou por qualquer UPDATE que mexa nas colunas de pódio do torneio), ele recalcula os
-- jogadores com champion_team = NULL → calc_podium_points retorna 0 → ZERA os pontos
-- de pódio dos clubes (ex.: 115 → 0).
--
-- CORREÇÃO (defensiva, independente do WHEN em prod):
--   (1) process_tournament_podium passa a processar SÓ palpites LEGADOS (competition IS NULL).
--       No torneio de clubes (todos os picks têm competition) o laço fica vazio → não toca
--       em podium_points.
--   (2) Reafirma a trigger com o WHEN correto (só dispara quando as colunas de pódio do
--       torneio mudam) — corrige eventual divergência do banco.
--   (3) Simetria: recompute_competition_podium soma SÓ picks por competição
--       (competition IS NOT NULL), para nunca tocar em picks legados.
-- ============================================================================

-- (1) Mecanismo LEGADO restrito a picks sem competição -----------------------
CREATE OR REPLACE FUNCTION process_tournament_podium()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rec RECORD;
    new_podium INTEGER;
BEGIN
    FOR rec IN
        SELECT pp.user_id, pp.champion_team, pp.runner_up_team, pp.third_place_team
        FROM public.podium_predictions pp
        WHERE pp.tournament_id = NEW.id
          AND pp.competition IS NULL          -- << só o pódio legado (Mundial)
    LOOP
        new_podium := calc_podium_points(
            rec.champion_team, rec.runner_up_team, rec.third_place_team,
            NEW.champion_team, NEW.runner_up_team, NEW.third_place_team
        );

        INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, podium_points)
        VALUES (rec.user_id, NEW.id, new_podium, 0, new_podium)
        ON CONFLICT (user_id, tournament_id) DO UPDATE
        SET total_points  = tournament_rankings.total_points - tournament_rankings.podium_points + new_podium,
            podium_points = new_podium,
            updated_at = NOW();
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- (2) Reafirma a trigger com o WHEN correto (só muda em colunas de pódio do torneio)
DROP TRIGGER IF EXISTS trigger_process_tournament_podium ON public.tournaments;
CREATE TRIGGER trigger_process_tournament_podium
    AFTER UPDATE ON public.tournaments
    FOR EACH ROW
    WHEN (
        NEW.champion_team    IS DISTINCT FROM OLD.champion_team
        OR NEW.runner_up_team   IS DISTINCT FROM OLD.runner_up_team
        OR NEW.third_place_team IS DISTINCT FROM OLD.third_place_team
    )
    EXECUTE FUNCTION process_tournament_podium();

-- (3) Mecanismo NOVO restrito a picks por competição -------------------------
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
          AND competition IS NOT NULL          -- << só pódio por competição
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
           AND pp.user_id       = rec.user_id
           AND pp.competition IS NOT NULL;

        INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, podium_points)
        VALUES (rec.user_id, p_tournament_id, new_podium, 0, new_podium)
        ON CONFLICT (user_id, tournament_id) DO UPDATE
        SET total_points  = tournament_rankings.total_points - tournament_rankings.podium_points + new_podium,
            podium_points = new_podium,
            updated_at    = NOW();
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- recompute_competition_podium é de manutenção: manter sem EXECUTE p/ cliente
-- (já revogado na 000007; reforço aqui porque o CREATE OR REPLACE acima não muda ACL,
--  mas garante a intenção caso a função não existisse antes).
REVOKE EXECUTE ON FUNCTION public.recompute_competition_podium(integer) FROM PUBLIC, anon, authenticated;
