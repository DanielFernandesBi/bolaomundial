import Link from 'next/link';
import { Calendar, Clock, Eye, Trophy } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MatchCard } from '@/components/match-card';
import { PodiumCard } from '@/components/podium-card';
import { PodiumTransparency } from '@/components/podium-transparency';
import { PendingTieCard } from '@/components/pending-tie-card';
import { AuditMatchCard } from './audit-match-card';
import { TournamentDeadlineBanner } from '@/components/tournament-deadline-banner';
import {
  getMatchesWithPredictions,
  getMatchesInProgressWithAllPredictions,
  getPodiumData,
  getPodiumTransparency,
  getPendingBracketTies,
} from './actions';
import { createServerSupabaseClient } from '@/lib/supabase';
import { COMPETITIONS } from '@/lib/competitions';
import { notFound } from 'next/navigation';

interface MatchesPageProps {
  params: Promise<{
    tournament: string;
  }>;
}

// Agrupa os jogos por competição (bolão unificado). Se nenhum jogo tem competição,
// retorna um único grupo sem cabeçalho (comportamento dos torneios antigos).
function groupByCompetition<T extends { competition?: string | null }>(items: T[]) {
  const hasComp = items.some((i) => i.competition);
  if (!hasComp) return [{ key: null as string | null, name: '', items }];

  const groups: { key: string | null; name: string; items: T[] }[] = [];
  for (const c of COMPETITIONS) {
    const gi = items.filter((i) => i.competition === c.key);
    if (gi.length) groups.push({ key: c.key, name: c.name, items: gi });
  }
  const known = new Set(COMPETITIONS.map((c) => c.key));
  const others = items.filter((i) => i.competition && !known.has(i.competition));
  if (others.length) groups.push({ key: 'outros', name: 'Outros', items: others });
  return groups;
}

