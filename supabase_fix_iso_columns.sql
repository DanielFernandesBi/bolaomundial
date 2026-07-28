-- ============================================
-- CORREÇÃO: Alterar tipo das colunas ISO
-- ============================================
-- Este script altera as colunas home_iso e away_iso de CHAR(2) para TEXT
-- para suportar códigos especiais como 'gb-eng', 'gb-sct', etc.

-- Alterar coluna home_iso
ALTER TABLE public.matches
ALTER COLUMN home_iso TYPE TEXT;

-- Alterar coluna away_iso
ALTER TABLE public.matches
ALTER COLUMN away_iso TYPE TEXT;

-- Atualizar comentários
COMMENT ON COLUMN public.matches.home_iso IS 'Código ISO ou identificador do país da equipe mandante (ex: br, ar, us, gb-eng, gb-sct, xx)';
COMMENT ON COLUMN public.matches.away_iso IS 'Código ISO ou identificador do país da equipe visitante (ex: br, ar, us, gb-eng, gb-sct, xx)';

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Execute esta query para verificar se as colunas foram alteradas corretamente:
-- SELECT column_name, data_type, character_maximum_length
-- FROM information_schema.columns
-- WHERE table_schema = 'public' 
--   AND table_name = 'matches' 
--   AND column_name IN ('home_iso', 'away_iso');

