import {
  Trophy,
  TrendingUp,
  Target,
  User,
  Award,
  DollarSign,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import { getPublicProfile } from '../actions';
import { notFound } from 'next/navigation';

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

// Função para formatar dinheiro
function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

interface PublicProfilePageProps {
  params: Promise<{
    userId: string;
  }>;
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { userId } = await params;
  const { profile, error } = await getPublicProfile(userId);

  if (error || !profile) {
    notFound();
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
      <div className="container mx-auto px-4 py-8 max-w-full">
        {/* Cabeçalho do Perfil */}
        <Card className="bg-card border-border mb-8">
          <CardContent className="p-6">
            <div className="flex items-center gap-6 flex-wrap">
              {/* Avatar */}
              <div className="bg-primary rounded-full p-1 w-24 h-24">
                <Avatar className="w-full h-full">
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback className="bg-muted text-foreground text-2xl">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>

              {/* Informações */}
              <div className="flex-1 min-w-[200px]">
                <h1 className="text-3xl font-bold text-foreground mb-2">
                  {profile.username}
                </h1>
                <p className="text-muted-foreground text-sm mb-3">
                  Membro desde {memberSince}
                </p>
                {profile.general_ranking_position && (
                  <div className="inline-flex items-center gap-2 bg-muted px-3 py-1 rounded-full">
                    <Trophy className="w-4 h-4 text-primary" />
                    <span className="text-foreground text-sm">
                      {profile.general_ranking_position}º Lugar no Ranking Geral
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Grid de Estatísticas Gerais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {/* Pontos Totais */}
          <Card className="bg-card border-border">
            <CardContent className="p-6 text-center">
              <TrendingUp className="w-8 h-8 text-primary mx-auto mb-2" />
              <div className="text-3xl font-bold text-foreground mb-1">
                {profile.total_points}
              </div>
              <div className="text-muted-foreground text-sm">Pontos Totais</div>
            </CardContent>
          </Card>

          {/* Cravadas Totais */}
          <Card className="bg-card border-border">
            <CardContent className="p-6 text-center">
              <Trophy className="w-8 h-8 text-primary mx-auto mb-2" />
              <div className="text-3xl font-bold text-foreground mb-1">
                {profile.exact_matches}
              </div>
              <div className="text-muted-foreground text-sm">Cravadas Totais</div>
            </CardContent>
          </Card>

          {/* Dinheiro Total */}
          <Card className="bg-card border-border">
            <CardContent className="p-6 text-center">
              <DollarSign className="w-8 h-8 text-state-open mx-auto mb-2" />
              <div className="text-3xl font-bold text-foreground mb-1">
                {formatMoney(profile.total_money)}
              </div>
              <div className="text-muted-foreground text-sm">Dinheiro Ganho</div>
            </CardContent>
          </Card>

          {/* Total de Palpites */}
          <Card className="bg-card border-border">
            <CardContent className="p-6 text-center">
              <User className="w-8 h-8 text-primary mx-auto mb-2" />
              <div className="text-3xl font-bold text-foreground mb-1">
                {profile.total_predictions}
              </div>
              <div className="text-muted-foreground text-sm">Palpites Totais</div>
            </CardContent>
          </Card>
        </div>

        {/* Estatísticas de Acertos */}
        <Card className="bg-card border-border mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <BarChart3 className="w-5 h-5 text-primary" />
              Estatísticas de Acertos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-muted-foreground text-sm">Acertos</p>
                  <p className="text-2xl font-bold text-foreground">
                    {profile.correct_predictions}
                  </p>
                </div>
                <Target className="w-8 h-8 text-state-open" />
              </div>
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-muted-foreground text-sm">Taxa de Acerto</p>
                  <p className="text-2xl font-bold text-foreground">
                    {profile.total_predictions > 0
                      ? Math.round(
                          (profile.correct_predictions / profile.total_predictions) * 100
                        )
                      : 0}
                    %
                  </p>
                </div>
                <Award className="w-8 h-8 text-primary" />
              </div>
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-muted-foreground text-sm">% Cravadas</p>
                  <p className="text-2xl font-bold text-foreground">
                    {profile.exact_matches_percentage || 0}%
                  </p>
                </div>
                <Trophy className="w-8 h-8 text-primary" />
              </div>
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-muted-foreground text-sm">Média de Pontos</p>
                  <p className="text-2xl font-bold text-foreground">
                    {profile.average_points || 0}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estatísticas Avançadas */}
        <Card className="bg-card border-border mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <BarChart3 className="w-5 h-5 text-primary" />
              Estatísticas Avançadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-muted-foreground text-sm mb-2">Melhor Pontuação em um Jogo</p>
                <p className="text-3xl font-bold text-primary">
                  {profile.best_score || 0} pts
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-muted-foreground text-sm mb-2">Distribuição de Pontos</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-card-foreground">Cravadas (30 pts)</span>
                    <span className="text-primary font-semibold">
                      {profile.points_distribution?.exact || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-card-foreground">17 pts</span>
                    <span className="text-purple-400 font-semibold">
                      {profile.points_distribution?.category17 || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-card-foreground">15 pts</span>
                    <span className="text-muted-foreground font-semibold">
                      {profile.points_distribution?.category15 || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-card-foreground">12 pts</span>
                    <span className="text-state-open font-semibold">
                      {profile.points_distribution?.category12 || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-card-foreground">10 pts</span>
                    <span className="text-cyan-400 font-semibold">
                      {profile.points_distribution?.category9 || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-card-foreground">3 pts</span>
                    <span className="text-state-missing font-semibold">
                      {profile.points_distribution?.category3 || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-card-foreground">0 pts</span>
                    <span className="text-[hsl(var(--faint))] font-semibold">
                      {profile.points_distribution?.zero || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Torneios Participados */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Trophy className="w-5 h-5 text-primary" />
              Torneios Participados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {profile.tournaments && profile.tournaments.length > 0 ? (
              <div className="space-y-4">
                {profile.tournaments.map((tournament) => (
                  <Link
                    key={tournament.tournament_id}
                    href={`/${tournament.tournament_slug}/desempenho`}
                    className="block"
                  >
                    <Card className="bg-muted border-border hover:border-primary transition-colors cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            {tournament.tournament_logo && (
                              <img
                                src={tournament.tournament_logo}
                                alt={tournament.tournament_name}
                                className="w-12 h-12 object-contain"
                              />
                            )}
                            <div>
                              <h3 className="text-lg font-semibold text-foreground">
                                {tournament.tournament_name}
                              </h3>
                              <div className="flex items-center gap-4 mt-1">
                                <span className="text-muted-foreground text-sm">
                                  {tournament.total_points} pontos
                                </span>
                                <span className="text-muted-foreground text-sm">
                                  {tournament.exact_matches} cravadas
                                </span>
                                {tournament.prize_money > 0 && (
                                  <span className="text-state-open text-sm font-semibold">
                                    {formatMoney(tournament.prize_money)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {tournament.tournament_status === 'active' && (
                              <span className="px-2 py-1 bg-state-open/20 text-state-open text-xs rounded-full">
                                Ativo
                              </span>
                            )}
                            {tournament.tournament_status === 'pending' && (
                              <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                                Pendente
                              </span>
                            )}
                            {tournament.tournament_status === 'finished' && (
                              <span className="px-2 py-1 bg-slate-600 text-muted-foreground text-xs rounded-full">
                                Encerrado
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Trophy className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Este usuário ainda não participou de nenhum torneio.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