export default async function MatchesPage({ params }: MatchesPageProps) {
  const { tournament: tournamentSlug } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, slug, prize_first, prize_second, prize_third')
    .eq('slug', tournamentSlug)
    .single();

  if (!tournament) {
    notFound();
  }

  const { matches, error, tournamentFormat } = await getMatchesWithPredictions(tournamentSlug);

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-red-500">Erro ao carregar jogos: {error}</div>
      </div>
    );
  }

  const now = new Date();
  // Jogos sem data ("a definir") entram nas próximas (palpite aberto, com alerta no card).
  const upcomingMatches = matches.filter((match: any) => {
    if (match.status !== 'SCHEDULED') return false;
    if (!match.match_date) return true;
    return new Date(match.match_date) > now;
  });

  const finishedMatches = matches.filter((match: any) => match.status === 'FINISHED');

  const missingPredictionsCount = matches.filter(
    (match: any) =>
      match.status !== 'FINISHED' &&
      (!match.match_date || new Date(match.match_date) > now) &&
      !match.user_prediction
  ).length;

  // Próximo jogo a fechar os palpites (ignora os "a definir"). upcomingMatches vem ordenado por data.
  const nextMatchDate =
    upcomingMatches.find((m: any) => m.match_date)?.match_date ?? null;

  // Transparência por partida (apostas encerradas, jogo ainda não finalizado)
  const { matches: inProgressMatches, error: auditError } = await getMatchesInProgressWithAllPredictions(tournamentSlug);

  // Pódio (só faz sentido em torneios de mata-mata)
  const showPodium = tournamentFormat === 'knockout' || tournamentFormat === 'mixed';
  const podium = showPodium ? await getPodiumData(tournamentSlug) : null;
  const podiumTransparency = showPodium ? await getPodiumTransparency(tournamentSlug) : null;
  const podiumCompetitions = podium && !podium.error ? podium.competitions : [];

  // Confrontos de oitavas ainda sem os dois participantes (playoffs pendentes)
  const { competitions: pendingBracket } = await getPendingBracketTies(tournamentSlug);

  return (
    <div className="min-h-screen bg-slate-950 overflow-x-hidden">
      <div className="container mx-auto px-4 py-8 max-w-full">
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-white mb-2">Partidas</h1>
          <p className="text-slate-400">Faça seus palpites para as partidas do {tournament.name}</p>
        </div>

        {/* Prêmio em disputa */}
        {(() => {
          const pot =
            (Number(tournament.prize_first) || 0) +
            (Number(tournament.prize_second) || 0) +
            (Number(tournament.prize_third) || 0);
          if (pot <= 0) return null;
          const fmt = (v: number) =>
            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
          return (
            <div className="mb-6 rounded-xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/15 to-amber-600/5 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Trophy className="w-8 h-8 text-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-amber-400 text-xs font-semibold uppercase tracking-wide">Prêmio em disputa</p>
                  <p className="text-white text-2xl sm:text-3xl font-bold">{fmt(pot)}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-300">
                <span>🏆 {fmt(Number(tournament.prize_first) || 0)}</span>
                <span>🥈 {fmt(Number(tournament.prize_second) || 0)}</span>
                <span>🥉 {fmt(Number(tournament.prize_third) || 0)}</span>
              </div>
            </div>
          );
        })()}

        <TournamentDeadlineBanner
          nextMatchDate={nextMatchDate}
          missingPredictionsCount={missingPredictionsCount}
        />

        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="bg-slate-900 w-full flex-wrap h-auto">
            <TabsTrigger value="upcoming" className="flex items-center gap-1.5 text-xs sm:text-sm flex-1 min-w-0">
              <Calendar className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="truncate">Próximas</span>
              <span className="hidden sm:inline">({upcomingMatches.length})</span>
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-1.5 text-xs sm:text-sm flex-1 min-w-0">
              <Eye className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="truncate">Transparência</span>
              <span className="hidden sm:inline">({inProgressMatches.length})</span>
            </TabsTrigger>
            <TabsTrigger value="finished" className="flex items-center gap-1.5 text-xs sm:text-sm flex-1 min-w-0">
              <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="truncate">Encerradas</span>
              <span className="hidden sm:inline">({finishedMatches.length})</span>
            </TabsTrigger>
            {showPodium && (
              <TabsTrigger value="podium-audit" className="flex items-center gap-1.5 text-xs sm:text-sm flex-1 min-w-0">
                <Trophy className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="truncate">Pódio</span>
              </TabsTrigger>
            )}
          </TabsList>

          {/* Próximas */}
          <TabsContent value="upcoming" className="mt-6">
            {showPodium && podiumCompetitions.length > 0 && (
              <div className="mb-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {podiumCompetitions.map((c) => (
                  <PodiumCard
                    key={c.key}
                    tournamentSlug={tournamentSlug}
                    competitionKey={c.key}
                    competitionName={c.name}
                    mode={c.mode}
                    teams={c.teams}
                    locked={c.locked}
                    pending={c.pending}
                    userPick={c.userPick}
                  />
                ))}
              </div>
            )}

            {pendingBracket.length > 0 &&
              pendingBracket.map((comp: any) => (
                <section key={`pending-${comp.key}`} className="mb-8">
                  <h2 className="text-xl font-bold text-white mb-1">{comp.name}</h2>
                  <p className="text-slate-500 text-sm mb-4">Confrontos aguardando os classificados dos playoffs</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {comp.ties.map((t: any) => (
                      <PendingTieCard key={t.id} sideA={t.sideA} sideB={t.sideB} />
                    ))}
                  </div>
                </section>
              ))}

            {upcomingMatches.length === 0 && pendingBracket.length === 0 ? (
              <div className="text-slate-400 text-center py-12">Nenhuma partida próxima no momento.</div>
            ) : (
              groupByCompetition(upcomingMatches).map((g) => (
                <section key={g.key ?? 'all'} className="mb-8">
                  {g.key && <h2 className="text-xl font-bold text-white mb-4">{g.name}</h2>}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {g.items.map((match: any) => (
                      <MatchCard key={match.id} match={match} group={match.phase ?? 'Fase de Grupos'} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </TabsContent>

          {/* Transparência */}
          <TabsContent value="audit" className="mt-6">
            {auditError ? (
              <div className="text-red-500 text-center py-12">Erro ao carregar partidas: {auditError}</div>
            ) : inProgressMatches.length === 0 ? (
              <div className="text-slate-400 text-center py-12">
                <Eye className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">Nenhuma partida com apostas encerradas no momento.</p>
                <p className="text-sm">
                  Assim que uma partida começa, as apostas dela são encerradas e os palpites de todos aparecem aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <Eye className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="text-amber-500 font-semibold mb-1">Transparência — Apostas Encerradas</h3>
                      <p className="text-slate-300 text-sm">
                        Palpites de todos os participantes nas partidas cujas apostas já fecharam (a partir do
                        horário de início de cada jogo). Garante que nenhum palpite foi alterado depois do início.
                      </p>
                    </div>
                  </div>
                </div>
                {groupByCompetition(inProgressMatches).map((g) => (
                  <section key={g.key ?? 'all'} className="space-y-4">
                    {g.key && <h2 className="text-xl font-bold text-white">{g.name}</h2>}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {g.items.map((match: any) => (
                        <AuditMatchCard key={match.id} match={match} tournamentSlug={tournamentSlug} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Encerradas */}
          <TabsContent value="finished" className="mt-6">
            {finishedMatches.length === 0 ? (
              <div className="text-slate-400 text-center py-12">Nenhuma partida encerrada ainda.</div>
            ) : (
              groupByCompetition(finishedMatches).map((g) => (
                <section key={g.key ?? 'all'} className="mb-8">
                  {g.key && <h2 className="text-xl font-bold text-white mb-4">{g.name}</h2>}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {g.items.map((match: any) => (
                      <Link
                        key={match.id}
                        href={`/${tournamentSlug}/matches/${match.id}`}
                        className="block transition-transform hover:scale-[1.01]"
                      >
                        <MatchCard match={match} group={match.phase ?? 'Fase de Grupos'} />
                      </Link>
                    ))}
                  </div>
                </section>
              ))
            )}
          </TabsContent>

          {/* Transparência do Pódio (só mata-mata) */}
          {showPodium && (
            <TabsContent value="podium-audit" className="mt-6">
              {!podiumTransparency || podiumTransparency.error ? (
                <div className="text-red-500 text-center py-12">
                  Erro ao carregar palpites de pódio{podiumTransparency?.error ? `: ${podiumTransparency.error}` : ''}
                </div>
              ) : !podiumTransparency.started ? (
                <div className="text-slate-400 text-center py-12">
                  <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">A transparência do pódio aparece quando cada competição começar.</p>
                  <p className="text-sm">
                    Os palpites de campeão e vice de todos ficarão visíveis a partir do primeiro jogo de cada competição.
                  </p>
                </div>
              ) : (
                <PodiumTransparency tournamentSlug={tournamentSlug} competitions={podiumTransparency.competitions} />
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
