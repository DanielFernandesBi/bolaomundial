-- ============================================
-- CORREÇÃO: URLs dos Logos do Paulistão 2026
-- ============================================
-- Este script atualiza as URLs dos logos dos times do Paulistão
-- com URLs que realmente funcionam

-- URLs alternativas usando logodownload.org ou outras fontes
-- Se essas URLs também não funcionarem, você pode:
-- 1. Hospedar as imagens no Supabase Storage
-- 2. Usar um serviço de CDN como Cloudinary
-- 3. Usar URLs diretas de sites oficiais dos times

UPDATE public.matches
SET home_iso = CASE team_home
  WHEN 'Palmeiras' THEN 'https://logodownload.org/wp-content/uploads/2017/02/palmeiras-logo-escudo-1.png'
  WHEN 'Corinthians' THEN 'https://logodownload.org/wp-content/uploads/2017/02/corinthians-logo-escudo-1.png'
  WHEN 'São Paulo' THEN 'https://logodownload.org/wp-content/uploads/2017/02/sao-paulo-logo-escudo-1.png'
  WHEN 'Santos' THEN 'https://upload.wikimedia.org/wikipedia/commons/3/35/Santos_logo.svg'
  WHEN 'RB Bragantino' THEN 'https://logodownload.org/wp-content/uploads/2020/09/red-bull-bragantino-logo-escudo.png'
  WHEN 'Red Bull Bragantino' THEN 'https://logodownload.org/wp-content/uploads/2020/09/red-bull-bragantino-logo-escudo.png'
  WHEN 'Guarani' THEN 'https://logodownload.org/wp-content/uploads/2017/02/guarani-logo-escudo-1.png'
  WHEN 'Ponte Preta' THEN 'https://logodownload.org/wp-content/uploads/2017/02/ponte-preta-logo-escudo-1.png'
  WHEN 'Botafogo-SP' THEN 'https://logodownload.org/wp-content/uploads/2017/02/botafogo-sp-logo-escudo-1.png'
  WHEN 'Mirassol' THEN 'https://logodownload.org/wp-content/uploads/2017/02/mirassol-logo-escudo-1.png'
  WHEN 'Novorizontino' THEN 'https://logodownload.org/wp-content/uploads/2017/02/novorizontino-logo-escudo-1.png'
  WHEN 'Portuguesa' THEN 'https://logodownload.org/wp-content/uploads/2017/02/portuguesa-logo-escudo-1.png'
  WHEN 'São Bernardo' THEN 'https://logodownload.org/wp-content/uploads/2017/02/sao-bernardo-logo-escudo-1.png'
  WHEN 'Capivariano' THEN 'https://logodownload.org/wp-content/uploads/2017/02/capivariano-logo-escudo-1.png'
  WHEN 'Velo Clube' THEN 'https://logodownload.org/wp-content/uploads/2017/02/velo-clube-logo-escudo-1.png'
  WHEN 'Noroeste' THEN 'https://logodownload.org/wp-content/uploads/2017/02/noroeste-logo-escudo-1.png'
  WHEN 'Primavera' THEN 'https://logodownload.org/wp-content/uploads/2017/02/primavera-logo-escudo-1.png'
  ELSE home_iso
END,
away_iso = CASE team_away
  WHEN 'Palmeiras' THEN 'https://logodownload.org/wp-content/uploads/2017/02/palmeiras-logo-escudo-1.png'
  WHEN 'Corinthians' THEN 'https://logodownload.org/wp-content/uploads/2017/02/corinthians-logo-escudo-1.png'
  WHEN 'São Paulo' THEN 'https://logodownload.org/wp-content/uploads/2017/02/sao-paulo-logo-escudo-1.png'
  WHEN 'Santos' THEN 'https://upload.wikimedia.org/wikipedia/commons/3/35/Santos_logo.svg'
  WHEN 'RB Bragantino' THEN 'https://logodownload.org/wp-content/uploads/2020/09/red-bull-bragantino-logo-escudo.png'
  WHEN 'Red Bull Bragantino' THEN 'https://logodownload.org/wp-content/uploads/2020/09/red-bull-bragantino-logo-escudo.png'
  WHEN 'Guarani' THEN 'https://logodownload.org/wp-content/uploads/2017/02/guarani-logo-escudo-1.png'
  WHEN 'Ponte Preta' THEN 'https://logodownload.org/wp-content/uploads/2017/02/ponte-preta-logo-escudo-1.png'
  WHEN 'Botafogo-SP' THEN 'https://logodownload.org/wp-content/uploads/2017/02/botafogo-sp-logo-escudo-1.png'
  WHEN 'Mirassol' THEN 'https://logodownload.org/wp-content/uploads/2017/02/mirassol-logo-escudo-1.png'
  WHEN 'Novorizontino' THEN 'https://logodownload.org/wp-content/uploads/2017/02/novorizontino-logo-escudo-1.png'
  WHEN 'Portuguesa' THEN 'https://logodownload.org/wp-content/uploads/2017/02/portuguesa-logo-escudo-1.png'
  WHEN 'São Bernardo' THEN 'https://logodownload.org/wp-content/uploads/2017/02/sao-bernardo-logo-escudo-1.png'
  WHEN 'Capivariano' THEN 'https://logodownload.org/wp-content/uploads/2017/02/capivariano-logo-escudo-1.png'
  WHEN 'Velo Clube' THEN 'https://logodownload.org/wp-content/uploads/2017/02/velo-clube-logo-escudo-1.png'
  WHEN 'Noroeste' THEN 'https://logodownload.org/wp-content/uploads/2017/02/noroeste-logo-escudo-1.png'
  WHEN 'Primavera' THEN 'https://logodownload.org/wp-content/uploads/2017/02/primavera-logo-escudo-1.png'
  ELSE away_iso
END
WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'paulistao-2026');

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Execute esta query para verificar as URLs atualizadas:
-- SELECT team_home, home_iso, team_away, away_iso 
-- FROM public.matches 
-- WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'paulistao-2026')
-- LIMIT 10;

