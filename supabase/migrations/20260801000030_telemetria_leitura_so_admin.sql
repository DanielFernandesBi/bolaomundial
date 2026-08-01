-- ============================================================================
-- As seis funções de uso passam a exigir admin.
--
-- Elas nasceram SECURITY DEFINER (precisam ser: leem app_sessions e profiles
-- de todo mundo) e com GRANT para `authenticated`. A RLS das tabelas diz
-- "leitura só admin", mas SECURITY DEFINER passa por cima da RLS — então, do
-- jeito que estavam, qualquer usuário logado poderia chamar uso_por_usuario()
-- e ver o tempo de tela dos outros pelo nome.
--
-- Mesmo idioma já usado em aplicar_apelido(): checagem explícita no corpo.
-- ============================================================================

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
    (SELECT COALESCE(avg(EXTRACT(EPOCH FROM (j.last_seen_at - j.started_at))), 0)::INT FROM janela j),
    (SELECT COALESCE(sum(EXTRACT(EPOCH FROM (j.last_seen_at - j.started_at))), 0)::INT FROM janela j),
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
             COALESCE(sum(EXTRACT(EPOCH FROM (last_seen_at - started_at))), 0)::INT AS tempo
        FROM public.app_sessions GROUP BY 1
    ) s ON s.dia = d.dia
    LEFT JOIN (
      SELECT (occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*)::INT AS visualizacoes
        FROM public.app_page_views GROUP BY 1
    ) v ON v.dia = d.dia
   ORDER BY d.dia;
END;
$$;

CREATE OR REPLACE FUNCTION public.uso_por_area(p_dias INT DEFAULT 30)
RETURNS TABLE (area TEXT, visualizacoes INT, usuarios INT, tempo_total_seg INT, tempo_medio_seg INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_admin) THEN
    RAISE EXCEPTION 'Apenas administradores podem ver a telemetria.';
  END IF;

  RETURN QUERY
  SELECT w.area, count(*)::INT, count(DISTINCT w.user_id)::INT,
         COALESCE(sum(EXTRACT(EPOCH FROM w.permanencia)), 0)::INT,
         COALESCE(avg(EXTRACT(EPOCH FROM w.permanencia)), 0)::INT
    FROM public.vw_page_dwell w
   WHERE w.occurred_at >= now() - make_interval(days => p_dias)
   GROUP BY w.area ORDER BY 2 DESC;
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
           COALESCE(sum(EXTRACT(EPOCH FROM (a.last_seen_at - a.started_at))), 0)::INT AS tempo,
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

CREATE OR REPLACE FUNCTION public.uso_por_hora(p_dias INT DEFAULT 30)
RETURNS TABLE (dia_semana INT, hora INT, visualizacoes INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_admin) THEN
    RAISE EXCEPTION 'Apenas administradores podem ver a telemetria.';
  END IF;

  RETURN QUERY
  SELECT EXTRACT(DOW  FROM pv.occurred_at AT TIME ZONE 'America/Sao_Paulo')::INT,
         EXTRACT(HOUR FROM pv.occurred_at AT TIME ZONE 'America/Sao_Paulo')::INT,
         count(*)::INT
    FROM public.app_page_views pv
   WHERE pv.occurred_at >= now() - make_interval(days => p_dias)
   GROUP BY 1, 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.uso_dispositivos(p_dias INT DEFAULT 30)
RETURNS TABLE (dispositivo TEXT, instalado BOOLEAN, sessoes INT, usuarios INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.is_admin) THEN
    RAISE EXCEPTION 'Apenas administradores podem ver a telemetria.';
  END IF;

  RETURN QUERY
  SELECT COALESCE(a.dispositivo, 'desconhecido'), COALESCE(a.instalado, FALSE),
         count(*)::INT, count(DISTINCT a.user_id)::INT
    FROM public.app_sessions a
   WHERE a.started_at >= now() - make_interval(days => p_dias)
   GROUP BY 1, 2 ORDER BY 3 DESC;
END;
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['uso_resumo','uso_por_dia','uso_por_area','uso_por_usuario','uso_por_hora','uso_dispositivos']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(INT) FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(INT) TO authenticated', f);
  END LOOP;
END $$;
