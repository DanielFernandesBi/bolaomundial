-- ============================================================================
-- Os números que o painel do admin lê.
--
-- O tempo em cada tela sai daqui, uma vez só: diferença para a tela seguinte
-- da mesma sessão, e para a última tela a diferença até o `last_seen_at` da
-- sessão. Teto de 30 minutos por tela — sem ele, uma aba esquecida aberta a
-- noite inteira viraria "8 horas lendo o Ranking" e estragaria toda média.
--
-- NOTA: as seis funções nascem aqui sem checagem de admin e ganham a checagem
-- na migração seguinte (20260801000030). O corpo definitivo é o de lá.
-- ============================================================================

CREATE OR REPLACE VIEW public.vw_page_dwell
WITH (security_invoker = true) AS
SELECT pv.id, pv.session_id, pv.user_id, pv.occurred_at, pv.rota, pv.area, pv.torneio,
       LEAST(
         COALESCE(
           LEAD(pv.occurred_at) OVER (PARTITION BY pv.session_id ORDER BY pv.occurred_at),
           s.last_seen_at
         ) - pv.occurred_at,
         INTERVAL '30 minutes'
       ) AS permanencia
  FROM public.app_page_views pv
  JOIN public.app_sessions s ON s.id = pv.session_id;

CREATE OR REPLACE FUNCTION public.uso_resumo(p_dias INT DEFAULT 30)
RETURNS TABLE (
  sessoes INT, visualizacoes INT, usuarios INT,
  duracao_media_seg INT, tempo_total_seg INT,
  telas_por_sessao NUMERIC,
  ativos_hoje INT, ativos_7d INT, ativos_30d INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH janela AS (
    SELECT * FROM public.app_sessions
     WHERE started_at >= now() - make_interval(days => p_dias)
  )
  SELECT
    (SELECT count(*)::INT FROM janela),
    (SELECT count(*)::INT FROM public.app_page_views
      WHERE occurred_at >= now() - make_interval(days => p_dias)),
    (SELECT count(DISTINCT user_id)::INT FROM janela),
    (SELECT COALESCE(avg(EXTRACT(EPOCH FROM (last_seen_at - started_at))), 0)::INT FROM janela),
    (SELECT COALESCE(sum(EXTRACT(EPOCH FROM (last_seen_at - started_at))), 0)::INT FROM janela),
    (SELECT ROUND(
       (SELECT count(*) FROM public.app_page_views
         WHERE occurred_at >= now() - make_interval(days => p_dias))::NUMERIC
       / NULLIF((SELECT count(*) FROM janela), 0), 1)),
    (SELECT count(DISTINCT user_id)::INT FROM public.app_sessions WHERE started_at >= now() - INTERVAL '1 day'),
    (SELECT count(DISTINCT user_id)::INT FROM public.app_sessions WHERE started_at >= now() - INTERVAL '7 days'),
    (SELECT count(DISTINCT user_id)::INT FROM public.app_sessions WHERE started_at >= now() - INTERVAL '30 days');
$$;

CREATE OR REPLACE FUNCTION public.uso_por_dia(p_dias INT DEFAULT 30)
RETURNS TABLE (dia DATE, sessoes INT, visualizacoes INT, usuarios INT, tempo_total_seg INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  -- generate_series e não GROUP BY puro: dia sem acesso tem de aparecer como
  -- zero. Sumir o dia vazio faz o gráfico mentir sobre a frequência.
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
$$;

CREATE OR REPLACE FUNCTION public.uso_por_area(p_dias INT DEFAULT 30)
RETURNS TABLE (area TEXT, visualizacoes INT, usuarios INT, tempo_total_seg INT, tempo_medio_seg INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT area, count(*)::INT, count(DISTINCT user_id)::INT,
         COALESCE(sum(EXTRACT(EPOCH FROM permanencia)), 0)::INT,
         COALESCE(avg(EXTRACT(EPOCH FROM permanencia)), 0)::INT
    FROM public.vw_page_dwell
   WHERE occurred_at >= now() - make_interval(days => p_dias)
   GROUP BY area ORDER BY 2 DESC;
$$;

CREATE OR REPLACE FUNCTION public.uso_por_usuario(p_dias INT DEFAULT 30)
RETURNS TABLE (
  user_id UUID, username TEXT, avatar_url TEXT,
  sessoes INT, visualizacoes INT, tempo_total_seg INT,
  ultima_visita TIMESTAMPTZ, dias_ativos INT, area_favorita TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH s AS (
    SELECT user_id, count(*)::INT AS sessoes,
           COALESCE(sum(EXTRACT(EPOCH FROM (last_seen_at - started_at))), 0)::INT AS tempo,
           max(last_seen_at) AS ultima,
           count(DISTINCT (started_at AT TIME ZONE 'America/Sao_Paulo')::date)::INT AS dias
      FROM public.app_sessions
     WHERE started_at >= now() - make_interval(days => p_dias)
     GROUP BY user_id
  ),
  v AS (
    SELECT user_id, count(*)::INT AS visualizacoes
      FROM public.app_page_views
     WHERE occurred_at >= now() - make_interval(days => p_dias)
     GROUP BY user_id
  ),
  fav AS (
    SELECT DISTINCT ON (user_id) user_id, area
      FROM (
        SELECT user_id, area, count(*) AS n
          FROM public.app_page_views
         WHERE occurred_at >= now() - make_interval(days => p_dias)
         GROUP BY user_id, area
      ) t ORDER BY user_id, n DESC
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
$$;

CREATE OR REPLACE FUNCTION public.uso_por_hora(p_dias INT DEFAULT 30)
RETURNS TABLE (dia_semana INT, hora INT, visualizacoes INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXTRACT(DOW  FROM occurred_at AT TIME ZONE 'America/Sao_Paulo')::INT,
         EXTRACT(HOUR FROM occurred_at AT TIME ZONE 'America/Sao_Paulo')::INT,
         count(*)::INT
    FROM public.app_page_views
   WHERE occurred_at >= now() - make_interval(days => p_dias)
   GROUP BY 1, 2;
$$;

CREATE OR REPLACE FUNCTION public.uso_dispositivos(p_dias INT DEFAULT 30)
RETURNS TABLE (dispositivo TEXT, instalado BOOLEAN, sessoes INT, usuarios INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(dispositivo, 'desconhecido'), COALESCE(instalado, FALSE),
         count(*)::INT, count(DISTINCT user_id)::INT
    FROM public.app_sessions
   WHERE started_at >= now() - make_interval(days => p_dias)
   GROUP BY 1, 2 ORDER BY 3 DESC;
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
