'use server';

import { createServerSupabaseClient } from '@/lib/supabase';

export async function getGeneralProfile() {
  const supabase = await createServerSupabaseClient();

  // Buscar usuário atual
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { profile: null, error: 'Usuário não autenticado' };
  }

  // Buscar perfil
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    return { profile: null, error: error.message };
  }

  // Buscar todos os rankings do usuário em todos os torneios
  const { data: allRankings } = await supabase
    .from('tournament_rankings')
    .select(`
      total_points,
      exact_matches,
      prize_money,
      tournament_id,
      tournaments:tournament_id (
        id,
        name,
        slug,
        active,
        logo_url
      )
    `)
    .eq('user_id', user.id)
    .order('total_points', { ascending: false });

  // Calcular totais
  const totalPoints = allRankings?.reduce((sum, r) => sum + (r.total_points || 0), 0) || 0;
  const totalExactMatches = allRankings?.reduce((sum, r) => sum + (r.exact_matches || 0), 0) || 0;
  const totalMoney = (profile as any).total_money || 0;

  // Buscar total de palpites em todos os torneios com detalhes
  const { data: allPredictions } = await supabase
    .from('predictions')
    .select('points_earned, points_regular')
    .eq('user_id', user.id);

  const totalPredictions = allPredictions?.length || 0;
  const correctPredictions = allPredictions?.filter((p) => p.points_earned > 0).length || 0;
  
  // Calcular estatísticas adicionais
  const exactMatchesCount = allPredictions?.filter((p) => p.points_regular === 30).length || 0;
  const exactMatchesPercentage = totalPredictions > 0 
    ? Math.round((exactMatchesCount / totalPredictions) * 100 * 10) / 10 
    : 0;
  
  const averagePoints = totalPredictions > 0
    ? Math.round((totalPoints / totalPredictions) * 10) / 10
    : 0;
  
  const bestScore = allPredictions?.reduce((max, p) => Math.max(max, p.points_earned || 0), 0) || 0;
  
  // Distribuição de pontos por categoria
  const pointsDistribution = {
    exact: allPredictions?.filter((p) => p.points_regular === 30).length || 0,
    category17: allPredictions?.filter((p) => p.points_regular === 17).length || 0,
    category15: allPredictions?.filter((p) => p.points_regular === 15).length || 0,
    category12: allPredictions?.filter((p) => p.points_regular === 12).length || 0,
    category9: allPredictions?.filter((p) => p.points_regular === 10).length || 0,
    category3: allPredictions?.filter((p) => p.points_regular === 3).length || 0,
    zero: allPredictions?.filter((p) => (p.points_regular ?? 0) === 0).length || 0,
  };

  // Formatar dados dos torneios
  const tournaments = await Promise.all(
    (allRankings || []).map(async (ranking) => {
      const tournament = Array.isArray(ranking.tournaments) 
        ? ranking.tournaments[0] 
        : ranking.tournaments;
      
      if (!tournament?.id) return null;

      // Verificar se há jogos finalizados neste torneio
      const { count: finishedMatchesCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id)
        .eq('status', 'FINISHED');

      // Determinar status:
      // - Se há jogos finalizados E active = false → "Encerrado"
      // - Se não há jogos finalizados e active = false → "Pendente"
      // - Se não há jogos finalizados e active = true → "Ativo"
      let tournamentStatus: 'active' | 'pending' | 'finished';
      if ((finishedMatchesCount || 0) > 0 && !tournament.active) {
        tournamentStatus = 'finished'; // Encerrado
      } else if (tournament.active) {
        tournamentStatus = 'active';
      } else {
        tournamentStatus = 'pending';
      }
      
      return {
        tournament_id: tournament.id,
        tournament_name: tournament.name,
        tournament_slug: tournament.slug,
        tournament_status: tournamentStatus,
        tournament_logo: tournament.logo_url,
        total_points: ranking.total_points || 0,
        exact_matches: ranking.exact_matches || 0,
        prize_money: Number(ranking.prize_money) || 0,
      };
    })
  );

  const validTournaments = tournaments.filter(t => t !== null) || [];

  // Buscar posição no ranking geral (por total de pontos)
  // Precisamos calcular o total de pontos de cada jogador, igual ao ranking geral
  let generalPosition = null;
  try {
    // Buscar todos os perfis
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id');

    if (allProfiles) {
      // Para cada perfil, calcular total de pontos
      const rankingsWithPoints: Array<{ id: string; total_points: number }> = [];
      
      for (const profile of allProfiles) {
        // Buscar todos os rankings deste usuário
        const { data: userRankings } = await supabase
          .from('tournament_rankings')
          .select('total_points')
          .eq('user_id', profile.id);

        const userTotalPoints = userRankings?.reduce((sum, r) => sum + (r.total_points || 0), 0) || 0;
        
        rankingsWithPoints.push({
          id: profile.id,
          total_points: userTotalPoints,
        });
      }

      // Ordenar por total de pontos (decrescente)
      rankingsWithPoints.sort((a, b) => b.total_points - a.total_points);

      // Encontrar a posição do usuário atual
      generalPosition = rankingsWithPoints.findIndex((r) => r.id === user.id) + 1 || null;
    }
  } catch (error) {
    // Em caso de erro, retornar null
    generalPosition = null;
  }

  return {
    profile: {
      ...profile,
      total_points: totalPoints,
      exact_matches: totalExactMatches,
      total_money: totalMoney,
      total_predictions: totalPredictions,
      correct_predictions: correctPredictions,
      general_ranking_position: generalPosition,
      tournaments: validTournaments,
      // Estatísticas adicionais
      exact_matches_percentage: exactMatchesPercentage,
      average_points: averagePoints,
      best_score: bestScore,
      points_distribution: pointsDistribution,
    },
    error: null,
  };
}

