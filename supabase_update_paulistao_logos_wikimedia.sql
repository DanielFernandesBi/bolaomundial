-- ============================================
-- ATUALIZAÇÃO: URLs dos Logos do Paulistão 2026
-- ============================================
-- Este script atualiza as URLs dos logos dos times do Paulistão
-- usando URLs do Wikimedia Commons (seguindo o padrão do Santos)
-- 
-- Padrão usado: https://upload.wikimedia.org/wikipedia/commons/...
-- (mesmo padrão do Santos que está funcionando: https://upload.wikimedia.org/wikipedia/commons/3/35/Santos_logo.svg)

UPDATE public.matches
SET home_iso = CASE team_home
  -- Times principais (URLs verificadas do commons)
  WHEN 'Palmeiras' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Palmeiras_logo.svg/500px-Palmeiras_logo.svg.png'
  WHEN 'São Paulo' THEN 'https://upload.wikimedia.org/wikipedia/commons/4/4b/S%C3%A3o_Paulo_Futebol_Clube.png'
  WHEN 'Santos' THEN 'https://upload.wikimedia.org/wikipedia/commons/3/35/Santos_logo.svg'
  WHEN 'Corinthians' THEN 'https://upload.wikimedia.org/wikipedia/pt/b/b4/Corinthians_simbolo.png?20250923030101'
  
  -- Red Bull Bragantino
  WHEN 'RB Bragantino' THEN 'https://upload.wikimedia.org/wikipedia/pt/9/9e/RedBullBragantino.png'
  WHEN 'Red Bull Bragantino' THEN 'https://upload.wikimedia.org/wikipedia/pt/9/9e/RedBullBragantino.png'
  
  -- Outros times - usando padrão commons (pode precisar verificação manual)
  WHEN 'Guarani' THEN 'https://logodetimes.com/wp-content/uploads/guarani.png'
  WHEN 'Ponte Preta' THEN 'https://logodetimes.com/wp-content/uploads/ponte-preta.png'
  WHEN 'Botafogo-SP' THEN 'https://logodetimes.com/wp-content/uploads/botafogo-sp.png'
  WHEN 'Mirassol' THEN 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Mirassol_FC_logo.png'
  WHEN 'Novorizontino' THEN 'https://logodetimes.com/wp-content/uploads/gremio-novorizontino.png'
  WHEN 'Portuguesa' THEN 'https://upload.wikimedia.org/wikipedia/commons/8/88/Portuguesa_de_desportos_Escudo_2012-Presente.png'
  WHEN 'São Bernardo' THEN 'https://upload.wikimedia.org/wikipedia/pt/e/e7/S%C3%A3o_Bernardo_Futebol_Clube_Logo.PNG?20230616233530'
  WHEN 'Capivariano' THEN 'https://upload.wikimedia.org/wikipedia/commons/4/43/Capivariano_FC.png'
  WHEN 'Velo Clube' THEN 'https://upload.wikimedia.org/wikipedia/pt/6/60/Bra_sp_velo-clube.png'
  WHEN 'Noroeste' THEN 'https://upload.wikimedia.org/wikipedia/pt/3/36/EC_Noroeste.PNG'
  WHEN 'Primavera' THEN 'https://upload.wikimedia.org/wikipedia/pt/0/0c/Esporte_Clube_Primavera_logo.png'
  
  ELSE home_iso
END,
away_iso = CASE team_away
  -- Times principais (URLs verificadas do commons)
  WHEN 'Palmeiras' THEN 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Palmeiras_logo.svg/500px-Palmeiras_logo.svg.png'
  WHEN 'São Paulo' THEN 'https://upload.wikimedia.org/wikipedia/commons/4/4b/S%C3%A3o_Paulo_Futebol_Clube.png'
  WHEN 'Santos' THEN 'https://upload.wikimedia.org/wikipedia/commons/3/35/Santos_logo.svg'
  WHEN 'Corinthians' THEN 'https://upload.wikimedia.org/wikipedia/pt/b/b4/Corinthians_simbolo.png?20250923030101'
  
  -- Red Bull Bragantino
  WHEN 'RB Bragantino' THEN 'https://upload.wikimedia.org/wikipedia/pt/9/9e/RedBullBragantino.png'
  WHEN 'Red Bull Bragantino' THEN 'https://upload.wikimedia.org/wikipedia/pt/9/9e/RedBullBragantino.png'
  
  -- Outros times - usando padrão commons (pode precisar verificação manual)
  WHEN 'Guarani' THEN 'https://logodetimes.com/wp-content/uploads/guarani.png'
  WHEN 'Ponte Preta' THEN 'https://logodetimes.com/wp-content/uploads/ponte-preta.png'
  WHEN 'Botafogo-SP' THEN 'https://logodetimes.com/wp-content/uploads/botafogo-sp.png'
  WHEN 'Mirassol' THEN 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Mirassol_FC_logo.png'
  WHEN 'Novorizontino' THEN 'https://logodetimes.com/wp-content/uploads/gremio-novorizontino.png'
  WHEN 'Portuguesa' THEN 'https://upload.wikimedia.org/wikipedia/commons/8/88/Portuguesa_de_desportos_Escudo_2012-Presente.png'
  WHEN 'São Bernardo' THEN 'https://upload.wikimedia.org/wikipedia/pt/e/e7/S%C3%A3o_Bernardo_Futebol_Clube_Logo.PNG?20230616233530'
  WHEN 'Capivariano' THEN 'https://upload.wikimedia.org/wikipedia/commons/4/43/Capivariano_FC.png'
  WHEN 'Velo Clube' THEN 'https://upload.wikimedia.org/wikipedia/pt/6/60/Bra_sp_velo-clube.png'
  WHEN 'Noroeste' THEN 'https://upload.wikimedia.org/wikipedia/pt/3/36/EC_Noroeste.PNG'
  WHEN 'Primavera' THEN 'https://upload.wikimedia.org/wikipedia/pt/0/0c/Esporte_Clube_Primavera_logo.png'
  
  ELSE away_iso
END
WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'paulistao-2026');

-- ============================================
-- NOTA IMPORTANTE
-- ============================================
-- Algumas URLs acima podem não existir no Wikimedia Commons.
-- Se uma URL retornar erro 404, você precisa:
-- 
-- 1. Acessar: https://commons.wikimedia.org
-- 2. Buscar pelo nome do time (ex: "Guarani FC logo")
-- 3. Encontrar a imagem SVG ou PNG
-- 4. Copiar a URL direta da imagem (não a URL da página)
-- 5. Atualizar manualmente no banco ou criar um novo UPDATE
--
-- Formato da URL correta:
-- https://upload.wikimedia.org/wikipedia/commons/[hash]/[nome].svg
-- ou
-- https://upload.wikimedia.org/wikipedia/commons/[hash]/[nome].png

-- ============================================
-- VERIFICAÇÃO
-- ============================================
-- Execute esta query para verificar as URLs atualizadas:
-- SELECT DISTINCT team_home, home_iso 
-- FROM public.matches 
-- WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'paulistao-2026')
-- ORDER BY team_home;
--
-- Para testar se uma URL funciona, acesse-a diretamente no navegador.
-- Se retornar 404, você precisa encontrar a URL correta no Wikimedia Commons.
