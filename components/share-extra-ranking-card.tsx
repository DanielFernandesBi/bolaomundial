'use client';

import { Trophy } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface Profile {
  position: number;
  username: string;
  avatar_url: string | null;
  total_points: number;
  exact_matches: number;
}

interface ShareExtraRankingCardProps {
  profiles: Profile[];
  tournamentName?: string;
  isGeneralRanking?: boolean;
  showCravadas?: boolean;
  cardId?: string;
  totalParticipants: number;
}

export function ShareExtraRankingCard({
  profiles,
  tournamentName,
  isGeneralRanking = false,
  showCravadas = false,
  cardId = 'share-extra-ranking-card',
  totalParticipants,
}: ShareExtraRankingCardProps) {
  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const firstPos = profiles[0]?.position ?? 11;
  const lastPos = profiles[profiles.length - 1]?.position ?? firstPos;

  return (
    <div
      id={cardId}
      className="w-[1080px] relative overflow-hidden rounded-2xl"
      style={{
        background: '#0F172A',
        backgroundImage: 'radial-gradient(circle at center, #1E293B 0%, #0F172A 100%)',
        minHeight: '400px',
      }}
    >
      {/* Header */}
      <div className="pt-12 pb-8 px-12 text-center">
        <h2
          className="text-white text-4xl font-bold mb-1 uppercase tracking-wider"
          style={{
            textShadow: '0px 0px 10px rgba(255, 255, 255, 0.3)',
            fontFamily: 'Rajdhani, sans-serif',
            fontWeight: 700,
          }}
        >
          CLASSIFICAÇÃO {isGeneralRanking ? 'GERAL' : (tournamentName || 'RANKING').toUpperCase()}
        </h2>
        <p
          className="text-[#94A3B8] text-sm uppercase tracking-widest"
          style={{ fontFamily: 'Rajdhani, sans-serif' }}
        >
          {showCravadas ? 'REIS DA CRAVADA · ' : ''}
          {firstPos}º ao {lastPos}º lugar
        </p>
      </div>

      {/* Lista de posições */}
      <div className="px-12 pb-12 space-y-3">
        {profiles.map((profile, index) => {
          const isEven = index % 2 === 0;
          return (
            <div
              key={profile.position}
              className="rounded-lg p-4 flex items-center gap-5"
              style={{
                background: isEven
                  ? 'rgba(255, 255, 255, 0.05)'
                  : 'rgba(255, 255, 255, 0.03)',
                backdropFilter: 'blur(8px)',
              }}
            >
              {/* Posição */}
              <div className="flex items-center justify-center w-14">
                <span
                  className="text-[#94A3B8] font-bold text-lg"
                  style={{ fontFamily: 'Rajdhani, sans-serif' }}
                >
                  {profile.position}º
                </span>
              </div>

              {/* Avatar */}
              <Avatar className="w-12 h-12 border border-white/20">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="text-white text-sm font-bold bg-white/20">
                  {getInitials(profile.username)}
                </AvatarFallback>
              </Avatar>

              {/* Nome com linha guia */}
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <div
                  className="text-white font-medium text-base truncate"
                  style={{ fontFamily: 'Rajdhani, sans-serif' }}
                >
                  {profile.username}
                </div>
                <div className="flex-1 border-b border-dotted border-[#334155] h-0" />
              </div>

              {/* Pontos e Cravadas */}
              <div className="flex items-center gap-2">
                {showCravadas ? (
                  <>
                    <Trophy className="w-5 h-5 text-[#94A3B8]" />
                    <span className="text-[#94A3B8] font-bold text-lg">
                      {profile.exact_matches}
                    </span>
                  </>
                ) : (
                  <div className="flex flex-col items-end">
                    <span className="text-[#94A3B8] font-bold text-xl">
                      {profile.total_points}
                    </span>
                    <div className="flex items-center gap-1.5 text-amber-400 text-sm font-semibold">
                      <Trophy className="w-3.5 h-3.5" />
                      <span>{profile.exact_matches}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rodapé */}
      <div className="pb-10 px-12 text-center">
        <div className="text-[#94A3B8] text-xs" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
          <p className="mb-2">{totalParticipants} jogadores no total</p>
          bolao-mundial.com
        </div>
      </div>
    </div>
  );
}
