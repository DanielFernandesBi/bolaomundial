-- ============================================================================
-- Escopo do import do snapshot + semente do mapa canônico de clubes.
--
-- A semente é o registro das decisões MANUAIS de mapeamento: qual clube do
-- Opta corresponde a qual nome usado no app. Não dá para gerar isso por
-- similaridade — a busca automática aponta Atlético-MG para "Athletico-PR" e
-- Real Santander para "Santa Fe". Por isso mora numa migração, e não só no
-- banco: se o banco for recriado, estas 50 decisões voltam junto.
--
-- Idempotente. O snapshot completo (1.574 clubes) entra depois, por
-- scripts/club-model/import-opta-snapshot.ts, que precisa da service role key.
-- ============================================================================

ALTER TABLE public.opta_snapshots
  ADD COLUMN IF NOT EXISTS imported_clubs INTEGER,
  ADD COLUMN IF NOT EXISTS import_scope   TEXT;

COMMENT ON COLUMN public.opta_snapshots.total_clubs IS
  'Clubes no arquivo original do Opta.';
COMMENT ON COLUMN public.opta_snapshots.imported_clubs IS
  'Clubes efetivamente carregados em opta_club_ratings.';
COMMENT ON COLUMN public.opta_snapshots.import_scope IS
  'Critério do recorte importado.';

INSERT INTO public.opta_snapshots (snapshot_at, source_file, total_clubs, imported_clubs, import_scope, is_active)
VALUES (DATE '2026-07-31', 'opta_snapshot_global_20260731.csv', 13789, 50,
        'PARCIAL: 50 clubes semeados (os 40 do bolao + os do Paulistao 2026, usados no backtest). O import completo roda por scripts/club-model/import-opta-snapshot.ts com a serviceRole key.',
        true)
ON CONFLICT DO NOTHING;