// Função para buscar perfil público de outro usuário
export async function getPublicProfile(userId: string) {
  const supabase = await createServerSupabaseClient();

  // Buscar perfil
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return { profile: null, error: 'Perfil não encontrado' };
  }

  // Buscar todos os rankings do usuário em todos os torneios
  const { data: allRankings } = await supabase
    .from('tournament_rankings')
    .select(`
      total_points,
      exact_matches,
      prize_money,
      tournament_id,
      tournaments:tournament_id (
        id,
        name,
        slug,
        active,
        logo_url
      )
    `)
    .eq('user_id', userId)
    .order('total_points', { ascending: false });

  // Calcular totais
  const totalPoints = allRankings?.reduce((sum, r) => sum + (r.total_points || 0), 0) || 0;
  const totalExactMatches = allRankings?.reduce((sum, r) => sum + (r.exact_matches || 0), 0) || 0;
  const totalMoney = (profile as any).total_money || 0;

  // Buscar total de palpites em todos os torneios
  const { data: allPredictions } = await supabase
    .from('predictions')
    .select('points_earned, points_regular')
    .eq('user_id', userId);

  const totalPredictions = allPredictions?.length || 0;
  const correctPredictions = allPredictions?.filter((p) => p.points_earned > 0).length || 0;
  
  // Calcular estatísticas adicionais
  const exactMatchesCount = allPredictions?.filter((p) => p.points_regular === 30).length || 0;
  const exactMatchesPercentage = totalPredictions > 0 
    ? Math.round((exactMatchesCount / totalPredictions) * 100 * 10) / 10 
    : 0;
  
  const averagePoints = totalPredictions > 0
    ? Math.round((totalPoints / totalPredictions) * 10) / 10
    : 0;
  
  const bestScore = allPredictions?.reduce((max, p) => Math.max(max, p.points_earned || 0), 0) || 0;
  
  // Distribuição de pontos por categoria
  const pointsDistribution = {
    exact: allPredictions?.filter((p) => p.points_regular === 30).length || 0,
    category17: allPredictions?.filter((p) => p.points_regular === 17).length || 0,
    category15: allPredictions?.filter((p) => p.points_regular === 15).length || 0,
    category12: allPredictions?.filter((p) => p.points_regular === 12).length || 0,
    category9: allPredictions?.filter((p) => p.points_regular === 10).length || 0,
    category3: allPredictions?.filter((p) => p.points_regular === 3).length || 0,
    zero: allPredictions?.filter((p) => (p.points_regular ?? 0) === 0).length || 0,
  };

  // Formatar dados dos torneios
  const tournaments = await Promise.all(
    (allRankings || []).map(async (ranking) => {
      const tournament = Array.isArray(ranking.tournaments) 
        ? ranking.tournaments[0] 
        : ranking.tournaments;
      
      if (!tournament?.id) return null;

      // Verificar se há jogos finalizados neste torneio
      const { count: finishedMatchesCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id)
        .eq('status', 'FINISHED');

      let tournamentStatus: 'active' | 'pending' | 'finished';
      if ((finishedMatchesCount || 0) > 0 && !tournament.active) {
        tournamentStatus = 'finished';
      } else if (tournament.active) {
        tournamentStatus = 'active';
      } else {
        tournamentStatus = 'pending';
      }
      
      return {
        tournament_id: tournament.id,
        tournament_name: tournament.name,
        tournament_slug: tournament.slug,
        tournament_status: tournamentStatus,
        tournament_logo: tournament.logo_url,
        total_points: ranking.total_points || 0,
        exact_matches: ranking.exact_matches || 0,
        prize_money: Number(ranking.prize_money) || 0,
      };
    })
  );

  const validTournaments = tournaments.filter(t => t !== null) || [];

  // Buscar posição no ranking geral
  let generalPosition = null;
  try {
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id');

    if (allProfiles) {
      const rankingsWithPoints: Array<{ id: string; total_points: number }> = [];
      
      for (const p of allProfiles) {
        const { data: userRankings } = await supabase
          .from('tournament_rankings')
          .select('total_points')
          .eq('user_id', p.id);

        const userTotalPoints = userRankings?.reduce((sum, r) => sum + (r.total_points || 0), 0) || 0;
        
        rankingsWithPoints.push({
          id: p.id,
          total_points: userTotalPoints,
        });
      }

      rankingsWithPoints.sort((a, b) => b.total_points - a.total_points);
      generalPosition = rankingsWithPoints.findIndex((r) => r.id === userId) + 1 || null;
    }
  } catch (error) {
    generalPosition = null;
  }

  return {
    profile: {
      ...profile,
      total_points: totalPoints,
      exact_matches: totalExactMatches,
      total_money: totalMoney,
      total_predictions: totalPredictions,
      correct_predictions: correctPredictions,
      general_ranking_position: generalPosition,
      tournaments: validTournaments,
      exact_matches_percentage: exactMatchesPercentage,
      average_points: averagePoints,
      best_score: bestScore,
      points_distribution: pointsDistribution,
    },
    error: null,
  };
}

