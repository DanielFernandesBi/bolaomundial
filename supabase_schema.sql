-- ============================================
-- BOLÃO DO MUNDIAL - SCHEMA DO BANCO DE DADOS
-- ============================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABELA: profiles
-- ============================================
-- Vinculada automaticamente à tabela auth.users do Supabase
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT NOT NULL UNIQUE,
    avatar_url TEXT,
    total_points INTEGER DEFAULT 0 NOT NULL,
    exact_matches INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Índices para profiles
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_total_points ON public.profiles(total_points DESC);

-- ============================================
-- TABELA: matches
-- ============================================
CREATE TABLE IF NOT EXISTS public.matches (
    id SERIAL PRIMARY KEY,
    team_home TEXT NOT NULL,
    team_away TEXT NOT NULL,
    match_date TIMESTAMP WITH TIME ZONE NOT NULL,
    score_home INTEGER,
    score_away INTEGER,
    status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'FINISHED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Índices para matches
CREATE INDEX IF NOT EXISTS idx_matches_match_date ON public.matches(match_date);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);

-- ============================================
-- TABELA: predictions
-- ============================================
CREATE TABLE IF NOT EXISTS public.predictions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    match_id INTEGER NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
    pred_home INTEGER NOT NULL,
    pred_away INTEGER NOT NULL,
    points_earned INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE(user_id, match_id) -- Um usuário só pode ter um palpite por jogo
);

-- Índices para predictions
CREATE INDEX IF NOT EXISTS idx_predictions_user_id ON public.predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON public.predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user_match ON public.predictions(user_id, match_id);

-- ============================================
-- TRIGGER: Impedir palpites após o início da PARTIDA
-- ============================================
-- Prazo por partida: o palpite trava no horário de início do jogo específico,
-- para todos os usuários (inclusive admin). Espelha o server action savePrediction
-- em app/[tournament]/matches/actions.ts.
--
-- Histórico: o banco de produção já teve uma versão desta função que travava por
-- INÍCIO DO TORNEIO (MIN(match_date)) com bypass de admin — regra antiga da fase
-- de grupos. Isso bloqueava não-admins em todos os jogos pendentes (até futuros)
-- assim que o mata-mata começava. Corrigido para o escopo por partida abaixo.
CREATE OR REPLACE FUNCTION public.check_prediction_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    match_start_time TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Data de início da PARTIDA específica deste palpite
    SELECT match_date INTO match_start_time
    FROM public.matches
    WHERE id = NEW.match_id;

    -- Sem data conhecida: permite
    IF match_start_time IS NULL THEN
        RETURN NEW;
    END IF;

    -- Bloqueia apenas se ESTA partida já começou (para todos, inclusive admin)
    IF NOW() > match_start_time THEN
        RAISE EXCEPTION 'A partida já começou. Palpites encerrados.';
    END IF;

    RETURN NEW;
END;
$$;

-- Remover a versão antiga (caso exista) para não manter dois triggers de prazo
DROP TRIGGER IF EXISTS trigger_check_match_date_insert ON public.predictions;
DROP TRIGGER IF EXISTS trigger_check_match_date_update ON public.predictions;
DROP FUNCTION IF EXISTS check_match_date();

-- Trigger único de prazo (INSERT e UPDATE)
DROP TRIGGER IF EXISTS tr_check_prediction_window ON public.predictions;
CREATE TRIGGER tr_check_prediction_window
    BEFORE INSERT OR UPDATE ON public.predictions
    FOR EACH ROW
    EXECUTE FUNCTION public.check_prediction_window();

-- ============================================
-- TRIGGER: Atualizar updated_at automaticamente
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger de updated_at em todas as tabelas
DROP TRIGGER IF EXISTS trigger_update_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_matches_updated_at ON public.matches;
CREATE TRIGGER trigger_update_matches_updated_at
    BEFORE UPDATE ON public.matches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_predictions_updated_at ON public.predictions;
CREATE TRIGGER trigger_update_predictions_updated_at
    BEFORE UPDATE ON public.predictions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLÍTICAS RLS: profiles
-- ============================================

-- Qualquer pessoa pode ler perfis (dados públicos)
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone"
    ON public.profiles
    FOR SELECT
    USING (true);

-- Usuários podem criar seu próprio perfil
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- Usuários podem atualizar apenas seu próprio perfil
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ============================================
-- POLÍTICAS RLS: matches
-- ============================================

-- Qualquer pessoa pode ler jogos (dados públicos)
DROP POLICY IF EXISTS "Matches are viewable by everyone" ON public.matches;
CREATE POLICY "Matches are viewable by everyone"
    ON public.matches
    FOR SELECT
    USING (true);

-- Apenas administradores podem inserir/atualizar jogos
-- (Ajuste conforme sua necessidade de autenticação de admin)
DROP POLICY IF EXISTS "Only admins can insert matches" ON public.matches;
CREATE POLICY "Only admins can insert matches"
    ON public.matches
    FOR INSERT
    WITH CHECK (false); -- Desabilitado por padrão - ajuste conforme necessário

DROP POLICY IF EXISTS "Only admins can update matches" ON public.matches;
CREATE POLICY "Only admins can update matches"
    ON public.matches
    FOR UPDATE
    USING (false) -- Desabilitado por padrão - ajuste conforme necessário
    WITH CHECK (false);

-- ============================================
-- POLÍTICAS RLS: predictions
-- ============================================

-- Qualquer pessoa pode ler palpites (dados públicos)
DROP POLICY IF EXISTS "Predictions are viewable by everyone" ON public.predictions;
CREATE POLICY "Predictions are viewable by everyone"
    ON public.predictions
    FOR SELECT
    USING (true);

-- Usuários podem criar apenas seus próprios palpites
DROP POLICY IF EXISTS "Users can insert their own predictions" ON public.predictions;
CREATE POLICY "Users can insert their own predictions"
    ON public.predictions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Usuários podem atualizar apenas seus próprios palpites
DROP POLICY IF EXISTS "Users can update their own predictions" ON public.predictions;
CREATE POLICY "Users can update their own predictions"
    ON public.predictions
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Usuários podem deletar apenas seus próprios palpites
DROP POLICY IF EXISTS "Users can delete their own predictions" ON public.predictions;
CREATE POLICY "Users can delete their own predictions"
    ON public.predictions
    FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- FUNÇÃO: Criar perfil automaticamente quando usuário se registra
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para criar perfil automaticamente
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- COMENTÁRIOS NAS TABELAS
-- ============================================
COMMENT ON TABLE public.profiles IS 'Perfis de usuários vinculados à autenticação do Supabase';
COMMENT ON TABLE public.matches IS 'Jogos do mundial';
COMMENT ON TABLE public.predictions IS 'Palpites dos usuários para os jogos';

COMMENT ON COLUMN public.profiles.id IS 'ID do usuário (FK para auth.users)';
COMMENT ON COLUMN public.profiles.total_points IS 'Total de pontos acumulados pelo usuário';
COMMENT ON COLUMN public.profiles.exact_matches IS 'Número de palpites exatos (placar correto)';
COMMENT ON COLUMN public.matches.status IS 'Status do jogo: SCHEDULED ou FINISHED';
COMMENT ON COLUMN public.predictions.points_earned IS 'Pontos ganhos neste palpite específico';

