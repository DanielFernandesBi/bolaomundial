-- ============================================================================
-- A lista curada de ligas a capturar.
--
-- O critério: competição profissional de adulto que algum bolão possa querer
-- um dia. Fica de fora, de propósito, o que a API manda em volume e ninguém
-- aposta — base (U17/U20), feminino, quarta divisão para baixo e amistoso.
--
-- Medido nos 3 dias que já estavam em cache: a API manda ~610 jogos/dia, a
-- regra antiga guardava ~50 e esta lista guarda ~63 (em agosto, com as ligas
-- europeias mal começadas). Guardar TUDO seriam ~610/dia — e o maior item
-- isolado do descarte são 328 amistosos em 3 dias.
-- ============================================================================

-- ── Lacunas na América do Sul ───────────────────────────────────────────────
-- Duas são falhas de cobertura que estavam passando despercebidas: a Venezuela
-- nunca foi cadastrada (por isso "liga 299" aparecia sem nome na tela de
-- apelidos) e o CLAUSURA uruguaio ficou de fora quando o Apertura entrou —
-- metade da temporada do Uruguai não estava sendo capturada.
INSERT INTO public.club_competition_weights (league_id, league_name, categoria, model_weight, capturar) VALUES
  (299,  'Venezuela Primera División',   'primeira_divisao', 1.00, true),
  (300,  'Venezuela Segunda División',   'segunda_divisao',  0.80, true),
  (1113, 'Copa Venezuela',               'copa_nacional',    1.00, true),
  (270,  'Uruguay Primera - Clausura',   'primeira_divisao', 1.00, true),
  (930,  'Copa Uruguay',                 'copa_nacional',    1.00, true),
  (501,  'Copa Paraguay',                'copa_nacional',    1.00, true),
  (917,  'Copa Ecuador',                 'copa_nacional',    1.00, true),
  (502,  'Copa Bicentenario',            'copa_nacional',    1.00, true),
  (1032, 'Copa de la Liga Profesional',  'primeira_divisao', 1.00, true),
  (1220, 'Copa de la Liga (Chile)',      'copa_nacional',    1.00, true),
  (711,  'Chile Segunda División',       'segunda_divisao',  0.60, true),
  (710,  'Bolivia Nacional B',           'segunda_divisao',  0.80, true),
  (131,  'Primera B Metropolitana',      'segunda_divisao',  0.60, true),
  (134,  'Torneo Federal A',             'segunda_divisao',  0.60, true),
  (76,   'Brasileiro Série D',           'segunda_divisao',  0.60, true),
  (632,  'Supercopa do Brasil',          'copa_nacional',    1.00, true),
  (843,  'Copa Verde',                   'copa_nacional',    0.80, true),
  (476,  'Paulista - A2',                'estadual',         0.60, true),
  (851,  'Carioca A2',                   'estadual',         0.60, true)
ON CONFLICT (provider, league_id) DO UPDATE SET capturar = true;

-- ── Fora da América do Sul: captura sim, modelo não ─────────────────────────
-- model_weight = 0 é intencional e não é desprezo: o prior do modelo é o Opta
-- Power Ranking da CONMEBOL, que não pontua clube europeu. Sem prior não há
-- como ancorar a força, então estas partidas viram histórico e estatística —
-- não evidência. No dia em que houver um prior para elas, muda-se o peso.
INSERT INTO public.club_competition_weights (league_id, league_name, categoria, model_weight, capturar) VALUES
  (39,  'Premier League',                'fora_conmebol', 0, true),
  (40,  'Championship',                  'fora_conmebol', 0, true),
  (140, 'La Liga',                       'fora_conmebol', 0, true),
  (141, 'La Liga 2',                     'fora_conmebol', 0, true),
  (135, 'Serie A (Itália)',              'fora_conmebol', 0, true),
  (136, 'Serie B (Itália)',              'fora_conmebol', 0, true),
  (78,  'Bundesliga',                    'fora_conmebol', 0, true),
  (79,  '2. Bundesliga',                 'fora_conmebol', 0, true),
  (61,  'Ligue 1',                       'fora_conmebol', 0, true),
  (62,  'Ligue 2',                       'fora_conmebol', 0, true),
  (94,  'Primeira Liga (Portugal)',      'fora_conmebol', 0, true),
  (88,  'Eredivisie',                    'fora_conmebol', 0, true),
  (2,   'UEFA Champions League',         'fora_conmebol', 0, true),
  (3,   'UEFA Europa League',            'fora_conmebol', 0, true),
  (848, 'UEFA Europa Conference League', 'fora_conmebol', 0, true),
  (15,  'FIFA Club World Cup',           'fora_conmebol', 0, true),
  (253, 'Major League Soccer',           'fora_conmebol', 0, true),
  (262, 'Liga MX',                       'fora_conmebol', 0, true)
ON CONFLICT (provider, league_id) DO UPDATE SET capturar = true;

-- O amistoso continua cadastrado com peso 0, mas SAI da captura: são 40% de
-- todo o volume da API e não descrevem competição nenhuma.
UPDATE public.club_competition_weights SET capturar = false WHERE league_id = 667;
