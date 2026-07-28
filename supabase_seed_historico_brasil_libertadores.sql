-- ============================================
-- POPULAR HISTÓRICO: Copa do Brasil, Libertadores, Sul Americana
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
-- 2. Atualiza o perfil "Impiedoso" para "Daniel Fernandes"
-- 3. Cria rankings apenas para perfis que já existem
--
-- Para criar os perfis dos outros jogadores:
-- 1. Vá em Authentication > Users no Supabase Dashboard
-- 2. Crie usuários com emails fictícios (ex: rubens.furusawa@historico.local)
-- 3. Depois, atualize o username na tabela profiles para o nome correto:
--    UPDATE public.profiles SET username = 'Rubens Furusawa' WHERE id = '<id_do_usuario_criado>';
-- 4. Execute este script novamente para criar os rankings

-- ============================================
-- 1. CRIAR O TORNEIO
-- ============================================
INSERT INTO public.tournaments (name, slug, active, created_at)
VALUES (
  'Copa do Brasil, Libertadores, Sul Americana',
  'copa-brasil-libertadores-sul-americana',
  false, -- Encerrado (active = false)
  NOW() - INTERVAL '1 year' -- Criado há 1 ano (histórico)
)
ON CONFLICT (slug) DO UPDATE
SET active = false; -- Garantir que está marcado como encerrado

-- Obter o ID do torneio criado
DO $$
DECLARE
  v_tournament_id INTEGER;
  v_daniel_fernandes_id UUID;
