-- ============================================
-- SEED: PAULISTÃO 2026 - JOGOS
-- ============================================
-- Este script popula a tabela matches com os jogos do Paulistão 2026
-- O torneio deve existir na tabela tournaments com slug 'paulistao-2026'

-- ============================================
-- MAPEAMENTO DE TIMES E LOGOS
-- ============================================
-- URLs dos escudos dos times (usando Wikimedia Commons e outras fontes estáveis)
-- Os campos home_iso e away_iso serão preenchidos com essas URLs
-- 
-- NOTA: As URLs dos logos são exemplos. Você pode precisar ajustá-las para URLs reais
-- dos escudos dos times. Algumas URLs podem não funcionar e precisarão ser substituídas.
-- Alternativas: logodownload.org, searchesvg.com, ou hospedar as imagens no Supabase Storage

-- ============================================
-- INSERÇÃO DOS JOGOS
-- ============================================
-- Usando CTE para buscar o ID do torneio
WITH tournament_info AS (
  SELECT id as tournament_id
  FROM public.tournaments
  WHERE slug = 'paulistao-2026'
  LIMIT 1
)
INSERT INTO public.matches (
  tournament_id,
  team_home,
  team_away,
  home_iso,
  away_iso,
  match_date,
  status
)
SELECT 
  ti.tournament_id,
  team_home,
  team_away,
  home_logo_url,
  away_logo_url,
  match_date::timestamp with time zone,
  'SCHEDULED'::text
