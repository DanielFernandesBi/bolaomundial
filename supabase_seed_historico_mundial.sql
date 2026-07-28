-- ============================================
-- POPULAR HISTÓRICO: Mundial
-- ============================================
-- Este script cria o torneio histórico e popula os rankings
-- com os dados do bolão finalizado
--
-- IMPORTANTE: 
-- A tabela profiles tem FK para auth.users, então os perfis precisam
-- ser criados manualmente no Supabase Auth primeiro.
-- 
-- Este script NÃO cria perfis automaticamente. Ele apenas:
-- 1. Cria o torneio
-- 2. Cria rankings apenas para perfis que já existem
--
-- Para criar os perfis dos outros jogadores:
-- 1. Vá em Authentication > Users no Supabase Dashboard
-- 2. Crie usuários com emails fictícios (ex: pedro.pin@historico.local)
-- 3. Depois, atualize o username na tabela profiles para o nome correto:
--    UPDATE public.profiles SET username = 'Pedro Pin' WHERE id = '<id_do_usuario_criado>';
-- 4. Execute este script novamente para criar os rankings

-- ============================================
-- 1. CRIAR O TORNEIO
-- ============================================
INSERT INTO public.tournaments (name, slug, active, created_at)
VALUES (
  'Mundial',
  'mundial',
  false, -- Encerrado (active = false)
  NOW() - INTERVAL '2 years' -- Criado há 2 anos (histórico)
)
ON CONFLICT (slug) DO UPDATE
SET active = false; -- Garantir que está marcado como encerrado

-- Obter o ID do torneio criado
DO $$
DECLARE
  v_tournament_id INTEGER;
