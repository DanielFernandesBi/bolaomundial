-- ============================================
-- ADICIONAR CAMPO DE DINHEIRO
-- ============================================
-- Este script adiciona campos para rastrear dinheiro ganho pelos jogadores

-- ============================================
-- 1. Adicionar campo total_money na tabela profiles
-- ============================================
-- Campo para armazenar o total de dinheiro ganho em todos os torneios
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS total_money DECIMAL(10, 2) DEFAULT 0.00 NOT NULL;

-- Comentário
COMMENT ON COLUMN public.profiles.total_money IS 'Total de dinheiro ganho pelo jogador em todos os torneios';

-- ============================================
-- 2. Adicionar campo prize_money na tabela tournament_rankings
-- ============================================
-- Campo para armazenar o dinheiro ganho em cada torneio específico
ALTER TABLE public.tournament_rankings
ADD COLUMN IF NOT EXISTS prize_money DECIMAL(10, 2) DEFAULT 0.00 NOT NULL;

-- Comentário
COMMENT ON COLUMN public.tournament_rankings.prize_money IS 'Dinheiro ganho pelo jogador neste torneio específico';

-- ============================================
-- 3. Índice para melhorar performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profiles_total_money ON public.profiles(total_money DESC);
CREATE INDEX IF NOT EXISTS idx_tournament_rankings_prize_money ON public.tournament_rankings(tournament_id, prize_money DESC);

-- ============================================
-- NOTA
-- ============================================
-- Após adicionar os campos, você precisará:
-- 1. Atualizar manualmente os valores de prize_money para cada torneio finalizado
-- 2. Atualizar total_money somando todos os prize_money de cada jogador
-- 
-- Exemplo de query para atualizar total_money:
-- UPDATE public.profiles p
-- SET total_money = (
--     SELECT COALESCE(SUM(tr.prize_money), 0)
--     FROM public.tournament_rankings tr
--     WHERE tr.user_id = p.id
-- );

