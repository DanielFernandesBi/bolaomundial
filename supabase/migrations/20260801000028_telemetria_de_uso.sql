-- ============================================================================
-- Telemetria de uso, dentro de casa.
--
-- Nenhum serviço externo. O bolão tem uma dezena de usuários conhecidos e um
-- admin só: contratar Vercel Analytics ou PostHog traria um painel fora do
-- app, dado que não cruza com as nossas tabelas, e um terceiro recebendo
-- informação de quem joga. Aqui a métrica vira SQL e o painel vira uma aba do
-- admin, ao lado do resto.
--
-- Duas tabelas, e uma decisão que simplifica tudo:
--
--   app_sessions    — uma por visita. `last_seen_at` avança com o heartbeat,
--                     então a duração é uma subtração e não depende de o
--                     navegador avisar que fechou (o que ele quase nunca faz).
--   app_page_views  — append-only, uma linha por tela aberta.
--
-- O TEMPO EM CADA TELA NÃO É GRAVADO: ele é derivado da diferença para a tela
-- seguinte da mesma sessão. Gravar exigiria um UPDATE na saída de cada página
-- — que é exatamente o evento que o navegador engole quando o usuário fecha a
-- aba. Derivar é mais simples e mais confiável.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_sessions (
  id           UUID PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 'mobile' | 'tablet' | 'desktop', decidido pela largura da viewport.
  dispositivo  TEXT,
  -- App instalado (PWA) ou aba do navegador. Diz se vale investir no PWA.
  instalado    BOOLEAN,
  viewport_w   INT,
  user_agent   TEXT,
  referrer     TEXT
);

CREATE INDEX IF NOT EXISTS app_sessions_user_idx   ON public.app_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS app_sessions_quando_idx ON public.app_sessions (started_at DESC);

CREATE TABLE IF NOT EXISTS public.app_page_views (
  id          BIGSERIAL PRIMARY KEY,
  session_id  UUID NOT NULL REFERENCES public.app_sessions(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Caminho com o slug do torneio já trocado por ':torneio', senão cada bolão
  -- vira uma rota diferente e não dá para somar "quanto se usa Partidas".
  rota        TEXT NOT NULL,
  area        TEXT NOT NULL,
  torneio     TEXT,
  caminho_cru TEXT
);

CREATE INDEX IF NOT EXISTS app_page_views_sessao_idx ON public.app_page_views (session_id, occurred_at);
CREATE INDEX IF NOT EXISTS app_page_views_quando_idx ON public.app_page_views (occurred_at DESC);
CREATE INDEX IF NOT EXISTS app_page_views_area_idx   ON public.app_page_views (area, occurred_at DESC);

ALTER TABLE public.app_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_page_views ENABLE ROW LEVEL SECURITY;

-- Escrita: cada um grava a PRÓPRIA telemetria e nada mais. Sem UPDATE de
-- terceiro, sem DELETE nenhum — a série histórica não pode ser reescrita.
DROP POLICY IF EXISTS app_sessions_insere ON public.app_sessions;
CREATE POLICY app_sessions_insere ON public.app_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS app_sessions_atualiza ON public.app_sessions;
CREATE POLICY app_sessions_atualiza ON public.app_sessions
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS app_page_views_insere ON public.app_page_views;
CREATE POLICY app_page_views_insere ON public.app_page_views
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));

-- Leitura: só admin. Saber por onde os outros andam não é assunto de jogador.
DROP POLICY IF EXISTS app_sessions_le ON public.app_sessions;
CREATE POLICY app_sessions_le ON public.app_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_admin));

DROP POLICY IF EXISTS app_page_views_le ON public.app_page_views;
CREATE POLICY app_page_views_le ON public.app_page_views
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_admin));

REVOKE DELETE ON public.app_sessions, public.app_page_views FROM authenticated, anon;

COMMENT ON TABLE public.app_sessions IS
  'Uma linha por visita. Duração = last_seen_at - started_at, mantido por heartbeat.';
COMMENT ON TABLE public.app_page_views IS
  'Append-only. O tempo em cada tela é derivado da diferença para a próxima da mesma sessão.';
