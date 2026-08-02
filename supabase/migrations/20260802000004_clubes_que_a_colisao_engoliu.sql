-- ============================================================================
-- 19 clubes do Opta nunca entraram no mapa. É a raiz de todos os homônimos.
-- ============================================================================
-- `club_source_ids.team_key` é UNIQUE e o import do snapshot derivou a chave do
-- NOME. Em cada colisão, o primeiro entrou e o resto foi descartado em
-- silêncio. O snapshot ativo tem 403 clubes; o mapa ficou com 384.
--
-- É por isso que os homônimos apareciam: o clube existia no Opta, com rating
-- próprio, mas não tinha entrada no mapa — então o jogo dele resolvia para o
-- clube de mesmo nome que tinha entrado.
--
--   Santos FC (Peru, Liga 2)          -> caía no Santos-BR
--   CA River Plate (Uruguai)          -> caía no River-ARG
--   U. Católica del Ecuador           -> caía na U. Católica-CHI
--   Portuguesa FC (Venezuela)         -> cairia na Portuguesa-BR
--   CD Recoleta (Chile)               -> caía no Recoleta-PAR
--   Fortaleza FC (Colômbia)           -> cairia no Fortaleza-BR
--   Club River Plate (Paraguai)       -> cairia no River-ARG
--
-- E quando os DOIS lados da colisão eram novos, os DOIS sumiam. É o caso de
-- CA Independiente (rank global 121) e Club Libertad (rank 370) — dois dos
-- maiores clubes da América do Sul, simplesmente ausentes do mapa, junto com
-- Leones, Colón, Sol de América e Atenas, todos em pares.
--
-- ----------------------------------------------------------------------------
-- O que esta migração faz
-- ----------------------------------------------------------------------------
-- 1. Cria os 19 com chave QUALIFICADA (cidade/região), como o mapa já fazia em
--    "Mitre Santiago d. Estero", "Estudiantes Río Cuarto", "Gimnasia La Plata".
--    Cada um carrega o `opta_contestant_id` do snapshot, então nasce com rating
--    e pode ser adversário válido no modelo.
--
-- 2. Fixa o `api_football_id` dos 13 que já vimos em campo. Cada um foi
--    conferido pelo par liga+país contra o registro do Opta — não pelo nome.
--
-- 3. `club_resolve_id` passa a tentar o ID ANTES do nome. É o que resolve o
--    caso que nenhum apelido resolveria: a API manda "Santos" tanto para o id
--    128 quanto para o 4226, e o espaço de apelidos só comporta um "santos".
--    Com o id na frente, cada um vai para o seu clube, e o nome vira só o
--    caminho de quem ainda não tem id fixado.
--
-- 4. Índice único em `api_football_id`: agora que o id decide identidade, dois
--    clubes não podem reivindicar o mesmo.
-- ============================================================================

-- ── 1. Um id de provedor, um clube ──────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS club_source_ids_api_football_id_idx
  ON public.club_source_ids (api_football_id) WHERE api_football_id IS NOT NULL;

-- ── 2. Os 19 que a colisão engoliu ──────────────────────────────────────────
-- `api_football_id` só é preenchido onde o clube JÁ FOI VISTO em campo e o par
-- liga+país bate com o registro do Opta. Os seis sem id ficam protegidos pela
-- regra de país até aparecerem.
INSERT INTO public.club_source_ids
  (team_key, canonical_name, country, opta_contestant_id, api_football_id, is_bolao_team)
