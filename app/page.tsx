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
      let statusColor = 'text-green-400';
      let borderColor = 'border-green-500/30';
      let badgeBg = 'bg-green-500/20';
      let badgeText = 'text-green-400';

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
          statusColor = 'text-slate-400';
          borderColor = 'border-slate-700';
          badgeBg = 'bg-slate-600/20';
          badgeText = 'text-slate-400';
        } else {
          // Torneio pendente
          status = 'pending';
          statusText = 'Torneio ainda não disponível';
          statusColor = 'text-orange-400';
          borderColor = 'border-orange-500/30';
          badgeBg = 'bg-orange-500/20';
          badgeText = 'text-orange-400';
        }
      } else {
        // Torneio ativo
        statusColor = 'text-green-400';
        borderColor = 'border-green-500/30';
        badgeBg = 'bg-green-500/20';
        badgeText = 'text-green-400';
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
    <div className="min-h-screen bg-slate-950 overflow-x-hidden">
      <div className="container mx-auto px-4 py-12 max-w-full">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-white mb-4 bg-gradient-to-r from-amber-500 to-amber-600 bg-clip-text text-transparent">
            Arena de Bolões
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Jogue, palpite e conquiste o topo do ranking em múltiplos torneios
          </p>
        </div>

        {/* Torneios */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8">
            <Calendar className="w-8 h-8 text-amber-500" />
            <h2 className="text-3xl font-bold text-white">Torneios</h2>
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
                    <Card className={`bg-gradient-to-br from-slate-900 to-slate-800 border-2 ${tournament.borderColor} ${isFinished ? 'opacity-90 hover:border-slate-400 hover:scale-105 transition-all cursor-pointer' : 'opacity-70 cursor-not-allowed'} h-full relative`}>
                      <CardContent className="p-8 flex flex-col items-center text-center">
                        {tournament.logo_url ? (
                          <img
                            src={tournament.logo_url}
                            alt={tournament.name}
                            className={`w-24 h-24 mb-4 rounded-full object-cover ${isFinished ? '' : 'opacity-80'}`}
                          />
                        ) : (
                          <div className={`w-24 h-24 mb-4 rounded-full ${isPending ? 'bg-orange-500/20' : 'bg-slate-700/20'} flex items-center justify-center border-2 ${isPending ? 'border-orange-500/50' : 'border-slate-600/50'}`}>
                            <span className={`text-3xl font-bold ${isPending ? 'text-orange-500' : 'text-slate-500'}`}>
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
                        <div className="mt-auto pt-4 border-t border-slate-700 w-full">
                          {isFinished ? (
                            <div className="flex items-center justify-center gap-2 text-amber-400">
                              <Award className="w-5 h-5" />
                              <span className="text-sm font-medium bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full">
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
                    <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-green-500/30 hover:border-green-500 transition-all duration-300 hover:scale-105 cursor-pointer h-full">
                      <CardContent className="p-8 flex flex-col items-center text-center">
                        {tournament.logo_url ? (
                          <img
                            src={tournament.logo_url}
                            alt={tournament.name}
                            className="w-24 h-24 mb-4 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-24 h-24 mb-4 rounded-full bg-green-500/20 flex items-center justify-center border-2 border-green-500/50">
                            <span className="text-3xl font-bold text-green-500">
                              {initials}
                            </span>
                          </div>
                        )}
                        <h3 className="text-2xl font-bold text-white mb-2">
                          {tournament.name}
                        </h3>
                        <p className="text-slate-400 mb-4">
                          Clique para ver partidas e ranking
                        </p>
                        <div className="mt-auto pt-4 border-t border-slate-700 w-full">
                          <div className="flex items-center justify-center gap-2 text-green-400">
                            <Users className="w-5 h-5" />
                            <span className="text-sm font-medium bg-green-500/20 text-green-400 px-3 py-1 rounded-full">
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
            <div className="text-center py-12 bg-slate-900 rounded-lg border border-slate-800">
              <p className="text-slate-400 text-lg">
                Nenhum torneio disponível no momento.
              </p>
            </div>
          )}
        </section>

        {/* Link para Hall da Fama */}
        <section>
          <Link href="/hall-of-fame">
            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-2 border-amber-500/30 hover:border-amber-500 transition-all duration-300 hover:scale-105 cursor-pointer">
              <CardContent className="p-8">
                <div className="flex items-center justify-center gap-4">
                  <Trophy className="w-12 h-12 text-amber-500" />
                  <div className="text-center">
                    <h2 className="text-3xl font-bold text-white mb-2">
                      Hall da Fama
                    </h2>
                    <p className="text-slate-400">
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
