'use client';

import Image from 'next/image';
import { Trophy } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getFlagUrl } from '@/lib/utils/flags';

interface ShareMatchCardProps {
  teamHome: string;
  teamAway: string;
  homeIso: string | null;
  awayIso: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  predHome: number;
  predAway: number;
  pointsEarned: number;
  userAvatarUrl?: string | null;
  username: string;
  cardId?: string;
}

export function ShareMatchCard({
  teamHome,
  teamAway,
  homeIso,
  awayIso,
  scoreHome,
  scoreAway,
  predHome,
  predAway,
  pointsEarned,
  userAvatarUrl,
  username,
  cardId = 'share-match-card',
}: ShareMatchCardProps) {
  const initials = username
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const getMessage = () => {
    if (pointsEarned === 30 || pointsEarned === 25 || pointsEarned === 20) return 'Eu cravei! 🎯';
    if (pointsEarned >= 15) return 'Mandei bem! 🔥';
    if (pointsEarned >= 9) return 'Acertou! ⚽';
    if (pointsEarned >= 3) return 'Quase lá! 💪';
    return 'Participei! 🏆';
  };

  const getBadgeColor = () => {
    if (pointsEarned === 30 || pointsEarned === 25 || pointsEarned === 20) return 'bg-amber-500';
    if (pointsEarned === 17) return 'bg-purple-500';
    if (pointsEarned === 15) return 'bg-blue-500';
    if (pointsEarned === 12) return 'bg-green-500';
    if (pointsEarned === 9) return 'bg-cyan-500';
    if (pointsEarned === 3) return 'bg-orange-500';
    return 'bg-slate-600';
  };

  return (
    <div
      id={cardId}
      className="w-[400px] h-[600px] relative overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      {/* Logo no topo */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-center">
        <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
          <span className="text-white font-bold text-lg">Bolão Mundial</span>
        </div>
      </div>

      {/* Conteúdo central */}
      <div className="flex flex-col items-center justify-center h-full px-8 pb-20">
        {/* Avatar e mensagem */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <Avatar className="w-20 h-20 border-4 border-white">
            <AvatarImage src={userAvatarUrl || undefined} />
            <AvatarFallback className="text-black text-2xl font-bold bg-amber-500">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="text-white text-2xl font-bold text-center">
            {getMessage()}
          </div>
        </div>

        {/* Placar do jogo */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6 w-full">
          <div className="text-white/80 text-sm text-center mb-4">
            Placar Real
          </div>
          <div className="flex items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-2">
              {homeIso && (
                homeIso.toLowerCase().startsWith('http') ? (
                  <img
                    src={homeIso}
                    alt={teamHome}
                    className="w-16 h-16 rounded object-contain"
                    loading="lazy"
                  />
                ) : (
                  <Image
                    src={getFlagUrl(homeIso)}
                    alt={teamHome}
                    width={64}
                    height={64}
                    className="w-16 h-auto rounded"
                  />
                )
              )}
              <div className="text-white text-3xl font-bold">
                {scoreHome ?? '-'}
              </div>
              <div className="text-white/80 text-sm text-center">
                {teamHome}
              </div>
            </div>
            <div className="text-white text-4xl font-bold">x</div>
            <div className="flex flex-col items-center gap-2">
              {awayIso && (
                awayIso.toLowerCase().startsWith('http') ? (
                  <img
                    src={awayIso}
                    alt={teamAway}
                    className="w-16 h-16 rounded object-contain"
                    loading="lazy"
                  />
                ) : (
                  <Image
                    src={getFlagUrl(awayIso)}
                    alt={teamAway}
                    width={64}
                    height={64}
                    className="w-16 h-auto rounded"
                  />
                )
              )}
              <div className="text-white text-3xl font-bold">
                {scoreAway ?? '-'}
              </div>
              <div className="text-white/80 text-sm text-center">
                {teamAway}
              </div>
            </div>
          </div>
        </div>

        {/* Meu palpite */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6 w-full">
          <div className="text-white/80 text-sm text-center mb-4">
            Meu Palpite
          </div>
          <div className="flex items-center justify-center gap-6">
            <div className="text-white text-4xl font-bold">{predHome}</div>
            <div className="text-white text-4xl font-bold">x</div>
            <div className="text-white text-4xl font-bold">{predAway}</div>
          </div>
        </div>

        {/* Badge de pontos */}
        <div
          className={`${getBadgeColor()} text-white px-6 py-3 rounded-full flex items-center gap-2`}
        >
          <Trophy className="w-6 h-6" />
          <span className="font-bold text-xl">+{pointsEarned} PONTOS</span>
        </div>
      </div>

      {/* Rodapé */}
      <div className="absolute bottom-6 left-6 right-6 text-center">
        <div className="text-white/60 text-xs">
          bolao-mundial.com
        </div>
      </div>
    </div>
  );
}

