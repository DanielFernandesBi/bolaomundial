'use client';

import { Trophy } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SHARE, ShareTopBar, ShareWordmark, positionColor } from '@/components/share-chrome';

interface Profile {
  position: number;
  username: string;
  avatar_url: string | null;
  total_points: number;
  exact_matches: number;
  /** Só usado no modo Prêmios. Opcional: quem não passa não muda de comportamento. */
  total_money?: number;
}

interface ShareFullRankingCardProps {
  profiles: Profile[];
  tournamentName?: string;
  isGeneralRanking?: boolean;
  showCravadas?: boolean;
  /** Ordenação por prêmios: o valor em destaque passa a ser o dinheiro. Sem
      isto, a aba Prêmios gerava uma imagem ordenada por dinheiro mas exibindo
      pontos — dois rankings diferentes na mesma arte. */
  showPrizes?: boolean;
  cardId?: string;
}

export function ShareFullRankingCard({
  profiles,
  tournamentName,
  isGeneralRanking = false,
  showCravadas = false,
  showPrizes = false,
  cardId = 'share-full-ranking-card',
}: ShareFullRankingCardProps) {
  const formatMoney = (v: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(v);
  const getInitials = (name: string): string =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const splitIndex = Math.floor(profiles.length / 2);
  const leftColumn = profiles.slice(0, splitIndex);
  const rightColumn = profiles.slice(splitIndex);

  const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  const now = new Date();
  const updatedAt = `${String(now.getDate()).padStart(2, '0')} ${months[now.getMonth()]} ${now.getFullYear()} - ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const criterio = showPrizes ? ' · por prêmios' : showCravadas ? ' · por cravadas' : '';
  const titulo =
    (isGeneralRanking
      ? 'Classificação geral consolidada'
      : `Classificação ${tournamentName || 'ranking'}`) + criterio;

  const leftFirst = leftColumn[0]?.position ?? 1;
  const leftLast = leftColumn[leftColumn.length - 1]?.position ?? splitIndex;
  const rightFirst = rightColumn[0]?.position ?? splitIndex + 1;
  const rightLast = rightColumn[rightColumn.length - 1]?.position ?? profiles.length;

  // §16: o card era claro e cada faixa do pódio tinha seu próprio gradiente
  // (ouro, prata, bronze) preenchendo a linha inteira. No fundo escuro isso vira
  // um destaque de contorno + numeral colorido: o mesmo recado, sem quatro
  // superfícies competindo pela atenção.
  const linhaStyle = (position: number, isLanterna: boolean): React.CSSProperties => {
    const base: React.CSSProperties = { borderRadius: '14px' };
    if (isLanterna) {
      return { ...base, background: 'rgba(248,113,113,0.10)', border: `1px solid rgba(248,113,113,0.50)` };
    }
    if (position === 1) {
      return { ...base, background: 'rgba(245,158,11,0.13)', border: `1px solid rgba(245,158,11,0.55)` };
    }
    if (position === 2) {
      return { ...base, background: 'rgba(203,213,225,0.09)', border: `1px solid rgba(203,213,225,0.38)` };
    }
    if (position === 3) {
      return { ...base, background: 'rgba(209,154,106,0.10)', border: `1px solid rgba(209,154,106,0.42)` };
    }
    return { ...base, background: SHARE.surface, border: `1px solid ${SHARE.hairline}` };
  };

  const renderCard = (profile: Profile, key: string, isLanterna: boolean) => {
    const mainValue = showPrizes
      ? formatMoney(profile.total_money ?? 0)
      : showCravadas
      ? profile.exact_matches
      : profile.total_points;
    const cor = positionColor(profile.position, isLanterna);
    const destaque = isLanterna || profile.position <= 3;

    return (
      <div key={key} className="flex items-center gap-2.5 px-3 py-2 mb-1.5" style={linhaStyle(profile.position, isLanterna)}>
        {/* Posição — sem coroa nem lanterna de emoji (§16) */}
        <div className="w-8 flex-shrink-0 text-center">
          <span className="font-bold tabular-nums" style={{ color: cor, fontSize: destaque ? '15px' : '13px' }}>
            {profile.position}º
          </span>
        </div>

        {/* Avatar */}
        <Avatar
          className="flex-shrink-0"
          style={{
            width: '38px',
            height: '38px',
            border: destaque ? `1.5px solid ${cor}` : `1px solid ${SHARE.hairline}`,
          }}
        >
          <AvatarImage src={profile.avatar_url || undefined} />
          <AvatarFallback
            style={{ background: SHARE.bg, color: SHARE.muted, fontSize: '12px', fontWeight: 700 }}
          >
            {getInitials(profile.username)}
          </AvatarFallback>
        </Avatar>

        {/* Nome */}
        <div className="flex-1 min-w-0">
          {isLanterna && (
            <div
              className="font-mono font-bold uppercase leading-none mb-1"
              style={{ color: SHARE.danger, fontSize: '8.5px', letterSpacing: '0.16em' }}
            >
              Lanterna
            </div>
          )}
          <div className="font-semibold truncate" style={{ color: SHARE.fg, fontSize: '13px' }}>
            {profile.username}
          </div>
        </div>

        {/* Pontuação */}
        <div className="flex-shrink-0 text-right">
          <div
            className="font-black leading-none tabular-nums"
            style={{ color: showPrizes ? SHARE.money : SHARE.fg, fontSize: showPrizes ? '15px' : '20px' }}
          >
            {mainValue}
          </div>
          {!showCravadas && !showPrizes && (
            <div
              className="flex items-center justify-end gap-1 mt-1 leading-none"
              style={{ color: SHARE.amber, fontSize: '10px', fontWeight: 600 }}
            >
              <Trophy style={{ width: '10px', height: '10px' }} />
              <span className="tabular-nums">{profile.exact_matches}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const faixa = (de: number, ate: number) => (
    <div className="text-center mb-3">
      <span
        className="font-mono uppercase"
        style={{ color: SHARE.faint, fontSize: '11px', letterSpacing: '0.18em' }}
      >
        {de}º ao {ate}º
      </span>
    </div>
  );

  return (
    <div
      id={cardId}
      className="relative overflow-hidden"
      style={{
        width: '1080px',
        background: SHARE.bg,
        padding: '42px 40px 60px',
      }}
    >
      <ShareTopBar height={6} />

      {/* Marcas d'água decorativas (losangos) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity: 0.05 }}>
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${(i % 6) * 18 - 2}%`,
              top: `${Math.floor(i / 6) * 22 - 1}%`,
              width: '52px',
              height: '52px',
              border: `1.5px solid ${SHARE.fg}`,
              transform: 'rotate(45deg)',
            }}
          />
        ))}
      </div>

      {/* Cabeçalho */}
      <div className="relative z-10 text-center mb-7">
        <ShareWordmark size={13} />
        <div className="mt-2.5 font-bold" style={{ color: SHARE.fg, fontSize: '30px', letterSpacing: '0.02em' }}>
          {titulo}
        </div>
      </div>

      {/* Duas colunas. "Folha 1 / Folha 2" saiu (§16): era vocabulário de
          impressão e não dizia nada ao jogador — a faixa de posições já diz. */}
      <div className="relative z-10 flex">
        <div className="flex-1 pr-5">
          {faixa(leftFirst, leftLast)}
          {leftColumn.map((profile, idx) => renderCard(profile, `left-${idx}`, false))}
        </div>

        <div style={{ width: '1px', background: SHARE.hairline, alignSelf: 'stretch', flexShrink: 0 }} />

        <div className="flex-1 pl-5">
          {faixa(rightFirst, rightLast)}
          {rightColumn.map((profile, idx) => {
            const isLanterna = profiles.length > 3 && idx === rightColumn.length - 1;
            return renderCard(profile, `right-${idx}`, isLanterna);
          })}
        </div>
      </div>

      {/* Rodapé */}
      <div className="relative z-10 text-center mt-7">
        <div className="font-mono" style={{ color: SHARE.muted, fontSize: '13px', letterSpacing: '0.1em' }}>
          bolao-mundial.com
        </div>
        <div className="mt-1.5" style={{ color: SHARE.faint, fontSize: '11px' }}>
          {profiles.length} participantes no total
        </div>
      </div>

      {/* Timestamp */}
      <div className="absolute" style={{ bottom: '14px', right: '20px', color: SHARE.hairline, fontSize: '9px' }}>
        Atualizado em: {updatedAt}
      </div>
    </div>
  );
}
