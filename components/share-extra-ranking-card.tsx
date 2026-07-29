'use client';

import { Trophy } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SHARE, ShareTopBar, ShareWordmark } from '@/components/share-chrome';

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
  const getInitials = (name: string): string =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const firstPos = profiles[0]?.position ?? 11;
  const lastPos = profiles[profiles.length - 1]?.position ?? firstPos;

  return (
    <div
      id={cardId}
      className="w-[1080px] relative overflow-hidden"
      style={{ background: SHARE.bg, minHeight: '400px' }}
    >
      <ShareTopBar height={6} />

      {/* Cabeçalho */}
      <div className="pt-12 pb-8 px-12 text-center">
        <ShareWordmark size={14} />
        <h2 className="mt-3 font-bold uppercase" style={{ color: SHARE.fg, fontSize: '36px', letterSpacing: '0.04em' }}>
          Classificação {isGeneralRanking ? 'geral' : tournamentName || 'ranking'}
        </h2>
        <p
          className="mt-2 font-mono uppercase"
          style={{ color: SHARE.faint, fontSize: '13px', letterSpacing: '0.18em' }}
        >
          {showCravadas ? 'Reis da cravada · ' : ''}
          {firstPos}º ao {lastPos}º lugar
        </p>
      </div>

      {/* Lista de posições */}
      <div className="px-12 pb-12 space-y-2">
        {profiles.map((profile, index) => (
          <div
            key={profile.position}
            className="rounded-xl px-5 py-3.5 flex items-center gap-5"
            style={{
              // Zebra sem backdrop-filter: o filtro é caro de rasterizar e o
              // html-to-image não garante o resultado.
              background: index % 2 === 0 ? SHARE.surface : SHARE.sunken,
              border: `1px solid ${SHARE.hairline}`,
            }}
          >
            {/* Posição */}
            <div className="w-14 flex-shrink-0 text-center">
              <span className="font-bold tabular-nums" style={{ color: SHARE.muted, fontSize: '20px' }}>
                {profile.position}º
              </span>
            </div>

            {/* Avatar */}
            <Avatar className="w-12 h-12 flex-shrink-0" style={{ border: `1px solid ${SHARE.hairline}` }}>
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback
                style={{ background: SHARE.bg, color: SHARE.muted, fontSize: '14px', fontWeight: 700 }}
              >
                {getInitials(profile.username)}
              </AvatarFallback>
            </Avatar>

            {/* Nome com linha guia */}
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <div className="font-semibold truncate" style={{ color: SHARE.fg, fontSize: '17px' }}>
                {profile.username}
              </div>
              <div className="flex-1 h-0" style={{ borderBottom: `1px dotted ${SHARE.hairline}` }} />
            </div>

            {/* Pontos e cravadas */}
            <div className="flex-shrink-0 text-right">
              {showCravadas ? (
                <div className="flex items-center gap-2" style={{ color: SHARE.amber }}>
                  <Trophy className="w-5 h-5" />
                  <span className="font-bold tabular-nums" style={{ fontSize: '20px' }}>
                    {profile.exact_matches}
                  </span>
                </div>
              ) : (
                <>
                  <div className="font-bold tabular-nums" style={{ color: SHARE.fg, fontSize: '22px', lineHeight: 1 }}>
                    {profile.total_points}
                  </div>
                  <div
                    className="flex items-center justify-end gap-1.5 mt-1"
                    style={{ color: SHARE.amber, fontSize: '13px', fontWeight: 600 }}
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    <span className="tabular-nums">{profile.exact_matches}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Rodapé */}
      <div className="pb-10 px-12 text-center">
        <p style={{ color: SHARE.muted, fontSize: '13px' }}>{totalParticipants} jogadores no total</p>
        <p
          className="mt-1.5 font-mono"
          style={{ color: SHARE.faint, fontSize: '11px', letterSpacing: '0.1em' }}
        >
          bolao-mundial.com
        </p>
      </div>
    </div>
  );
}
