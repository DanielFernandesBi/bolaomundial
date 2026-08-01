import { Flame, Trophy } from 'lucide-react';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase';
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
    participantes: number;
    encerradoEm: string | null;
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

    // Participantes e data de encerramento: o cabeçalho do Handoff mostra os
    // dois, e a contagem também dá a posição do lanterna.
    const { count: participantes } = await supabase
      .from('tournament_rankings')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournament.id);

    // Encerramento = último jogo disputado, não a criação do torneio. É a data
    // que o jogador reconhece.
    const { data: ultimoJogo } = await supabase
      .from('matches')
      .select('match_date')
      .eq('tournament_id', tournament.id)
      .eq('status', 'FINISHED')
      .not('match_date', 'is', null)
      .order('match_date', { ascending: false })
      .limit(1);

    let last: TournamentResult | null = null;
    if (allRankings && allRankings.length > 0) {
      const lastRanking = allRankings[0];
      const lastProfile = Array.isArray(lastRanking.profiles) 
        ? lastRanking.profiles[0] 
        : lastRanking.profiles;
      
      if (lastProfile) {
        last = {
          tournament_id: tournament.id,
          tournament_name: tournament.name,
          tournament_slug: tournament.slug,
          position: participantes || 0,
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
      participantes: participantes || 0,
      encerradoEm: (ultimoJogo?.[0] as any)?.match_date ?? tournament.created_at ?? null,
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

  const totalDistribuido = tournamentsResults.reduce(
    (soma, t) => soma + t.top3.reduce((s, r) => s + r.prize_money, 0),
    0
  );

  function mesAno(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso)
      .toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' })
      .replace('.', '.');
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="container mx-auto max-w-full px-4 py-8 pb-28 md:pb-8">
        {/* Cabeçalho no peso do resto do app: título grande, subtítulo com o
            que a tela inteira soma. O hero antigo tinha `text-6xl` e um troféu
            de 64px — não existia nada desse tamanho em nenhuma outra tela. */}
        <div className="mb-6">
          <h1 className="mb-1 text-3xl font-bold text-foreground sm:text-4xl">Hall da Fama</h1>
          <p className="text-sm text-muted-foreground">
            {tournamentsResults.length}{' '}
            {tournamentsResults.length === 1 ? 'bolão encerrado' : 'bolões encerrados'}
            {totalDistribuido > 0 && <> · {formatMoney(totalDistribuido)} distribuídos</>}
          </p>
        </div>

        <div className="space-y-8">
          {tournamentsResults.map(({ tournament, top3, last, participantes, encerradoEm }) => {
            const campeao = top3[0];
            const demais = top3.slice(1);
            return (
              <section key={tournament.id}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h2 className="min-w-0 truncate text-lg font-bold text-foreground">
                    {tournament.name}
                  </h2>
                  <p className="flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(var(--faint))]">
                    {mesAno(encerradoEm)}
                    {participantes > 0 && ` · ${participantes} participantes`}
                  </p>
                </div>

                {/* Campeão: o único com destaque. Antes os três primeiros eram
                    cards iguais, e o pódio não se lia num relance. */}
                {campeao && (
                  <div className="mb-2 rounded-[14px] border border-primary/45 bg-primary/10 px-3 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12 flex-shrink-0 border-2 border-primary/50">
                        <AvatarImage src={campeao.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/20 text-sm text-foreground">
                          {getInitials(campeao.username)}
                        </AvatarFallback>
                      </Avatar>
                      {/* min-w-0 é o que impede o nome longo de empurrar o
                          prêmio para fora do card. */}
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
                          Campeão
                        </p>
                        <Link
                          href={`/profile/${campeao.user_id}`}
                          className="block truncate text-base font-bold text-foreground transition-colors hover:text-primary"
                        >
                          {campeao.username}
                        </Link>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">
                          {campeao.total_points.toLocaleString('pt-BR')} pts · {campeao.exact_matches}{' '}
                          cravadas
                        </p>
                      </div>
                      {campeao.prize_money > 0 && (
                        <p className="flex-shrink-0 text-base font-bold tabular-nums text-primary">
                          {formatMoney(campeao.prize_money)}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* 2º e 3º: linhas discretas. */}
                {demais.length > 0 && (
                  <div className="mb-2 overflow-hidden rounded-[14px] border border-border bg-card">
                    {demais.map((r) => (
                      <div
                        key={r.user_id}
                        className="flex items-center gap-3 border-t border-hairline px-3 py-2.5 first:border-t-0"
                      >
                        <span className="w-5 flex-shrink-0 text-center font-mono text-xs font-bold tabular-nums text-[hsl(var(--faint))]">
                          {r.position}º
                        </span>
                        <Avatar className="h-8 w-8 flex-shrink-0 border border-border">
                          <AvatarImage src={r.avatar_url || undefined} />
                          <AvatarFallback className="bg-surface-sunken text-[10px] text-foreground">
                            {getInitials(r.username)}
                          </AvatarFallback>
                        </Avatar>
                        <Link
                          href={`/profile/${r.user_id}`}
                          className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground transition-colors hover:text-primary"
                        >
                          {r.username}
                        </Link>
                        {r.prize_money > 0 && (
                          <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-foreground">
                            {formatMoney(r.prize_money)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Lanterna: linha tracejada, sem card próprio nem coluna
                    inteira. É uma brincadeira, não meio pódio. */}
                {last && (
                  <div className="flex items-center gap-2.5 rounded-[14px] border border-dashed border-border px-3 py-2.5">
                    <Flame className="h-3.5 w-3.5 flex-shrink-0 text-destructive" aria-hidden="true" />
                    <span className="flex-shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-[hsl(var(--faint))]">
                      Lanterna
                    </span>
                    <Link
                      href={`/profile/${last.user_id}`}
                      className="min-w-0 flex-1 truncate text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {last.username}
                    </Link>
                    <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-[hsl(var(--faint))]">
                      {last.position}º · {last.total_points.toLocaleString('pt-BR')} pts
                    </span>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
