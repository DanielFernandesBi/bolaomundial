'use server';

import { createServerSupabaseClient } from '@/lib/supabase';

export async function getUserProfile(tournamentSlug: string, userId?: string) {
  const supabase = await createServerSupabaseClient();

  // Se userId não foi fornecido, usar o usuário atual
  let targetUserId: string;
  
  if (userId) {
    targetUserId = userId;
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { profile: null, error: 'Usuário não autenticado' };
    }
    targetUserId = user.id;
  }

  // Buscar o torneio pelo slug
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();

  if (tournamentError || !tournament) {
    return { profile: null, error: 'Torneio não encontrado' };
  }

  // Buscar perfil
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', targetUserId)
    .single();

  if (error) {
    return { profile: null, error: error.message };
  }

  // Buscar ranking do torneio para calcular posição
  const { data: tournamentRankings } = await supabase
    .from('tournament_rankings')
    .select('user_id, total_points, exact_matches')
    .eq('tournament_id', tournament.id)
    .order('total_points', { ascending: false })
    .order('exact_matches', { ascending: false });

  const rankingPosition =
    tournamentRankings?.findIndex((r) => r.user_id === targetUserId) + 1 || null;

  // Buscar ranking do usuário neste torneio
  const { data: userRanking } = await supabase
    .from('tournament_rankings')
    .select('total_points, exact_matches')
    .eq('user_id', targetUserId)
    .eq('tournament_id', tournament.id)
    .single();

  // Buscar estatísticas de palpites do torneio
  // Primeiro buscar os IDs dos jogos do torneio
  const { data: tournamentMatches } = await supabase
    .from('matches')
    .select('id')
    .eq('tournament_id', tournament.id);

  const tournamentMatchIds = tournamentMatches?.map((m) => m.id) || [];

  const { data: predictions } = await supabase
    .from('predictions')
    .select('points_earned')
    .eq('user_id', targetUserId)
    .in('match_id', tournamentMatchIds.length > 0 ? tournamentMatchIds : [0]);

  const totalPredictions = predictions?.length || 0;
  const correctPredictions =
    predictions?.filter((p) => p.points_earned > 0).length || 0;

  // Buscar histórico de palpites em jogos finalizados do torneio
  const { data: finishedMatches } = await supabase
    .from('matches')
    .select('id')
    .eq('status', 'FINISHED')
    .eq('tournament_id', tournament.id);

  const finishedMatchIds = finishedMatches?.map((m) => m.id) || [];

  // Buscar palpites do usuário nesses jogos
  const { data: finishedPredictions } = await supabase
    .from('predictions')
    .select(
      'pred_home, pred_away, pred_extra_result, pred_pen_home, pred_pen_away, pred_pen_winner, points_earned, points_regular, points_extra, points_pen, match_id'
    )
    .eq('user_id', targetUserId)
    .in('match_id', finishedMatchIds.length > 0 ? finishedMatchIds : [0]);

  // Buscar detalhes dos jogos
  const matchIds = finishedPredictions?.map((p) => p.match_id) || [];
  let matchesData = null;

  if (matchIds.length > 0) {
    const { data } = await supabase
      .from('matches')
      .select(
        'id, team_home, team_away, home_iso, away_iso, score_home, score_away, match_date, is_knockout, has_extra_time, extra_time_result, pen_home, pen_away, pen_winner'
      )
      .in('id', matchIds)
      .order('match_date', { ascending: false });
    matchesData = data;
  }

  // Combinar dados
  const matchesMap = new Map(matchesData?.map((m: any) => [m.id, m]) || []);
  const history = finishedPredictions
    ?.map((pred: any) => {
      const match = matchesMap.get(pred.match_id);
      if (!match) return null;
      return {
        match_id: match.id,
        team_home: match.team_home,
        team_away: match.team_away,
        home_iso: match.home_iso,
        away_iso: match.away_iso,
        score_home: match.score_home,
        score_away: match.score_away,
        match_date: match.match_date,
        is_knockout: match.is_knockout ?? false,
        has_extra_time: match.has_extra_time ?? true,
        extra_time_result: match.extra_time_result ?? null,
        pen_home: match.pen_home ?? null,
        pen_away: match.pen_away ?? null,
        pen_winner: match.pen_winner ?? null,
        pred_home: pred.pred_home,
        pred_away: pred.pred_away,
        pred_extra_result: pred.pred_extra_result ?? null,
        pred_pen_home: pred.pred_pen_home ?? null,
        pred_pen_away: pred.pred_pen_away ?? null,
        pred_pen_winner: pred.pred_pen_winner ?? null,
        points_earned: pred.points_earned,
        points_regular: pred.points_regular ?? 0,
        points_extra: pred.points_extra ?? 0,
        points_pen: pred.points_pen ?? 0,
      };
    })
    .filter((h: any) => h !== null)
    .sort((a: any, b: any) => {
      const dateA = new Date(a.match_date).getTime();
      const dateB = new Date(b.match_date).getTime();
      return dateB - dateA; // Mais recente primeiro
    }) || [];

  // Calcular estatísticas baseadas em jogos finalizados
  const finishedPredictionsCount = finishedPredictions?.length || 0;
  
  // Porcentagem de acerto (palpites com pontos > 0)
  const correctFinishedPredictions = finishedPredictions?.filter((p: any) => p.points_earned > 0).length || 0;
  const accuracyPercentage = finishedPredictionsCount > 0
    ? Math.round((correctFinishedPredictions / finishedPredictionsCount) * 100 * 10) / 10
    : 0;

  // Porcentagem de cravadas (placar exato do tempo normal: points_regular === 30)
  const exactMatchesCount = finishedPredictions?.filter((p: any) => p.points_regular === 30).length || 0;
  const exactMatchesPercentage = finishedPredictionsCount > 0
    ? Math.round((exactMatchesCount / finishedPredictionsCount) * 100 * 10) / 10
    : 0;

  // Média de pontos por jogo finalizado
  const totalPointsFromFinished = finishedPredictions?.reduce((sum: number, p: any) => sum + (p.points_earned || 0), 0) || 0;
  const averagePoints = finishedPredictionsCount > 0
    ? Math.round((totalPointsFromFinished / finishedPredictionsCount) * 10) / 10
    : 0;

  return {
    profile: {
      ...profile,
      total_points: userRanking?.total_points || 0,
      exact_matches: userRanking?.exact_matches || 0,
      ranking_position: rankingPosition,
      total_predictions: totalPredictions,
      correct_predictions: correctPredictions,
      history,
      // Novas estatísticas baseadas em jogos finalizados
      accuracy_percentage: accuracyPercentage,
      exact_matches_percentage: exactMatchesPercentage,
      average_points: averagePoints,
      finished_predictions_count: finishedPredictionsCount,
    },
    error: null,
  };
}

