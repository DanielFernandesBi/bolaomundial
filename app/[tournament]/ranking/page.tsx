import { getRanking, getDailyRanking } from './actions';
import { RankingContent } from './ranking-content';
import { createServerSupabaseClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';

interface RankingPageProps {
  params: Promise<{
    tournament: string;
  }>;
}

export default async function RankingPage({ params }: RankingPageProps) {
  const { tournament: tournamentSlug } = await params;
  
  // Verificar se o torneio existe
  const supabase = await createServerSupabaseClient();
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, slug')
    .eq('slug', tournamentSlug)
    .single();

  if (!tournament) {
    notFound();
  }

  const [
    { profiles, error },
    { entries: dailyEntries, hasMatchesToday, matchDayLabel },
    { data: { user } },
  ] = await Promise.all([
    getRanking(tournamentSlug),
    getDailyRanking(tournamentSlug),
    supabase.auth.getUser(),
  ]);

  const currentUserId = user?.id;

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="container mx-auto px-4 py-8">
          <div className="text-red-500">Erro ao carregar ranking: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 overflow-x-hidden">
      <div className="container mx-auto px-4 py-8 max-w-full">
        {/* Cabeçalho */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Ranking</h1>
          <p className="text-slate-400">Classificação do {tournament.name}</p>
        </div>

        {/* Conteúdo com Abas */}
        <RankingContent
          profiles={profiles}
          currentUserId={currentUserId}
          tournamentName={tournament.name}
          tournamentSlug={tournamentSlug}
          dailyEntries={dailyEntries}
          hasMatchesToday={hasMatchesToday}
          todayLabel={matchDayLabel}
        />
      </div>
    </div>
  );
}

