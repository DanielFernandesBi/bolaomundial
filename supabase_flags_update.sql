-- ============================================
-- ATUALIZAÇÃO: Adicionar códigos ISO para bandeiras
-- ============================================

-- Adicionar colunas para códigos ISO dos países
ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS home_iso CHAR(2),
ADD COLUMN IF NOT EXISTS away_iso CHAR(2);

-- Comentários nas novas colunas
COMMENT ON COLUMN public.matches.home_iso IS 'Código ISO 3166-1 alpha-2 do país da equipe mandante (ex: br, ar, us)';
COMMENT ON COLUMN public.matches.away_iso IS 'Código ISO 3166-1 alpha-2 do país da equipe visitante (ex: br, ar, us)';

-- ============================================
-- ATUALIZAR DADOS EXISTENTES COM CÓDIGOS ISO
-- ============================================

-- Grupo A
UPDATE public.matches
SET home_iso = 'br', away_iso = 'rs'
WHERE team_home = 'Brasil' AND team_away = 'Sérvia';

UPDATE public.matches
SET home_iso = 'ch', away_iso = 'cm'
WHERE team_home = 'Suíça' AND team_away = 'Camarões';

UPDATE public.matches
SET home_iso = 'br', away_iso = 'ch'
WHERE team_home = 'Brasil' AND team_away = 'Suíça';

UPDATE public.matches
SET home_iso = 'cm', away_iso = 'rs'
WHERE team_home = 'Camarões' AND team_away = 'Sérvia';

UPDATE public.matches
SET home_iso = 'cm', away_iso = 'br'
WHERE team_home = 'Camarões' AND team_away = 'Brasil';

UPDATE public.matches
SET home_iso = 'rs', away_iso = 'ch'
WHERE team_home = 'Sérvia' AND team_away = 'Suíça';

-- Grupo B
UPDATE public.matches
SET home_iso = 'gb', away_iso = 'ir'
WHERE team_home = 'Inglaterra' AND team_away = 'Irã';

UPDATE public.matches
SET home_iso = 'us', away_iso = 'gb'
WHERE team_home = 'Estados Unidos' AND team_away = 'País de Gales';

UPDATE public.matches
SET home_iso = 'gb', away_iso = 'us'
WHERE team_home = 'Inglaterra' AND team_away = 'Estados Unidos';

UPDATE public.matches
SET home_iso = 'gb', away_iso = 'ir'
WHERE team_home = 'País de Gales' AND team_away = 'Irã';

-- ============================================
-- NOTAS SOBRE OS CÓDIGOS ISO
-- ============================================
-- Brasil: br
-- Sérvia: rs
-- Suíça: ch
-- Camarões: cm
-- Inglaterra: gb (Reino Unido - usado para Inglaterra em contextos de futebol)
-- Irã: ir
-- Estados Unidos: us
-- País de Gales: gb (parte do Reino Unido, mas para fins de exibição de bandeiras,
--                    pode ser necessário usar uma URL específica ou código alternativo)

