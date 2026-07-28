-- ============================================
-- BOLÃO DO MUNDIAL - REFATORAÇÃO MULTI-TORNEIO
-- ============================================
-- Este script refatora o banco de dados para suportar múltiplos torneios
-- ao invés de apenas a Copa do Mundo

-- ============================================
-- 1. CRIAR TABELA: tournaments
-- ============================================
CREATE TABLE IF NOT EXISTS public.tournaments (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    active BOOLEAN DEFAULT true NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Índices para tournaments
CREATE INDEX IF NOT EXISTS idx_tournaments_slug ON public.tournaments(slug);
CREATE INDEX IF NOT EXISTS idx_tournaments_active ON public.tournaments(active);

-- ============================================
-- 2. CRIAR TABELA: tournament_rankings
-- ============================================
-- Esta tabela substitui os pontos no profile, pois cada torneio tem seu ranking
CREATE TABLE IF NOT EXISTS public.tournament_rankings (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    tournament_id INTEGER NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    total_points INTEGER DEFAULT 0 NOT NULL,
    exact_matches INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    -- Constraint única: Um usuário só pode ter um registro de ranking por torneio
    UNIQUE(user_id, tournament_id)
);

-- Índices para tournament_rankings
CREATE INDEX IF NOT EXISTS idx_tournament_rankings_user_id ON public.tournament_rankings(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_rankings_tournament_id ON public.tournament_rankings(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_rankings_total_points ON public.tournament_rankings(tournament_id, total_points DESC);
CREATE INDEX IF NOT EXISTS idx_tournament_rankings_user_tournament ON public.tournament_rankings(user_id, tournament_id);

-- ============================================
-- 3. ALTERAR TABELA: matches
-- ============================================
-- Adicionar coluna tournament_id
ALTER TABLE public.matches 
ADD COLUMN IF NOT EXISTS tournament_id INTEGER REFERENCES public.tournaments(id) ON DELETE CASCADE;

-- Criar índice para tournament_id
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON public.matches(tournament_id);

-- ============================================
-- 4. MIGRAÇÃO DE DADOS (SEED)
-- ============================================

-- Inserir dois torneios
INSERT INTO public.tournaments (name, slug, active, logo_url) VALUES
('Copa do Mundo 2026', 'copa-2026', true, NULL),
('Paulistão 2026', 'paulistao-2026', true, NULL)
ON CONFLICT (slug) DO NOTHING;

-- Atualizar todos os jogos existentes para pertencerem à Copa do Mundo 2026
-- Assumindo que o ID do torneio 'copa-2026' será 1 (ou buscamos dinamicamente)
UPDATE public.matches
SET tournament_id = (
    SELECT id FROM public.tournaments WHERE slug = 'copa-2026' LIMIT 1
)
WHERE tournament_id IS NULL;

-- ============================================
-- 5. MIGRAR PONTOS EXISTENTES PARA tournament_rankings
-- ============================================
-- Migrar os pontos atuais dos profiles para tournament_rankings do torneio 'copa-2026'
INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches)
SELECT 
    p.id as user_id,
    (SELECT id FROM public.tournaments WHERE slug = 'copa-2026' LIMIT 1) as tournament_id,
    p.total_points,
    p.exact_matches
FROM public.profiles p
WHERE p.total_points > 0 OR p.exact_matches > 0
ON CONFLICT (user_id, tournament_id) DO UPDATE
SET 
    total_points = EXCLUDED.total_points,
    exact_matches = EXCLUDED.exact_matches;

-- ============================================
-- 6. TRIGGER: Atualizar updated_at em tournament_rankings
-- ============================================
DROP TRIGGER IF EXISTS trigger_update_tournament_rankings_updated_at ON public.tournament_rankings;
CREATE TRIGGER trigger_update_tournament_rankings_updated_at
    BEFORE UPDATE ON public.tournament_rankings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. REESCREVER FUNÇÃO: process_match_finished
-- ============================================
-- Agora atualiza tournament_rankings baseado no tournament_id do jogo
CREATE OR REPLACE FUNCTION process_match_finished()
RETURNS TRIGGER AS $$
DECLARE
    prediction_record RECORD;
    calculated_points INTEGER;
    is_exact_match BOOLEAN;
    old_points INTEGER;
    match_tournament_id INTEGER;
BEGIN
    -- Só processa se o status mudou para 'FINISHED' e o placar está definido
    IF NEW.status = 'FINISHED' AND NEW.score_home IS NOT NULL AND NEW.score_away IS NOT NULL THEN
        -- Obter o tournament_id do jogo
        match_tournament_id := NEW.tournament_id;
        
        -- Verificar se o jogo tem um torneio associado
        IF match_tournament_id IS NULL THEN
            RAISE WARNING 'Jogo % não tem tournament_id associado. Pulando processamento de pontos.', NEW.id;
            RETURN NEW;
        END IF;
        
        -- Processar cada palpite deste jogo
        FOR prediction_record IN
            SELECT 
                p.id,
                p.user_id,
                p.pred_home,
                p.pred_away,
                p.points_earned as old_points_earned
            FROM public.predictions p
            WHERE p.match_id = NEW.id
        LOOP
            -- Calcular pontos do palpite
            calculated_points := calculate_prediction_points(
                prediction_record.pred_home,
                prediction_record.pred_away,
                NEW.score_home,
                NEW.score_away
            );
            
            -- Verificar se é cravada (placar exato)
            is_exact_match := (calculated_points = 20);
            
            -- Obter pontos antigos (se existirem)
            old_points := COALESCE(prediction_record.old_points_earned, 0);
            
            -- Atualizar points_earned na tabela predictions
            UPDATE public.predictions
            SET points_earned = calculated_points
            WHERE id = prediction_record.id;
            
            -- Atualizar (ou criar) tournament_rankings baseado no tournament_id do jogo
            -- Usar INSERT ... ON CONFLICT para garantir que o registro existe
            INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches)
            VALUES (
                prediction_record.user_id,
                match_tournament_id,
                calculated_points, -- Se for novo registro, começa com os pontos deste palpite
                CASE WHEN is_exact_match THEN 1 ELSE 0 END
            )
            ON CONFLICT (user_id, tournament_id) DO UPDATE
            SET 
                -- Ajustar pontos: subtrair os pontos antigos e adicionar os novos
                total_points = tournament_rankings.total_points - old_points + calculated_points,
                -- Ajustar exact_matches: incrementar se ganhou uma cravada, decrementar se perdeu uma
                exact_matches = CASE 
                    WHEN is_exact_match AND old_points != 20 THEN tournament_rankings.exact_matches + 1
                    WHEN NOT is_exact_match AND old_points = 20 THEN tournament_rankings.exact_matches - 1
                    ELSE tournament_rankings.exact_matches
                END,
                updated_at = NOW();
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. REESCREVER FUNÇÃO: recalculate_user_points
-- ============================================
-- Agora recalcula pontos por torneio
CREATE OR REPLACE FUNCTION recalculate_user_points(p_user_id UUID, p_tournament_id INTEGER DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
    total_points_sum INTEGER := 0;
    exact_matches_count INTEGER := 0;
    tournament_record RECORD;
BEGIN
    -- Se p_tournament_id foi fornecido, recalcular apenas para aquele torneio
    -- Caso contrário, recalcular para todos os torneios
    IF p_tournament_id IS NOT NULL THEN
        -- Recalcular total_points somando todos os points_earned do torneio
        SELECT COALESCE(SUM(p.points_earned), 0) INTO total_points_sum
        FROM public.predictions p
        INNER JOIN public.matches m ON p.match_id = m.id
        WHERE p.user_id = p_user_id AND m.tournament_id = p_tournament_id;
        
        -- Contar exact_matches (palpites com 20 pontos) do torneio
        SELECT COUNT(*) INTO exact_matches_count
        FROM public.predictions p
        INNER JOIN public.matches m ON p.match_id = m.id
        WHERE p.user_id = p_user_id 
          AND m.tournament_id = p_tournament_id 
          AND p.points_earned = 20;
        
        -- Atualizar ou criar ranking do torneio
        INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches)
        VALUES (p_user_id, p_tournament_id, total_points_sum, exact_matches_count)
        ON CONFLICT (user_id, tournament_id) DO UPDATE
        SET 
            total_points = total_points_sum,
            exact_matches = exact_matches_count,
            updated_at = NOW();
    ELSE
        -- Recalcular para todos os torneios
        FOR tournament_record IN
            SELECT DISTINCT m.tournament_id
            FROM public.matches m
            INNER JOIN public.predictions p ON m.id = p.match_id
            WHERE p.user_id = p_user_id AND m.tournament_id IS NOT NULL
        LOOP
            PERFORM recalculate_user_points(p_user_id, tournament_record.tournament_id);
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 9. ROW LEVEL SECURITY (RLS) - tournaments
-- ============================================
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode ler torneios (dados públicos)
DROP POLICY IF EXISTS "Tournaments are viewable by everyone" ON public.tournaments;
CREATE POLICY "Tournaments are viewable by everyone"
    ON public.tournaments
    FOR SELECT
    USING (true);

-- Apenas administradores podem inserir/atualizar torneios
-- (Ajuste conforme sua necessidade de autenticação de admin)
DROP POLICY IF EXISTS "Only admins can insert tournaments" ON public.tournaments;
CREATE POLICY "Only admins can insert tournaments"
    ON public.tournaments
    FOR INSERT
    WITH CHECK (false); -- Desabilitado por padrão - ajuste conforme necessário

DROP POLICY IF EXISTS "Only admins can update tournaments" ON public.tournaments;
CREATE POLICY "Only admins can update tournaments"
    ON public.tournaments
    FOR UPDATE
    USING (false) -- Desabilitado por padrão - ajuste conforme necessário
    WITH CHECK (false);

-- ============================================
-- 10. ROW LEVEL SECURITY (RLS) - tournament_rankings
-- ============================================
ALTER TABLE public.tournament_rankings ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode ler rankings (dados públicos)
DROP POLICY IF EXISTS "Tournament rankings are viewable by everyone" ON public.tournament_rankings;
CREATE POLICY "Tournament rankings are viewable by everyone"
    ON public.tournament_rankings
    FOR SELECT
    USING (true);

-- Apenas o sistema pode inserir/atualizar rankings (via triggers)
-- Usuários não podem modificar diretamente
DROP POLICY IF EXISTS "System can manage tournament rankings" ON public.tournament_rankings;
CREATE POLICY "System can manage tournament rankings"
    ON public.tournament_rankings
    FOR ALL
    USING (false) -- Desabilitado por padrão - apenas triggers podem modificar
    WITH CHECK (false);

-- ============================================
-- 11. CONSTRAINT: matches deve ter tournament_id
-- ============================================
-- Adicionar constraint NOT NULL após migração (opcional, descomente se necessário)
-- ALTER TABLE public.matches ALTER COLUMN tournament_id SET NOT NULL;

-- ============================================
-- 12. COMENTÁRIOS
-- ============================================
COMMENT ON TABLE public.tournaments IS 'Torneios disponíveis no sistema (Copa do Mundo, Paulistão, etc.)';
COMMENT ON TABLE public.tournament_rankings IS 'Rankings de usuários por torneio (substitui pontos no profile)';
COMMENT ON COLUMN public.matches.tournament_id IS 'ID do torneio ao qual este jogo pertence';
COMMENT ON COLUMN public.tournament_rankings.total_points IS 'Total de pontos acumulados pelo usuário neste torneio';
COMMENT ON COLUMN public.tournament_rankings.exact_matches IS 'Número de palpites exatos (placar correto) neste torneio';

COMMENT ON FUNCTION process_match_finished IS 'Processa todos os palpites quando um jogo é finalizado e atualiza as pontuações no tournament_rankings baseado no tournament_id';
COMMENT ON FUNCTION recalculate_user_points IS 'Recalcula todos os pontos de um usuário para um torneio específico ou todos os torneios';

