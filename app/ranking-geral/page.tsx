import { createServerSupabaseClient } from '@/lib/supabase';
import { RankingGeralContent } from './ranking-geral-content';
import { loadGeneralRanking } from './load';

export default async function RankingGeralPage() {
  const supabase = await createServerSupabaseClient();

  const { profiles: rankingsWithStats, error } = await loadGeneralRanking(supabase);

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 pb-28 md:pb-8">
          <div className="text-destructive">Erro ao carregar ranking: {error}</div>
        </div>
      </div>
    );
  }

  // Buscar usuário atual
  const {
    data: { user },
  } = await supabase.auth.getUser();
  
  const currentUserId = user?.id;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="container mx-auto px-4 py-12 pb-28 md:pb-12 max-w-full">
        <RankingGeralContent profiles={rankingsWithStats} currentUserId={currentUserId} />
      </div>
    </div>
  );
}

