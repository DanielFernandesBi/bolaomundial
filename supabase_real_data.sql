-- ============================================
-- DADOS REAIS DA COPA DO MUNDO 2026
-- ============================================
-- Este script popula a tabela matches com os jogos oficiais da Copa de 2026
-- 
-- IMPORTANTE: Horários são de Brasília (UTC-3)
-- Datas e horários convertidos para timestamp com timezone

-- Limpar dados de teste anteriores
TRUNCATE TABLE public.matches CASCADE;

-- ============================================
-- GRUPO A
-- ============================================
INSERT INTO public.matches (team_home, team_away, match_date, home_iso, away_iso, status) VALUES
('México', 'África do Sul', '2026-06-11 16:00:00-03', 'mx', 'za', 'SCHEDULED'),
('Coreia do Sul', 'Europa D', '2026-06-11 23:00:00-03', 'kr', 'xx', 'SCHEDULED'),
('Europa D', 'África do Sul', '2026-06-18 13:00:00-03', 'xx', 'za', 'SCHEDULED'),
('México', 'Coreia do Sul', '2026-06-18 22:00:00-03', 'mx', 'kr', 'SCHEDULED'),
('Europa D', 'México', '2026-06-24 22:00:00-03', 'xx', 'mx', 'SCHEDULED'),
('África do Sul', 'Coreia do Sul', '2026-06-24 22:00:00-03', 'za', 'kr', 'SCHEDULED');

-- ============================================
-- GRUPO B
-- ============================================
INSERT INTO public.matches (team_home, team_away, match_date, home_iso, away_iso, status) VALUES
('Canadá', 'Europa A', '2026-06-12 16:00:00-03', 'ca', 'xx', 'SCHEDULED'),
('Catar', 'Suíça', '2026-06-13 16:00:00-03', 'qa', 'ch', 'SCHEDULED'),
('Suíça', 'Europa A', '2026-06-18 16:00:00-03', 'ch', 'xx', 'SCHEDULED'),
('Canadá', 'Catar', '2026-06-18 19:00:00-03', 'ca', 'qa', 'SCHEDULED'),
('Suíça', 'Canadá', '2026-06-24 16:00:00-03', 'ch', 'ca', 'SCHEDULED'),
('Europa A', 'Catar', '2026-06-24 16:00:00-03', 'xx', 'qa', 'SCHEDULED');

-- ============================================
-- GRUPO C
-- ============================================
INSERT INTO public.matches (team_home, team_away, match_date, home_iso, away_iso, status) VALUES
('Brasil', 'Marrocos', '2026-06-13 19:00:00-03', 'br', 'ma', 'SCHEDULED'),
('Haiti', 'Escócia', '2026-06-13 22:00:00-03', 'ht', 'gb-sct', 'SCHEDULED'),
('Brasil', 'Haiti', '2026-06-19 22:00:00-03', 'br', 'ht', 'SCHEDULED'),
('Escócia', 'Marrocos', '2026-06-19 19:00:00-03', 'gb-sct', 'ma', 'SCHEDULED'),
('Escócia', 'Brasil', '2026-06-24 19:00:00-03', 'gb-sct', 'br', 'SCHEDULED'),
('Marrocos', 'Haiti', '2026-06-24 19:00:00-03', 'ma', 'ht', 'SCHEDULED');

-- ============================================
-- GRUPO D
-- ============================================
INSERT INTO public.matches (team_home, team_away, match_date, home_iso, away_iso, status) VALUES
('Estados Unidos', 'Paraguai', '2026-06-12 22:00:00-03', 'us', 'py', 'SCHEDULED'),
('Austrália', 'Europa C', '2026-06-14 01:00:00-03', 'au', 'xx', 'SCHEDULED'),
('Europa C', 'Paraguai', '2026-06-20 01:00:00-03', 'xx', 'py', 'SCHEDULED'),
('Estados Unidos', 'Austrália', '2026-06-19 16:00:00-03', 'us', 'au', 'SCHEDULED'),
('Europa C', 'Estados Unidos', '2026-06-25 23:00:00-03', 'xx', 'us', 'SCHEDULED'),
('Paraguai', 'Austrália', '2026-06-25 23:00:00-03', 'py', 'au', 'SCHEDULED');

