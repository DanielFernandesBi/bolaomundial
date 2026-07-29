-- ============================================================================
-- pgTAP: funções puras de pontuação (a matemática do dinheiro)
-- Rodar: `supabase test db` (ou psql com pgTAP num banco com as migrações aplicadas)
-- ============================================================================
BEGIN;
SELECT plan(29);

-- ---- Pontuação do tempo normal (calculate_prediction_points) ----
SELECT is(calculate_prediction_points(2,1,2,1), 30, 'cravada (placar exato) = 30');
SELECT is(calculate_prediction_points(2,0,2,1), 17, 'vencedor + gols do vencedor = 17');
SELECT is(calculate_prediction_points(2,1,3,2), 15, 'vencedor + saldo = 15');
SELECT is(calculate_prediction_points(2,1,3,1), 12, 'vencedor + gols do perdedor = 12');
SELECT is(calculate_prediction_points(1,1,2,2), 15, 'empate seco = 15');
SELECT is(calculate_prediction_points(1,0,3,1), 10, 'vitória seca = 10');
SELECT is(calculate_prediction_points(1,0,1,3), 3,  'consolação (1 placar avulso) = 3');
SELECT is(calculate_prediction_points(0,1,2,0), 0,  'errou tudo = 0');
SELECT is(calculate_prediction_points(0,0,NULL,NULL), 0, 'sem placar real = 0');

-- ---- Pênaltis por vencedor (clubes) ----
SELECT is(calc_pen_winner_points('home','home'), 7, 'pênaltis: acertou o vencedor = 7');
SELECT is(calc_pen_winner_points('home','away'), 0, 'pênaltis: errou o vencedor = 0');
SELECT is(calc_pen_winner_points('home',NULL),   0, 'pênaltis: não houve = 0');
SELECT is(calc_pen_winner_points(NULL,'home'),   0, 'pênaltis: não palpitou = 0');

-- ---- Pênaltis por placar (Mundial legado) ----
SELECT is(calc_pen_points(3,1,3,1), 10, 'pênaltis legado: placar exato = 10');
SELECT is(calc_pen_points(2,1,4,3), 5,  'pênaltis legado: só o vencedor = 5');
SELECT is(calc_pen_points(1,2,3,1), 0,  'pênaltis legado: errou o vencedor = 0');
SELECT is(calc_pen_points(NULL,NULL,3,1), 0, 'pênaltis legado: sem palpite = 0');

-- ---- Prorrogação (Mundial legado) ----
SELECT is(calc_extra_points('home','home'), 5, 'prorrogação: acertou = 5');
SELECT is(calc_extra_points('home','away'), 0, 'prorrogação: errou = 0');
SELECT is(calc_extra_points('home',NULL),   0, 'prorrogação: não houve = 0');

-- ---- Pódio por competição (campeão 40 / vice 25 / consolação 10) ----
SELECT is(calc_podium_points_cv('A','B','A','B'), 65, 'pódio cv: campeão+vice exatos = 65');
SELECT is(calc_podium_points_cv('A','B','B','A'), 20, 'pódio cv: campeão↔vice trocados = 10+10');
SELECT is(calc_podium_points_cv('A','B','A','C'), 40, 'pódio cv: só o campeão = 40');
SELECT is(calc_podium_points_cv('A','B','C','A'), 10, 'pódio cv: campeão previsto foi vice = 10');
SELECT is(calc_podium_points_cv('A','B','C','D'), 0,  'pódio cv: errou tudo = 0');
SELECT is(calc_podium_points_cv('A','B',NULL,NULL), 0, 'pódio cv: sem resultado real = 0');

-- ---- Pódio legado (campeão 40 / vice 20 / terceiro 25 / consolação 10) ----
SELECT is(calc_podium_points('A','B','C','A','B','C'), 85, 'pódio legado exato = 40+20+25');
SELECT is(calc_podium_points('A','B','C','B','A','C'), 45, 'pódio legado com trocas = 10+10+25');
SELECT is(calc_podium_points('A','B','C','D','E','F'), 0,  'pódio legado: errou tudo = 0');

SELECT * FROM finish();
ROLLBACK;
