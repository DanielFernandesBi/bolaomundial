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

        {/* Grid de Estatísticas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {/* Pontos */}
          <Card className="bg-card border-border">
            <CardContent className="p-6 text-center">
              <TrendingUp className="w-8 h-8 text-primary mx-auto mb-2" />
              <div className="text-3xl font-bold text-foreground mb-1">
                {profile.total_points}
              </div>
              <div className="text-muted-foreground text-sm">Pontos</div>
            </CardContent>
          </Card>

          {/* Cravadas */}
          <Card className="bg-card border-border">
            <CardContent className="p-6 text-center">
              <Trophy className="w-8 h-8 text-primary mx-auto mb-2" />
              <div className="text-3xl font-bold text-foreground mb-1">
                {profile.exact_matches}
              </div>
              <div className="text-muted-foreground text-sm">Cravadas</div>
            </CardContent>
          </Card>

          {/* Acertos */}
          <Card className="bg-card border-border">
            <CardContent className="p-6 text-center">
              <Target className="w-8 h-8 text-state-open mx-auto mb-2" />
              <div className="text-3xl font-bold text-foreground mb-1">
                {profile.correct_predictions}
              </div>
              <div className="text-muted-foreground text-sm">Acertos</div>
            </CardContent>
          </Card>

          {/* Total de Palpites */}
          <Card className="bg-card border-border">
            <CardContent className="p-6 text-center">
              <User className="w-8 h-8 text-primary mx-auto mb-2" />
              <div className="text-3xl font-bold text-foreground mb-1">
                {profile.total_predictions}
              </div>
              <div className="text-muted-foreground text-sm">Palpites</div>
            </CardContent>
          </Card>
        </div>

        {/* Estatísticas Adicionais (Baseadas em Jogos Finalizados) */}
        {(profile as any).finished_predictions_count > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {/* Porcentagem de Acerto */}
            <Card className="bg-card border-border">
              <CardContent className="p-6 text-center">
                <Target className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <div className="text-3xl font-bold text-foreground mb-1">
                  {(profile as any).accuracy_percentage}%
                </div>
                <div className="text-muted-foreground text-sm">Porcentagem de Acerto</div>
                <div className="text-[hsl(var(--faint))] text-xs mt-1">
                  {((profile as any).finished_predictions_count || 0)} jogos finalizados
                </div>
              </CardContent>
            </Card>

            {/* Porcentagem de Cravadas */}
            <Card className="bg-card border-border">
              <CardContent className="p-6 text-center">
                <Trophy className="w-8 h-8 text-primary mx-auto mb-2" />
                <div className="text-3xl font-bold text-foreground mb-1">
                  {(profile as any).exact_matches_percentage}%
                </div>
                <div className="text-muted-foreground text-sm">Porcentagem de Cravadas</div>
                <div className="text-[hsl(var(--faint))] text-xs mt-1">
                  {((profile as any).finished_predictions_count || 0)} jogos finalizados
                </div>
              </CardContent>
            </Card>

            {/* Média de Pontos */}
            <Card className="bg-card border-border">
              <CardContent className="p-6 text-center">
                <TrendingUp className="w-8 h-8 text-state-open mx-auto mb-2" />
                <div className="text-3xl font-bold text-foreground mb-1">
                  {(profile as any).average_points}
                </div>
                <div className="text-muted-foreground text-sm">Média de Pontos</div>
                <div className="text-[hsl(var(--faint))] text-xs mt-1">
                  Por jogo finalizado
                </div>
              </CardContent>
            </Card>
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

