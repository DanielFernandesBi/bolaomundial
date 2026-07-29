import { Trophy, Calendar, Users, Lock, Award, ChevronRight } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

interface Tournament {
  id: number;
  name: string;
  slug: string;
  active: boolean;
  logo_url: string | null;
  status?: 'active' | 'pending' | 'finished';
  statusText?: string;
  statusColor?: string;
  borderColor?: string;
  badgeBg?: string;
  badgeText?: string;
}


export default async function HomePage() {
  const supabase = await createServerSupabaseClient();

  // Buscar todos os torneios (ativos e inativos) para exibir na seção principal
  const { data: allTournaments } = await supabase
    .from('tournaments')
    .select('*')
    .order('active', { ascending: false }) // Ativos primeiro
    .order('created_at', { ascending: false });

  // Para cada torneio, determinar se é pendente ou encerrado
  const tournamentsWithStatus = await Promise.all(
    (allTournaments || []).map(async (tournament) => {
      let status: 'active' | 'pending' | 'finished' = 'active';
      let statusText = 'Torneio Ativo';
      let statusColor = 'text-state-open';
      let borderColor = 'border-state-open/30';
      let badgeBg = 'bg-state-open/20';
      let badgeText = 'text-state-open';

      if (!tournament.active) {
        // Verificar se há jogos finalizados neste torneio
        const { count: finishedMatchesCount } = await supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .eq('tournament_id', tournament.id)
          .eq('status', 'FINISHED');

        if ((finishedMatchesCount || 0) > 0) {
          // Torneio encerrado
          status = 'finished';
          statusText = 'Torneio encerrado';
          statusColor = 'text-muted-foreground';
          borderColor = 'border-border';
          badgeBg = 'bg-slate-600/20';
          badgeText = 'text-muted-foreground';
        } else {
          // Torneio pendente
          status = 'pending';
          statusText = 'Torneio ainda não disponível';
          statusColor = 'text-state-missing';
          borderColor = 'border-state-missing/30';
          badgeBg = 'bg-state-missing/20';
          badgeText = 'text-state-missing';
        }
      } else {
        // Torneio ativo
        statusColor = 'text-state-open';
        borderColor = 'border-state-open/30';
        badgeBg = 'bg-state-open/20';
        badgeText = 'text-state-open';
      }

      return {
        ...tournament,
        status,
        statusText,
        statusColor,
        borderColor,
        badgeBg,
        badgeText,
      };
    })
  );


  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="container mx-auto px-4 py-12 pb-28 md:pb-12 max-w-full">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-foreground mb-4 text-primary">
            Arena de Bolões
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Jogue, palpite e conquiste o topo do ranking em múltiplos torneios
          </p>
        </div>

        {/* Torneios */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <Calendar className="w-8 h-8 text-primary" />
            <h2 className="text-3xl font-bold text-foreground">Torneios</h2>
          </div>

          {tournamentsWithStatus && tournamentsWithStatus.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tournamentsWithStatus.map((tournament) => {
                const initials = tournament.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);

                const isActive = tournament.active;
                const isFinished = tournament.status === 'finished';
                const isPending = tournament.status === 'pending';

                // Inativo: encerrado (clicável -> ranking) ou pendente (bloqueado)
                if (!isActive) {
                  const cardInner = (
                    <Card className={`bg-card border-2 ${tournament.borderColor} ${isFinished ? 'opacity-90 hover:border-slate-400 hover:scale-105 transition-all cursor-pointer' : 'opacity-70 cursor-not-allowed'} h-full relative`}>
                      <CardContent className="p-8 flex flex-col items-center text-center">
                        {tournament.logo_url ? (
                          <img
                            src={tournament.logo_url}
                            alt={tournament.name}
                            className={`w-24 h-24 mb-4 rounded-full object-cover ${isFinished ? '' : 'opacity-80'}`}
                          />
                        ) : (
                          <div className={`w-24 h-24 mb-4 rounded-full ${isPending ? 'bg-state-missing/20' : 'bg-muted/20'} flex items-center justify-center border-2 ${isPending ? 'border-state-missing/50' : 'border-border/50'}`}>
                            <span className={`text-3xl font-bold ${isPending ? 'text-state-missing' : 'text-[hsl(var(--faint))]'}`}>
                              {initials}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mb-2">
                          {isFinished ? (
                            <Trophy className={`w-5 h-5 ${tournament.statusColor}`} />
                          ) : (
                            <Lock className={`w-5 h-5 ${tournament.statusColor}`} />
                          )}
                          <h3 className={`text-2xl font-bold ${tournament.statusColor}`}>
                            {tournament.name}
                          </h3>
                        </div>
                        <p className={`${tournament.statusColor} mb-4 text-sm`}>
                          {tournament.statusText}
                        </p>
                        <div className="mt-auto pt-4 border-t border-border w-full">
                          {isFinished ? (
                            <div className="flex items-center justify-center gap-2 text-primary">
                              <Award className="w-5 h-5" />
                              <span className="text-sm font-medium bg-primary/20 text-primary px-3 py-1 rounded-full">
                                Encerrado · Ver ranking
                              </span>
                              <ChevronRight className="w-4 h-4" />
                            </div>
                          ) : (
                            <div className={`flex items-center justify-center gap-2 ${tournament.statusColor}`}>
                              <Lock className="w-5 h-5" />
                              <span className={`text-sm font-medium ${tournament.badgeBg} ${tournament.badgeText} px-3 py-1 rounded-full`}>
                                Bloqueado
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );

                  if (isFinished) {
                    return (
                      <Link key={tournament.id} href={`/${tournament.slug}/ranking`} className="block">
                        {cardInner}
                      </Link>
                    );
                  }
                  return (
                    <div key={tournament.id} className="block">
                      {cardInner}
                    </div>
                  );
                }

                // Se for ativo, renderizar com link normalmente
                return (
                  <Link
                    key={tournament.id}
                    href={`/${tournament.slug}/matches`}
                    className="block"
                  >
                    <Card className="bg-card border-2 border-state-open/30 hover:border-green-500 transition-all duration-300 hover:scale-105 cursor-pointer h-full">
                      <CardContent className="p-8 flex flex-col items-center text-center">
                        {tournament.logo_url ? (
                          <img
                            src={tournament.logo_url}
                            alt={tournament.name}
                            className="w-24 h-24 mb-4 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-24 h-24 mb-4 rounded-full bg-state-open/20 flex items-center justify-center border-2 border-state-open/50">
                            <span className="text-3xl font-bold text-state-open">
                              {initials}
                            </span>
                          </div>
                        )}
                        <h3 className="text-2xl font-bold text-foreground mb-2">
                          {tournament.name}
                        </h3>
                        <p className="text-muted-foreground mb-4">
                          Clique para ver partidas e ranking
                        </p>
                        <div className="mt-auto pt-4 border-t border-border w-full">
                          <div className="flex items-center justify-center gap-2 text-state-open">
                            <Users className="w-5 h-5" />
                            <span className="text-sm font-medium bg-state-open/20 text-state-open px-3 py-1 rounded-full">
                              Torneio Ativo
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 bg-card rounded-lg border border-border">
              <p className="text-muted-foreground text-lg">
                Nenhum torneio disponível no momento.
              </p>
            </div>
          )}
        </section>

        {/* Link para Hall da Fama */}
        <section>
          <Link href="/hall-of-fame">
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-primary/30 hover:border-primary transition-all duration-300 hover:scale-105 cursor-pointer">
              <CardContent className="p-8">
                <div className="flex items-center justify-center gap-4">
                  <Trophy className="w-12 h-12 text-primary" />
                  <div className="text-center">
                    <h2 className="text-3xl font-bold text-foreground mb-2">
                      Hall da Fama
                    </h2>
                    <p className="text-muted-foreground">
                      Veja os campeões e destaques dos torneios finalizados
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </section>
      </div>
    </div>
  );
}
