'use server';

import { createServerSupabaseClient } from '@/lib/supabase';

export async function getDailyRanking(tournamentSlug: string) {
  const supabase = await createServerSupabaseClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();

  if (!tournament) {
    return { entries: [], error: 'Torneio não encontrado', hasMatchesToday: false, matchDayLabel: '' };
  }

  const now = new Date();

  // Retorna a data no fuso de São Paulo no formato YYYY-MM-DD
  function getBRTDate(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }).format(date);
  }

  const todayBRT = getBRTDate(now);

  // Busca todas as partidas do torneio para determinar o dia mais relevante
  const { data: allMatches } = await supabase
    .from('matches')
    .select('id, match_date')
    .eq('tournament_id', tournament.id)
    .order('match_date', { ascending: false });

  if (!allMatches || allMatches.length === 0) {
    return { entries: [], error: null, hasMatchesToday: false, matchDayLabel: '' };
  }

  // Agrupa IDs de partidas por data BRT
  const matchesByDate = new Map<string, number[]>();
  for (const m of allMatches as any[]) {
    const d = getBRTDate(new Date(m.match_date));
    if (!matchesByDate.has(d)) matchesByDate.set(d, []);
    matchesByDate.get(d)!.push(m.id);
  }

  // Determina o dia mais relevante:
  // 1. Hoje (BRT) se tiver partidas
  // 2. Senão, o dia mais recente passado com partidas
  // Isso garante que resultados lançados após a meia-noite ainda aparecem no dia correto
  const sortedPastDates = Array.from(matchesByDate.keys())
    .filter(d => d <= todayBRT)
    .sort()
    .reverse();

  if (sortedPastDates.length === 0) {
    return { entries: [], error: null, hasMatchesToday: false, matchDayLabel: '' };
  }

  const targetDate = sortedPastDates[0]; // hoje se tiver jogos, senão o mais recente
  const matchIds   = matchesByDate.get(targetDate) || [];

  // Monta o label da aba
  const yesterdayBRT = getBRTDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const [y, mo, d]   = targetDate.split('-');
  const dateFormatted = `${d}/${mo}`;
  const matchDayLabel =
    targetDate === todayBRT    ? `Hoje (${dateFormatted})`   :
    targetDate === yesterdayBRT ? `Ontem (${dateFormatted})` :
    dateFormatted;

  // Palpites das partidas do dia alvo
  const { data: predictions, error } = await supabase
    .from('predictions')
    .select(`
      user_id,
      points_earned,
      profiles:user_id (
        id,
        username,
        avatar_url
      )
    `)
    .in('match_id', matchIds);

  if (error) {
    return { entries: [], error: error.message, hasMatchesToday: true, matchDayLabel };
  }

  if (!predictions || predictions.length === 0) {
    return { entries: [], error: null, hasMatchesToday: true, matchDayLabel };
  }

  // Agrega pontos por usuário
  const userMap = new Map<string, {
    username: string;
    avatar_url: string | null;
    daily_points: number;
    daily_exact: number;
  }>();

  for (const pred of predictions as any[]) {
    const profile = Array.isArray(pred.profiles) ? pred.profiles[0] : pred.profiles;
    if (!profile) continue;

    const pts     = pred.points_earned ?? 0;
    const isExact = pts >= 20;
    const entry   = userMap.get(pred.user_id);

    if (entry) {
      entry.daily_points += pts;
      if (isExact) entry.daily_exact++;
    } else {
      userMap.set(pred.user_id, {
        username: profile.username,
        avatar_url: profile.avatar_url,
        daily_points: pts,
        daily_exact: isExact ? 1 : 0,
      });
    }
  }

  const entries = Array.from(userMap.entries())
    .map(([user_id, data]) => ({ user_id, ...data }))
    .sort((a, b) =>
      b.daily_points !== a.daily_points
        ? b.daily_points - a.daily_points
        : b.daily_exact - a.daily_exact
    );

  return { entries, error: null, hasMatchesToday: true, matchDayLabel };
}

export async function getRanking(tournamentSlug: string) {
  const supabase = await createServerSupabaseClient();

  // Buscar o torneio pelo slug
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();

  if (tournamentError || !tournament) {
    return { profiles: [], error: 'Torneio não encontrado' };
  }

  // Buscar rankings do torneio com dados dos perfis
  const { data: rankings, error } = await supabase
    .from('tournament_rankings')
    .select(`
      user_id,
      total_points,
      exact_matches,
      profiles:user_id (
        id,
        username,
        avatar_url
      )
    `)
    .eq('tournament_id', tournament.id)
    .order('total_points', { ascending: false })
    .order('exact_matches', { ascending: false });

  if (error) {
    return { profiles: [], error: error.message };
  }

  // Processar os dados para o formato esperado
  const profiles = (rankings || []).map((ranking: any) => {
    const profile = Array.isArray(ranking.profiles) 
      ? ranking.profiles[0] 
      : ranking.profiles;
    
    return {
      id: profile.id,
      username: profile.username,
      avatar_url: profile.avatar_url,
      total_points: ranking.total_points,
      exact_matches: ranking.exact_matches,
    };
  });

  return { profiles, error: null };
}

