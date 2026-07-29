import { Trophy, Medal, Award, Flame } from 'lucide-react';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { notFound } from 'next/navigation';

interface TournamentResult {
  tournament_id: number;
  tournament_name: string;
  tournament_slug: string;
  position: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  total_points: number;
  exact_matches: number;
  prize_money: number;
}

export default async function HallOfFamePage() {
  const supabase = await createServerSupabaseClient();

  // Buscar apenas torneios encerrados (active = false E possui jogos finalizados)
  // Primeiro, buscar todos os torneios com active = false
  const { data: inactiveTournaments } = await supabase
    .from('tournaments')
    .select('*')
    .eq('active', false)
    .order('created_at', { ascending: false });

  // Filtrar apenas os que têm jogos finalizados
  const finishedTournaments: any[] = [];
  
  if (inactiveTournaments) {
    for (const tournament of inactiveTournaments) {
      // Verificar se há jogos finalizados neste torneio
      const { count: finishedMatchesCount } = await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id)
        .eq('status', 'FINISHED');

      // Só incluir se tiver jogos finalizados (torneio encerrado)
      if ((finishedMatchesCount || 0) > 0) {
        finishedTournaments.push(tournament);
      }
    }
  }

  if (!finishedTournaments || finishedTournaments.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-12 pb-28 md:pb-12">
          <div className="text-center py-16">
            <Trophy className="w-24 h-24 text-[hsl(var(--faint))] mx-auto mb-4" />
            <h1 className="text-4xl font-bold text-foreground mb-4">Hall da Fama</h1>
            <p className="text-muted-foreground text-lg">
              Ainda não há torneios finalizados.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Buscar resultados de cada torneio (top 3 e lanterna)
  const tournamentsResults: Array<{
    tournament: any;
    top3: TournamentResult[];
    last: TournamentResult | null;
  }> = [];

  for (const tournament of finishedTournaments) {
    // Buscar top 3
    const { data: top3Rankings } = await supabase
      .from('tournament_rankings')
      .select(`
        user_id,
        total_points,
        exact_matches,
        prize_money,
        profiles:user_id (
          id,
          username,
          avatar_url
        )
      `)
      .eq('tournament_id', tournament.id)
      .order('total_points', { ascending: false })
      .order('exact_matches', { ascending: false })
      .limit(3);

    // Buscar lanterna (último lugar)
    const { data: allRankings } = await supabase
      .from('tournament_rankings')
      .select(`
        user_id,
        total_points,
        exact_matches,
        prize_money,
        profiles:user_id (
          id,
          username,
          avatar_url
        )
      `)
      .eq('tournament_id', tournament.id)
      .order('total_points', { ascending: true })
      .order('exact_matches', { ascending: true })
      .limit(1);

    const top3: TournamentResult[] = [];
    if (top3Rankings) {
      for (let i = 0; i < top3Rankings.length; i++) {
        const ranking = top3Rankings[i];
        const profile = Array.isArray(ranking.profiles) 
          ? ranking.profiles[0] 
          : ranking.profiles;
        
        if (profile) {
          top3.push({
            tournament_id: tournament.id,
            tournament_name: tournament.name,
            tournament_slug: tournament.slug,
            position: i + 1,
            user_id: ranking.user_id,
            username: profile.username,
            avatar_url: profile.avatar_url,
            total_points: ranking.total_points,
            exact_matches: ranking.exact_matches,
            prize_money: Number(ranking.prize_money) || 0,
          });
        }
      }
    }

    let last: TournamentResult | null = null;
    if (allRankings && allRankings.length > 0) {
      const lastRanking = allRankings[0];
      const lastProfile = Array.isArray(lastRanking.profiles) 
        ? lastRanking.profiles[0] 
        : lastRanking.profiles;
      
      if (lastProfile) {
        // Contar total de participantes para saber a posição do lanterna
        const { count } = await supabase
          .from('tournament_rankings')
          .select('*', { count: 'exact', head: true })
          .eq('tournament_id', tournament.id);

        last = {
          tournament_id: tournament.id,
          tournament_name: tournament.name,
          tournament_slug: tournament.slug,
          position: count || 0,
          user_id: lastRanking.user_id,
          username: lastProfile.username,
          avatar_url: lastProfile.avatar_url,
          total_points: lastRanking.total_points,
          exact_matches: lastRanking.exact_matches,
          prize_money: Number(lastRanking.prize_money) || 0,
        };
      }
    }

    tournamentsResults.push({
      tournament,
      top3,
      last,
    });
  }

  function formatMoney(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  function getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  function getPositionIcon(position: number) {
    switch (position) {
      case 1:
        return <Trophy className="w-6 h-6 text-primary" />;
      case 2:
        return <Medal className="w-6 h-6 text-muted-foreground" />;
      case 3:
        return <Award className="w-6 h-6 text-muted-foreground" />;
      default:
        return <Flame className="w-6 h-6 text-destructive" />;
    }
  }

  function getPositionColor(position: number) {
    switch (position) {
      case 1:
        return 'border-primary bg-primary/10';
      case 2:
        return 'border-border bg-surface-sunken';
      case 3:
        return 'border-border bg-surface-sunken';
      default:
        return 'border-dashed border-border bg-surface-sunken';
    }
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="container mx-auto px-4 py-12 pb-28 md:pb-12 max-w-full">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-4 mb-4">
            <Trophy className="w-16 h-16 text-primary" />
            <h1 className="text-6xl font-bold text-foreground text-primary">
              Hall da Fama
            </h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Os maiores campeões e os momentos históricos dos torneios finalizados
          </p>
        </div>

        {/* Torneios Finalizados */}
        <div className="space-y-16">
          {tournamentsResults.map(({ tournament, top3, last }) => (
            <section key={tournament.id}>
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-foreground mb-2">
                  {tournament.name}
                </h2>
                <p className="text-muted-foreground">Torneio Finalizado</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top 3 */}
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">
                    Top 3
                  </h3>
                  <div className="space-y-4">
                    {top3.map((result) => (
                      <Card
                        key={result.user_id}
                        className={`${getPositionColor(result.position)} border-2`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-card">
                              {getPositionIcon(result.position)}
                            </div>
                            <Avatar className="w-12 h-12 border-2 border-border">
                              <AvatarImage
                                src={result.avatar_url || undefined}
                              />
                              <AvatarFallback className="bg-muted text-foreground">
                                {getInitials(result.username)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <Link
                                href={`/profile/${result.user_id}`}
                                className="text-foreground font-semibold hover:text-primary transition-colors block"
                              >
                                {result.username}
                              </Link>
                              <div className="flex items-center gap-4 mt-1 text-sm">
                                <span className="text-muted-foreground">
                                  {result.total_points} pts
                                </span>
                                <span className="text-muted-foreground">
                                  {result.exact_matches} cravadas
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-primary font-bold text-lg">
                                {formatMoney(result.prize_money)}
                              </p>
                              <p className="text-[hsl(var(--faint))] text-xs">
                                {result.position}º lugar
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Lanterna */}
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">
                    Lanterna
                  </h3>
                  {last ? (
                    <Card className="border border-dashed border-border bg-surface-sunken">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-card">
                            <Flame className="w-6 h-6 text-destructive" />
                          </div>
                          <Avatar className="w-12 h-12 border border-border">
                            <AvatarImage
                              src={last.avatar_url || undefined}
                            />
                            <AvatarFallback className="bg-destructive/20 text-destructive">
                              {getInitials(last.username)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <Link
                              href={`/profile/${last.user_id}`}
                              className="text-foreground font-semibold hover:text-primary transition-colors block"
                            >
                              {last.username}
                            </Link>
                            <div className="flex items-center gap-4 mt-1 text-sm">
                              <span className="text-muted-foreground">
                                {last.total_points} pts
                              </span>
                              <span className="text-muted-foreground">
                                {last.exact_matches} cravadas
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-destructive font-bold text-lg">
                              {formatMoney(last.prize_money)}
                            </p>
                            <p className="text-[hsl(var(--faint))] text-xs">
                              {last.position}º lugar
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card className="border-2 border-border bg-card">
                      <CardContent className="p-4">
                        <p className="text-muted-foreground text-center">
                          Nenhum participante
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

