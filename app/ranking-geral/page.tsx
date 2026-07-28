import { createServerSupabaseClient } from '@/lib/supabase';
import { RankingGeralContent } from './ranking-geral-content';

interface GeneralRankingProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  total_money: number;
  total_points: number;
  total_exact_matches: number;
}

export default async function RankingGeralPage() {
  const supabase = await createServerSupabaseClient();

  // Buscar todos os perfis (com total_money se existir)
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, total_money')
    .limit(1000); // Limite para evitar problemas de performance

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="container mx-auto px-4 py-8">
          <div className="text-red-500">Erro ao carregar ranking: {error.message}</div>
        </div>
      </div>
    );
  }

  // Para cada perfil, calcular total de pontos e cravadas de todos os torneios
  const rankingsWithStats: GeneralRankingProfile[] = [];

  if (profiles) {
    for (const profile of profiles) {
      // Buscar todos os rankings deste usuário
      const { data: userRankings } = await supabase
        .from('tournament_rankings')
        .select('total_points, exact_matches')
        .eq('user_id', profile.id);

      const totalPoints = userRankings?.reduce((sum, r) => sum + (r.total_points || 0), 0) || 0;
      const totalExactMatches = userRankings?.reduce((sum, r) => sum + (r.exact_matches || 0), 0) || 0;

      rankingsWithStats.push({
        id: profile.id,
        username: profile.username,
        avatar_url: profile.avatar_url,
        total_money: Number((profile as any).total_money) || 0,
        total_points: totalPoints,
        total_exact_matches: totalExactMatches,
      });
    }
  }

  // Ordenar por total de pontos (decrescente)
  rankingsWithStats.sort((a, b) => b.total_points - a.total_points);

  // Buscar usuário atual
  const {
    data: { user },
  } = await supabase.auth.getUser();
  
  const currentUserId = user?.id;

  return (
    <div className="min-h-screen bg-slate-950 overflow-x-hidden">
      <div className="container mx-auto px-4 py-12 max-w-full">
        <RankingGeralContent profiles={rankingsWithStats} currentUserId={currentUserId} />
      </div>
    </div>
  );
}

