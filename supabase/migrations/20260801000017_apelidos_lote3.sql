-- ============================================================================
-- Terceira leva de apelidos, decidida clube a clube.
--
-- Cada linha foi conferida contra três coisas ao mesmo tempo: o nome, a LIGA em
-- que a partida aconteceu (é ela que separa homônimos entre países) e o rating
-- Opta do candidato (que precisa ser compatível com o nível da competição).
-- Semelhança de texto sozinha não decide nada — foi ela que quase mapeou
-- "Juventus" para o Juventude.
--
-- Efeito: 15 -> 17 jogos no modelo, 22 -> 2 nomes pendentes, 3 -> 0 nomes
-- custando jogos.
-- ============================================================================

INSERT INTO public.club_aliases (alias, team_key, origem) VALUES
  -- Estudiantes de La Plata. O candidato é clube DO BOLÃO (Opta 85,1) e joga a
  -- Libertadores; "L.P." é o desambiguador que a própria API usa.
  (public.club_key_normalize('Estudiantes L.P.'),          'estudiantes',            'provider'),
  -- Argentina, Liga Profesional. Nome quase idêntico, só a acentuação muda.
  (public.club_key_normalize('Estudiantes de Rio Cuarto'), 'estudiantes rio cuarto', 'provider'),
  -- Equador, Serie B. "Ind." é abreviação de Independiente, e o Juniors é o
  -- único Independiente equatoriano da lista.
  (public.club_key_normalize('Ind. Juniors'),              'independiente juniors',  'provider'),
  -- Chile, Primera División. Everton de Viña del Mar — o único Everton entre
  -- clubes sul-americanos.
  (public.club_key_normalize('Everton de Vina'),           'everton',                'provider'),
  -- Chile, Primera B. A API corta o "Deportes".
  (public.club_key_normalize('Antofagasta'),               'deportes antofagasta',   'provider'),
  -- Peru, Segunda División. A semelhança de texto apontava para "San Martín San
  -- Juan" (Argentina); quem decide aqui é a liga.
  (public.club_key_normalize('U. San Martin'),             'universidad san martin', 'provider'),
  -- Uruguai, Segunda División.
  (public.club_key_normalize('Miramar'),                   'miramar misiones',       'provider'),
  -- Equador. A API acrescenta o "FC".
  (public.club_key_normalize('Guayaquil City FC'),         'guayaquil city',         'provider'),
  -- Chile, Primera B. San Marcos de Arica é o único San Marcos sul-americano.
  (public.club_key_normalize('San Marcos de Arica'),       'san marcos',             'provider'),
  -- Colômbia, Primera A. O Alianza mudou de sede para Valledupar; o Opta 78,5
  -- é compatível com a primeira divisão colombiana. "Alianza Lima" e "Alianza
  -- Atlético" estão cadastrados à parte.
  (public.club_key_normalize('Alianza Valledupar'),        'alianza',                'provider')
ON CONFLICT (alias) DO NOTHING;

-- ── Nomes que NÃO têm correspondência ───────────────────────────────────────
INSERT INTO public.club_alias_ignored (alias, nome_visto, motivo) VALUES
  (public.club_key_normalize('Independiente'),           'Independiente',           'Independiente de Avellaneda — não está entre os 384 clubes com rating Opta'),
  (public.club_key_normalize('Sport Huancayo 2'),        'Sport Huancayo 2',        'time B, não é o Sport Huancayo'),
  (public.club_key_normalize('Fortaleza FC'),            'Fortaleza FC',            'Fortaleza CEIF, da Colômbia — não é o Fortaleza do bolão (IDs diferentes na API)'),
  (public.club_key_normalize('Colon Santa Fe'),          'Colon Santa Fe',          'Colón de Santa Fe, da Argentina — não é o Independiente Santa Fe (IDs diferentes)'),
  (public.club_key_normalize('Juventus'),                'Juventus',                'não é o Juventude; clube fora da lista'),
  (public.club_key_normalize('CA Estudiantes'),          'CA Estudiantes',          'Estudiantes de Buenos Aires (Primera Nacional) — não é o Estudiantes de La Plata'),
  (public.club_key_normalize('Tacuarembo'),              'Tacuarembo',              'Tacuarembó FC, do Uruguai — não é o Tacuary, do Paraguai'),
  (public.club_key_normalize('Academia Cantolao'),       'Academia Cantolao',       'fora dos 384 clubes com rating Opta'),
  (public.club_key_normalize('CD Arabe Unido'),          'CD Arabe Unido',          'Árabe Unido, do Panamá — fora do escopo sul-americano'),
  (public.club_key_normalize('Independiente Petrolero'), 'Independiente Petrolero', 'da Bolívia — não é o Oriente Petrolero')
ON CONFLICT (alias) DO UPDATE SET motivo = EXCLUDED.motivo;

-- Ficam PENDENTES de propósito, por ambiguidade real. Nenhum custa jogo: a
-- liga 299 (Venezuela) não tem peso no modelo.
--   · "Portuguesa FC" — pode ser a venezuelana ou a brasileira;
--   · "Academia Anzoátegui" — pode não ser o mesmo clube do "Anzoátegui".

SELECT public.reresolve_fixture_keys();
SELECT public.pin_provider_ids();
SELECT public.pin_crest_urls();
