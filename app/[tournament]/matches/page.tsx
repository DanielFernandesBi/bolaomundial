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
  CompetitionFilterProvider,
  CompetitionFilterBar,
  CompetitionSection,
} from '@/components/competition-filter';
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
  const known = new Set<string>(COMPETITIONS.map((c) => c.key));
  const others = items.filter((i) => i.competition && !known.has(i.competition));
  if (others.length) groups.push({ key: 'outros', name: 'Outros', items: others });
  return groups;
}

// Ordena os grupos pela data do jogo mais próximo de cada competição, em vez da
// ordem fixa de COMPETITIONS. É o que resolve o incômodo real da aba "Próximas":
// a Copa do Brasil podia jogar antes e ainda assim aparecer por último, porque a
// ordem era a da constante, não a do calendário. Grupos só com jogos "a definir"
// (sem data) vão para o fim. Só compara timestamps — nada de formatar data no
// servidor, que traria divergência de fuso com o horário exibido no card.
function sortGroupsByNextMatch<T extends { items: any[] }>(groups: T[]): T[] {
  const primeiraData = (g: T) => {
    const datas = g.items
      .map((m) => (m.match_date ? new Date(m.match_date).getTime() : null))
      .filter((t): t is number => t !== null);
    return datas.length ? Math.min(...datas) : Number.POSITIVE_INFINITY;
  };
  return [...groups].sort((a, b) => primeiraData(a) - primeiraData(b));
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
      <div className="container mx-auto px-4 py-8 pb-28 md:pb-8">
        <div className="text-destructive">Erro ao carregar jogos: {error}</div>
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

  // Predicado ÚNICO do "falta palpitar". Extraído de propósito: o total e o
  // detalhamento por competição têm de sair do mesmo critério, senão um dia as
  // duas contas divergem e a etiqueta passa a mentir.
  //
  // Usa lock_at, não match_date: o que conta é se o jogador AINDA PODE palpitar.
  // Depois que a FASE fecha, o jogo sem palpite virou prejuízo consumado —
  // continuar contando ele como pendência mandaria o jogador a uma tela onde não
  // há nada a fazer.
  const semPalpite = (match: any) =>
    match.status !== 'FINISHED' &&
    (!match.lock_at || new Date(match.lock_at) > now) &&
    !match.user_prediction;

  // Declarado ANTES de tudo que o consome — arrays de dependência e expressões
  // são avaliados na ordem do arquivo.
  const temCompeticoesLista = matches.some((m: any) => m.competition);

  const missingMatches = matches.filter(semPalpite);
  const missingPredictionsCount = missingMatches.length;

  // Próximo PRAZO a vencer — não o próximo jogo. Com a trava por fase, o que o
  // jogador precisa saber é quando fecha a próxima fase, que pode ser bem antes
  // do próximo jogo dela e bem depois de outro jogo já em andamento.
  const prazosFuturos = matches
    .map((m: any) => m.lock_at as string | null)
    .filter((d: string | null): d is string => !!d && new Date(d) > now)
    .sort();
  const nextMatchDate = prazosFuturos[0] ?? null;

  // Prazo VIGENTE de cada competição, para o banner. É o próximo prazo ainda por
  // vencer — não o primeiro da lista: quando as oitavas fecharem e as quartas
  // ganharem data, o que interessa é o prazo das quartas.
  const prazoPorCompeticao = temCompeticoesLista
    ? COMPETITIONS.filter((c) => matches.some((m: any) => m.competition === c.key)).map((c) => {
        const locks = matches
          .filter((m: any) => m.competition === c.key && m.lock_at)
          .map((m: any) => m.lock_at as string);
        const futuros = locks.filter((d) => new Date(d) > now).sort();
        const passados = locks.sort();
        return {
          key: c.key,
          short: c.short,
          lockAt: (futuros[0] ?? passados[passados.length - 1] ?? null) as string | null,
        };
      })
    : [];

  // Filtro por competição: só existe no bolão unificado, onde as três dividem a
  // mesma tela. Em torneio de competição única nada disso é renderizado.
  const temCompeticoes = temCompeticoesLista;
  const chipsDe = (lista: any[]) =>
    COMPETITIONS.filter((c) => matches.some((m: any) => m.competition === c.key)).map((c) => ({
      key: c.key,
      short: c.short,
      count: lista.filter((m: any) => m.competition === c.key).length,
    }));

  // "36 sem palpite" não dizia DE QUAL competição. Reaproveita o mesmo chipsDe,
  // agora sobre os jogos que faltam palpitar. Vazio em torneio de competição
  // única — ali a etiqueta única já basta e nada muda.
  const missingByCompetition = temCompeticoes ? chipsDe(missingMatches) : [];

  // Transparência por partida (apostas encerradas, jogo ainda não finalizado)
  const { matches: inProgressMatches, error: auditError } = await getMatchesInProgressWithAllPredictions(tournamentSlug);

  // Pódio (só faz sentido em torneios de mata-mata)
  const showPodium = tournamentFormat === 'knockout' || tournamentFormat === 'mixed';
  const podium = showPodium ? await getPodiumData(tournamentSlug) : null;
  const podiumTransparency = showPodium ? await getPodiumTransparency(tournamentSlug) : null;
  // Só para destacar a própria linha na transparência do pódio. A lista em si
  // não muda: continua mostrando todo mundo, que é o ponto da transparência.
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  const podiumCompetitions = podium && !podium.error ? podium.competitions : [];

  // Confrontos de oitavas ainda sem os dois participantes (playoffs pendentes)
  const { competitions: pendingBracket } = await getPendingBracketTies(tournamentSlug);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="container mx-auto px-4 py-8 pb-28 md:pb-8 max-w-full">
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-foreground mb-2">Partidas</h1>
          <p className="text-muted-foreground">Faça seus palpites para as partidas do {tournament.name}</p>
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
            <div className="mb-6 rounded-xl border-2 border-primary/40 bg-gradient-to-r from-primary/15 to-primary/5 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Trophy className="w-8 h-8 text-primary flex-shrink-0" />
                <div>
                  <p className="text-primary text-xs font-semibold uppercase tracking-wide">Prêmio em disputa</p>
                  <p className="text-foreground text-2xl sm:text-3xl font-bold">{fmt(pot)}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-card-foreground">
                {([['1º', tournament.prize_first], ['2º', tournament.prize_second], ['3º', tournament.prize_third]] as const).map(
                  ([pos, val]) => (
                    <span key={pos} className="flex flex-col items-end">
                      <span className="font-mono text-[11px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">{pos}</span>
                      <span className="text-[11px] font-semibold text-card-foreground">{fmt(Number(val) || 0)}</span>
                    </span>
                  )
                )}
              </div>
            </div>
          );
        })()}

        <TournamentDeadlineBanner
          nextMatchDate={nextMatchDate}
          missingPredictionsCount={missingPredictionsCount}
          missingByCompetition={missingByCompetition}
          deadlinesByCompetition={prazoPorCompeticao}
        />

        <CompetitionFilterProvider>
        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="grid w-full auto-cols-fr grid-flow-col gap-1 rounded-[12px] border border-border bg-card p-1">
            <TabsTrigger value="upcoming" className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-[9px] text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">
              <Calendar className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="truncate">Próximas</span>
              <span className="hidden sm:inline">({upcomingMatches.length})</span>
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-[9px] text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">
              <Eye className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="truncate">Transparência</span>
              <span className="hidden sm:inline">({inProgressMatches.length})</span>
            </TabsTrigger>
            <TabsTrigger value="finished" className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-[9px] text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">
              <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="truncate">Encerradas</span>
              <span className="hidden sm:inline">({finishedMatches.length})</span>
            </TabsTrigger>
            {showPodium && (
              <TabsTrigger value="podium-audit" className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-[9px] text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm">
                <Trophy className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="truncate">Pódio</span>
              </TabsTrigger>
            )}
          </TabsList>

          {/* Próximas */}
          <TabsContent value="upcoming" className="mt-6">
            {temCompeticoes && <CompetitionFilterBar comps={chipsDe(upcomingMatches)} className="mb-8" />}

            {showPodium && podiumCompetitions.length > 0 && (
              <div className="mb-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {podiumCompetitions.map((c) => (
                  <CompetitionSection key={c.key} compKey={c.key}>
                    <PodiumCard
                      tournamentSlug={tournamentSlug}
                      competitionKey={c.key}
                      competitionName={c.name}
                      mode={c.mode}
                      teams={c.teams}
                      locked={c.locked}
                      pending={c.pending}
                      userPick={c.userPick}
                    />
                  </CompetitionSection>
                ))}
              </div>
            )}

            {pendingBracket.length > 0 &&
              pendingBracket.map((comp: any) => (
                <CompetitionSection key={`pending-${comp.key}`} compKey={comp.key}>
                <section className="mb-8">
                  <h2 className="text-xl font-bold text-foreground mb-1">{comp.name}</h2>
                  <p className="text-[hsl(var(--faint))] text-sm mb-4">Confrontos aguardando os classificados dos playoffs</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {comp.ties.map((t: any) => (
                      <PendingTieCard key={t.id} sideA={t.sideA} sideB={t.sideB} />
                    ))}
                  </div>
                </section>
                </CompetitionSection>
              ))}

            {upcomingMatches.length === 0 && pendingBracket.length === 0 ? (
              <div className="text-muted-foreground text-center py-12">Nenhuma partida próxima no momento.</div>
            ) : (
              /* Aqui os grupos vão na ordem do calendário, não na da constante:
                 quem joga antes aparece primeiro. */
              sortGroupsByNextMatch(groupByCompetition(upcomingMatches)).map((g) => (
                <CompetitionSection key={g.key ?? 'all'} compKey={g.key}>
                <section className="mb-8">
                  {g.key && (
                    <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-hairline pb-2">
                      <h2 className="font-mono text-[10.5px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">{g.name}</h2>
                      <span className="text-[11px] text-muted-foreground">{g.items.length} {g.items.length === 1 ? 'jogo' : 'jogos'}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {g.items.map((match: any) => (
                      <MatchCard key={match.id} match={match} group={match.phase ?? 'Fase de Grupos'} />
                    ))}
                  </div>
                </section>
                </CompetitionSection>
              ))
            )}
          </TabsContent>

          {/* Transparência */}
          <TabsContent value="audit" className="mt-6">
            {temCompeticoes && <CompetitionFilterBar comps={chipsDe(inProgressMatches)} className="mb-6" />}
            {auditError ? (
              <div className="text-destructive text-center py-12">Erro ao carregar partidas: {auditError}</div>
            ) : inProgressMatches.length === 0 ? (
              <div className="text-muted-foreground text-center py-12">
                <Eye className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">Nenhuma partida com apostas encerradas no momento.</p>
                <p className="text-sm">
                  Assim que uma partida começa, as apostas dela são encerradas e os palpites de todos aparecem aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <Eye className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="text-primary font-semibold mb-1">Transparência — Apostas Encerradas</h3>
                      <p className="text-card-foreground text-sm">
                        Palpites de todos os participantes nas partidas cujas apostas já fecharam (a partir do
                        horário de início de cada jogo). Garante que nenhum palpite foi alterado depois do início.
                      </p>
                    </div>
                  </div>
                </div>
                {groupByCompetition(inProgressMatches).map((g) => (
                  <CompetitionSection key={g.key ?? 'all'} compKey={g.key}>
                  <section className="space-y-4">
                    {g.key && (
                      <div className="flex items-baseline justify-between gap-3 border-b border-hairline pb-2">
                        <h2 className="font-mono text-[10.5px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">{g.name}</h2>
                        <span className="text-[11px] text-muted-foreground">{g.items.length} {g.items.length === 1 ? 'jogo' : 'jogos'}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {g.items.map((match: any) => (
                        <AuditMatchCard key={match.id} match={match} tournamentSlug={tournamentSlug} />
                      ))}
                    </div>
                  </section>
                  </CompetitionSection>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Encerradas */}
          <TabsContent value="finished" className="mt-6">
            {temCompeticoes && <CompetitionFilterBar comps={chipsDe(finishedMatches)} className="mb-8" />}
            {finishedMatches.length === 0 ? (
              <div className="text-muted-foreground text-center py-12">Nenhuma partida encerrada ainda.</div>
            ) : (
              groupByCompetition(finishedMatches).map((g) => (
                <CompetitionSection key={g.key ?? 'all'} compKey={g.key}>
                <section className="mb-8">
                  {g.key && (
                    <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-hairline pb-2">
                      <h2 className="font-mono text-[10.5px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">{g.name}</h2>
                      <span className="text-[11px] text-muted-foreground">{g.items.length} {g.items.length === 1 ? 'jogo' : 'jogos'}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {g.items.map((match: any) => (
                      <Link
                        key={match.id}
                        href={`/${tournamentSlug}/matches/${match.id}`}
                        className="group block rounded-lg transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <MatchCard match={match} group={match.phase ?? 'Fase de Grupos'} />
                        {/* Afordância explícita de "abrir os palpites". É um <span>,
                            não um <button>/<a>: o card inteiro já é o link, e link
                            dentro de link seria HTML inválido. */}
                        <span className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-lg border border-border bg-surface-sunken text-sm font-semibold text-card-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
                          Ver os palpites
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
                </CompetitionSection>
              ))
            )}
          </TabsContent>

          {/* Transparência do Pódio (só mata-mata) */}
          {showPodium && (
            <TabsContent value="podium-audit" className="mt-6">
              {!podiumTransparency || podiumTransparency.error ? (
                <div className="text-destructive text-center py-12">
                  Erro ao carregar palpites de pódio{podiumTransparency?.error ? `: ${podiumTransparency.error}` : ''}
                </div>
              ) : !podiumTransparency.started ? (
                <div className="text-muted-foreground text-center py-12">
                  <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">A transparência do pódio aparece quando cada competição começar.</p>
                  <p className="text-sm">
                    Os palpites de campeão e vice de todos ficarão visíveis a partir do primeiro jogo de cada competição.
                  </p>
                </div>
              ) : (
                <PodiumTransparency
                  tournamentSlug={tournamentSlug}
                  competitions={podiumTransparency.competitions}
                  currentUserId={currentUser?.id ?? null}
                />
              )}
            </TabsContent>
          )}
        </Tabs>
        </CompetitionFilterProvider>
      </div>
    </div>
  );
}
