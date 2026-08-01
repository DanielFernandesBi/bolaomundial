import { getRanking, getRecentFormRanking } from './actions';
import { RankingContent } from './ranking-content';
import { createServerSupabaseClient } from '@/lib/supabase';
import { loadGeneralRanking } from '@/app/ranking-geral/load';
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
  const { profiles: generalProfiles } = await loadGeneralRanking(supabase);

  const { data: tournament } = await supabase
    .from('tournaments')
    // Duas colunas decidem a aba "Projeção", e cada uma liga um motor
    // diferente: has_simulator é o de seleções (ranking FIFA, grupos, disputa
    // de 3º) e has_club_projection é o de clubes (prior Opta, ida e volta, três
    // competições). Sem elas a aba aparecia em qualquer torneio.
    .select('id, name, slug, has_simulator, has_club_projection')
    .eq('slug', tournamentSlug)
    .single();

  if (!tournament) {
    notFound();
  }

  const [
    { profiles, error },
    { matches: recentMatches, entries: recentEntries },
    { data: { user } },
  ] = await Promise.all([
    getRanking(tournamentSlug),
    getRecentFormRanking(tournamentSlug),
    supabase.auth.getUser(),
  ]);

  const currentUserId = user?.id;

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 pb-28 md:pb-8">
          <div className="text-destructive">Erro ao carregar ranking: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="container mx-auto px-4 py-8 pb-28 md:pb-8 max-w-full">
        {/* Cabeçalho */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Ranking</h1>
          <p className="text-muted-foreground">Classificação do {tournament.name}</p>
        </div>

        {/* Conteúdo com Abas */}
        <RankingContent
          profiles={profiles}
          generalProfiles={generalProfiles}
          currentUserId={currentUserId}
          tournamentName={tournament.name}
          tournamentSlug={tournamentSlug}
          hasSimulator={!!(tournament as any).has_simulator}
          hasClubProjection={!!(tournament as any).has_club_projection}
          recentMatches={recentMatches}
          recentEntries={recentEntries}
        />
      </div>
    </div>
  );
}

