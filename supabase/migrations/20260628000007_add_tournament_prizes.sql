-- ============================================
-- Premiação por torneio (1º, 2º e 3º lugares)
-- ============================================
-- Define o "prêmio em disputa" (mostrado no topo) e a base para distribuir
-- os prêmios aos vencedores ao encerrar o torneio. Seguro/aditivo.

ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS prize_first  DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS prize_second DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS prize_third  DECIMAL(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tournaments.prize_first IS 'Prêmio do 1º lugar (R$)';
COMMENT ON COLUMN public.tournaments.prize_second IS 'Prêmio do 2º lugar (R$)';
COMMENT ON COLUMN public.tournaments.prize_third IS 'Prêmio do 3º lugar (R$)';

-- ============================================
-- Distribuir prêmios aos vencedores (top 3) e atualizar o total_money
-- ============================================
-- Roda como SECURITY DEFINER para escrever em tournament_rankings/profiles sem
-- esbarrar no RLS. Só admin pode chamar.
CREATE OR REPLACE FUNCTION distribute_tournament_prizes(p_tournament_id INTEGER)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
    pos INTEGER := 0;
    v_prize NUMERIC;
    v_first NUMERIC;
    v_second NUMERIC;
    v_third NUMERIC;
BEGIN
    -- Só administradores
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
        RAISE EXCEPTION 'Apenas administradores podem distribuir prêmios';
    END IF;

    SELECT prize_first, prize_second, prize_third
      INTO v_first, v_second, v_third
      FROM public.tournaments WHERE id = p_tournament_id;

    -- Zera os prêmios deste torneio
    UPDATE public.tournament_rankings SET prize_money = 0 WHERE tournament_id = p_tournament_id;

    -- Atribui aos 3 primeiros (mesmo desempate do ranking)
    FOR r IN
        SELECT id FROM public.tournament_rankings
        WHERE tournament_id = p_tournament_id
        ORDER BY total_points DESC, exact_matches DESC
        LIMIT 3
    LOOP
        pos := pos + 1;
        v_prize := CASE pos WHEN 1 THEN v_first WHEN 2 THEN v_second WHEN 3 THEN v_third ELSE 0 END;
        UPDATE public.tournament_rankings SET prize_money = COALESCE(v_prize, 0) WHERE id = r.id;
    END LOOP;

    -- Recalcula o total_money de todos (soma dos prêmios em todos os torneios)
    -- WHERE explícito: o banco tem o guard safeupdate (bloqueia UPDATE sem WHERE).
    UPDATE public.profiles p
    SET total_money = COALESCE((
        SELECT SUM(tr.prize_money) FROM public.tournament_rankings tr WHERE tr.user_id = p.id
    ), 0)
    WHERE p.id IS NOT NULL;
END;
$$ LANGUAGE plpgsql;
