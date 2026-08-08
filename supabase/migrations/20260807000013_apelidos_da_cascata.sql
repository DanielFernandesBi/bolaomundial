-- ============================================================================
-- A cascata: mapear um nome revela o próximo.
-- ============================================================================
-- Depois de mapear os 11, dois nomes que estavam com ZERO jogos perdidos
-- passaram a ter um cada. Não é regressão: a partida precisa dos DOIS lados
-- mapeados, então enquanto o outro lado estava desconhecido o prejuízo era
-- creditado a ele. Resolvido aquele, quem bloqueia passa a ser este.
--
-- Vale registrar porque muda como se lê a fila: ela não encolhe linearmente.
-- Zerar exige repetir a rodada até parar de aparecer nome novo.
--
-- Os dois são abreviação, sem ambiguidade:
--   Argentinos JRS   -> JRS é Juniors  (Liga Profesional)
--   San Martin S.J.  -> S.J. é San Juan (Primera Nacional; os homônimos
--                       Tucumán e Mendoza estão marcados como conflitantes)
-- ============================================================================

INSERT INTO public.club_aliases (alias, team_key, origem) VALUES
  (public.club_key_normalize('Argentinos JRS'),  'argentinos juniors',  'provider'),
  (public.club_key_normalize('San Martin S.J.'), 'san martin san juan', 'provider')
ON CONFLICT (alias) DO UPDATE SET team_key = EXCLUDED.team_key;

SELECT public.reconciliar_identidades();

-- ---------------------------------------------------------------------------
-- Verificação depois desta rodada:
--   apelidos com prejuízo ............ 14 -> 0
--   descartados com clube do bolão ....  3 -> 0
--   jogos elegíveis ao modelo ........ 249
-- ---------------------------------------------------------------------------