FROM tournament_info ti
CROSS JOIN (VALUES
  -- RODADA 1
  ('São Bernardo', 'Capivariano', 'https://upload.wikimedia.org/wikipedia/pt/7/7a/Sao_Bernardo_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/1/1a/Capivariano_logo.png', '2026-01-10 15:00:00'),
  ('Santos', 'Novorizontino', 'https://upload.wikimedia.org/wikipedia/commons/3/35/Santos_logo.svg', 'https://upload.wikimedia.org/wikipedia/pt/5/5a/Novorizontino_logo.png', '2026-01-10 16:00:00'),
  ('Guarani', 'Primavera', 'https://upload.wikimedia.org/wikipedia/pt/8/8a/Guarani_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/4/4a/Primavera_logo.png', '2026-01-10 18:30:00'),
  ('Portuguesa', 'Palmeiras', 'https://upload.wikimedia.org/wikipedia/pt/6/6a/Portuguesa_logo.png', 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Palmeiras_logo.svg', '2026-01-10 20:30:00'),
  ('Corinthians', 'Ponte Preta', 'https://upload.wikimedia.org/wikipedia/pt/9/9b/Corinthians_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/9/9a/Ponte_Preta_logo.png', '2026-01-11 16:00:00'),
  ('Velo Clube', 'Botafogo-SP', 'https://upload.wikimedia.org/wikipedia/pt/2/2a/Velo_Clube_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/8/8b/Botafogo_FC_logo.png', '2026-01-11 17:00:00'),
  ('Noroeste', 'Red Bull Bragantino', 'https://upload.wikimedia.org/wikipedia/pt/3/3a/Noroeste_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/4/4b/Red_Bull_Bragantino_logo.png', '2026-01-11 18:15:00'),
  ('Mirassol', 'São Paulo', 'https://upload.wikimedia.org/wikipedia/pt/0/0a/Mirassol_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Sao_Paulo_FC_logo.svg', '2026-01-11 20:30:00'),

  -- RODADA 2
  ('Novorizontino', 'Guarani', 'https://upload.wikimedia.org/wikipedia/pt/5/5a/Novorizontino_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/8/8a/Guarani_FC_logo.png', '2026-01-13 19:00:00'),
  ('Capivariano', 'Portuguesa', 'https://upload.wikimedia.org/wikipedia/pt/1/1a/Capivariano_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/6/6a/Portuguesa_logo.png', '2026-01-13 21:30:00'),
  ('Primavera', 'Mirassol', 'https://upload.wikimedia.org/wikipedia/pt/4/4a/Primavera_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/0/0a/Mirassol_FC_logo.png', '2026-01-14 19:00:00'),
  ('Palmeiras', 'Santos', 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Palmeiras_logo.svg', 'https://upload.wikimedia.org/wikipedia/commons/3/35/Santos_logo.svg', '2026-01-14 19:30:00'),
  ('Ponte Preta', 'Velo Clube', 'https://upload.wikimedia.org/wikipedia/pt/9/9a/Ponte_Preta_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/2/2a/Velo_Clube_logo.png', '2026-01-14 21:00:00'),
  ('Botafogo-SP', 'Noroeste', 'https://upload.wikimedia.org/wikipedia/pt/8/8b/Botafogo_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/3/3a/Noroeste_logo.png', '2026-01-15 19:00:00'),
  ('Red Bull Bragantino', 'Corinthians', 'https://upload.wikimedia.org/wikipedia/pt/4/4b/Red_Bull_Bragantino_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/9/9b/Corinthians_logo.png', '2026-01-15 19:30:00'),
  ('São Paulo', 'São Bernardo', 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Sao_Paulo_FC_logo.svg', 'https://upload.wikimedia.org/wikipedia/pt/7/7a/Sao_Bernardo_FC_logo.png', '2026-01-15 21:45:00'),

  -- RODADA 3
  ('Primavera', 'Novorizontino', 'https://upload.wikimedia.org/wikipedia/pt/4/4a/Primavera_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/5/5a/Novorizontino_logo.png', '2026-01-17 16:00:00'),
  ('Portuguesa', 'Velo Clube', 'https://upload.wikimedia.org/wikipedia/pt/6/6a/Portuguesa_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/2/2a/Velo_Clube_logo.png', '2026-01-17 17:00:00'),
  ('Capivariano', 'Ponte Preta', 'https://upload.wikimedia.org/wikipedia/pt/1/1a/Capivariano_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/9/9a/Ponte_Preta_logo.png', '2026-01-17 18:30:00'),
  ('Palmeiras', 'Mirassol', 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Palmeiras_logo.svg', 'https://upload.wikimedia.org/wikipedia/pt/0/0a/Mirassol_FC_logo.png', '2026-01-17 20:30:00'),
  ('Corinthians', 'São Paulo', 'https://upload.wikimedia.org/wikipedia/pt/9/9b/Corinthians_logo.png', 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Sao_Paulo_FC_logo.svg', '2026-01-18 16:00:00'),
  ('São Bernardo', 'Noroeste', 'https://upload.wikimedia.org/wikipedia/pt/7/7a/Sao_Bernardo_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/3/3a/Noroeste_logo.png', '2026-01-18 17:00:00'),
  ('Red Bull Bragantino', 'Botafogo-SP', 'https://upload.wikimedia.org/wikipedia/pt/4/4b/Red_Bull_Bragantino_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/8/8b/Botafogo_FC_logo.png', '2026-01-18 18:15:00'),
  ('Guarani', 'Santos', 'https://upload.wikimedia.org/wikipedia/pt/8/8a/Guarani_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/commons/3/35/Santos_logo.svg', '2026-01-18 20:30:00'),

  -- RODADA 4
  ('Novorizontino', 'Palmeiras', 'https://upload.wikimedia.org/wikipedia/pt/5/5a/Novorizontino_logo.png', 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Palmeiras_logo.svg', '2026-01-20 20:00:00'),
  ('Noroeste', 'Capivariano', 'https://upload.wikimedia.org/wikipedia/pt/3/3a/Noroeste_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/1/1a/Capivariano_logo.png', '2026-01-21 19:00:00'),
  ('São Paulo', 'Portuguesa', 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Sao_Paulo_FC_logo.svg', 'https://upload.wikimedia.org/wikipedia/pt/6/6a/Portuguesa_logo.png', '2026-01-21 19:30:00'),
  ('Mirassol', 'Red Bull Bragantino', 'https://upload.wikimedia.org/wikipedia/pt/0/0a/Mirassol_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/4/4b/Red_Bull_Bragantino_logo.png', '2026-01-21 20:00:00'),
  ('Ponte Preta', 'São Bernardo', 'https://upload.wikimedia.org/wikipedia/pt/9/9a/Ponte_Preta_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/7/7a/Sao_Bernardo_FC_logo.png', '2026-01-21 21:30:00'),
  ('Santos', 'Corinthians', 'https://upload.wikimedia.org/wikipedia/commons/3/35/Santos_logo.svg', 'https://upload.wikimedia.org/wikipedia/pt/9/9b/Corinthians_logo.png', '2026-01-22 19:30:00'),
  ('Botafogo-SP', 'Primavera', 'https://upload.wikimedia.org/wikipedia/pt/8/8b/Botafogo_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/4/4a/Primavera_logo.png', '2026-01-22 20:00:00'),
  ('Velo Clube', 'Guarani', 'https://upload.wikimedia.org/wikipedia/pt/2/2a/Velo_Clube_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/8/8a/Guarani_FC_logo.png', '2026-01-22 21:30:00'),

  -- RODADA 5
  ('São Bernardo', 'Mirassol', 'https://upload.wikimedia.org/wikipedia/pt/7/7a/Sao_Bernardo_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/0/0a/Mirassol_FC_logo.png', '2026-01-24 16:00:00'),
  ('Ponte Preta', 'Noroeste', 'https://upload.wikimedia.org/wikipedia/pt/9/9a/Ponte_Preta_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/3/3a/Noroeste_logo.png', '2026-01-24 17:00:00'),
  ('Palmeiras', 'São Paulo', 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Palmeiras_logo.svg', 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Sao_Paulo_FC_logo.svg', '2026-01-24 18:30:00'),
  ('Santos', 'Red Bull Bragantino', 'https://upload.wikimedia.org/wikipedia/commons/3/35/Santos_logo.svg', 'https://upload.wikimedia.org/wikipedia/pt/4/4b/Red_Bull_Bragantino_logo.png', '2026-01-25 16:00:00'),
  ('Capivariano', 'Primavera', 'https://upload.wikimedia.org/wikipedia/pt/1/1a/Capivariano_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/4/4a/Primavera_logo.png', '2026-01-25 17:00:00'),
  ('Novorizontino', 'Botafogo-SP', 'https://upload.wikimedia.org/wikipedia/pt/5/5a/Novorizontino_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/8/8b/Botafogo_FC_logo.png', '2026-01-25 18:30:00'),
  ('Velo Clube', 'Corinthians', 'https://upload.wikimedia.org/wikipedia/pt/2/2a/Velo_Clube_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/9/9b/Corinthians_logo.png', '2026-01-25 20:30:00'),
  ('Portuguesa', 'Guarani', 'https://upload.wikimedia.org/wikipedia/pt/6/6a/Portuguesa_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/8/8a/Guarani_FC_logo.png', '2026-01-26 20:00:00'),

  -- RODADA 6
  ('Guarani', 'Ponte Preta', 'https://upload.wikimedia.org/wikipedia/pt/8/8a/Guarani_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/9/9a/Ponte_Preta_logo.png', '2026-01-31 16:00:00'),
  ('Corinthians', 'Capivariano', 'https://upload.wikimedia.org/wikipedia/pt/9/9b/Corinthians_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/1/1a/Capivariano_logo.png', '2026-01-31 18:30:00'),
  ('Botafogo-SP', 'Palmeiras', 'https://upload.wikimedia.org/wikipedia/pt/8/8b/Botafogo_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Palmeiras_logo.svg', '2026-01-31 20:30:00'),
  ('Primavera', 'Portuguesa', 'https://upload.wikimedia.org/wikipedia/pt/4/4a/Primavera_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/6/6a/Portuguesa_logo.png', '2026-01-31 20:30:00'),
  ('Noroeste', 'Velo Clube', 'https://upload.wikimedia.org/wikipedia/pt/3/3a/Noroeste_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/2/2a/Velo_Clube_logo.png', '2026-02-01 16:00:00'),
  ('Red Bull Bragantino', 'São Bernardo', 'https://upload.wikimedia.org/wikipedia/pt/4/4b/Red_Bull_Bragantino_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/7/7a/Sao_Bernardo_FC_logo.png', '2026-02-01 16:00:00'),
  ('Mirassol', 'Novorizontino', 'https://upload.wikimedia.org/wikipedia/pt/0/0a/Mirassol_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/5/5a/Novorizontino_logo.png', '2026-02-01 18:30:00'),
  ('São Paulo', 'Santos', 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Sao_Paulo_FC_logo.svg', 'https://upload.wikimedia.org/wikipedia/commons/3/35/Santos_logo.svg', '2026-02-01 20:30:00'),

  -- RODADA 7
  ('Portuguesa', 'Ponte Preta', 'https://upload.wikimedia.org/wikipedia/pt/6/6a/Portuguesa_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/9/9a/Ponte_Preta_logo.png', '2026-02-07 16:00:00'),
  ('Guarani', 'Botafogo-SP', 'https://upload.wikimedia.org/wikipedia/pt/8/8a/Guarani_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/8/8b/Botafogo_FC_logo.png', '2026-02-07 18:30:00'),
  ('Novorizontino', 'São Bernardo', 'https://upload.wikimedia.org/wikipedia/pt/5/5a/Novorizontino_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/7/7a/Sao_Bernardo_FC_logo.png', '2026-02-07 18:30:00'),
  ('São Paulo', 'Primavera', 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Sao_Paulo_FC_logo.svg', 'https://upload.wikimedia.org/wikipedia/pt/4/4a/Primavera_logo.png', '2026-02-07 20:30:00'),
  ('Noroeste', 'Santos', 'https://upload.wikimedia.org/wikipedia/pt/3/3a/Noroeste_logo.png', 'https://upload.wikimedia.org/wikipedia/commons/3/35/Santos_logo.svg', '2026-02-08 16:00:00'),
  ('Capivariano', 'Mirassol', 'https://upload.wikimedia.org/wikipedia/pt/1/1a/Capivariano_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/0/0a/Mirassol_FC_logo.png', '2026-02-08 18:30:00'),
  ('Velo Clube', 'Red Bull Bragantino', 'https://upload.wikimedia.org/wikipedia/pt/2/2a/Velo_Clube_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/4/4b/Red_Bull_Bragantino_logo.png', '2026-02-08 18:30:00'),
  ('Corinthians', 'Palmeiras', 'https://upload.wikimedia.org/wikipedia/pt/9/9b/Corinthians_logo.png', 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Palmeiras_logo.svg', '2026-02-08 20:30:00'),

  -- RODADA 8
  ('Botafogo-SP', 'Capivariano', 'https://upload.wikimedia.org/wikipedia/pt/8/8b/Botafogo_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/1/1a/Capivariano_logo.png', '2026-02-15 20:30:00'),
  ('Primavera', 'Noroeste', 'https://upload.wikimedia.org/wikipedia/pt/4/4a/Primavera_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/3/3a/Noroeste_logo.png', '2026-02-15 20:30:00'),
  ('Mirassol', 'Portuguesa', 'https://upload.wikimedia.org/wikipedia/pt/0/0a/Mirassol_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/6/6a/Portuguesa_logo.png', '2026-02-15 20:30:00'),
  ('Palmeiras', 'Guarani', 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Palmeiras_logo.svg', 'https://upload.wikimedia.org/wikipedia/pt/8/8a/Guarani_FC_logo.png', '2026-02-15 20:30:00'),
  ('Ponte Preta', 'São Paulo', 'https://upload.wikimedia.org/wikipedia/pt/9/9a/Ponte_Preta_logo.png', 'https://upload.wikimedia.org/wikipedia/commons/7/7a/Sao_Paulo_FC_logo.svg', '2026-02-15 20:30:00'),
  ('Red Bull Bragantino', 'Novorizontino', 'https://upload.wikimedia.org/wikipedia/pt/4/4b/Red_Bull_Bragantino_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/5/5a/Novorizontino_logo.png', '2026-02-15 20:30:00'),
  ('Santos', 'Velo Clube', 'https://upload.wikimedia.org/wikipedia/commons/3/35/Santos_logo.svg', 'https://upload.wikimedia.org/wikipedia/pt/2/2a/Velo_Clube_logo.png', '2026-02-15 20:30:00'),
  ('São Bernardo', 'Corinthians', 'https://upload.wikimedia.org/wikipedia/pt/7/7a/Sao_Bernardo_FC_logo.png', 'https://upload.wikimedia.org/wikipedia/pt/9/9b/Corinthians_logo.png', '2026-02-15 20:30:00')
) AS matches_data (
  team_home,
  team_away,
  home_logo_url,
  away_logo_url,
  match_date
)
WHERE ti.tournament_id IS NOT NULL;

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Execute esta query para verificar quantos jogos foram inseridos:
-- SELECT COUNT(*) FROM public.matches WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'paulistao-2026');
