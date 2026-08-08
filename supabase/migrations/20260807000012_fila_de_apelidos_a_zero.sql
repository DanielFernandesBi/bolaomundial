-- ============================================================================
-- Os 14 nomes pendentes: 13 são o mesmo clube com outra grafia, 3 não são
-- para mapear.
-- ============================================================================
-- IMPORTANTE, porque o rótulo do admin assusta mais do que devia: NENHUM desses
-- nomes está em jogo do bolão. São todos de ligas que capturamos só para
-- histórico (Liga Profesional, Primera Nacional, Chile, Colômbia B, Venezuela
-- 2ª, Paraguai Intermedia, Federal A, Primera B Metro). Conferido no mesmo
-- minuto: zero jogos do bolão sem pareamento, e os 40 clubes do bolão seguem
-- ancorados por ID. O custo é ao MODELO, não ao lançamento de resultado.
--
-- E o custo real é pequeno: dos 231 jogos descartados por "adversário não
-- mapeado", só TRÊS envolvem clube do bolão — e são justamente três destes
-- nomes:
--
--   Concepción      x U. Católica          (02/08, Chile)
--   Sarmiento Junin x Independ. Rivadavia  (03/08, Argentina)
--   Tigre           x Belgrano Cordoba     (05/08, Argentina)
--
-- Os outros 165 não têm nenhum lado mapeado: são jogos entre clubes fora do
-- universo Opta, que nunca poderiam entrar no modelo. Não há o que consertar
-- neles.
--
-- SOBRE O "Concepción", que é o caso perigoso — o mesmo formato do Santos do
-- Peru. Duas confirmações independentes antes de mapear:
--   1. fonte externa: Deportes Concepción 3-0 Universidad Católica, 02/08/2026,
--      Fecha 17 da Primera División; o placar guardado aqui é 3-0;
--   2. o provider 5635 tem outro jogo marcado CONTRA a "Universidad de
--      Concepcion" — então ele não é ela.
-- E, dos três "Concepción" do nosso mapa, só o Deportes está sem id fixado.
-- ============================================================================

INSERT INTO public.club_aliases (alias, team_key, origem) VALUES
  -- Os três que custam jogo de clube do bolão
  (public.club_key_normalize('Sarmiento Junin'),           'sarmiento',              'provider'),
  (public.club_key_normalize('Belgrano Cordoba'),          'belgrano',               'provider'),
  (public.club_key_normalize('Concepción'),                'deportes concepcion',    'provider'),
  -- Os demais: abreviação, pontuação ou cidade a mais no nome da fonte
  (public.club_key_normalize('A. Italiano'),               'audax italiano',         'provider'),
  (public.club_key_normalize('Atletico DE Rafaela'),       'atletico rafaela',       'provider'),
  (public.club_key_normalize('Independiente De Chivilcoy'),'independiente chivilcoy','provider'),
  (public.club_key_normalize('Independiente F.b.c.'),      'independiente fbc',      'provider'),
  (public.club_key_normalize('Quindio'),                   'deportes quindio',       'provider'),
  -- Homônimos resolvidos pelo PAÍS DA LIGA em que apareceram
  (public.club_key_normalize('Leones FC'),                 'leones fc colombia',     'provider'),
  (public.club_key_normalize('SOL DE America'),            'sol de america asuncion','provider'),
  -- A busca por semelhança não achou este: "Güemes" x "Club Atlético Güemes"
  -- ficou abaixo do corte. Está no mapa, é da Argentina e não tem id fixado.
  (public.club_key_normalize('Club Atlético Güemes'),      'guemes',                 'provider')
ON CONFLICT (alias) DO UPDATE SET team_key = EXCLUDED.team_key;

-- ── Os que NÃO são para mapear ─────────────────────────────────────────────
INSERT INTO public.club_alias_ignored (alias, nome_visto, motivo) VALUES
  (public.club_key_normalize('Zamora FC B'), 'Zamora FC B',
   'Time B. O Zamora principal já está mapeado (id 2806); a reserva não é o mesmo clube.'),
  (public.club_key_normalize('Argentino de Merlo'), 'Argentino de Merlo',
   'Clube real da Primera B Metropolitana, fora do universo Opta. Sem rating, mapear não faria a partida entrar no modelo.'),
  (public.club_key_normalize('Union Santa Fe'), 'Union Santa Fe',
   'Unión de Santa Fe, fora do universo Opta. Os candidatos por semelhança são outros clubes (Santa Fe da Colômbia, Colón de Santa Fe).')
ON CONFLICT (alias) DO UPDATE SET motivo = EXCLUDED.motivo;

SELECT public.reconciliar_identidades();
