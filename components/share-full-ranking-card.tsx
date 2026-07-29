'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface Profile {
  position: number;
  username: string;
  avatar_url: string | null;
  total_points: number;
  exact_matches: number;
}

interface ShareFullRankingCardProps {
  profiles: Profile[];
  tournamentName?: string;
  isGeneralRanking?: boolean;
  showCravadas?: boolean;
  cardId?: string;
}

export function ShareFullRankingCard({
  profiles,
  tournamentName,
  isGeneralRanking = false,
  showCravadas = false,
  cardId = 'share-full-ranking-card',
}: ShareFullRankingCardProps) {
  const getInitials = (name: string): string =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const splitIndex = Math.floor(profiles.length / 2);
  const leftColumn = profiles.slice(0, splitIndex);
  const rightColumn = profiles.slice(splitIndex);

  const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const now = new Date();
  const updatedAt = `${String(now.getDate()).padStart(2, '0')} ${months[now.getMonth()]} ${now.getFullYear()} - ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const titleLine1 = isGeneralRanking
    ? 'CLASSIFICAÇÃO GERAL CONSOLIDADA'
    : `CLASSIFICAÇÃO ${(tournamentName || 'RANKING').toUpperCase()}`;

  const leftFirst = leftColumn[0]?.position ?? 1;
  const leftLast = leftColumn[leftColumn.length - 1]?.position ?? splitIndex;
  const rightFirst = rightColumn[0]?.position ?? splitIndex + 1;
  const rightLast = rightColumn[rightColumn.length - 1]?.position ?? profiles.length;

  const getCardStyle = (position: number, isLanterna: boolean): React.CSSProperties => {
    if (isLanterna) {
      return {
        background: 'linear-gradient(135deg, #2B0A0A 0%, #5C1A1E 100%)',
        border: '2px solid #EF4444',
        boxShadow: '0 0 14px rgba(239, 68, 68, 0.55)',
        borderRadius: '14px',
      };
    }
    if (position === 1) {
      return {
        background: 'linear-gradient(135deg, #FCE9A8 0%, #F4CE6E 100%)',
        border: '2px solid #C9950A',
        boxShadow: '0 0 14px rgba(212, 160, 23, 0.45)',
        borderRadius: '14px',
      };
    }
    if (position === 2) {
      return {
        background: 'linear-gradient(135deg, #ECECF0 0%, #C9CCD3 100%)',
        border: '2px solid #9EA5B0',
        boxShadow: '0 0 10px rgba(158, 165, 176, 0.35)',
        borderRadius: '14px',
      };
    }
    if (position === 3) {
      return {
        background: 'linear-gradient(135deg, #F5D6C2 0%, #E6B295 100%)',
        border: '2px solid #B07050',
        boxShadow: '0 0 10px rgba(176, 112, 80, 0.35)',
        borderRadius: '14px',
      };
    }
    return {
      background: '#FFFFFF',
      border: '1px solid #E4E8EF',
      boxShadow: '0 2px 6px rgba(0,0,0,0.07)',
      borderRadius: '14px',
    };
  };

  const renderCard = (profile: Profile, key: string, isLanterna: boolean) => {
    const cardStyle = getCardStyle(profile.position, isLanterna);
    const mainValue = showCravadas ? profile.exact_matches : profile.total_points;

    const positionColor = profile.position <= 3 ? '#4A5568' : '#64748B';
    const nameColor = isLanterna ? '#FFFFFF' : '#1E293B';
    const mainValueColor = isLanterna ? '#F87171' : '#1E293B';
    const trophyColor = isLanterna ? '#F87171' : '#B45309';

    const avatarFallbackBg =
      isLanterna ? '#7F1D1D'
      : profile.position === 1 ? '#C9950A'
      : profile.position === 2 ? '#8A909A'
      : profile.position === 3 ? '#A06040'
      : '#8A909A';

    return (
      <div
        key={key}
        className="flex items-center gap-2 px-3 py-2 mb-1.5"
        style={cardStyle}
      >
        {/* Posição */}
        <div className="w-7 flex-shrink-0 text-center">
          {isLanterna ? (
            <span style={{ fontSize: '16px' }}>🏮</span>
          ) : profile.position === 1 ? (
            <span style={{ fontSize: '16px' }}>👑</span>
          ) : (
            <span className="font-bold" style={{ fontSize: '12px', color: positionColor }}>
              {profile.position}º
            </span>
          )}
        </div>

        {/* Avatar */}
        <Avatar
          className="flex-shrink-0"
          style={{
            width: '38px',
            height: '38px',
            border: isLanterna ? '1.5px solid #EF4444' : '1.5px solid rgba(0,0,0,0.12)',
          }}
        >
          <AvatarImage src={profile.avatar_url || undefined} />
          <AvatarFallback
            style={{
              background: avatarFallbackBg,
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            {getInitials(profile.username)}
          </AvatarFallback>
        </Avatar>

        {/* Nome */}
        <div className="flex-1 min-w-0">
          {isLanterna && (
            <div
              className="font-bold uppercase tracking-wide leading-none mb-0.5"
              style={{ color: '#EF4444', fontSize: '9px' }}
            >
              LANTERNA ({profile.position}º)
            </div>
          )}
          <div
            className="font-semibold truncate"
            style={{ color: nameColor, fontSize: '13px' }}
          >
            {profile.username}
          </div>
        </div>

        {/* Pontuação */}
        <div className="flex-shrink-0 text-right">
          <div
            className="font-black leading-none"
            style={{ color: mainValueColor, fontSize: '20px' }}
          >
            {mainValue}
          </div>
          {!showCravadas && (
            <div
              className="leading-none mt-0.5"
              style={{ color: trophyColor, fontSize: '10px', fontWeight: 600 }}
            >
              🏆 {profile.exact_matches}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      id={cardId}
      className="relative overflow-hidden"
      style={{
        width: '1080px',
        background: 'linear-gradient(180deg, #EEF1F7 0%, #FFFFFF 55%)',
        border: '2px solid #D4D9E5',
        borderRadius: '24px',
        padding: '36px 40px 60px',
      }}
    >
      {/* Marcas d'água decorativas (losangos) */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ opacity: 0.055 }}
      >
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${(i % 6) * 18 - 2}%`,
              top: `${Math.floor(i / 6) * 22 - 1}%`,
              width: '52px',
              height: '52px',
              border: '1.5px solid #1E293B',
              transform: 'rotate(45deg)',
            }}
          />
        ))}
      </div>

      {/* Cabeçalho */}
      <div className="relative z-10 text-center mb-6">
        <div
          className="font-black uppercase leading-tight"
          style={{ color: '#1E293B', fontSize: '26px', letterSpacing: '0.06em' }}
        >
          {titleLine1}
        </div>
        <div
          className="font-black uppercase leading-tight mt-1"
          style={{ color: '#1E293B', fontSize: '19px', letterSpacing: '0.06em' }}
        >
          ARENA DE BOLÕES
        </div>
      </div>

      {/* Duas colunas */}
      <div className="relative z-10 flex">
        {/* Coluna esquerda */}
        <div className="flex-1 pr-4">
          <div className="text-center mb-3">
            <span className="font-bold" style={{ color: '#1E293B', fontSize: '13px' }}>
              Folha 1{' '}
            </span>
            <span style={{ color: '#64748B', fontSize: '13px' }}>
              ({leftFirst}º ao {leftLast}º)
            </span>
          </div>
          {leftColumn.map((profile, idx) =>
            renderCard(profile, `left-${idx}`, false)
          )}
        </div>

        {/* Divisor vertical */}
        <div
          style={{
            width: '1px',
            background: '#D4D9E5',
            alignSelf: 'stretch',
            flexShrink: 0,
          }}
        />

        {/* Coluna direita */}
        <div className="flex-1 pl-4">
          <div className="text-center mb-3">
            <span className="font-bold" style={{ color: '#1E293B', fontSize: '13px' }}>
              Folha 2{' '}
            </span>
            <span style={{ color: '#64748B', fontSize: '13px' }}>
              ({rightFirst}º ao {rightLast}º)
            </span>
          </div>
          {rightColumn.map((profile, idx) => {
            const isLanterna = profiles.length > 3 && idx === rightColumn.length - 1;
            return renderCard(profile, `right-${idx}`, isLanterna);
          })}
        </div>
      </div>

      {/* Rodapé */}
      <div className="relative z-10 text-center mt-6">
        <div className="font-semibold" style={{ color: '#1E293B', fontSize: '14px' }}>
          bolao-mundial.com
        </div>
        <div className="mt-1" style={{ color: '#94A3B8', fontSize: '11px' }}>
          {profiles.length} participantes no total
        </div>
      </div>

      {/* Timestamp */}
      <div
        className="absolute"
        style={{ bottom: '14px', right: '20px', color: '#CBD5E1', fontSize: '9px' }}
      >
        Atualizado em: {updatedAt}
      </div>
    </div>
  );
}
