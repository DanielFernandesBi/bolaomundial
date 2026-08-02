-- ============================================================================
-- O último nome da fila: "Atenas" (id 21043), Torneo Federal A.
-- ============================================================================
-- São dois Atenas no snapshot: o CA Atenas de San Carlos (Uruguai, 2ª divisão)
-- e o Club Sportivo y Biblioteca Atenas de Río Cuarto (Argentina, Torneo
-- Federal A). A partida vista é Atenas × Villa Mitre no Torneo Federal A, com
-- `league_country = Argentina` — é o de Río Cuarto.
--
-- POR QUE PELO ID E NÃO POR APELIDO: um apelido 'atenas' capturaria também o
-- uruguaio quando ele aparecesse, e aí o jogo dele seria RECUSADO pelo pino —
-- mas sem entrar na fila do admin, porque a fila só lista nome que não resolve.
-- Ele sumiria em silêncio. Fixando o id, o nome "Atenas" continua livre: o
-- uruguaio vai cair na fila e ser mapeado como qualquer outro.
--
-- É a regra geral quando há homônimo conhecido: ancorar no id, nunca no nome.
-- ============================================================================

UPDATE public.club_source_ids
   SET api_football_id = 21043
 WHERE team_key = 'atenas de rio cuarto' AND api_football_id IS NULL;

SELECT public.reresolve_fixture_keys();

-- ---------------------------------------------------------------------------
-- Verificação: a fila do admin deve ficar vazia.
--   SELECT * FROM public.apelidos_sugeridos(60);
-- ---------------------------------------------------------------------------
