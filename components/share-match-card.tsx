'use client';

import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getFlagUrl } from '@/lib/utils/flags';
import { SHARE, ShareTopBar, ShareWordmark } from '@/components/share-chrome';

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
  pointsRegular?: number;
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
  pointsRegular,
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

  // Categoria pela pontuação do TEMPO NORMAL (o total pode incluir bônus de pênaltis)
  const cat = pointsRegular ?? pointsEarned;

  // §16: sem emoji. A mensagem passa a seguir a mesma escala de 3 níveis do
  // resto do app (lib/scoring-ui.ts), em vez de sete frases com sete cores.
  const tier: 'exact' | 'partial' | 'none' = cat >= 20 ? 'exact' : cat > 0 ? 'partial' : 'none';
  const message = tier === 'exact' ? 'Cravei o placar' : tier === 'partial' ? 'Mandei bem' : 'Participei';

  const badge =
    tier === 'exact'
      ? { background: SHARE.amber, color: '#1c1206', border: `1px solid ${SHARE.amber}` }
      : tier === 'partial'
      ? { background: 'rgba(251,191,36,0.14)', color: SHARE.amberSoft, border: `1px solid rgba(251,191,36,0.45)` }
      : { background: SHARE.surface, color: SHARE.muted, border: `1px solid ${SHARE.hairline}` };

  const bloco: React.CSSProperties = {
    background: SHARE.surface,
    border: `1px solid ${SHARE.hairline}`,
    borderRadius: '16px',
  };

  const rotulo = 'font-mono uppercase';
  const rotuloStyle: React.CSSProperties = {
    color: SHARE.faint,
    fontSize: '10px',
    letterSpacing: '0.18em',
  };

  const escudo = (iso: string | null, nome: string) => {
    if (!iso) return null;
    return iso.toLowerCase().startsWith('http') ? (
      <img src={iso} alt={nome} className="w-14 h-14 rounded object-contain" loading="lazy" />
    ) : (
      <Image src={getFlagUrl(iso)} alt={nome} width={56} height={56} className="w-14 h-auto rounded" />
    );
  };

  // Sem canto arredondado no elemento exportado: o html-to-image pinta o fundo
  // do PNG de branco (lib/shareUtils.ts), e o canto transparente sairia como uma
  // orelha branca sobre o fundo escuro. O raio fica só nos blocos internos.
  return (
    <div
      id={cardId}
      className="w-[400px] h-[600px] relative overflow-hidden"
      style={{ background: SHARE.bg }}
    >
      <ShareTopBar />

      {/* Marca */}
      <div className="absolute top-6 left-0 right-0 flex justify-center">
        <ShareWordmark />
      </div>

      <div className="flex flex-col items-center h-full px-7 pt-[74px] pb-[52px]">
        {/* Autor e veredito */}
        <Avatar className="w-[72px] h-[72px]" style={{ border: `2px solid ${SHARE.amber}` }}>
          <AvatarImage src={userAvatarUrl || undefined} />
          <AvatarFallback
            style={{ background: SHARE.amber, color: '#1c1206', fontSize: '22px', fontWeight: 700 }}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="mt-3 text-center font-bold" style={{ color: SHARE.fg, fontSize: '24px' }}>
          {message}
        </div>
        <div className="mt-1 truncate max-w-full text-center" style={{ color: SHARE.muted, fontSize: '13px' }}>
          {username}
        </div>

        {/* Placar real */}
        <div className="w-full mt-5 p-4" style={bloco}>
          <div className={`${rotulo} text-center mb-3`} style={rotuloStyle}>
            Placar real
          </div>
          <div className="flex items-center justify-center gap-5">
            <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
              {escudo(homeIso, teamHome)}
              <div className="font-bold" style={{ color: SHARE.fg, fontSize: '28px', lineHeight: 1 }}>
                {scoreHome ?? '-'}
              </div>
              <div className="truncate max-w-full text-center" style={{ color: SHARE.muted, fontSize: '12px' }}>
                {teamHome}
              </div>
            </div>
            <div className="font-bold" style={{ color: SHARE.faint, fontSize: '20px' }}>
              ×
            </div>
            <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
              {escudo(awayIso, teamAway)}
              <div className="font-bold" style={{ color: SHARE.fg, fontSize: '28px', lineHeight: 1 }}>
                {scoreAway ?? '-'}
              </div>
              <div className="truncate max-w-full text-center" style={{ color: SHARE.muted, fontSize: '12px' }}>
                {teamAway}
              </div>
            </div>
          </div>
        </div>

        {/* Palpite */}
        <div className="w-full mt-3 p-4" style={bloco}>
          <div className={`${rotulo} text-center mb-2`} style={rotuloStyle}>
            Meu palpite
          </div>
          <div className="flex items-center justify-center gap-4">
            <span className="font-bold tabular-nums" style={{ color: SHARE.amber, fontSize: '34px', lineHeight: 1 }}>
              {predHome}
            </span>
            <span className="font-bold" style={{ color: SHARE.faint, fontSize: '20px' }}>
              ×
            </span>
            <span className="font-bold tabular-nums" style={{ color: SHARE.amber, fontSize: '34px', lineHeight: 1 }}>
              {predAway}
            </span>
          </div>
        </div>

        {/* Pontos */}
        <div
          className="mt-4 px-6 py-2.5 rounded-full font-bold tabular-nums"
          style={{ ...badge, fontSize: '19px' }}
        >
          +{pointsEarned} pontos
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
