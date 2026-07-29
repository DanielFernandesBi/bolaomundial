import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Carregamento do Ranking Geral (soma de todos os torneios)
// ============================================================================
// Extraído de app/ranking-geral/page.tsx para poder ser reaproveitado também
// pela tela de ranking do torneio, onde o escopo "Todos os bolões" passa a
// renderizar na própria página em vez de navegar.
//
// A lógica é a MESMA de antes, movida sem alteração: mesmos campos, mesma soma
// e mesma ordenação por pontos. Continua um laço N+1 (uma consulta por
// usuário) — não otimizei aqui de propósito, para a mudança ser só de lugar.
// ============================================================================

export interface GeneralRankingProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  total_money: number;
  total_points: number;
  total_exact_matches: number;
}

export async function loadGeneralRanking(
  supabase: SupabaseClient<any, any, any>
): Promise<{ profiles: GeneralRankingProfile[]; error: string | null }> {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, total_money')
    .limit(1000);

  if (error) {
    return { profiles: [], error: error.message };
  }

  const rankingsWithStats: GeneralRankingProfile[] = [];

  if (profiles) {
    for (const profile of profiles as any[]) {
      const { data: userRankings } = await supabase
        .from('tournament_rankings')
        .select('total_points, exact_matches')
        .eq('user_id', profile.id);

      const totalPoints = (userRankings as any[])?.reduce((sum, r) => sum + (r.total_points || 0), 0) || 0;
      const totalExactMatches = (userRankings as any[])?.reduce((sum, r) => sum + (r.exact_matches || 0), 0) || 0;

      rankingsWithStats.push({
        id: profile.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        total_money: Number(profile.total_money) || 0,
        total_points: totalPoints,
        total_exact_matches: totalExactMatches,
      });
    }
  }

  rankingsWithStats.sort((a, b) => b.total_points - a.total_points);

  return { profiles: rankingsWithStats, error: null };
}