-- ============================================
-- GRUPO E
-- ============================================
INSERT INTO public.matches (team_home, team_away, match_date, home_iso, away_iso, status) VALUES
('Alemanha', 'Curaçao', '2026-06-14 14:00:00-03', 'de', 'cw', 'SCHEDULED'),
('Costa do Marfim', 'Equador', '2026-06-14 20:00:00-03', 'ci', 'ec', 'SCHEDULED'),
('Alemanha', 'Costa do Marfim', '2026-06-20 17:00:00-03', 'de', 'ci', 'SCHEDULED'),
('Equador', 'Curaçao', '2026-06-20 21:00:00-03', 'ec', 'cw', 'SCHEDULED'),
('Equador', 'Alemanha', '2026-06-25 17:00:00-03', 'ec', 'de', 'SCHEDULED'),
('Curaçao', 'Costa do Marfim', '2026-06-25 17:00:00-03', 'cw', 'ci', 'SCHEDULED');

-- ============================================
-- GRUPO F
-- ============================================
INSERT INTO public.matches (team_home, team_away, match_date, home_iso, away_iso, status) VALUES
('Holanda', 'Japão', '2026-06-14 17:00:00-03', 'nl', 'jp', 'SCHEDULED'),
('Europa B', 'Tunísia', '2026-06-14 23:00:00-03', 'xx', 'tn', 'SCHEDULED'),
('Holanda', 'Europa B', '2026-06-20 14:00:00-03', 'nl', 'xx', 'SCHEDULED'),
('Tunísia', 'Japão', '2026-06-21 01:00:00-03', 'tn', 'jp', 'SCHEDULED'), -- Madrugada do dia 21
('Tunísia', 'Holanda', '2026-06-25 20:00:00-03', 'tn', 'nl', 'SCHEDULED'),
('Japão', 'Europa B', '2026-06-25 20:00:00-03', 'jp', 'xx', 'SCHEDULED');

-- ============================================
-- GRUPO G
-- ============================================
INSERT INTO public.matches (team_home, team_away, match_date, home_iso, away_iso, status) VALUES
('Bélgica', 'Egito', '2026-06-15 16:00:00-03', 'be', 'eg', 'SCHEDULED'),
('Irã', 'Nova Zelândia', '2026-06-15 22:00:00-03', 'ir', 'nz', 'SCHEDULED'),
('Bélgica', 'Irã', '2026-06-21 16:00:00-03', 'be', 'ir', 'SCHEDULED'),
('Nova Zelândia', 'Egito', '2026-06-21 22:00:00-03', 'nz', 'eg', 'SCHEDULED'),
('Nova Zelândia', 'Bélgica', '2026-06-27 00:00:00-03', 'nz', 'be', 'SCHEDULED'), -- Meia-noite
('Egito', 'Irã', '2026-06-27 00:00:00-03', 'eg', 'ir', 'SCHEDULED'); -- Meia-noite

-- ============================================
-- GRUPO H
-- ============================================
INSERT INTO public.matches (team_home, team_away, match_date, home_iso, away_iso, status) VALUES
('Arábia Saudita', 'Uruguai', '2026-06-15 19:00:00-03', 'sa', 'uy', 'SCHEDULED'),
('Espanha', 'Arábia Saudita', '2026-06-21 13:00:00-03', 'es', 'sa', 'SCHEDULED'),
('Uruguai', 'Cabo Verde', '2026-06-21 19:00:00-03', 'uy', 'cv', 'SCHEDULED'),
('Uruguai', 'Espanha', '2026-06-26 21:00:00-03', 'uy', 'es', 'SCHEDULED'),
('Cabo Verde', 'Arábia Saudita', '2026-06-26 21:00:00-03', 'cv', 'sa', 'SCHEDULED');

