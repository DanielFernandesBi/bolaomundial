'use client';

import { useState } from 'react';
import { Award, Share2 } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ShareRankingCard } from '@/components/share-ranking-card';
import { ShareFullRankingCard } from '@/components/share-full-ranking-card';
import { shareAsImage } from '@/lib/shareUtils';
import { Toast } from '@/components/toast';

interface GeneralRankingProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  total_money: number;
  total_points: number;
  total_exact_matches: number;
}

interface RankingGeralContentProps {
  profiles: GeneralRankingProfile[];
  currentUserId?: string;
}

export function RankingGeralContent({ profiles, currentUserId }: RankingGeralContentProps) {
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [sharingFullRanking, setSharingFullRanking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);


  function formatMoney(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  function getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  const handleShareRanking = async (profile: GeneralRankingProfile, position: number) => {
    setSharingId(profile.id);
    setToast(null);

    try {
      const cardId = `share-ranking-card-${profile.id}`;
      
      // Aguardar um frame para garantir que o card está renderizado
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Gerar e compartilhar imagem
      await shareAsImage(cardId, `bolao-ranking-geral-${profile.id}.png`);
      
      setToast('Imagem gerada! Compartilhe com a galera 🎉');
      setTimeout(() => setToast(null), 3000);
    } catch (error: any) {
      setToast(error.message || 'Erro ao gerar imagem');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSharingId(null);
    }
  };

  const handleShareFullRanking = async () => {
    setSharingFullRanking(true);
    setToast(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      await shareAsImage('share-full-ranking-card-geral', 'bolao-ranking-geral-completo.png');
      setToast('Ranking completo gerado! Compartilhe com a galera 🎉');
      setTimeout(() => setToast(null), 3000);
    } catch (error: any) {
      setToast(error.message || 'Erro ao gerar imagem');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSharingFullRanking(false);
    }
  };

  return (
    <div>
      {/* Toast */}
      <Toast message={toast} />

      {/* Cards ocultos para compartilhamento individual */}
      <div style={{ position: 'fixed', left: '-9999px', top: '0', pointerEvents: 'none' }}>
        {profiles.map((profile, index) => {
          const position = index + 1;
          return (
            <div key={`share-ranking-card-${profile.id}`} id={`share-ranking-card-${profile.id}`}>
              <ShareRankingCard
                position={position}
                username={profile.username}
                userAvatarUrl={profile.avatar_url}
                totalPoints={profile.total_points}
                exactMatches={profile.total_exact_matches}
                rankingName="Ranking Geral"
                totalMoney={profile.total_money}
              />
            </div>
          );
        })}
      </div>

      {/* Card oculto para compartilhamento do ranking completo */}
      <div style={{ position: 'fixed', left: '-9999px', top: '0', pointerEvents: 'none' }}>
        <ShareFullRankingCard
          profiles={profiles.map((profile, index) => ({
            position: index + 1,
            username: profile.username,
            avatar_url: profile.avatar_url,
            total_points: profile.total_points,
            exact_matches: profile.total_exact_matches,
          }))}
          isGeneralRanking={true}
          cardId="share-full-ranking-card-geral"
        />
      </div>

      {/* Cabeçalho com botão de compartilhar */}
      <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <Award className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">Ranking Geral</h1>
          </div>
          <p className="text-muted-foreground">
            Classificação geral de todos os jogadores por total de pontos
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleShareFullRanking}
          disabled={sharingFullRanking}
          className="text-primary border-primary hover:bg-primary/10"
        >
          {sharingFullRanking ? (
            'Gerando...'
          ) : (
            <>
              <Share2 className="w-4 h-4 mr-2" />
              Compartilhar Ranking
            </>
          )}
        </Button>
      </div>

      {/* Lista única, responsiva. Antes havia dois blocos: cards md:hidden e
          tabela hidden md:block, com o mesmo conteúdo mantido em dobro. */}
      <div className="space-y-2">
        {profiles.length > 0 ? (
          profiles.map((profile, index) => {
            const position = index + 1;
            const isMe = !!currentUserId && profile.id === currentUserId;
            const isTop3 = position <= 3;
            const hasPrize = Number(profile.total_money) > 0;

            // Três pesos: você, top 3, demais.
            const row = isMe
              ? 'border-primary/45 bg-primary/10'
              : isTop3
              ? 'border-border bg-card'
              : 'border-hairline bg-surface-sunken';

            return (
              <div
                key={profile.id}
                className={`flex items-center gap-3 rounded-[14px] border px-3 py-2.5 ${row}`}
              >
                <span
                  className={`w-7 flex-shrink-0 text-center text-[15px] font-bold tabular-nums ${
                    isMe || isTop3 ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {position}
                </span>

                <Avatar className="h-9 w-9 flex-shrink-0 border border-border">
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback className="bg-muted text-xs text-foreground">
                    {getInitials(profile.username)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/profile/${profile.id}`}
                    className="block truncate text-sm font-semibold text-foreground transition-colors hover:text-primary"
                  >
                    {profile.username}
                    {isMe && <span className="ml-1.5 text-[11px] font-normal text-primary">você</span>}
                  </Link>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {profile.total_exact_matches} {profile.total_exact_matches === 1 ? 'cravada' : 'cravadas'}
                    {' · '}
                    {hasPrize ? `${formatMoney(profile.total_money)} em prêmios` : 'sem prêmio ainda'}
                  </p>
                </div>

                <span className="flex-shrink-0 text-base font-bold tabular-nums text-foreground">
                  {profile.total_points.toLocaleString('pt-BR')}
                </span>

                {/* Irmão do link, nunca aninhado dentro dele */}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleShareRanking(profile, position)}
                  disabled={sharingId === profile.id}
                  aria-label={`Compartilhar a posição de ${profile.username}`}
                  className="h-9 w-9 flex-shrink-0 p-0 text-primary hover:bg-primary/10 hover:text-primary"
                >
                  {sharingId === profile.id ? '...' : <Share2 className="h-4 w-4" />}
                </Button>
              </div>
            );
          })
        ) : (
          <div className="rounded-[14px] border border-hairline bg-surface-sunken p-8 text-center text-muted-foreground">
            Nenhum jogador encontrado.
          </div>
        )}
      </div>

      {/* Legenda */}
      <div className="mt-6 text-muted-foreground text-sm">
        <p>
          <strong className="text-card-foreground">Dinheiro total:</strong> soma de todos os prêmios ganhos em todos os torneios.
        </p>
      </div>
    </div>
  );
}
