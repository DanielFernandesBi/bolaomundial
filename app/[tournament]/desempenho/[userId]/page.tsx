import { Trophy, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getUserProfile } from '../actions';
import { HistoryList } from '../history-list';
import { ScoringLegend } from '@/components/scoring-legend';
import { createServerSupabaseClient } from '@/lib/supabase';
import { mapaDeLinksDeClube } from '@/lib/club-links';
import { notFound } from 'next/navigation';
import { scoreTier } from '@/lib/scoring-ui';

// ============================================================================
// Desempenho de OUTRO jogador
// ============================================================================
// Tela irmã de app/[tournament]/desempenho/page.tsx. O redesign do bloco 5b
// reorganizou só a própria, e esta ficou com o layout velho — o mesmo descuido
// que aconteceu com o Perfil. Agora as duas seguem o MESMO desenho; a diferença
// é só a cópia em terceira pessoa e o `isOwn={false}` no histórico.
// ============================================================================

interface DesempenhoUserPageProps {
  params: Promise<{
    tournament: string;
    userId: string;
  }>;
}

// Função para formatar data em português
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const months = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

export default async function DesempenhoUserPage({ params }: DesempenhoUserPageProps) {
  const { tournament: tournamentSlug, userId } = await params;

  // Verificar se o torneio existe
  const supabase = await createServerSupabaseClient();
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, slug, format')
    .eq('slug', tournamentSlug)
    .single();

  if (!tournament) {
    notFound();
  }

  const { data: compMatch } = await supabase
    .from('matches')
    .select('id')
    .eq('tournament_id', tournament.id)
    .not('competition', 'is', null)
    .limit(1)
    .maybeSingle();
  const scoringVariant: 'groups' | 'clubs' | 'legacy' =
    tournament.format === 'groups' ? 'groups' : compMatch ? 'clubs' : 'legacy';

  const { profile, error } = await getUserProfile(tournamentSlug, userId);

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 pb-28 md:pb-8">
          <div className="text-destructive">
            Erro ao carregar desempenho: {error || 'Desempenho não encontrado'}
          </div>
        </div>
      </div>
    );
  }

  // Link de cada clube do histórico. Só no bolão de clubes: em torneio de
  // seleções o "time" é um país e não há página dele para abrir.
  const clubHrefs =
    scoringVariant === 'clubs'
      ? await mapaDeLinksDeClube(
          supabase,
          tournamentSlug,
          (profile.history ?? []).flatMap((h: any) => [h.team_home, h.team_away])
        )
      : undefined;

  const initials = profile.username
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const memberSince = formatDate(profile.created_at);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="container mx-auto max-w-full px-4 py-8 pb-28 md:pb-8">
        {/* Cabeçalho */}
        <Card className="mb-8 border-border bg-card">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-center gap-6">
              <div className="rounded-full bg-primary p-1">
                <Avatar className="h-20 w-20 border-2 border-primary">
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback className="bg-muted text-2xl font-bold text-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>

              <div className="min-w-[200px] flex-1">
                <h1 className="mb-2 text-3xl font-bold text-foreground">{profile.username}</h1>
                <p className="mb-3 text-sm text-muted-foreground">Membro desde {memberSince}</p>
                {profile.ranking_position && (
                  <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1">
                    <Trophy className="h-4 w-4 text-primary" />
                    <span className="text-sm text-foreground">
                      {profile.ranking_position}º Lugar no ranking do {tournament.name}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hero: posição e pontos */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-[16px] border border-primary/30 bg-primary/5 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">
              Posição
            </p>
            <p className="mt-1 text-[32px] font-bold leading-none tabular-nums text-primary">
              {profile.ranking_position ?? '—'}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">no {tournament.name}</p>
          </div>
          <div className="rounded-[16px] border border-border bg-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">
              Pontos
            </p>
            <p className="mt-1 text-[32px] font-bold leading-none tabular-nums text-foreground">
              {profile.total_points}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {profile.total_predictions} {profile.total_predictions === 1 ? 'palpite' : 'palpites'}
            </p>
          </div>
        </div>

        {/* Faixa de métricas, com divisórias de 1px */}
        <div className="mb-4 grid grid-cols-4 divide-x divide-hairline rounded-[16px] border border-border bg-card">
          {([
            ['Cravadas', profile.exact_matches],
            ['Acertos', profile.correct_predictions],
            ['Aproveit.', `${(profile as any).accuracy_percentage ?? 0}%`],
            ['Média', (profile as any).average_points ?? 0],
          ] as const).map(([label, value]) => (
            <div key={label} className="px-2 py-3 text-center">
              <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
              <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* Últimos 8 jogos: forma recente num relance */}
        {/* Renderiza mesmo sem histórico: some-lo fazia parecer que o card
            tinha quebrado, quando na verdade o bolão ainda não pontuou nada —
            que é o caso de todo torneio recém-começado. */}
        <div className="mb-8 rounded-[16px] border border-border bg-card p-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">
              Últimos {Math.min(profile.history?.length ?? 0, 8) || ''} jogos
            </p>
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[hsl(var(--faint))]">
              mais recente à direita
            </p>
          </div>
          {!profile.history || profile.history.length === 0 ? (
            <div className="flex gap-1.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <span
                  key={i}
                  className="h-[34px] flex-1 rounded-[8px] bg-surface-sunken"
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : (
            <div className="flex gap-1.5">
              {profile.history.slice(0, 8).reverse().map((h: any) => {
                const pts = h.points_earned ?? 0;
                const tier = scoreTier(h.points_regular ?? pts);
                const tone =
                  tier === 'exact'
                    ? 'bg-score-exact text-primary-foreground'
                    : tier === 'partial'
                    ? 'bg-score-partial/20 text-score-partial'
                    : 'bg-score-none/10 text-muted-foreground';
                return (
                  <span
                    key={h.match_id}
                    title={`${h.team_home} x ${h.team_away}: ${pts} pts`}
                    className={`flex h-[34px] flex-1 items-center justify-center rounded-[8px] text-xs font-bold tabular-nums ${tone}`}
                  >
                    {pts}
                  </span>
                );
              })}
            </div>
          )}
          {(!profile.history || profile.history.length === 0) && (
            <p className="mt-2 text-[11px] text-[hsl(var(--faint))]">
              Nenhum jogo pontuado ainda neste bolão.
            </p>
          )}
        </div>

        {/* Regras de Pontuação */}
        <ScoringLegend variant={scoringVariant} />

        {/* Histórico de Palpites */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Calendar className="h-5 w-5 text-primary" />
              Histórico de Palpites - {tournament.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HistoryList
              isOwn={false}
              history={profile.history}
              userAvatarUrl={profile.avatar_url}
              username={profile.username}
              clubHrefs={clubHrefs}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