VALUES
  ('independiente avellaneda', 'Independiente Avellaneda', 'Argentina', 'ag3u5yhvyaxwtebl9xp5e2vaa', 453,   false),
  ('universidad catolica quito','Universidad Católica Quito','Ecuador',  '85tqel61vdk8sfz1vsb1jykk7', 1157,  false),
  ('libertad asuncion',        'Libertad Asunción',        'Paraguay',  '984ibdjplnlwb36kt6wbgwe97', 1179,  false),
  ('fortaleza ceif',           'Fortaleza CEIF',           'Colombia',  '263edk7xyjafv0cfktqymjcmn', 1147,  false),
  ('leones fc equador',        'Leones FC (Equador)',      'Ecuador',   '1ixo4545wkh4oe83osm4tg0a2', NULL,  false),
  ('libertad loja',            'Libertad de Loja',         'Ecuador',   '37k9jifjhdcnb31yzzkmo7uhg', 18762, false),
  ('colon de santa fe',        'Colón de Santa Fe',        'Argentina', '64a7qygl90q6k3319f29fwduo', 448,   false),
  ('portuguesa fc',            'Portuguesa FC',            'Venezuela', '3x8x3dd40vugloa78gehb12u2', 2814,  false),
  ('recoleta chile',           'Recoleta (Chile)',         'Chile',     'ass7ef9okv29r1os5500q1ckg', 5644,  false),
  ('independiente petrolero',  'Independiente Petrolero',  'Bolivia',   '4wok4lbythsvj88b2odi6eooa', 15702, false),
  ('sol de america asuncion',  'Sol de América (Assunção)','Paraguay',  'an573q9co58ebwecdvo8w3osc', NULL,  false),
  ('atenas de rio cuarto',     'Atenas de Río Cuarto',     'Argentina', '13x6pponjb28rc5ydtk8k0yxh', NULL,  false),
  ('sol de america formosa',   'Sol de América de Formosa','Argentina', '522mp6j6hmoo671etzul59l6n', 3982,  false),
  ('colon fc uruguai',         'Colón FC (Uruguai)',       'Uruguay',   'cj68g7psgmrw4nwka2pvpys6t', NULL,  false),
  ('leones fc colombia',       'Leones FC (Colômbia)',     'Colombia',  '6rigic3bl36srv4lgojqo1kz8', NULL,  false),
  ('santos fc peru',           'Santos FC (Peru)',         'Peru',      '4e8lgm9vye64u2qccotpbnmui', 4226,  false),
  ('river plate asuncion',     'River Plate Asunción',     'Paraguay',  '1zfrk0ghec8v3kx58p7whxzbi', NULL,  false),
  ('river plate montevideo',   'River Plate Montevideo',   'Uruguay',   'eelwjx75tbefadtw1bfkoroq6', 2351,  false),
  ('atenas san carlos',        'Atenas San Carlos',        'Uruguay',   'gyphzmrnoe4kbuvklw04s5ec',  NULL,  false)
ON CONFLICT (team_key) DO NOTHING;

