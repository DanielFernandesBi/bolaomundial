'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ShareMatchCard } from '@/components/share-match-card';
import { shareAsImage } from '@/lib/shareUtils';
import { getFlagUrl } from '@/lib/utils/flags';
import { scoreTier, tierBadge, bonusBadge } from '@/lib/scoring-ui';

interface HistoryItem {
  match_id: number;
  team_home: string;
  team_away: string;
  home_iso: string | null;
  away_iso: string | null;
  score_home: number | null;
  score_away: number | null;
  is_knockout?: boolean;
  has_extra_time?: boolean;
  extra_time_result?: 'home' | 'draw' | 'away' | null;
  pen_home?: number | null;
  pen_away?: number | null;
  pen_winner?: 'home' | 'away' | null;
  pred_home: number;
  pred_away: number;
  pred_extra_result?: 'home' | 'draw' | 'away' | null;
  pred_pen_home?: number | null;
  pred_pen_away?: number | null;
  pred_pen_winner?: 'home' | 'away' | null;
  points_earned: number;
  points_regular?: number;
  points_extra?: number;
  points_pen?: number;
}

interface HistoryListProps {
  history: HistoryItem[];
  userAvatarUrl?: string | null;
  username: string;
}

// Etiqueta da pontuação regular (tempo normal) — mesma lógica dos cards de "Encerradas"
function regularBadge(pts: number) {
  if (pts === 0) return null;
  let text = `+${pts} pts`;
  if (pts === 30) { text = `+${pts} Cravada!`; }
  else if (pts === 17) { text = `+${pts} Vencedor + Gols`; }
  else if (pts === 10 || pts === 9) { text = `+${pts} Vencedor`; }
  else if (pts === 3) { text = `+${pts} Consolação`; }
  return (
    <span className={`${tierBadge[scoreTier(pts)]} px-3 py-1 rounded-full text-xs`}>{text}</span>
  );
}

