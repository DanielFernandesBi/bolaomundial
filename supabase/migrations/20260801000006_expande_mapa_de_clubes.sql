-- ============================================================================
-- Amplia o mapa canônico de clubes a partir dos ratings já carregados.
--
-- Sai de 50 clubes (os do bolão + Paulistão) para 384. Sem isto, todo
-- adversário de Brasileirão, Liga Profesional, Liga Pro etc. cairia em
-- OPPONENT_NOT_MAPPED e a partida não alimentaria o modelo.
--
-- REGRA DE SEGURANÇA: nome que aparece mais de uma vez entre os 403 ratings
-- NÃO é mapeado. "River Plate" existe na Argentina, no Uruguai e no Paraguai;
-- "Santos" no Brasil e no Peru; "Independiente", "Nacional", "Libertad",
-- "Universidad Católica" idem. Atribuir o jogo ao clube errado polui a força
-- de um clube real — é pior do que não atribuir. Fica para mapeamento manual,
-- que é o que a especificação manda (§4.1: nunca decidir por similaridade
-- quando houver ambiguidade).
-- ============================================================================

WITH cand AS (
  SELECT r.opta_contestant_id, r.team_name, r.country,
         public.club_key_normalize(r.team_name) AS chave
  FROM public.opta_club_ratings r
  JOIN public.opta_snapshots s ON s.id = r.snapshot_id AND s.is_active
  WHERE NOT EXISTS (SELECT 1 FROM public.club_source_ids c
                    WHERE c.opta_contestant_id = r.opta_contestant_id)
),
freq AS (SELECT chave, count(*) AS n FROM cand GROUP BY chave),
ok AS (
  SELECT c.* FROM cand c JOIN freq f USING (chave)
  WHERE f.n = 1
    AND NOT EXISTS (SELECT 1 FROM public.club_source_ids s WHERE s.team_key = c.chave)
    AND NOT EXISTS (SELECT 1 FROM public.club_aliases a WHERE a.alias = c.chave)
)
INSERT INTO public.club_source_ids (team_key, canonical_name, country, opta_contestant_id, is_bolao_team)
SELECT chave, team_name, country, opta_contestant_id, false FROM ok
ON CONFLICT (team_key) DO NOTHING;

-- Apelidos a partir do nome longo do Opta ("CA Boca Juniors" -> boca juniors),
-- pela mesma regra: só quando não houver ambiguidade nem colisão.
WITH cand AS (
  SELECT c.team_key, public.club_key_normalize(r.club_name) AS ap
  FROM public.club_source_ids c
  JOIN public.opta_club_ratings r ON r.opta_contestant_id = c.opta_contestant_id
  JOIN public.opta_snapshots s ON s.id = r.snapshot_id AND s.is_active
  WHERE r.club_name IS NOT NULL
),
freq AS (SELECT ap, count(DISTINCT team_key) AS n FROM cand WHERE ap IS NOT NULL GROUP BY ap)
INSERT INTO public.club_aliases (alias, team_key, origem)
SELECT DISTINCT c.ap, c.team_key, 'opta'
FROM cand c JOIN freq f USING (ap)
WHERE f.n = 1 AND c.ap IS NOT NULL AND c.ap <> c.team_key
  AND NOT EXISTS (SELECT 1 FROM public.club_source_ids s WHERE s.team_key = c.ap)
  AND NOT EXISTS (SELECT 1 FROM public.club_aliases a WHERE a.alias = c.ap)
ON CONFLICT (alias) DO NOTHING;

-- Grafias observadas na API-Football que não batem com as do Opta.
-- "Chapecoense-sc" é um dos 40 do bolão: sem este apelido, todo jogo da
-- Chapecoense ficaria inelegível para o modelo.
INSERT INTO public.club_aliases (alias, team_key, origem) VALUES
  ('chapecoense sc',   'chapecoense',       'provider'),
  ('newells old boys', 'newell s old boys', 'provider'),
  ('d puerto montt',   'puerto montt',      'provider')
ON CONFLICT (alias) DO NOTHING;
