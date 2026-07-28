-- ============================================================================
-- BOLÃO MATA-MATA DE CLUBES: competição, pernas (ida/volta) e data opcional
-- ============================================================================
-- Seguro aplicar a qualquer momento (aditivo/nullable). NÃO altera torneios antigos:
-- has_extra_time entra com DEFAULT true (comportamento do Mundial); os jogos deste
-- bolão serão criados com has_extra_time = false (sem prorrogação).
-- ============================================================================

-- Competição a que o jogo pertence (bolão unificado junta 3 competições no mesmo torneio).
-- NULL nos torneios que não usam essa dimensão (ex.: Mundial).
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS competition TEXT
  CHECK (competition IS NULL OR competition IN ('copa_do_brasil', 'sudamericana', 'libertadores'));

-- Habilita a prorrogação no fluxo de mata-mata. Nesses torneios de clubes = false
-- (agregado empatado vai direto aos pênaltis, sem prorrogação).
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS has_extra_time BOOLEAN NOT NULL DEFAULT true;

-- Perna do confronto de ida e volta ('ida' | 'volta'). NULL em jogo único.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS leg TEXT
  CHECK (leg IS NULL OR leg IN ('ida', 'volta'));

-- Data/hora passa a ser OPCIONAL: partidas geradas automaticamente pela próxima fase
-- podem nascer "a definir" (match_date NULL) até a organização divulgar o horário.
-- As travas de palpite tratam NULL como "sem prazo" (palpite aberto + alerta na tela).
ALTER TABLE public.matches ALTER COLUMN match_date DROP NOT NULL;

COMMENT ON COLUMN public.matches.competition IS 'Competição do jogo no bolão unificado: copa_do_brasil | sudamericana | libertadores (NULL se não se aplica)';
COMMENT ON COLUMN public.matches.has_extra_time IS 'Se o mata-mata deste jogo tem prorrogação (Mundial=true; clubes=false, vai direto aos pênaltis)';
COMMENT ON COLUMN public.matches.leg IS 'Perna do confronto ida/volta (NULL em jogo único)';
COMMENT ON COLUMN public.matches.match_date IS 'Data/hora do jogo em UTC. NULL = data a definir (partida gerada pela fase anterior ainda sem horário)';
