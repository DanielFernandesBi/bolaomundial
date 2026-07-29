import { redirect, notFound } from 'next/navigation';
import { checkAdminAccess, getAdminMatches, getAdminTournamentInfo, getAdminCompetitionResults, getAdminBracket } from './actions';
import { AdminMatchesTable } from './admin-matches-table';
import { AdminBracket } from './admin-bracket';
import { CreateMatchDialog } from './create-match-dialog';
import { CreateTournamentDialog } from './create-tournament-dialog';
import { EditTournamentDialog } from './edit-tournament-dialog';
import { PodiumEntry } from './podium-entry';
import { CompetitionResultsEntry } from './competition-results-entry';
import { PrizeEntry } from './prize-entry';
import { createServerSupabaseClient } from '@/lib/supabase';

interface AdminPageProps {
  params: Promise<{
    tournament: string;
  }>;
}

export default async function AdminPage({ params }: AdminPageProps) {
  const { tournament: tournamentSlug } = await params;
  
  // Verificar acesso de admin no servidor
  const { isAdmin, error } = await checkAdminAccess();

  if (!isAdmin) {
    redirect(`/${tournamentSlug}/matches`);
  }

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

  // Buscar jogos
  const { matches, error: fetchError } = await getAdminMatches(tournamentSlug);

  // Info do torneio (regime + times + pódio atual)
  const info = await getAdminTournamentInfo(tournamentSlug);
  // Pódio por competição (bolão unificado de clubes)
  const compResults = await getAdminCompetitionResults(tournamentSlug);
  const competitions = !compResults.error ? compResults.competitions : [];
  const hasCompetitions = competitions.length > 0;
  // Chaveamento (ties) para a seção de administração do bracket
  const bracket = await getAdminBracket(tournamentSlug);
  const bracketCompetitions = !bracket.error ? bracket.competitions : [];
  // Pódio antigo (Mundial): só quando NÃO é o bolão por competição
  const showPodium =
    !hasCompetitions && !info.error && (info.tournament.format === 'knockout' || info.tournament.format === 'mixed');

  if (fetchError) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="text-destructive">Erro ao carregar jogos: {fetchError}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="container mx-auto px-4 py-8 max-w-full">
        {/* Cabeçalho */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">
              Painel do Administrador - Resultados
            </h1>
            <p className="text-muted-foreground">
              Gerencie os resultados dos jogos do {tournament.name}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!info.error && (
              <EditTournamentDialog
                tournamentSlug={tournamentSlug}
                current={{
                  name: info.tournament.name,
                  logo_url: info.tournament.logo_url,
                  format: info.tournament.format,
                  active: info.tournament.active,
                }}
              />
            )}
            <CreateTournamentDialog />
            <CreateMatchDialog tournamentSlug={tournamentSlug} />
          </div>
        </div>

        {!info.error && (
          <PrizeEntry
            tournamentSlug={tournamentSlug}
            current={{
              first: Number(info.tournament.prize_first) || 0,
              second: Number(info.tournament.prize_second) || 0,
              third: Number(info.tournament.prize_third) || 0,
            }}
          />
        )}

        {bracketCompetitions.length > 0 && (
          <AdminBracket
            tournamentSlug={tournamentSlug}
            tournamentId={(bracket as any).tournamentId}
            competitions={bracketCompetitions as any}
          />
        )}

        {hasCompetitions && (
          <CompetitionResultsEntry tournamentSlug={tournamentSlug} competitions={competitions} />
        )}

        {showPodium && !info.error && (
          <PodiumEntry
            tournamentSlug={tournamentSlug}
            teams={info.teams}
            current={{
              champion_team: info.tournament.champion_team,
              champion_iso: info.tournament.champion_iso,
              runner_up_team: info.tournament.runner_up_team,
              runner_up_iso: info.tournament.runner_up_iso,
              third_place_team: info.tournament.third_place_team,
              third_place_iso: info.tournament.third_place_iso,
            }}
          />
        )}

        <AdminMatchesTable initialMatches={matches} tournamentSlug={tournamentSlug} />
      </div>
    </div>
  );
}