BEGIN
  -- Obter ID do torneio
  SELECT id INTO v_tournament_id
  FROM public.tournaments
  WHERE slug = 'mundial';

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Torneio não foi criado';
  END IF;

  -- ============================================
  -- 2. CRIAR RANKINGS DO TORNEIO
  -- ============================================
  -- Nota: Os rankings serão criados apenas se os perfis existirem
  -- Se um perfil não existir, o INSERT será ignorado silenciosamente
  
  -- 1º Pedro Pin = 435 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    435,
    0, -- Não temos dados de cravadas
    1100.00, -- Prêmio do 1º lugar
    NOW() - INTERVAL '2 years',
    NOW() - INTERVAL '2 years'
  FROM public.profiles p
  WHERE p.username = 'Pedro Pin'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 435, prize_money = 1100.00, updated_at = NOW();

  -- 2º Daniel Alves = 405 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    405,
    0,
    0.00,
    NOW() - INTERVAL '2 years',
    NOW() - INTERVAL '2 years'
  FROM public.profiles p
  WHERE p.username = 'Daniel Alves'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 405, prize_money = 0.00, updated_at = NOW();

  -- 3º Fernando Paulitsch = 396 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    396,
    0,
    0.00,
    NOW() - INTERVAL '2 years',
    NOW() - INTERVAL '2 years'
  FROM public.profiles p
  WHERE p.username = 'Fernando Paulitsch'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 396, prize_money = 0.00, updated_at = NOW();

  -- 4º Vitor Garcia = 381 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    381,
    0,
    0.00,
    NOW() - INTERVAL '2 years',
    NOW() - INTERVAL '2 years'
  FROM public.profiles p
  WHERE p.username = 'Vitor Garcia'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 381, prize_money = 0.00, updated_at = NOW();

  -- 5º Daniel Fernandes = 378 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    378,
    0,
    0.00,
    NOW() - INTERVAL '2 years',
    NOW() - INTERVAL '2 years'
  FROM public.profiles p
  WHERE p.username = 'Daniel Fernandes'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 378, prize_money = 0.00, updated_at = NOW();

  -- 6º Marcelo Graciano = 375 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    375,
    0,
    0.00,
    NOW() - INTERVAL '2 years',
    NOW() - INTERVAL '2 years'
  FROM public.profiles p
  WHERE p.username = 'Marcelo Graciano'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 375, prize_money = 0.00, updated_at = NOW();

  -- 7º Rubens Furusawa = 371 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    371,
    0,
    0.00,
    NOW() - INTERVAL '2 years',
    NOW() - INTERVAL '2 years'
  FROM public.profiles p
  WHERE p.username = 'Rubens Furusawa'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 371, prize_money = 0.00, updated_at = NOW();

  -- 8º Domingos Neto = 364 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    364,
    0,
    0.00,
    NOW() - INTERVAL '2 years',
    NOW() - INTERVAL '2 years'
  FROM public.profiles p
  WHERE p.username = 'Domingos Neto'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 364, prize_money = 0.00, updated_at = NOW();

  -- 9º Enio Bodelao = 360 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    360,
    0,
    0.00,
    NOW() - INTERVAL '2 years',
    NOW() - INTERVAL '2 years'
  FROM public.profiles p
  WHERE p.username = 'Enio Bodelao'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 360, prize_money = 0.00, updated_at = NOW();

  -- 10º Daniel Pires = 357 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    357,
    0,
    0.00,
    NOW() - INTERVAL '2 years',
    NOW() - INTERVAL '2 years'
  FROM public.profiles p
  WHERE p.username = 'Daniel Pires'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 357, prize_money = 0.00, updated_at = NOW();

  -- 11º Fabio Ribeiro = 353 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    353,
    0,
    0.00,
    NOW() - INTERVAL '2 years',
    NOW() - INTERVAL '2 years'
  FROM public.profiles p
  WHERE p.username = 'Fabio Ribeiro'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 353, prize_money = 0.00, updated_at = NOW();

  -- ============================================
  -- 3. CRIAR JOGOS FINALIZADOS PARA MARCAR COMO ENCERRADO
  -- ============================================
  -- Para que o torneio apareça como "Encerrado" (não apenas "Pendente"),
  -- precisamos criar pelo menos um jogo finalizado
  -- Vamos criar um jogo fictício finalizado
  INSERT INTO public.matches (
    team_home,
    team_away,
    match_date,
    score_home,
    score_away,
    status,
    tournament_id,
    created_at,
    updated_at
  )
  SELECT 
    'Time A',
    'Time B',
    NOW() - INTERVAL '2 years' - INTERVAL '6 months', -- Data no passado
    1,
    0,
    'FINISHED',
    v_tournament_id,
    NOW() - INTERVAL '2 years',
    NOW() - INTERVAL '2 years'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.matches 
    WHERE tournament_id = v_tournament_id 
    AND status = 'FINISHED'
    LIMIT 1
  );

  -- ============================================
  -- 4. ATUALIZAR total_money EM CADA PERFIL
  -- ============================================
  -- Atualizar total_money somando todos os prize_money de cada jogador
  UPDATE public.profiles p
  SET total_money = COALESCE((
    SELECT SUM(tr.prize_money)
    FROM public.tournament_rankings tr
    WHERE tr.user_id = p.id
  ), 0.00);

  RAISE NOTICE 'Torneio histórico "Mundial" criado com sucesso! ID: %', v_tournament_id;
  RAISE NOTICE 'Torneio marcado como ENCERRADO (active = false e possui jogos finalizados)';
END $$;

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Execute estas queries para verificar:

-- Ver o torneio criado:
-- SELECT id, name, slug, active FROM public.tournaments WHERE slug = 'mundial';

-- Ver os rankings:
-- SELECT 
--   tr.total_points,
--   tr.prize_money,
--   p.username
-- FROM public.tournament_rankings tr
-- JOIN public.profiles p ON p.id = tr.user_id
-- JOIN public.tournaments t ON t.id = tr.tournament_id
-- WHERE t.slug = 'mundial'
-- ORDER BY tr.total_points DESC;

-- Ver total_money de cada jogador:
-- SELECT username, total_money FROM public.profiles WHERE total_money > 0 ORDER BY total_money DESC;

