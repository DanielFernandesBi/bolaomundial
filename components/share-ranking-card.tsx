'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SHARE, ShareTopBar, ShareWordmark, positionColor } from '@/components/share-chrome';

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

  // §16: sem medalhas de emoji. A posição vira o próprio número, grande, na cor
  // do pódio — que é o que se lê à distância na miniatura do WhatsApp.
  const cor = positionColor(position);

  const formatMoney = (value: number): string =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const temDinheiro = totalMoney !== undefined && totalMoney > 0;

  const rotuloStyle: React.CSSProperties = {
    color: SHARE.faint,
    fontSize: '10px',
    letterSpacing: '0.18em',
  };

  const linha = (label: string, valor: string, corValor: string, ultima = false) => (
    <div
      className="flex items-center justify-between px-4 py-3"
      style={ultima ? undefined : { borderBottom: `1px solid ${SHARE.hairline}` }}
    >
      <span className="font-mono uppercase" style={rotuloStyle}>
        {label}
      </span>
      <span className="font-bold tabular-nums" style={{ color: corValor, fontSize: '22px' }}>
        {valor}
      </span>
    </div>
  );

  return (
    <div
      id="share-ranking-card"
      className="w-[400px] h-[680px] relative overflow-hidden"
      style={{ background: SHARE.bg }}
    >
      <ShareTopBar />

      {/* Marca e campeonato */}
      <div className="absolute top-6 left-0 right-0 flex flex-col items-center gap-2 px-7">
        <ShareWordmark />
        {rankingName && (
          <div
            className="truncate max-w-full text-center font-semibold"
            style={{ color: SHARE.muted, fontSize: '13px' }}
          >
            {rankingName}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center h-full px-7 pt-[104px] pb-[52px]">
        {/* Posição */}
        <div className="flex items-baseline justify-center gap-1">
          <span className="font-bold tabular-nums" style={{ color: cor, fontSize: '104px', lineHeight: 1 }}>
            {position}
          </span>
          <span className="font-bold" style={{ color: cor, fontSize: '34px' }}>
            º
          </span>
        </div>
        <div className="mt-1 font-mono uppercase" style={rotuloStyle}>
          Lugar
        </div>

        {/* Jogador */}
        <div className="mt-7 flex flex-col items-center gap-3">
          <Avatar className="w-[84px] h-[84px]" style={{ border: `2px solid ${cor}` }}>
            <AvatarImage src={userAvatarUrl || undefined} />
            <AvatarFallback
              style={{ background: SHARE.surface, color: SHARE.fg, fontSize: '26px', fontWeight: 700 }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          <div
            className="truncate max-w-[300px] text-center font-bold"
            style={{ color: SHARE.fg, fontSize: '21px' }}
          >
            {username}
          </div>
        </div>

        {/* Números */}
        <div
          className="w-full mt-7 overflow-hidden"
          style={{ background: SHARE.surface, border: `1px solid ${SHARE.hairline}`, borderRadius: '16px' }}
        >
          {linha('Pontos', totalPoints.toLocaleString('pt-BR'), SHARE.fg)}
          {/* A divisória de baixo só some na última linha — e a de dinheiro
              nem sempre existe. */}
          {linha('Cravadas', String(exactMatches), SHARE.amber, !temDinheiro)}
          {temDinheiro && linha('Dinheiro', formatMoney(totalMoney!), SHARE.money, true)}
        </div>
      </div>

      {/* Rodapé */}
      <div className="absolute bottom-5 left-0 right-0 text-center">
        <div className="font-mono" style={{ color: SHARE.faint, fontSize: '10px', letterSpacing: '0.1em' }}>
          bolao-mundial.com
        </div>
      </div>
    </div>
  );
}
