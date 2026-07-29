-- ============================================================================
-- Premiação com POSIÇÃO COMPARTILHADA em empates (auditoria item 16)
-- ============================================================================
-- Antes: ordenava por (total_points DESC, exact_matches DESC) e dava 1º/2º/3º sem
-- regra determinística para empates completos (mesmos pontos E mesmas cravadas) →
-- a ordem dos empatados dependia do PostgreSQL.
--
-- Regra do usuário: em empate completo, POSIÇÃO COMPARTILHADA. Quando o
-- compartilhamento envolve prêmio em dinheiro, SOMAR os prêmios das posições
-- ocupadas pelo grupo e DIVIDIR pelo número de empatados.
--   • 2 empatados no topo (posições 1 e 2)  -> cada um (prize_first + prize_second)/2
--   • 3 empatados no topo (posições 1,2,3)   -> cada um (soma dos três)/3
--   • 1º isolado + 2 empatados (posições 2,3) -> cada empatado (prize_second+prize_third)/2
--   • empate fora do pódio (posições >3)     -> 0
-- Observação: divisões podem gerar centavos de arredondamento (ex.: /3).
-- ============================================================================

CREATE OR REPLACE FUNCTION distribute_tournament_prizes(p_tournament_id INTEGER)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_first  NUMERIC;
    v_second NUMERIC;
    v_third  NUMERIC;
BEGIN
    -- Só administradores
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
        RAISE EXCEPTION 'Apenas administradores podem distribuir prêmios';
    END IF;

    SELECT prize_first, prize_second, prize_third
      INTO v_first, v_second, v_third
      FROM public.tournaments WHERE id = p_tournament_id;

    v_first  := COALESCE(v_first, 0);
    v_second := COALESCE(v_second, 0);
    v_third  := COALESCE(v_third, 0);

    -- Calcula o prêmio de cada linha (0 para quem está fora das posições 1-3).
    -- Empates completos (mesmo total_points E exact_matches) formam um grupo que
    -- ocupa posições contíguas; o pool das posições ocupadas é dividido igualmente.
    WITH ranked AS (
        SELECT id, total_points, exact_matches,
               ROW_NUMBER() OVER (ORDER BY total_points DESC, exact_matches DESC) AS pos
        FROM public.tournament_rankings
        WHERE tournament_id = p_tournament_id
    ),
    grouped AS (
        SELECT id,
               MIN(pos) OVER (PARTITION BY total_points, exact_matches) AS grp_start,
               COUNT(*) OVER (PARTITION BY total_points, exact_matches) AS grp_size
        FROM ranked
    ),
    prized AS (
        SELECT id,
               (
                   (CASE WHEN 1 BETWEEN grp_start AND grp_start + grp_size - 1 THEN v_first  ELSE 0 END)
                 + (CASE WHEN 2 BETWEEN grp_start AND grp_start + grp_size - 1 THEN v_second ELSE 0 END)
                 + (CASE WHEN 3 BETWEEN grp_start AND grp_start + grp_size - 1 THEN v_third  ELSE 0 END)
               )::NUMERIC / grp_size AS prize
        FROM grouped
    )
    UPDATE public.tournament_rankings tr
    SET prize_money = ROUND(COALESCE(prized.prize, 0), 2)
    FROM prized
    WHERE tr.id = prized.id;

    -- Recalcula o total_money de todos (soma dos prêmios em todos os torneios).
    -- WHERE explícito por causa do guard safeupdate (bloqueia UPDATE sem WHERE).
    UPDATE public.profiles p
    SET total_money = COALESCE((
        SELECT SUM(tr.prize_money) FROM public.tournament_rankings tr WHERE tr.user_id = p.id
    ), 0)
    WHERE p.id IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- EXECUTE continua concedido só ao app (authenticated) — a função tem checagem
-- interna de admin. (Coerente com a migração 000007.)
GRANT EXECUTE ON FUNCTION public.distribute_tournament_prizes(integer) TO authenticated;
