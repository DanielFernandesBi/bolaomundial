-- ============================================================================
-- Datas das oitavas da CONMEBOL Sul-Americana 2026.
--
-- Horários em BRASÍLIA (UTC-3, sem horário de verão desde 2019), gravados em
-- UTC como o resto da tabela.
--
-- O pareamento é por (competição, leg, mandante, visitante) e não por id: o id
-- é desta base, e a chave de negócio é legível e confere sozinha — se um nome
-- não bater, a linha simplesmente não é atualizada e a contagem final acusa.
--
-- BOTAFOGO x CIENCIANO (volta, 20/08) AINDA NÃO TEM HORÁRIO CONFIRMADO pela
-- CONMEBOL. Gravado às 19:00, que é o primeiro horário daquela data — o mais
-- CEDO entre os plausíveis, de propósito: o prazo de palpite é MIN(match_date)
-- da fase e já fecha em 11/08, então a escolha não muda a trava; e se um dia
-- mudar, errar para cedo fecha antes da bola rolar, errar para tarde deixaria
-- palpitar com jogo em andamento. Atualizar quando sair a tabela oficial.
-- ============================================================================

UPDATE public.matches m
   SET match_date = v.quando
  FROM (VALUES
    -- ── Ida ────────────────────────────────────────────────────────────────
    ('ida',   'Boca Juniors',           'Recoleta',               '2026-08-11 22:00:00+00'::TIMESTAMPTZ), -- 11/08 19:00
    ('ida',   'Bolivar',                'São Paulo',              '2026-08-12 00:30:00+00'),              -- 11/08 21:30
    ('ida',   'Tigre',                  'Montevideo City Torque', '2026-08-12 22:00:00+00'),              -- 12/08 19:00
    ('ida',   'Bragantino',             'Atlético-MG',            '2026-08-12 22:00:00+00'),              -- 12/08 19:00
    ('ida',   'Santa Fe',               'River Plate',            '2026-08-13 00:30:00+00'),              -- 12/08 21:30
    ('ida',   'Santos',                 'Macará',                 '2026-08-13 22:00:00+00'),              -- 13/08 19:00
    ('ida',   'Vasco da Gama',          'Olimpia',                '2026-08-13 22:00:00+00'),              -- 13/08 19:00
    ('ida',   'Cienciano',              'Botafogo',               '2026-08-14 00:30:00+00'),              -- 13/08 21:30
    -- ── Volta ──────────────────────────────────────────────────────────────
    ('volta', 'Recoleta',               'Boca Juniors',           '2026-08-18 22:00:00+00'),              -- 18/08 19:00
    ('volta', 'São Paulo',              'Bolivar',                '2026-08-19 00:30:00+00'),              -- 18/08 21:30
    ('volta', 'Atlético-MG',            'Bragantino',             '2026-08-19 22:00:00+00'),              -- 19/08 19:00
    ('volta', 'River Plate',            'Santa Fe',               '2026-08-20 00:30:00+00'),              -- 19/08 21:30
    ('volta', 'Montevideo City Torque', 'Tigre',                  '2026-08-20 00:30:00+00'),              -- 19/08 21:30
    ('volta', 'Macará',                 'Santos',                 '2026-08-20 22:00:00+00'),              -- 20/08 19:00
    ('volta', 'Olimpia',                'Vasco da Gama',          '2026-08-20 22:00:00+00'),              -- 20/08 19:00
    ('volta', 'Botafogo',               'Cienciano',              '2026-08-20 22:00:00+00')               -- 20/08 A CONFIRMAR
  ) AS v(leg, home, away, quando)
 WHERE m.tournament_id = (SELECT t.id FROM public.tournaments t WHERE t.slug = 'mata-mata-clubes-2026')
   AND m.competition = 'sudamericana'
   AND m.leg = v.leg
   AND m.team_home = v.home
   AND m.team_away = v.away;
