'use client';

import { useState } from 'react';
import { Award, DollarSign, Share2 } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ShareRankingCard } from '@/components/share-ranking-card';
import { ShareFullRankingCard } from '@/components/share-full-ranking-card';
import { shareAsImage } from '@/lib/shareUtils';

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
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-3 rounded-md shadow-lg">
          {toast}
        </div>
      )}

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
            <Award className="w-8 h-8 text-amber-500" />
            <h1 className="text-4xl font-bold text-white">Ranking Geral</h1>
          </div>
          <p className="text-slate-400">
            Classificação geral de todos os jogadores por total de pontos
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleShareFullRanking}
          disabled={sharingFullRanking}
          className="text-amber-500 border-amber-500 hover:bg-amber-500/10"
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

      {/* Cards Mobile (md:hidden) */}
      <div className="md:hidden space-y-3">
        {profiles.length > 0 ? (
          profiles.map((profile, index) => {
            const position = index + 1;
            const isTop3 = position <= 3;

            return (
              <Card
                key={profile.id}
                className={`bg-slate-900 border-slate-800 ${
                  isTop3 ? 'border-amber-500/50 bg-amber-500/5' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 flex-1">
                      <span className={`font-bold text-lg min-w-[40px] ${
                        isTop3 ? 'text-amber-500' : 'text-slate-400'
                      }`}>
                        {position}º
                      </span>
                      <Avatar className="w-12 h-12 border-2 border-slate-700">
                        <AvatarImage src={profile.avatar_url || undefined} />
                        <AvatarFallback className="bg-slate-800 text-white">
                          {getInitials(profile.username)}
                        </AvatarFallback>
                      </Avatar>
                      <Link 
                        href={`/profile/${profile.id}`}
                        className="text-white font-semibold flex-1 truncate hover:text-amber-500 transition-colors"
                      >
                        {profile.username}
                      </Link>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleShareRanking(profile, position)}
                      disabled={sharingId === profile.id}
                      className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                    >
                      {sharingId === profile.id ? (
                        'Gerando...'
                      ) : (
                        <Share2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-sm">Pontos</span>
                      <span className="text-amber-500 font-bold text-lg">
                        {profile.total_points.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-sm">Dinheiro</span>
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4 text-amber-500" />
                        <span className="text-amber-500 font-semibold">
                          {formatMoney(profile.total_money)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-8 text-center text-slate-400">
              Nenhum jogador encontrado.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabela Desktop (hidden md:block) */}
      <Card className="bg-slate-900 border-slate-800 hidden md:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead className="text-slate-300 w-16">#</TableHead>
                  <TableHead className="text-slate-300">Jogador</TableHead>
                  <TableHead className="text-slate-300 text-right">Dinheiro Total</TableHead>
                  <TableHead className="text-slate-300 text-right">Pontos Totais</TableHead>
                  <TableHead className="text-slate-300 text-right">Cravadas Totais</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.length > 0 ? (
                  profiles.map((profile, index) => {
                    const position = index + 1;
                    const isTop3 = position <= 3;

                    return (
                      <TableRow
                        key={profile.id}
                        className={`border-slate-800 ${
                          isTop3
                            ? 'bg-amber-500/10 hover:bg-amber-500/20'
                            : 'hover:bg-slate-800/50'
                        }`}
                      >
                        <TableCell className="text-slate-300 font-bold">
                          {position}º
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-10 h-10 border-2 border-slate-700">
                              <AvatarImage
                                src={profile.avatar_url || undefined}
                              />
                              <AvatarFallback className="bg-slate-800 text-white">
                                {getInitials(profile.username)}
                              </AvatarFallback>
                            </Avatar>
                            <Link
                              href={`/profile/${profile.id}`}
                              className="text-white font-medium hover:text-amber-500 transition-colors"
                            >
                              {profile.username}
                            </Link>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleShareRanking(profile, position)}
                              disabled={sharingId === profile.id}
                              className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 ml-auto"
                            >
                              {sharingId === profile.id ? (
                                'Gerando...'
                              ) : (
                                <Share2 className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <DollarSign className="w-5 h-5 text-amber-500" />
                            <span className="text-amber-500 font-bold text-lg">
                              {formatMoney(profile.total_money)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-300 text-right">
                          {profile.total_points.toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell className="text-slate-300 text-right">
                          {profile.total_exact_matches}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                      Nenhum jogador encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Legenda */}
      <div className="mt-6 text-slate-400 text-sm">
        <p>
          💰 <strong>Dinheiro Total:</strong> Soma de todos os prêmios ganhos em todos os torneios.
        </p>
      </div>
    </div>
  );
}