-- ── 3. O ID vem antes do nome ───────────────────────────────────────────────
-- Nenhum apelido resolveria o caso do Santos: a API manda o mesmo texto
-- "Santos" para o clube brasileiro (128) e para o peruano (4226), e `alias` é
-- chave primária — só cabe um. O id não tem esse problema.
CREATE OR REPLACE FUNCTION public.club_resolve_id(
  p_nome           TEXT,
  p_provider_id    BIGINT,
  p_league_country TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_key   TEXT;
  v_pino  BIGINT;
  v_pais  TEXT;
BEGIN
  -- (0) O id manda. Conhecendo este id, o clube é esse — o nome não importa.
  IF p_provider_id IS NOT NULL THEN
    SELECT c.team_key INTO v_key
      FROM public.club_source_ids c WHERE c.api_football_id = p_provider_id;
    IF v_key IS NOT NULL THEN
      RETURN v_key;
    END IF;
  END IF;

  -- (1) Sem id conhecido, o nome é o caminho.
  v_key := public.club_resolve(p_nome);
  IF v_key IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.api_football_id, c.country INTO v_pino, v_pais
    FROM public.club_source_ids c WHERE c.team_key = v_key;

  -- O nome levou a um clube que JÁ TEM outro id fixado: é homônimo.
  IF v_pino IS NOT NULL THEN
    IF p_provider_id IS NOT NULL AND p_provider_id <> v_pino THEN
      RETURN NULL;
    END IF;
    RETURN v_key;
  END IF;

  -- Sem pino, o país da liga decide — mas só quando a liga TEM país. As
  -- continentais e os amistosos vêm como 'World' e não dizem nada sobre a
  -- identidade do clube.
  IF p_league_country IS NOT NULL
     AND p_league_country <> 'World'
     AND v_pais IS NOT NULL
     AND p_league_country <> v_pais THEN
    RETURN NULL;
  END IF;

  RETURN v_key;
END;
$$;

COMMENT ON FUNCTION public.club_resolve_id(TEXT, BIGINT, TEXT) IS
  'Nome da API -> team_key. Tenta primeiro o id do provedor (identidade forte); só então o nome, conferido pelo pino ou pelo país da liga. NULL quando é homônimo.';

-- ── 4. Apelidos da fila do admin ────────────────────────────────────────────
-- Cada um decidido pelo `club_name` do próprio snapshot Opta, que traz a razão
-- social — não por semelhança de texto. Os dois casos em que o nome comercial
-- mudou foram confirmados fora do banco:
--   • "Academia Anzoátegui" virou "Anzoátegui FC" em 2024 (o Opta já registra
--     club_name = 'Anzoátegui FC'), e a API-Football manteve o nome antigo;
--   • "UCV Moquegua" virou "Deportivo Moquegua" em 2024, subiu para a Liga 1
--     em 2026 — e é a Liga 1 que o Opta registra para 'CD Moquegua'.
INSERT INTO public.club_aliases (alias, team_key, origem)
SELECT public.club_key_normalize(v.nome), v.chave, 'provider'
FROM (VALUES
  ('Academia Anzoátegui',       'anzoategui'),              -- Anzoátegui FC (VEN), ex-Academia
  ('Atletico Mitre',            'mitre santiago d estero'), -- CA Mitre de Santiago del Estero
  ('Bogota FC',                 'bogota'),                  -- Corporación Deportiva Bogotá FC
  ('Carlos A. Mannucci',        'carlos mannucci'),         -- CSD Carlos A. Mannucci
  ('Chico',                     'boyaca chico'),            -- Boyacá Chicó FC
  ('Club Nacional',             'nacional'),                -- Club Nacional de Football (URU)
  ('D. La Serena',              'la serena'),               -- CD La Serena
  ('Defensores de Belgrano VR', 'defensores belgrano vr'),  -- Defensores de Belgrano de Villa Ramallo
  ('Gimnasia L.P.',             'gimnasia la plata'),       -- Gimnasia y Esgrima La Plata
  ('Jaguares',                  'jaguares de cordoba'),     -- Jaguares de Córdoba FC
  ('Liverpool Montevideo',      'liverpool'),               -- Liverpool FC Montevideo
  ('Olimpo Bahia Blanca',       'olimpo'),                  -- Club Olimpo de Bahía Blanca
  ('Puerto Cabello',            'academia puerto cabello'), -- Academia Puerto Cabello
  ('Racing Montevideo',         'racing'),                  -- Racing Club de Montevideo
  ('Santamarina',               'deportivo santamarina'),   -- CD Santamarina de Tandil
  ('UCV Moquegua',              'deportivo moquegua')       -- CD Moquegua, ex-UCV Moquegua
) AS v(nome, chave)
ON CONFLICT (alias) DO UPDATE SET team_key = EXCLUDED.team_key;

-- ── 5. Os que o Opta não tem ────────────────────────────────────────────────
-- Não é preguiça: sem rating não há como ancorar a força, então mapear não
-- traria a partida para o modelo — e mapear para o "parecido" é o erro que
-- esta série de migrações existe para impedir.
INSERT INTO public.club_alias_ignored (alias, nome_visto, motivo)
VALUES
  (public.club_key_normalize('Cerrito'), 'Cerrito',
   'Sportivo Cerrito (URU, 2ª divisão). Não é o CA Cerro e não está no snapshot Opta.'),
  (public.club_key_normalize('Estudiantil CNI'), 'Estudiantil CNI',
   'Colegio Nacional de Iquitos (PER, Liga 2). Não está no snapshot Opta.')
ON CONFLICT (alias) DO NOTHING;

-- ── 6. Aplicar ao que já está gravado ───────────────────────────────────────
SELECT public.pin_provider_ids();
SELECT public.reresolve_fixture_keys();
SELECT public.pin_crest_urls();
SELECT public.registra_provider_teams();

-- ---------------------------------------------------------------------------
-- Verificação:
--   -- fila do admin deve ficar vazia (ou só com nomes novos da próxima coleta):
--   SELECT * FROM public.apelidos_sugeridos(60);
--   -- o Santos peruano deve resolver para o clube dele, não para o do bolão:
--   SELECT public.club_resolve_id('Santos', 4226, 'Peru');   -- santos fc peru
--   SELECT public.club_resolve_id('Santos', 128,  'Brazil'); -- santos
--   -- e o mapa deve cobrir o snapshot inteiro:
--   SELECT count(*) FROM public.opta_club_ratings r
--     JOIN public.opta_snapshots s ON s.id = r.snapshot_id AND s.is_active
--     LEFT JOIN public.club_source_ids c ON c.opta_contestant_id = r.opta_contestant_id
--    WHERE c.team_key IS NULL;  -- 0
-- ---------------------------------------------------------------------------
