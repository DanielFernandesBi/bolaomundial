-- ============================================================================
-- "General Caballero" -> General Caballero JLM.
--
-- Este apelido foi cadastrado pela tela de Apelidos do admin, não por
-- migration; sem esta linha, uma base nova não o teria. O conteúdo é o mesmo
-- que a interface grava.
--
-- Eu havia deixado o caso pendente por achar ambíguo: existem o General
-- Caballero JLM (Juan León Mallorquín) e o General Caballero ZC (Zeballos
-- Cué), e a partida — contra o Benjamín Aceval — é da División Intermedia,
-- segunda divisão paraguaia. Achei que o JLM estivesse na Primera.
--
-- Estava errado: o JLM disputa a Intermedia. Confirmado contra a Wikipédia em
-- 01/08/2026. A liga 251 da partida é a APF División Intermedia, então o
-- mapeamento está certo.
--
-- Fica como lembrete de que "nome ambíguo" nem sempre quer dizer "não dá para
-- decidir" — às vezes falta só olhar em que divisão o clube joga.
-- ============================================================================

INSERT INTO public.club_aliases (alias, team_key, origem)
VALUES (public.club_key_normalize('General Caballero'), 'general caballero jlm', 'provider')
ON CONFLICT (alias) DO NOTHING;

SELECT public.reresolve_fixture_keys();
