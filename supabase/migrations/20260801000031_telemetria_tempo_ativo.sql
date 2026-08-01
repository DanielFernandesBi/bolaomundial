-- ============================================================================
-- Tempo ATIVO, e não tempo de calendário.
--
-- A duração vinha de `last_seen_at - started_at`. Essa conta transforma "abri
-- de manhã, deixei a aba aberta, voltei à noite" em oito horas de uso: basta
-- um pulso no fim para o intervalo inteiro entrar. Com uma dezena de usuários,
-- uma sessão dessas sozinha estraga a média do mês.
--
-- Agora o cliente soma apenas os trechos em que a aba esteve VISÍVEL e grava o
-- total aqui. A coluna é um contador absoluto (não incremental), então repetir
-- a gravação não soma duas vezes.
--
-- `last_seen_at` continua existindo e continua servindo para "quando foi a
-- última vez" e para fechar a permanência da última tela da sessão.
-- ============================================================================

ALTER TABLE public.app_sessions
  ADD COLUMN IF NOT EXISTS segundos_ativos INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.app_sessions.segundos_ativos IS
  'Tempo com a aba à vista, em segundos. Contador absoluto, reescrito a cada pulso.';

CREATE OR REPLACE FUNCTION public.uso_resumo(p_dias INT DEFAULT 30)
RETURNS TABLE (
  sessoes INT, visualizacoes INT, usuarios INT,
  duracao_media_seg INT, tempo_total_seg INT,
  telas_por_sessao NUMERIC,
  ativos_hoje INT, ativos_7d INT, ativos_30d INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_admin) THEN
    RAISE EXCEPTION 'Apenas administradores podem ver a telemetria.';
  END IF;

  RETURN QUERY
  WITH janela AS (
    SELECT * FROM public.app_sessions
     WHERE started_at >= now() - make_interval(days => p_dias)
  )
  SELECT
    (SELECT count(*)::INT FROM janela),
    (SELECT count(*)::INT FROM public.app_page_views
      WHERE occurred_at >= now() - make_interval(days => p_dias)),
    (SELECT count(DISTINCT j.user_id)::INT FROM janela j),
    -- Média só sobre quem passou dos 5 segundos: sessão de 1s é recarregamento
    -- ou toque errado, e entra na conta puxando a média para baixo.
    (SELECT COALESCE(avg(j.segundos_ativos), 0)::INT FROM janela j WHERE j.segundos_ativos >= 5),
    (SELECT COALESCE(sum(j.segundos_ativos), 0)::INT FROM janela j),
    (SELECT ROUND(
       (SELECT count(*) FROM public.app_page_views
         WHERE occurred_at >= now() - make_interval(days => p_dias))::NUMERIC
       / NULLIF((SELECT count(*) FROM janela), 0), 1)),
    (SELECT count(DISTINCT s.user_id)::INT FROM public.app_sessions s WHERE s.started_at >= now() - INTERVAL '1 day'),
    (SELECT count(DISTINCT s.user_id)::INT FROM public.app_sessions s WHERE s.started_at >= now() - INTERVAL '7 days'),
    (SELECT count(DISTINCT s.user_id)::INT FROM public.app_sessions s WHERE s.started_at >= now() - INTERVAL '30 days');
END;
$$;

CREATE OR REPLACE FUNCTION public.uso_por_dia(p_dias INT DEFAULT 30)
RETURNS TABLE (dia DATE, sessoes INT, visualizacoes INT, usuarios INT, tempo_total_seg INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_admin) THEN
    RAISE EXCEPTION 'Apenas administradores podem ver a telemetria.';
  END IF;

  -- generate_series e não GROUP BY puro: dia sem acesso tem de aparecer como
  -- zero. Sumir o dia vazio faz o gráfico mentir sobre a frequência.
  RETURN QUERY
  WITH dias AS (
    SELECT generate_series(
             ((now() AT TIME ZONE 'America/Sao_Paulo')::date - (p_dias - 1)),
             (now() AT TIME ZONE 'America/Sao_Paulo')::date,
             '1 day'
           )::date AS dia
  )
  SELECT d.dia,
         COALESCE(s.sessoes, 0), COALESCE(v.visualizacoes, 0),
         COALESCE(s.usuarios, 0), COALESCE(s.tempo, 0)
    FROM dias d
    LEFT JOIN (
      SELECT (started_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
             count(*)::INT AS sessoes,
             count(DISTINCT user_id)::INT AS usuarios,
             COALESCE(sum(segundos_ativos), 0)::INT AS tempo
        FROM public.app_sessions GROUP BY 1
    ) s ON s.dia = d.dia
    LEFT JOIN (
      SELECT (occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*)::INT AS visualizacoes
        FROM public.app_page_views GROUP BY 1
    ) v ON v.dia = d.dia
   ORDER BY d.dia;
END;
$$;

CREATE OR REPLACE FUNCTION public.uso_por_usuario(p_dias INT DEFAULT 30)
RETURNS TABLE (
  user_id UUID, username TEXT, avatar_url TEXT,
  sessoes INT, visualizacoes INT, tempo_total_seg INT,
  ultima_visita TIMESTAMPTZ, dias_ativos INT, area_favorita TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_admin) THEN
    RAISE EXCEPTION 'Apenas administradores podem ver a telemetria.';
  END IF;

  RETURN QUERY
  WITH s AS (
    SELECT a.user_id, count(*)::INT AS sessoes,
           COALESCE(sum(a.segundos_ativos), 0)::INT AS tempo,
           max(a.last_seen_at) AS ultima,
           count(DISTINCT (a.started_at AT TIME ZONE 'America/Sao_Paulo')::date)::INT AS dias
      FROM public.app_sessions a
     WHERE a.started_at >= now() - make_interval(days => p_dias)
     GROUP BY a.user_id
  ),
  v AS (
    SELECT pv.user_id, count(*)::INT AS visualizacoes
      FROM public.app_page_views pv
     WHERE pv.occurred_at >= now() - make_interval(days => p_dias)
     GROUP BY pv.user_id
  ),
  fav AS (
    SELECT DISTINCT ON (t.user_id) t.user_id, t.area
      FROM (
        SELECT pv.user_id, pv.area, count(*) AS n
          FROM public.app_page_views pv
         WHERE pv.occurred_at >= now() - make_interval(days => p_dias)
         GROUP BY pv.user_id, pv.area
      ) t ORDER BY t.user_id, t.n DESC
  )
  -- LEFT JOIN a partir de profiles: quem NÃO acessou também precisa aparecer,
  -- com zero. É a linha mais útil da tabela — mostra quem sumiu.
  SELECT p.id, p.username, p.avatar_url,
         COALESCE(s.sessoes,0), COALESCE(v.visualizacoes,0), COALESCE(s.tempo,0),
         s.ultima, COALESCE(s.dias,0), fav.area
    FROM public.profiles p
    LEFT JOIN s   ON s.user_id   = p.id
    LEFT JOIN v   ON v.user_id   = p.id
    LEFT JOIN fav ON fav.user_id = p.id
   ORDER BY COALESCE(s.tempo,0) DESC, p.username;
END;
$$;
