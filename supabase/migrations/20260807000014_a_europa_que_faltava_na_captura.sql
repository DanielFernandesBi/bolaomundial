-- ============================================================================
-- Alargar a captura: 22 competições europeias, a custo zero de API.
-- ============================================================================
-- A CONTA QUE JUSTIFICA ISTO. A varredura chama `/fixtures?date=`, que devolve
-- o dia INTEIRO do mundo. Medido em 08/08: 1.213 partidas de 261 ligas
-- chegaram na resposta; guardamos 106. As outras 1.107 foram baixadas,
-- percorridas e descartadas.
--
-- Ou seja: incluir liga nova não custa chamada nenhuma. A cota de 100/dia é
-- por REQUISIÇÃO, e a requisição já está sendo feita. O único custo é disco —
-- 2,2 KB por jogo, com o banco em 23 MB de 500 MB.
--
-- POR QUE AGORA. O plano gratuito não deixa buscar data passada: só acumulamos
-- daqui para a frente. A temporada europeia começa nas próximas semanas, e o
-- que não for capturado neste começo não volta. Um bolão europeu montado em
-- 2027 vai querer o histórico de 2026 — e ele só existirá se estiver sendo
-- gravado hoje.
--
-- O QUE ENTRA, e por quê:
--   • as COPAS NACIONAIS dos cinco grandes. Era o buraco mais evidente: já
--     tínhamos a liga de Inglaterra, Espanha, Itália, Alemanha e França, mas
--     não a copa do mesmo país — os mesmos clubes, jogos que sumiam;
--   • as PRIMEIRAS DIVISÕES que faltavam (Bélgica, Escócia, Suíça, Áustria,
--     Turquia, Grécia). São de onde saem metade dos adversários de fase de
--     grupos europeia;
--   • as SEGUNDAS relevantes (3. Liga, Segunda Liga, Eerste Divisie, League
--     One e Two). Elas fecham o caminho de acesso: clube que sobe aparece com
--     histórico, em vez de nascer do zero.
--
-- O QUE NÃO ENTRA, de propósito: amistosos de clube (132 num dia só), sub-19,
-- feminino e as divisões regionais alemãs, suíças e inglesas. É muito jogo que
-- ninguém vai apostar e que descreve mal a força de quem interessa — tudo isso
-- levaria a captura a ~970 MB/ano e estouraria o plano.
--
-- PESO ZERO, como todas as de fora da Conmebol. Elas não entram no modelo do
-- bolão atual: existem para ter histórico quando fizerem falta. `model_weight`
-- é o que separa "guardar" de "usar para projetar".
--
-- Os 22 ids foram lidos de `/leagues` da própria API, não de memória: id errado
-- captura nada, em silêncio, e só se descobre meses depois.
-- ============================================================================

INSERT INTO public.club_competition_weights
  (provider, league_id, league_name, categoria, model_weight, active, capturar, country)
VALUES
  -- Copas nacionais dos cinco grandes
  ('api_football',  45, 'FA Cup',                    'fora_conmebol', 0, true, true, 'England'),
  ('api_football',  48, 'League Cup (Inglaterra)',   'fora_conmebol', 0, true, true, 'England'),
  ('api_football', 143, 'Copa del Rey',              'fora_conmebol', 0, true, true, 'Spain'),
  ('api_football', 137, 'Coppa Italia',              'fora_conmebol', 0, true, true, 'Italy'),
  ('api_football',  81, 'DFB Pokal',                 'fora_conmebol', 0, true, true, 'Germany'),
  ('api_football',  66, 'Coupe de France',           'fora_conmebol', 0, true, true, 'France'),
  ('api_football',  96, 'Taça de Portugal',          'fora_conmebol', 0, true, true, 'Portugal'),
  ('api_football',  90, 'KNVB Beker',                'fora_conmebol', 0, true, true, 'Netherlands'),
  ('api_football', 147, 'Copa da Bélgica',           'fora_conmebol', 0, true, true, 'Belgium'),
  -- Primeiras divisões que faltavam
  ('api_football', 144, 'Jupiler Pro League',        'fora_conmebol', 0, true, true, 'Belgium'),
  ('api_football', 179, 'Premiership (Escócia)',     'fora_conmebol', 0, true, true, 'Scotland'),
  ('api_football', 207, 'Super League (Suíça)',      'fora_conmebol', 0, true, true, 'Switzerland'),
  ('api_football', 218, 'Bundesliga (Áustria)',      'fora_conmebol', 0, true, true, 'Austria'),
  ('api_football', 203, 'Süper Lig',                 'fora_conmebol', 0, true, true, 'Turkey'),
  ('api_football', 197, 'Super League 1 (Grécia)',   'fora_conmebol', 0, true, true, 'Greece'),
  -- Segundas divisões que fecham o caminho de acesso
  ('api_football',  80, '3. Liga (Alemanha)',        'fora_conmebol', 0, true, true, 'Germany'),
  ('api_football',  95, 'Segunda Liga (Portugal)',   'fora_conmebol', 0, true, true, 'Portugal'),
  ('api_football',  89, 'Eerste Divisie',            'fora_conmebol', 0, true, true, 'Netherlands'),
  ('api_football',  41, 'League One (Inglaterra)',   'fora_conmebol', 0, true, true, 'England'),
  ('api_football',  42, 'League Two (Inglaterra)',   'fora_conmebol', 0, true, true, 'England'),
  ('api_football', 180, 'Championship (Escócia)',    'fora_conmebol', 0, true, true, 'Scotland'),
  ('api_football', 204, '1. Lig (Turquia)',          'fora_conmebol', 0, true, true, 'Turkey')
ON CONFLICT (provider, league_id) DO UPDATE
   SET capturar = true, active = true,
       league_name = EXCLUDED.league_name,
       country = EXCLUDED.country;

-- ---------------------------------------------------------------------------
-- Verificação (feita na aplicação):
--   ligas capturadas ......... 74 -> 96
--   na primeira varredura .... 90 jogos das novas já entraram
--     League Cup 30 · 3. Liga 9 · Jupiler 8 · 1. Lig 8 · Segunda Liga 7
--     Suíça 6 · Escócia 6 · Áustria 5 · Coppa Italia 4 · Escócia B 4 · Eerste 3
-- ---------------------------------------------------------------------------
