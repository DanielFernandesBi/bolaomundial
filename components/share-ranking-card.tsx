'use client';

import { Trophy, Award, DollarSign } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface ShareRankingCardProps {
  position: number;
  username: string;
  userAvatarUrl?: string | null;
  totalPoints: number;
  exactMatches: number;
  rankingName?: string;
  totalMoney?: number;
}

export function ShareRankingCard({
  position,
  username,
  userAvatarUrl,
  totalPoints,
  exactMatches,
  rankingName,
  totalMoney,
}: ShareRankingCardProps) {
  const initials = username
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const getPositionEmoji = () => {
    if (position === 1) return '🥇';
    if (position === 2) return '🥈';
    if (position === 3) return '🥉';
    return '🏆';
  };

  const getPositionColor = () => {
    if (position === 1) return 'text-amber-500';
    if (position === 2) return 'text-slate-400';
    if (position === 3) return 'text-amber-700';
    return 'text-white';
  };

  const formatMoney = (value: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div
      id="share-ranking-card"
      className="w-[400px] h-[680px] relative overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      {/* Logo e nome do ranking no topo */}
      <div className="absolute top-5 left-5 right-5 flex flex-col items-center gap-2 z-10">
        <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
          <span className="text-white font-bold text-lg">Bolão Mundial</span>
        </div>
        {rankingName && (
          <div className="bg-white/15 backdrop-blur-sm px-4 py-1.5 rounded-full">
            <span className="text-white font-semibold text-sm">{rankingName}</span>
          </div>
        )}
      </div>

      {/* Conteúdo central */}
      <div className="flex flex-col items-center justify-center h-full px-8 pb-24 pt-28">
        {/* Posição */}
        <div className="text-7xl mb-2">{getPositionEmoji()}</div>
        <div className={`text-5xl font-bold mb-5 ${getPositionColor()}`}>
          {position}º Lugar
        </div>

        {/* Avatar e nome */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <Avatar className="w-20 h-20 border-4 border-white shadow-lg">
            <AvatarImage src={userAvatarUrl || undefined} />
            <AvatarFallback className="text-black text-2xl font-bold bg-amber-500">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="text-white text-xl font-bold text-center max-w-[280px] truncate">
            {username}
          </div>
        </div>

        {/* Estatísticas */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 w-full space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <Award className="w-5 h-5" />
              <span className="text-base font-medium">Pontos</span>
            </div>
            <div className="text-white text-2xl font-bold">{totalPoints.toLocaleString('pt-BR')}</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <Trophy className="w-5 h-5" />
              <span className="text-base font-medium">Cravadas</span>
            </div>
            <div className="text-white text-2xl font-bold">{exactMatches}</div>
          </div>
          {totalMoney !== undefined && totalMoney > 0 && (
            <div className="flex items-center justify-between pt-3 border-t border-white/20">
              <div className="flex items-center gap-2 text-white">
                <DollarSign className="w-5 h-5" />
                <span className="text-base font-medium">Dinheiro</span>
              </div>
              <div className="text-amber-400 text-2xl font-bold">{formatMoney(totalMoney)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Rodapé */}
      <div className="absolute bottom-5 left-5 right-5 text-center">
        <div className="text-white/60 text-xs">
          bolao-mundial.com
        </div>
      </div>
    </div>
  );
}