export function HistoryList({ history, userAvatarUrl, username }: HistoryListProps) {
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handleShare = async (match: HistoryItem) => {
    setSharingId(match.match_id);
    setToast(null);

    try {
      const cardId = `share-card-${match.match_id}`;
      
      // Aguardar um frame para garantir que o card está renderizado
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Gerar e compartilhar imagem
      await shareAsImage(cardId, `bolao-cravada-${match.match_id}.png`);
      
      setToast('Imagem gerada! Compartilhe com a galera 🎉');
      setTimeout(() => setToast(null), 3000);
    } catch (error: any) {
      setToast(error.message || 'Erro ao gerar imagem');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSharingId(null);
    }
  };

  if (history.length === 0) {
    return (
      <div className="text-muted-foreground text-center py-8">
        Nenhum palpite finalizado ainda.
      </div>
    );
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-foreground px-4 py-3 rounded-md shadow-lg">
          {toast}
        </div>
      )}

      {/* Cards ocultos para compartilhamento */}
      <div style={{ position: 'fixed', left: '-9999px', top: '0', pointerEvents: 'none' }}>
        {history.map((match) => {
          const cardId = `share-card-${match.match_id}`;
          return (
            <ShareMatchCard
              key={cardId}
              teamHome={match.team_home}
              teamAway={match.team_away}
              homeIso={match.home_iso}
              awayIso={match.away_iso}
              scoreHome={match.score_home}
              scoreAway={match.score_away}
              predHome={match.pred_home}
              predAway={match.pred_away}
              pointsEarned={match.points_earned}
              pointsRegular={match.points_regular}
              userAvatarUrl={userAvatarUrl}
              username={username}
              cardId={cardId}
            />
          );
        })}
      </div>

      <div className="space-y-3">
        {history.map((match) => {
          const ptsExtra = match.points_extra ?? 0;
          const ptsPen = match.points_pen ?? 0;
          // Fallback p/ palpites antigos sem o detalhamento salvo: usa o total como regular
          const ptsRegular =
            (match.points_regular ?? 0) ||
            Math.max(0, match.points_earned - ptsExtra - ptsPen);
          const hasNoPoints = match.points_earned === 0;
          const extraResultLabel = (r: 'home' | 'draw' | 'away' | null | undefined) => {
            if (r === 'home') return `${match.team_home} vence`;
            if (r === 'away') return `${match.team_away} vence`;
            if (r === 'draw') return 'Empate';
            return '—';
          };
          const penWinnerLabel = (w: 'home' | 'away' | null | undefined) =>
            w === 'home' ? match.team_home : w === 'away' ? match.team_away : '—';
          const clubsPen = match.has_extra_time === false;
          return (
            <Card
              key={match.match_id}
              className="bg-card border-border"
            >
              <CardContent className="p-4">
                {/* Cabeçalho: Confronto */}
                <div className="flex items-center justify-center gap-3 mb-4">
                  {/* Time Casa */}
                  <div className="flex flex-col items-center gap-2 flex-1">
                    {match.home_iso && (
                      match.home_iso.toLowerCase().startsWith('http') ? (
                        <img
                          src={match.home_iso}
                          alt={match.team_home}
                          className="w-12 h-12 rounded object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <Image
                          src={getFlagUrl(match.home_iso)}
                          alt={match.team_home}
                          width={48}
                          height={48}
                          className="w-12 h-auto rounded"
                        />
                      )
                    )}
                    <span className="text-foreground text-sm font-semibold text-center truncate w-full">
                      {match.team_home}
                    </span>
                  </div>

                  {/* Placar Real */}
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-foreground font-bold text-2xl">
                      {match.score_home ?? '-'} x {match.score_away ?? '-'}
                    </div>
                    <div className="text-muted-foreground text-xs">Placar Real</div>
                  </div>

                  {/* Time Visitante */}
                  <div className="flex flex-col items-center gap-2 flex-1">
                    {match.away_iso && (
                      match.away_iso.toLowerCase().startsWith('http') ? (
                        <img
                          src={match.away_iso}
                          alt={match.team_away}
                          className="w-12 h-12 rounded object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <Image
                          src={getFlagUrl(match.away_iso)}
                          alt={match.team_away}
                          width={48}
                          height={48}
                          className="w-12 h-auto rounded"
                        />
                      )
                    )}
                    <span className="text-foreground text-sm font-semibold text-center truncate w-full">
                      {match.team_away}
                    </span>
                  </div>
                </div>

                {/* Resultado real de prorrogação/pênaltis (mata-mata) */}
                {match.is_knockout && (match.extra_time_result || match.pen_home != null || match.pen_winner) && (
                  <div className="text-muted-foreground text-xs text-center mb-3 space-y-0.5">
                    {match.extra_time_result && (
                      <div>Prorrogação: {extraResultLabel(match.extra_time_result)}</div>
                    )}
                    {clubsPen
                      ? match.pen_winner && <div>Pênaltis: {penWinnerLabel(match.pen_winner)}</div>
                      : match.pen_home != null && match.pen_away != null && (
                          <div>Pênaltis: {match.pen_home} x {match.pen_away}</div>
                        )}
                  </div>
                )}

                {/* Separador */}
                <div className="border-t border-border pt-3 space-y-3">
                  {/* Seu Palpite */}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">Seu Palpite</span>
                    <div className="flex flex-col items-end">
                      <span className="text-foreground font-semibold text-lg">
                        {match.pred_home} x {match.pred_away}
                      </span>
                      {match.is_knockout && match.pred_extra_result && (
                        <span className="text-muted-foreground text-xs">
                          Prorrogação: {extraResultLabel(match.pred_extra_result)}
                        </span>
                      )}
                      {match.is_knockout && !clubsPen && match.pred_pen_home != null && match.pred_pen_away != null && (
                        <span className="text-muted-foreground text-xs">
                          Pênaltis: {match.pred_pen_home} x {match.pred_pen_away}
                        </span>
                      )}
                      {match.is_knockout && clubsPen && match.pred_pen_winner && (
                        <span className="text-muted-foreground text-xs">
                          Pênaltis: {penWinnerLabel(match.pred_pen_winner)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pontos e Etiquetas */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground text-sm mb-1">Pontuação</span>
                      <div
                        className={`font-bold text-xl ${
                          hasNoPoints ? 'text-muted-foreground' : 'text-primary'
                        }`}
                      >
                        +{match.points_earned} pts
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-muted-foreground text-sm mb-1">Tipo</span>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {hasNoPoints ? (
                          <span className={`${tierBadge.none} px-3 py-1 rounded-full text-xs`}>
                            Sem pontos
                          </span>
                        ) : (
                          <>
                            {regularBadge(ptsRegular)}
                            {ptsExtra > 0 && (
                              <span className={`${bonusBadge} px-3 py-1 rounded-full text-xs`}>
                                +{ptsExtra} Prorrogação
                              </span>
                            )}
                            {ptsPen > 0 && (
                              <span className={`${bonusBadge} px-3 py-1 rounded-full text-xs`}>
                                +{ptsPen} Pênaltis
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Botão de Compartilhar */}
                  {match.points_earned > 0 && (
                    <div className="pt-2 border-t border-border">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleShare(match)}
                        disabled={sharingId === match.match_id}
                        className="w-full text-primary border-primary hover:bg-primary/10"
                      >
                        {sharingId === match.match_id ? (
                          'Gerando imagem...'
                        ) : (
                          <>
                            <Share2 className="w-4 h-4 mr-2" />
                            Compartilhar
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

