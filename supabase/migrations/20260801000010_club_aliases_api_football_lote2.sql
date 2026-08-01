-- ============================================================================
-- Apelidos que a API-Football usa e que o nosso mapa não conhecia.
--
-- Sem eles a partida inteira é descartada: a elegibilidade exige os DOIS lados
-- mapeados. Doze dos 21 jogos encerrados estavam caindo por isso, e um deles é
-- do Montevideo City Torque — clube do bolão, que a API chama de "Atlético
-- Torque".
--
-- Efeito medido: 9 → 15 jogos elegíveis para o ajuste de força.
--
-- Só entram equivalências inequívocas. Ficam de fora, de propósito:
--   · "Independiente" (liga 128, Argentina) — é o de Avellaneda, que não está
--     entre os 384 clubes com rating Opta. Mapear para "Independiente FBC"
--     (Paraguai) seria inventar dado.
--   · "Sport Huancayo 2" — é o time B, não o Sport Huancayo.
--   · "General Caballero" (liga 251) — há JLM e ZC, e o nome cru não decide.
-- ============================================================================

INSERT INTO public.club_aliases (alias, team_key, origem) VALUES
  (public.club_key_normalize('Atletico Torque'),             'montevideo city torque', 'provider'),
  (public.club_key_normalize('Rangers de Talca'),            'rangers',                'provider'),
  (public.club_key_normalize('Patriotas'),                   'patriotas boyaca',       'provider'),
  (public.club_key_normalize('Club Deportivo Los Chankas'),  'los chankas',            'provider'),
  (public.club_key_normalize('Bucaramanga'),                 'atletico bucaramanga',   'provider'),
  (public.club_key_normalize('Central Cordoba de Santiago'), 'central cordoba sde',    'provider')
ON CONFLICT (alias) DO NOTHING;

-- Reprocessa o que já está gravado: o apelido novo não serve de nada se as
-- partidas antigas continuarem com a chave nula.
UPDATE public.club_fixtures f
   SET home_team_key = COALESCE(f.home_team_key, public.club_resolve(f.home_team_name)),
       away_team_key = COALESCE(f.away_team_key, public.club_resolve(f.away_team_name))
 WHERE f.home_team_key IS NULL OR f.away_team_key IS NULL;

SELECT public.recompute_fixture_eligibility();
