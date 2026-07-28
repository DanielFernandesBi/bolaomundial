-- ============================================
-- CORREÇÃO: Criar registros em tournament_rankings
-- para todos os usuários que fizeram palpites
-- ============================================
-- Este script corrige o problema onde usuários que fizeram palpites
-- não aparecem no ranking porque os registros só são criados quando
-- jogos são finalizados.

-- ============================================
-- 1. COPA DO MUNDO (copa-2026)
-- ============================================
-- Criar registros para todos os usuários que fizeram palpites na Copa,
-- mesmo que ainda não tenham pontos (jogos não finalizados)
INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches)
SELECT DISTINCT
    pred.user_id,
    (SELECT id FROM public.tournaments WHERE slug = 'copa-2026' LIMIT 1) as tournament_id,
    COALESCE(SUM(pred.points_earned), 0) as total_points,
    COUNT(CASE WHEN pred.points_earned = 20 THEN 1 END) as exact_matches
FROM public.predictions pred
INNER JOIN public.matches m ON pred.match_id = m.id
WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'copa-2026' LIMIT 1)
GROUP BY pred.user_id
ON CONFLICT (user_id, tournament_id) DO UPDATE
SET 
    total_points = EXCLUDED.total_points,
    exact_matches = EXCLUDED.exact_matches,
    updated_at = NOW();

-- ============================================
-- 2. PAULISTÃO 2026 (paulistao-2026)
-- ============================================
-- Criar registros para todos os usuários que fizeram palpites no Paulistão,
-- mesmo que ainda não tenham pontos (jogos não finalizados)
INSERT INTO public.tournament_rankings (user_id, tournament_id, total_points, exact_matches)
SELECT DISTINCT
    pred.user_id,
    (SELECT id FROM public.tournaments WHERE slug = 'paulistao-2026' LIMIT 1) as tournament_id,
    COALESCE(SUM(pred.points_earned), 0) as total_points,
    COUNT(CASE WHEN pred.points_earned = 20 THEN 1 END) as exact_matches
FROM public.predictions pred
INNER JOIN public.matches m ON pred.match_id = m.id
WHERE m.tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'paulistao-2026' LIMIT 1)
GROUP BY pred.user_id
ON CONFLICT (user_id, tournament_id) DO UPDATE
SET 
    total_points = EXCLUDED.total_points,
    exact_matches = EXCLUDED.exact_matches,
    updated_at = NOW();

-- ============================================
-- 3. VERIFICAÇÃO
-- ============================================
-- Execute estas queries para verificar os resultados:

-- Ver quantos registros existem por torneio:
-- SELECT 
--     t.name as tournament_name,
--     t.slug,
--     COUNT(tr.id) as total_rankings
-- FROM public.tournaments t
-- LEFT JOIN public.tournament_rankings tr ON t.id = tr.tournament_id
-- GROUP BY t.id, t.name, t.slug
-- ORDER BY t.name;

-- Ver todos os rankings da Copa:
-- SELECT 
--     p.username,
--     tr.total_points,
--     tr.exact_matches,
--     COUNT(DISTINCT pred.id) as total_predictions
-- FROM public.tournament_rankings tr
-- INNER JOIN public.profiles p ON tr.user_id = p.id
-- INNER JOIN public.tournaments t ON tr.tournament_id = t.id
-- LEFT JOIN public.predictions pred ON pred.user_id = p.id
-- LEFT JOIN public.matches m ON pred.match_id = m.id AND m.tournament_id = t.id
-- WHERE t.slug = 'copa-2026'
-- GROUP BY p.username, tr.total_points, tr.exact_matches
-- ORDER BY tr.total_points DESC, tr.exact_matches DESC;

-- Ver todos os rankings do Paulistão:
-- SELECT 
--     p.username,
--     tr.total_points,
--     tr.exact_matches,
--     COUNT(DISTINCT pred.id) as total_predictions
-- FROM public.tournament_rankings tr
-- INNER JOIN public.profiles p ON tr.user_id = p.id
-- INNER JOIN public.tournaments t ON tr.tournament_id = t.id
-- LEFT JOIN public.predictions pred ON pred.user_id = p.id
-- LEFT JOIN public.matches m ON pred.match_id = m.id AND m.tournament_id = t.id
-- WHERE t.slug = 'paulistao-2026'
-- GROUP BY p.username, tr.total_points, tr.exact_matches
-- ORDER BY tr.total_points DESC, tr.exact_matches DESC;

-- Ver usuários que fizeram palpites mas não aparecem no ranking:
-- SELECT DISTINCT
--     p.username,
--     t.name as tournament_name,
--     t.slug,
--     COUNT(pred.id) as total_predictions
-- FROM public.profiles p
-- INNER JOIN public.predictions pred ON pred.user_id = p.id
-- INNER JOIN public.matches m ON pred.match_id = m.id
-- INNER JOIN public.tournaments t ON m.tournament_id = t.id
-- LEFT JOIN public.tournament_rankings tr ON tr.user_id = p.id AND tr.tournament_id = t.id
-- WHERE tr.id IS NULL
-- GROUP BY p.username, t.name, t.slug
-- ORDER BY t.name, p.username;