-- Ratings dos mesmos 50 clubes, para o banco ficar utilizável sem depender
-- do import completo. O restante do snapshot entra pelo script.
INSERT INTO public.opta_club_ratings (snapshot_id,opta_contestant_id,team_name,club_name,country,confederation,domestic_league_name,rating,global_rank,confederation_rank)
SELECT s.id, v.* FROM public.opta_snapshots s, (VALUES
('102ykb145wz6dtveg65nistwm','Flamengo','CR Flamengo','Brazil','South America','Carioca Série A',90.3927811054,37,1),
('b9d2xcvxxcwplyp4le9ulnlv9','Palmeiras','SE Palmeiras','Brazil','South America','Paulista A1',90.2284595467,40,2),
('ddkiejug4w4ri9ch2fnnen6yw','Independiente Valle','CSD Independiente del Valle','Ecuador','South America','Liga Pro',87.8938425664,63,3),
('bd6vujl7jfv4wtc8gvo1o1t5y','Cruzeiro','Cruzeiro EC','Brazil','South America','Mineiro 1',86.8277057524,76,4),
('2ldx5vhhqfz2rllkgp7wpa744','Fluminense','Fluminense FC','Brazil','South America','Carioca Série A',86.3906471298,80,5),
('8inprqnxjps9ckiamn3cfoo8v','Independiente Rivadavia','CS Independiente Rivadavia','Argentina','South America','Liga Profesional Argentina',86.2900742954,81,6),
('2x94b2pn1o1tb5l1bbu8x9yu9','Botafogo','Botafogo FR','Brazil','South America','Carioca Série A',86.2376763725,83,7),
('ciqt22ivoc48zj62detdyh1mm','Boca Juniors','CA Boca Juniors','Argentina','South America','Liga Profesional Argentina',85.8040329637,90,9),
('4ayjm36vlnc5j8jhwpsdwxuph','RB Bragantino','Red Bull Bragantino','Brazil','South America','Paulista A1',85.7977018493,92,10),
('5h3amvo8ykt01u4h3upw3c5qf','Athletico Paranaense','Club Athletico Paranaense','Brazil','South America','Paranaense 1',85.7488110396,94,11),
('f0td6lvs326lppbwh1fj8v2ls','Corinthians','SC Corinthians Paulista','Brazil','South America','Paulista A1',85.4287109561,105,13),
('91j32z6ga16tjj140ss2i24mt','Estudiantes','Club Estudiantes de La Plata','Argentina','South America','Liga Profesional Argentina',85.1025888238,119,14),
('cllomrn9h2sg6vmxy0pdnmups','Mirassol','Mirassol FC','Brazil','South America','Paulista A1',85.0290559309,120,15),
('e8ma1lonj51sqmwy00mwnw1ke','Rosario Central','CA Rosario Central','Argentina','South America','Liga Profesional Argentina',84.9382802701,123,17),
('115foion8jwrvp2e7xif675kx','River Plate','CA River Plate','Argentina','South America','Liga Profesional Argentina',84.8471494292,127,19),
('1f6qzkdjh8fih5ii1eyqmkolq','Atlético Mineiro','CA Mineiro','Brazil','South America','Mineiro 1',84.5297486882,136,21),
('1icvp50kgaw8oduqmhyt3iex0','Santos','Santos FC Sao Paulo','Brazil','South America','Paulista A1',84.3168351154,149,24),
('5p301ikmaba9gesscss3zo745','São Paulo','São Paulo FC','Brazil','South America','Paulista A1',83.8409683096,164,25),
('c7n1isjmpyqt5pj51yekr08wo','Internacional','SC Internacional','Brazil','South America','Gaúcho 1',83.8226638978,166,26),
('7gkwmrw0cjz0m168ouw00z4gy','Universidad Católica','CD Universidad Católica','Chile','South America','Primera División',83.790278834,167,27),
('bw2py3aiws1rq61pokete3kv2','Coquimbo Unido','CD Coquimbo Unido','Chile','South America','Primera División',83.6220104086,177,28),
('5vtngmqlfpmuntxl9fw683ttc','Independiente Santa Fe','Club Independiente Santa Fe','Colombia','South America','Primera A',83.489640492,181,29),
('epcjkyn8gazuywbotxwikc5kn','Deportes Tolima','Club Deportes Tolima SA','Colombia','South America','Primera A',83.3695860313,185,31),
('cs3122cdx3g2nviltzfilmz5c','Tigre','CA Tigre','Argentina','South America','Liga Profesional Argentina',83.2787491052,192,32),
('buyj9j0qwgbvx3v8wzikpjyzu','Cerro Porteño','Club Cerro Porteño','Paraguay','South America','Division Profesional',83.2414275247,193,33),
('dj7mlv2txjphj4xtannqj8q6z','Bolívar','Club Bolívar','Bolivia','South America','Primera División',83.1833314716,201,37),
('5ponlslulpugdlvd93n9yqu2b','Vasco da Gama','CR Vasco da Gama','Brazil','South America','Carioca Série A',83.0717127309,205,39),
('cxb4hqite921i36gwrezdts7c','LDU Quito','Liga Deportiva Universitaria de Quito','Ecuador','South America','Liga Pro',82.9650187242,211,41),
('ajjzd6ex2rqp70mwh5by9wdfb','Olimpia','Club Olimpia','Paraguay','South America','Division Profesional',82.9354393561,215,43),
('436xob9epu7bzdu7c1zzjjdak','Vitória','EC Vitória','Brazil','South America','Baiano 1',82.9104374657,217,44),
('4c7u4ex3h310j2unfmd4uc18v','Macará','CSD Macará','Ecuador','South America','Liga Pro',82.7445733124,222,46),
('1yd80wg4djlmtgkei51x0x4t6','Grêmio','Grêmio FB Porto Alegrense','Brazil','South America','Gaúcho 1',82.6089858758,232,50),
('eks7plclfqznw5kd17zlq6dhm','Remo','Clube do Remo','Brazil','South America','Paraense A1',81.7554899234,276,58),
('3d9c158350xh1oq4mhpdrkz3x','City Torque','Montevideo City Torque','Uruguay','South America','Liga AUF',80.9224821442,321,66),
('d08q2rnrt7mss1axbuu595tyu','Platense','CA Platense','Argentina','South America','Liga Profesional Argentina',80.7670535619,331,69),
('dcmhxgsc612y27h5p2rzqy7i','Chapecoense','Chapecoense AF','Brazil','South America','Catarinense 1',79.4037037728,423,88),
('24h1lehk43heu9nkp3p7co76y','Recoleta','Recoleta FC','Paraguay','South America','Division Profesional',78.8143278922,471,99),
('6z2y5seyiusqbh8xyfzq17nzk','Cienciano','Club Cienciano','Peru','South America','Liga 1',77.8136991977,564,122),
('9cl05467nuteeh2yk1ylr897l','Novorizontino','Grêmio Novorizontino','Brazil','South America','Serie B',75.9393240666,754,160),
('1vvaya787s5wg5geudzacya7m','Fortaleza','Fortaleza EC','Brazil','South America','Serie B',74.2570680432,946,205),
('7avb9meepw828qkp0tiugzd1b','Juventude','EC Juventude','Brazil','South America','Serie B',73.7129965144,1012,215),
('6b0zh3jsqunui0n83wuq8b5m2','Primavera SP','EC Primavera','Brazil','South America','Paulista A1',73.5132214103,1035,217),
('8q9x0gzkqsus3x4o0aw7wjzso','Capivariano','Capivariano FC','Brazil','South America','Paulista A1',73.4375494867,1048,219),
('53r1xghhsn5zog9gxjkt2am8o','Botafogo SP','Botafogo FC Ribeirão Preto','Brazil','South America','Serie B',71.5523002858,1328,264),
('82ng59yij7r96hwr24uzxibq4','São Bernardo','São Bernardo FC','Brazil','South America','Serie B',71.3877155831,1355,268),
('u414hw3hw8leoqvbymkn9n4j','Ponte Preta','Associacao Atletica Ponte Preta','Brazil','South America','Serie B',66.892727384,2226,352),
('15akzajbqir3ko16ly444nz1i','Guarani SP','Guarani FC','Brazil','South America','Serie C',66.2593770561,2399,370),
('dum6uftf62s1x31zc39tftduk','Portuguesa','Associacao Portuguesa de Desportos','Brazil','South America','Serie D',58.2780901285,4704,608),
('3m30l01i8c2k9xgw9mokn6tz5','Noroeste','Esporte Clube Noroeste','Brazil','South America','Serie D',55.110920657,5704,685),
('8vxkzl4q8o7oyzpahy1sga2f1','Velo Clube','AE Velo Clube Rioclarense','Brazil','South America','Serie D',54.5961388906,5881,711)
) AS v(opta_contestant_id,team_name,club_name,country,confederation,domestic_league_name,rating,global_rank,confederation_rank)
WHERE s.is_active
ON CONFLICT (snapshot_id, opta_contestant_id) DO NOTHING;

