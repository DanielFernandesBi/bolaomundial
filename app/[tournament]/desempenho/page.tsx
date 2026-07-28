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

// Função para obter badge de pontos (novo sistema)
function getPointsBadge(points: number) {
  if (points === 30 || points === 25) {
    return {
      bg: 'bg-amber-500',
      text: 'Cravada!',
      color: 'text-amber-500',
      category: 'A. Placar Exato',
    };
  } else if (points === 17) {
    return {
      bg: 'bg-purple-500',
      text: 'Vencedor + Gols Vencedor',
      color: 'text-purple-400',
      category: 'B. Vencedor + Gols do Vencedor',
    };
  } else if (points === 15) {
    return {
      bg: 'bg-blue-500',
      text: 'Vencedor + Saldo / Empate',
      color: 'text-blue-400',
      category: 'C. Vencedor + Saldo de Gols / E. Empate Seco',
    };
  } else if (points === 12) {
    return {
      bg: 'bg-green-500',
      text: 'Vencedor + Gols Perdedor / Empate',
      color: 'text-green-400',
      category: 'D. Vencedor + Gols do Perdedor / E. Empate Seco',
    };
  } else if (points === 10 || points === 9) {
    return {
      bg: 'bg-cyan-500',
      text: 'Vencedor Seco',
      color: 'text-cyan-400',
      category: 'F. Vencedor Seco',
    };
  } else if (points === 3) {
    return {
      bg: 'bg-orange-500',
      text: 'Consolação',
      color: 'text-orange-400',
      category: 'G. Consolação (Gols Avulsos)',
    };
  } else if (points > 0) {
    // Totais de mata-mata (tempo normal + prorrogação/pênaltis) podem não cair numa faixa única
    return {
      bg: 'bg-emerald-600',
      text: 'Pontuado',
      color: 'text-emerald-400',
      category: 'Inclui bônus de mata-mata',
    };
  } else {
    return {
      bg: 'bg-slate-600',
      text: 'Sem pontos',
      color: 'text-slate-400',
      category: 'Sem pontos',
    };
  }
}

export default async function DesempenhoPage({ params }: DesempenhoPageProps) {
  const { tournament: tournamentSlug } = await params;
  
  // Verificar se o torneio existe
  const supabase = await createServerSupabaseClient();
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, slug')
    .eq('slug', tournamentSlug)
    .single();

  if (!tournament) {
    notFound();
  }

  const { profile, error } = await getUserProfile(tournamentSlug);

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="container mx-auto px-4 py-8">
          <div className="text-red-500">
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
    <div className="min-h-screen bg-slate-950 overflow-x-hidden">
      <div className="container mx-auto px-4 py-8 max-w-full">
        {/* Cabeçalho do Desempenho */}
        <Card className="bg-slate-900 border-slate-800 mb-8">
          <CardContent className="p-6">
            <div className="flex items-center gap-6 flex-wrap">
              {/* Avatar com Upload */}
              <div className="bg-amber-500 rounded-full p-1">
                <AvatarUploadDialog
                  currentAvatarUrl={profile.avatar_url}
                  userId={profile.id}
                  userInitials={initials}
                />
              </div>

              {/* Informações */}
              <div className="flex-1 min-w-[200px]">
                <h1 className="text-3xl font-bold text-white mb-2">
                  {profile.username}
                </h1>
                <p className="text-slate-400 text-sm mb-3">
                  Membro desde {memberSince}
                </p>
                {profile.ranking_position && (
                  <div className="inline-flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-full">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    <span className="text-white text-sm">
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
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6 text-center">
              <TrendingUp className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <div className="text-3xl font-bold text-white mb-1">
                {profile.total_points}
              </div>
              <div className="text-slate-400 text-sm">Pontos</div>
            </CardContent>
          </Card>

          {/* Cravadas */}
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6 text-center">
              <Trophy className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <div className="text-3xl font-bold text-white mb-1">
                {profile.exact_matches}
              </div>
              <div className="text-slate-400 text-sm">Cravadas</div>
            </CardContent>
          </Card>

          {/* Acertos */}
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6 text-center">
              <Target className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <div className="text-3xl font-bold text-white mb-1">
                {profile.correct_predictions}
              </div>
              <div className="text-slate-400 text-sm">Acertos</div>
            </CardContent>
          </Card>

          {/* Total de Palpites */}
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6 text-center">
              <User className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <div className="text-3xl font-bold text-white mb-1">
                {profile.total_predictions}
              </div>
              <div className="text-slate-400 text-sm">Palpites</div>
            </CardContent>
          </Card>
        </div>

        {/* Estatísticas Adicionais (Baseadas em Jogos Finalizados) */}
        {(profile as any).finished_predictions_count > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {/* Porcentagem de Acerto */}
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-6 text-center">
                <Target className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                <div className="text-3xl font-bold text-white mb-1">
                  {(profile as any).accuracy_percentage}%
                </div>
                <div className="text-slate-400 text-sm">Porcentagem de Acerto</div>
                <div className="text-slate-500 text-xs mt-1">
                  {((profile as any).finished_predictions_count || 0)} jogos finalizados
                </div>
              </CardContent>
            </Card>

            {/* Porcentagem de Cravadas */}
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-6 text-center">
                <Trophy className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <div className="text-3xl font-bold text-white mb-1">
                  {(profile as any).exact_matches_percentage}%
                </div>
                <div className="text-slate-400 text-sm">Porcentagem de Cravadas</div>
                <div className="text-slate-500 text-xs mt-1">
                  {((profile as any).finished_predictions_count || 0)} jogos finalizados
                </div>
              </CardContent>
            </Card>

            {/* Média de Pontos */}
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-6 text-center">
                <TrendingUp className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <div className="text-3xl font-bold text-white mb-1">
                  {(profile as any).average_points}
                </div>
                <div className="text-slate-400 text-sm">Média de Pontos</div>
                <div className="text-slate-500 text-xs mt-1">
                  Por jogo finalizado
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Regras de Pontuação */}
        <ScoringLegend />

        {/* Histórico de Palpites */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Calendar className="w-5 h-5 text-amber-500" />
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

