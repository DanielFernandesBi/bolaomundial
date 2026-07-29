import {
  Trophy,
  TrendingUp,
  Target,
  User,
  Calendar,
  Award,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getUserProfile } from './actions';
import { AvatarUploadDialog } from '@/components/avatar-upload-dialog';
import { HistoryList } from './history-list';
import { ScoringLegend } from '@/components/scoring-legend';
import { createServerSupabaseClient } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import { scoreTier } from '@/lib/scoring-ui';

interface DesempenhoPageProps {
  params: Promise<{
    tournament: string;
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

// A antiga getPointsBadge() vivia aqui: 60 linhas com a escala de 8 cores,
// declaradas e nunca chamadas. Removida na Fase 3 — a exibição da pontuação
// agora sai de lib/scoring-ui.ts (scoreTier / tierBadge / tierRow).

export default async function DesempenhoPage({ params }: DesempenhoPageProps) {
  const { tournament: tournamentSlug } = await params;
  
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

  // Descobre a variante do sistema de pontuação a exibir:
  // grupos (só tempo normal) · clubes (pênaltis por vencedor, pódio por competição) · legado (Mundial)
  const { data: compMatch } = await supabase
    .from('matches')
    .select('id')
    .eq('tournament_id', tournament.id)
    .not('competition', 'is', null)
    .limit(1)
    .maybeSingle();
  const scoringVariant: 'groups' | 'clubs' | 'legacy' =
    tournament.format === 'groups' ? 'groups' : compMatch ? 'clubs' : 'legacy';

  const { profile, error } = await getUserProfile(tournamentSlug);

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

  const initials = profile.username
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const memberSince = formatDate(profile.created_at);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <div className="container mx-auto px-4 py-8 pb-28 md:pb-8 max-w-full">
        {/* Cabeçalho do Desempenho */}
        <Card className="bg-card border-border mb-8">
          <CardContent className="p-6">
            <div className="flex items-center gap-6 flex-wrap">
              {/* Avatar com Upload */}
              <div className="bg-primary rounded-full p-1">
                <AvatarUploadDialog
                  currentAvatarUrl={profile.avatar_url}
                  userId={profile.id}
                  userInitials={initials}
                />
              </div>

              {/* Informações */}
              <div className="flex-1 min-w-[200px]">
                <h1 className="text-3xl font-bold text-foreground mb-2">
                  {profile.username}
                </h1>
                <p className="text-muted-foreground text-sm mb-3">
                  Membro desde {memberSince}
                </p>
                {profile.ranking_position && (
                  <div className="inline-flex items-center gap-2 bg-muted px-3 py-1 rounded-full">
                    <Trophy className="w-4 h-4 text-primary" />
                    <span className="text-foreground text-sm">
                      {profile.ranking_position}º Lugar no ranking do {tournament.name}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hero: posição e pontos. Antes eram 7 cards de peso igual, o que
            não dizia o que olhar primeiro. */}
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

        {/* Últimos 8 jogos: forma recente num relance, pela escala de 3 níveis */}
        {profile.history && profile.history.length > 0 && (
          <div className="mb-8 rounded-[16px] border border-border bg-card p-4">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">
              Últimos jogos
            </p>
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
          </div>
        )}

        {/* Regras de Pontuação */}
        <ScoringLegend variant={scoringVariant} />

        {/* Histórico de Palpites */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Calendar className="w-5 h-5 text-primary" />
              Histórico de Palpites - {tournament.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HistoryList
              history={profile.history}
              userAvatarUrl={profile.avatar_url}
              username={profile.username}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