INSERT INTO public.club_source_ids (team_key, canonical_name, country, opta_contestant_id, is_bolao_team) VALUES
('athletico pr','Athletico-PR','Brazil','5h3amvo8ykt01u4h3upw3c5qf',true),
('atletico mg','Atlético-MG','Brazil','1f6qzkdjh8fih5ii1eyqmkolq',true),
('boca juniors','Boca Juniors','Argentina','ciqt22ivoc48zj62detdyh1mm',true),
('bolivar','Bolivar','Bolivia','dj7mlv2txjphj4xtannqj8q6z',true),
('botafogo','Botafogo','Brazil','2x94b2pn1o1tb5l1bbu8x9yu9',true),
('botafogo sp','Botafogo-SP','Brazil','53r1xghhsn5zog9gxjkt2am8o',false),
('bragantino','Bragantino','Brazil','4ayjm36vlnc5j8jhwpsdwxuph',true),
('capivariano','Capivariano','Brazil','8q9x0gzkqsus3x4o0aw7wjzso',false),
('cerro porteno','Cerro Porteño','Paraguay','buyj9j0qwgbvx3v8wzikpjyzu',true),
('chapecoense','Chapecoense','Brazil','dcmhxgsc612y27h5p2rzqy7i',true),
('cienciano','Cienciano','Peru','6z2y5seyiusqbh8xyfzq17nzk',true),
('coquimbo unido','Coquimbo Unido','Chile','bw2py3aiws1rq61pokete3kv2',true),
('corinthians','Corinthians','Brazil','f0td6lvs326lppbwh1fj8v2ls',true),
('cruzeiro','Cruzeiro','Brazil','bd6vujl7jfv4wtc8gvo1o1t5y',true),
('deportes tolima','Deportes Tolima','Colombia','epcjkyn8gazuywbotxwikc5kn',true),
('estudiantes','Estudiantes','Argentina','91j32z6ga16tjj140ss2i24mt',true),
('flamengo','Flamengo','Brazil','102ykb145wz6dtveg65nistwm',true),
('fluminense','Fluminense','Brazil','2ldx5vhhqfz2rllkgp7wpa744',true),
('fortaleza','Fortaleza','Brazil','1vvaya787s5wg5geudzacya7m',true),
('gremio','Grêmio','Brazil','1yd80wg4djlmtgkei51x0x4t6',true),
('guarani','Guarani','Brazil','15akzajbqir3ko16ly444nz1i',false),
('independiente del valle','Independiente del Valle','Ecuador','ddkiejug4w4ri9ch2fnnen6yw',true),
('independiente rivadavia','Independiente Rivadavia','Argentina','8inprqnxjps9ckiamn3cfoo8v',true),
('internacional','Internacional','Brazil','c7n1isjmpyqt5pj51yekr08wo',true),
('juventude','Juventude','Brazil','7avb9meepw828qkp0tiugzd1b',true),
('ldu quito','LDU Quito','Ecuador','cxb4hqite921i36gwrezdts7c',true),
('macara','Macará','Ecuador','4c7u4ex3h310j2unfmd4uc18v',true),
('mirassol','Mirassol','Brazil','cllomrn9h2sg6vmxy0pdnmups',true),
('montevideo city torque','Montevideo City Torque','Uruguay','3d9c158350xh1oq4mhpdrkz3x',true),
('noroeste','Noroeste','Brazil','3m30l01i8c2k9xgw9mokn6tz5',false),
('novorizontino','Novorizontino','Brazil','9cl05467nuteeh2yk1ylr897l',false),
('olimpia','Olimpia','Paraguay','ajjzd6ex2rqp70mwh5by9wdfb',true),
('palmeiras','Palmeiras','Brazil','b9d2xcvxxcwplyp4le9ulnlv9',true),
('platense','Platense','Argentina','d08q2rnrt7mss1axbuu595tyu',true),
('ponte preta','Ponte Preta','Brazil','u414hw3hw8leoqvbymkn9n4j',false),
('portuguesa','Portuguesa','Brazil','dum6uftf62s1x31zc39tftduk',false),
('primavera','Primavera','Brazil','6b0zh3jsqunui0n83wuq8b5m2',false),
('recoleta','Recoleta','Paraguay','24h1lehk43heu9nkp3p7co76y',true),
('remo','Remo','Brazil','eks7plclfqznw5kd17zlq6dhm',true),
('river plate','River Plate','Argentina','115foion8jwrvp2e7xif675kx',true),
('rosario central','Rosario Central','Argentina','e8ma1lonj51sqmwy00mwnw1ke',true),
('santa fe','Santa Fe','Colombia','5vtngmqlfpmuntxl9fw683ttc',true),
('santos','Santos','Brazil','1icvp50kgaw8oduqmhyt3iex0',true),
('sao bernardo','São Bernardo','Brazil','82ng59yij7r96hwr24uzxibq4',false),
('sao paulo','São Paulo','Brazil','5p301ikmaba9gesscss3zo745',true),
('tigre','Tigre','Argentina','cs3122cdx3g2nviltzfilmz5c',true),
('universidad catolica','Universidad Católica','Chile','7gkwmrw0cjz0m168ouw00z4gy',true),
('vasco da gama','Vasco da Gama','Brazil','5ponlslulpugdlvd93n9yqu2b',true),
('velo clube','Velo Clube','Brazil','8vxkzl4q8o7oyzpahy1sga2f1',false),
('vitoria','Vitória','Brazil','436xob9epu7bzdu7c1zzjjdak',true)
ON CONFLICT (team_key) DO NOTHING;