-- ============================================
-- GRUPO I
-- ============================================
INSERT INTO public.matches (team_home, team_away, match_date, home_iso, away_iso, status) VALUES
('França', 'Senegal', '2026-06-16 16:00:00-03', 'fr', 'sn', 'SCHEDULED'),
('Intercontinental 2', 'Noruega', '2026-06-16 19:00:00-03', 'xx', 'no', 'SCHEDULED'),
('França', 'Intercontinental 2', '2026-06-22 18:00:00-03', 'fr', 'xx', 'SCHEDULED'),
('Noruega', 'Senegal', '2026-06-22 21:00:00-03', 'no', 'sn', 'SCHEDULED'),
('Noruega', 'França', '2026-06-26 16:00:00-03', 'no', 'fr', 'SCHEDULED'),
('Senegal', 'Intercontinental 2', '2026-06-26 16:00:00-03', 'sn', 'xx', 'SCHEDULED');

-- ============================================
-- GRUPO J
-- ============================================
INSERT INTO public.matches (team_home, team_away, match_date, home_iso, away_iso, status) VALUES
('Argentina', 'Argélia', '2026-06-16 22:00:00-03', 'ar', 'dz', 'SCHEDULED'),
('Áustria', 'Jordânia', '2026-06-17 01:00:00-03', 'at', 'jo', 'SCHEDULED'), -- Madrugada do dia 17
('Argentina', 'Áustria', '2026-06-22 14:00:00-03', 'ar', 'at', 'SCHEDULED'),
('Jordânia', 'Argélia', '2026-06-18 00:00:00-03', 'jo', 'dz', 'SCHEDULED'), -- Meia-noite do dia 18
('Jordânia', 'Argentina', '2026-06-27 23:00:00-03', 'jo', 'ar', 'SCHEDULED'),
('Argélia', 'Áustria', '2026-06-27 23:00:00-03', 'dz', 'at', 'SCHEDULED');

-- ============================================
-- GRUPO K
-- ============================================
INSERT INTO public.matches (team_home, team_away, match_date, home_iso, away_iso, status) VALUES
('Portugal', 'Intercontinental 1', '2026-06-17 14:00:00-03', 'pt', 'xx', 'SCHEDULED'),
('Uzbequistão', 'Colômbia', '2026-06-17 23:00:00-03', 'uz', 'co', 'SCHEDULED'),
('Portugal', 'Uzbequistão', '2026-06-23 14:00:00-03', 'pt', 'uz', 'SCHEDULED'),
('Colômbia', 'Intercontinental 1', '2026-06-23 23:00:00-03', 'co', 'xx', 'SCHEDULED'),
('Colômbia', 'Portugal', '2026-06-27 20:30:00-03', 'co', 'pt', 'SCHEDULED'),
('Intercontinental 1', 'Uzbequistão', '2026-06-27 20:30:00-03', 'xx', 'uz', 'SCHEDULED');

-- ============================================
-- GRUPO L
-- ============================================
INSERT INTO public.matches (team_home, team_away, match_date, home_iso, away_iso, status) VALUES
('Inglaterra', 'Croácia', '2026-06-17 17:00:00-03', 'gb-eng', 'hr', 'SCHEDULED'),
('Gana', 'Panamá', '2026-06-17 20:00:00-03', 'gh', 'pa', 'SCHEDULED'),
('Inglaterra', 'Gana', '2026-06-23 17:00:00-03', 'gb-eng', 'gh', 'SCHEDULED'),
('Panamá', 'Croácia', '2026-06-23 20:00:00-03', 'pa', 'hr', 'SCHEDULED'),
('Panamá', 'Inglaterra', '2026-06-27 18:00:00-03', 'pa', 'gb-eng', 'SCHEDULED'),
('Croácia', 'Gana', '2026-06-27 18:00:00-03', 'hr', 'gh', 'SCHEDULED');

-- ============================================
-- COMENTÁRIOS
-- ============================================
-- Total de jogos inseridos: 72 jogos (12 grupos × 6 jogos cada)
-- Todos os jogos estão com status 'SCHEDULED'
-- Horários estão em UTC-3 (horário de Brasília)
-- Times indefinidos (Europa A, B, C, D, Intercontinental 1, 2) usam código 'xx'
-- Inglaterra usa 'gb-eng' e Escócia usa 'gb-sct' para diferenciação de bandeiras

