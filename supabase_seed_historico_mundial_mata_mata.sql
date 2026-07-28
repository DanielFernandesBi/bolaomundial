-- ============================================
-- POPULAR HISTÓRICO: Mundial mata-mata
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
-- 2. Crie usuários com emails fictícios (ex: daniel.alves@historico.local)
-- 3. Depois, atualize o username na tabela profiles para o nome correto:
--    UPDATE public.profiles SET username = 'Daniel Alves' WHERE id = '<id_do_usuario_criado>';
-- 4. Execute este script novamente para criar os rankings

-- ============================================
-- 1. CRIAR O TORNEIO
-- ============================================
INSERT INTO public.tournaments (name, slug, active, created_at)
VALUES (
  'Mundial mata-mata',
  'mundial-mata-mata',
  false, -- Encerrado (active = false)
  NOW() - INTERVAL '1 year' - INTERVAL '6 months' -- Criado há 1 ano e meio (histórico)
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
  WHERE slug = 'mundial-mata-mata';

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Torneio não foi criado';
  END IF;

  -- ============================================
  -- 2. CRIAR RANKINGS DO TORNEIO
  -- ============================================
  -- Nota: Os rankings serão criados apenas se os perfis existirem
  -- Se um perfil não existir, o INSERT será ignorado silenciosamente
  
  -- 1º Daniel Alves = 136 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    136,
    0, -- Não temos dados de cravadas
    880.00, -- Prêmio do 1º lugar
    NOW() - INTERVAL '1 year' - INTERVAL '6 months',
    NOW() - INTERVAL '1 year' - INTERVAL '6 months'
  FROM public.profiles p
  WHERE p.username = 'Daniel Alves'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 136, prize_money = 880.00, updated_at = NOW();

  -- 2º Domingos Neto = 121 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    121,
    0,
    220.00, -- Prêmio do 2º lugar
    NOW() - INTERVAL '1 year' - INTERVAL '6 months',
    NOW() - INTERVAL '1 year' - INTERVAL '6 months'
  FROM public.profiles p
  WHERE p.username = 'Domingos Neto'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 121, prize_money = 220.00, updated_at = NOW();

  -- 3º Fabio Ribeiro = 105 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    105,
    0,
    0.00,
    NOW() - INTERVAL '1 year' - INTERVAL '6 months',
    NOW() - INTERVAL '1 year' - INTERVAL '6 months'
  FROM public.profiles p
  WHERE p.username = 'Fabio Ribeiro'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 105, prize_money = 0.00, updated_at = NOW();

  -- 4º Daniel Pires = 101 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    101,
    0,
    0.00,
    NOW() - INTERVAL '1 year' - INTERVAL '6 months',
    NOW() - INTERVAL '1 year' - INTERVAL '6 months'
  FROM public.profiles p
  WHERE p.username = 'Daniel Pires'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 101, prize_money = 0.00, updated_at = NOW();

  -- 5º Daniel Fernandes = 95 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    95,
    0,
    0.00,
    NOW() - INTERVAL '1 year' - INTERVAL '6 months',
    NOW() - INTERVAL '1 year' - INTERVAL '6 months'
  FROM public.profiles p
  WHERE p.username = 'Daniel Fernandes'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 95, prize_money = 0.00, updated_at = NOW();

  -- 6º Enio Bodelao = 93 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    93,
    0,
    0.00,
    NOW() - INTERVAL '1 year' - INTERVAL '6 months',
    NOW() - INTERVAL '1 year' - INTERVAL '6 months'
  FROM public.profiles p
  WHERE p.username = 'Enio Bodelao'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 93, prize_money = 0.00, updated_at = NOW();

  -- 7º Fernando Paulitsch = 93 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    93,
    0,
    0.00,
    NOW() - INTERVAL '1 year' - INTERVAL '6 months',
    NOW() - INTERVAL '1 year' - INTERVAL '6 months'
  FROM public.profiles p
  WHERE p.username = 'Fernando Paulitsch'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 93, prize_money = 0.00, updated_at = NOW();

  -- 8º Vitor Garcia = 89 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    89,
    0,
    0.00,
    NOW() - INTERVAL '1 year' - INTERVAL '6 months',
    NOW() - INTERVAL '1 year' - INTERVAL '6 months'
  FROM public.profiles p
  WHERE p.username = 'Vitor Garcia'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 89, prize_money = 0.00, updated_at = NOW();

  -- 9º Pedro Pin = 84 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    84,
    0,
    0.00,
    NOW() - INTERVAL '1 year' - INTERVAL '6 months',
    NOW() - INTERVAL '1 year' - INTERVAL '6 months'
  FROM public.profiles p
  WHERE p.username = 'Pedro Pin'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 84, prize_money = 0.00, updated_at = NOW();

  -- 10º Rubens Furusawa = 82 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    82,
    0,
    0.00,
    NOW() - INTERVAL '1 year' - INTERVAL '6 months',
    NOW() - INTERVAL '1 year' - INTERVAL '6 months'
  FROM public.profiles p
  WHERE p.username = 'Rubens Furusawa'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 82, prize_money = 0.00, updated_at = NOW();

  -- 11º Marcelo Graciano = 81 pontos
  INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches, prize_money, created_at, updated_at)
  SELECT 
    p.id,
    v_tournament_id,
    81,
    0,
    0.00,
    NOW() - INTERVAL '1 year' - INTERVAL '6 months',
    NOW() - INTERVAL '1 year' - INTERVAL '6 months'
  FROM public.profiles p
  WHERE p.username = 'Marcelo Graciano'
  ON CONFLICT (user_id, tournament_id) DO UPDATE
  SET total_points = 81, prize_money = 0.00, updated_at = NOW();

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
    NOW() - INTERVAL '1 year' - INTERVAL '6 months' - INTERVAL '3 months', -- Data no passado
    1,
    0,
    'FINISHED',
    v_tournament_id,
    NOW() - INTERVAL '1 year' - INTERVAL '6 months',
    NOW() - INTERVAL '1 year' - INTERVAL '6 months'
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

  RAISE NOTICE 'Torneio histórico "Mundial mata-mata" criado com sucesso! ID: %', v_tournament_id;
  RAISE NOTICE 'Torneio marcado como ENCERRADO (active = false e possui jogos finalizados)';
END $$;

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Execute estas queries para verificar:

-- Ver o torneio criado:
-- SELECT id, name, slug, active FROM public.tournaments WHERE slug = 'mundial-mata-mata';

-- Ver os rankings:
-- SELECT 
--   tr.total_points,
--   tr.prize_money,
--   p.username
-- FROM public.tournament_rankings tr
-- JOIN public.profiles p ON p.id = tr.user_id
-- JOIN public.tournaments t ON t.id = tr.tournament_id
-- WHERE t.slug = 'mundial-mata-mata'
-- ORDER BY tr.total_points DESC;

-- Ver total_money de cada jogador:
-- SELECT username, total_money FROM public.profiles WHERE total_money > 0 ORDER BY total_money DESC;