INSERT INTO public.club_aliases (alias, team_key, origem) VALUES
('ae velo clube rioclarense','velo clube','opta'),
('associacao atletica ponte preta','ponte preta','opta'),
('associacao portuguesa de desportos','portuguesa','opta'),
('athletico paranaense','athletico pr','opta'),
('atletico mineiro','atletico mg','opta'),
('botafogo fc ribeirao preto','botafogo sp','opta'),
('botafogo fr','botafogo','opta'),
('ca boca juniors','boca juniors','opta'),
('ca mineiro','atletico mg','opta'),
('ca platense','platense','opta'),
('ca river plate','river plate','opta'),
('ca rosario central','rosario central','opta'),
('ca tigre','tigre','opta'),
('capivariano fc','capivariano','opta'),
('cd coquimbo unido','coquimbo unido','opta'),
('cd universidad catolica','universidad catolica','opta'),
('chapecoense af','chapecoense','opta'),
('city torque','montevideo city torque','opta'),
('club athletico paranaense','athletico pr','opta'),
('club bolivar','bolivar','opta'),
('club cerro porteno','cerro porteno','opta'),
('club cienciano','cienciano','opta'),
('club deportes tolima sa','deportes tolima','opta'),
('club estudiantes de la plata','estudiantes','opta'),
('club independiente santa fe','santa fe','opta'),
('club olimpia','olimpia','opta'),
('clube do remo','remo','opta'),
('cr flamengo','flamengo','opta'),
('cr vasco da gama','vasco da gama','opta'),
('cruzeiro ec','cruzeiro','opta'),
('cs independiente rivadavia','independiente rivadavia','opta'),
('csd independiente del valle','independiente del valle','opta'),
('csd macara','macara','opta'),
('ec juventude','juventude','opta'),
('ec primavera','primavera','opta'),
('ec vitoria','vitoria','opta'),
('esporte clube noroeste','noroeste','opta'),
('fluminense fc','fluminense','opta'),
('fortaleza ec','fortaleza','opta'),
('gremio fb porto alegrense','gremio','opta'),
('gremio novorizontino','novorizontino','opta'),
('guarani fc','guarani','opta'),
('guarani sp','guarani','opta'),
('independiente santa fe','santa fe','opta'),
('independiente valle','independiente del valle','opta'),
('liga deportiva universitaria de quito','ldu quito','opta'),
('mirassol fc','mirassol','opta'),
('primavera sp','primavera','opta'),
('rb bragantino','bragantino','opta'),
('recoleta fc','recoleta','opta'),
('red bull bragantino','bragantino','app_matches'),
('santos fc sao paulo','santos','opta'),
('sao bernardo fc','sao bernardo','opta'),
('sao paulo fc','sao paulo','opta'),
('sc corinthians paulista','corinthians','opta'),
('sc internacional','internacional','opta'),
('se palmeiras','palmeiras','opta'),
('vasco','vasco da gama','app_matches')
ON CONFLICT (alias) DO NOTHING;