BEGIN
  -- Obter ID do torneio
  SELECT id INTO v_tournament_id
  FROM public.tournaments
  WHERE slug = 'copa-brasil-libertadores-sul-americana';

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Torneio não foi criado';
  END IF;

  -- ============================================
  -- 2. ATUALIZAR PERFIL EXISTENTE: Impiedoso -> Daniel Fernandes
  -- ============================================
  UPDATE public.profiles
  SET username = 'Daniel Fernandes'
  WHERE username = 'Impiedoso';

  -- Obter ID do Daniel Fernandes
  SELECT id INTO v_daniel_fernandes_id
  FROM public.profiles
  WHERE username = 'Daniel Fernandes';

  -- ============================================
  -- 3. CRIAR PERFIS QUE NÃO EXISTEM
  -- ============================================
  -- IMPORTANTE: Como profiles tem FK para auth.users, os perfis precisam
  -- ser criados manualmente no Supabase Auth primeiro.
  -- 
  -- Este script NÃO cria perfis automaticamente. Ele apenas cria os rankings
  -- para perfis que já existem. Se um perfil não existir, o ranking será ignorado.
  --
  -- Para criar os perfis manualmente:
  -- 1. Vá em Authentication > Users no Supabase Dashboard
  -- 2. Crie usuários com emails fictícios (ex: rubens.furusawa@historico.local)
  -- 3. Depois, atualize o username na tabela profiles para o nome correto
  -- 4. Execute este script novamente
  --
  -- Por enquanto, vamos apenas criar os rankings para perfis existentes.

  -- ============================================
  -- 4. CRIAR RANKINGS DO TORNEIO
  -- ============================================
  -- Nota: Os rankings serão criados apenas se os perfis existirem
  -- Se um perfil não existir, o INSERT será ignorado silenciosamente
  
  -- 1º Rubens Furusawa = 687 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    687,
    0, -- Não temos dados de cravadas
    420.00, -- Prêmio
    NOW() - INTERVAL '1 year',
    NOW() - INTERVAL '1 year'
  FROM public.profiles p
  WHERE p.username = 'Rubens Furusawa'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 687, prize_money = 420.00, updated_at = NOW();

  -- 2º Fernando Paulitsch = 632 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    632,
    0,
    120.00, -- Prêmio
    NOW() - INTERVAL '1 year',
    NOW() - INTERVAL '1 year'
  FROM public.profiles p
  WHERE p.username = 'Fernando Paulitsch'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 632, prize_money = 120.00, updated_at = NOW();

  -- 3º Vitor Garcia = 629 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    629,
    0,
    60.00, -- Prêmio
    NOW() - INTERVAL '1 year',
    NOW() - INTERVAL '1 year'
  FROM public.profiles p
  WHERE p.username = 'Vitor Garcia'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 629, prize_money = 60.00, updated_at = NOW();

  -- 4º Pedro Pin = 605 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    605,
    0,
    0.00,
    NOW() - INTERVAL '1 year',
    NOW() - INTERVAL '1 year'
  FROM public.profiles p
  WHERE p.username = 'Pedro Pin'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 605, prize_money = 0.00, updated_at = NOW();

  -- 5º Daniel Alves = 601 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    601,
    0,
    0.00,
    NOW() - INTERVAL '1 year',
    NOW() - INTERVAL '1 year'
  FROM public.profiles p
  WHERE p.username = 'Daniel Alves'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 601, prize_money = 0.00, updated_at = NOW();

  -- 6º Ênio Bodelão = 579 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    579,
    0,
    0.00,
    NOW() - INTERVAL '1 year',
    NOW() - INTERVAL '1 year'
  FROM public.profiles p
  WHERE p.username = 'Enio Bodelao'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 579, prize_money = 0.00, updated_at = NOW();

  -- 7º Daniel Pires = 574 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    574,
    0,
    0.00,
    NOW() - INTERVAL '1 year',
    NOW() - INTERVAL '1 year'
  FROM public.profiles p
  WHERE p.username = 'Daniel Pires'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 574, prize_money = 0.00, updated_at = NOW();

  -- 8º Marcelo Graciano = 572 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    572,
    0,
    0.00,
    NOW() - INTERVAL '1 year',
    NOW() - INTERVAL '1 year'
  FROM public.profiles p
  WHERE p.username = 'Marcelo Graciano'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 572, prize_money = 0.00, updated_at = NOW();

  -- 9º Domingos Neto = 554 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    554,
    0,
    0.00,
    NOW() - INTERVAL '1 year',
    NOW() - INTERVAL '1 year'
  FROM public.profiles p
  WHERE p.username = 'Domingos Neto'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 554, prize_money = 0.00, updated_at = NOW();

  -- 10º Daniel Fernandes = 524 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    524,
    0,
    0.00,
    NOW() - INTERVAL '1 year',
    NOW() - INTERVAL '1 year'
  FROM public.profiles p
  WHERE p.username = 'Daniel Fernandes'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 524, prize_money = 0.00, updated_at = NOW();

  -- 11º Vinícius Vaccaro = 522 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    522,
    0,
    0.00,
    NOW() - INTERVAL '1 year',
    NOW() - INTERVAL '1 year'
  FROM public.profiles p
  WHERE p.username = 'Vinicius Vaccaro'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 522, prize_money = 0.00, updated_at = NOW();

  -- 12º Fabio Ribeiro = 477 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    477,
    0,
    0.00,
    NOW() - INTERVAL '1 year',
    NOW() - INTERVAL '1 year'
  FROM public.profiles p
  WHERE p.username = 'Fabio Ribeiro'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 477, prize_money = 0.00, updated_at = NOW();

  -- ============================================
  -- 5. CRIAR JOGOS FINALIZADOS PARA MARCAR COMO ENCERRADO
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
    NOW() - INTERVAL '1 year' - INTERVAL '6 months', -- Data no passado
    1,
    0,
    'FINISHED',
    v_tournament_id,
    NOW() - INTERVAL '1 year',
    NOW() - INTERVAL '1 year'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.matches 
    WHERE tournament_id = v_tournament_id 
    AND status = 'FINISHED'
    LIMIT 1
  );

  -- ============================================
  -- 6. ATUALIZAR total_money EM CADA PERFIL
  -- ============================================
  -- Atualizar total_money somando todos os prize_money de cada jogador
  UPDATE public.profiles p
  SET total_money = COALESCE((
    SELECT SUM(tr.prize_money)
    FROM public.tournament_rankings tr
    WHERE tr.user_id = p.id
  ), 0.00);

  RAISE NOTICE 'Torneio histórico criado com sucesso! ID: %', v_tournament_id;
  RAISE NOTICE 'Torneio marcado como ENCERRADO (active = false e possui jogos finalizados)';
END $$;

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Execute estas queries para verificar:

-- Ver o torneio criado:
-- SELECT id, name, slug, active FROM public.tournaments WHERE slug = 'copa-brasil-libertadores-sul-americana';

-- Ver os rankings:
-- SELECT 
--   tr.total_points,
--   tr.prize_money,
--   p.username
-- FROM public.tournament_rankings tr
-- JOIN public.profiles p ON p.id = tr.user_id
-- JOIN public.tournaments t ON t.id = tr.tournament_id
-- WHERE t.slug = 'copa-brasil-libertadores-sul-americana'
-- ORDER BY tr.total_points DESC;

-- Ver total_money de cada jogador:
-- SELECT username, total_money FROM public.profiles WHERE total_money > 0 ORDER BY total_money DESC;

