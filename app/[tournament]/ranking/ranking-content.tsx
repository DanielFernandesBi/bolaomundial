'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Trophy, Share2, CalendarDays } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShareRankingCard } from '@/components/share-ranking-card';
import { ShareFullRankingCard } from '@/components/share-full-ranking-card';
import { shareAsImage } from '@/lib/shareUtils';

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  total_points: number;
  exact_matches: number;
}

interface DailyEntry {
  user_id: string;
  username: string;
  avatar_url: string | null;
  daily_points: number;
  daily_exact: number;
}

interface RankingContentProps {
  profiles: Profile[];
  currentUserId?: string;
  tournamentName?: string;
  tournamentSlug?: string;
  dailyEntries?: DailyEntry[];
  hasMatchesToday?: boolean;
  todayLabel?: string;
}

export function RankingContent({ profiles, currentUserId, tournamentName, tournamentSlug, dailyEntries = [], hasMatchesToday = false, todayLabel }: RankingContentProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'cravadas' | 'daily'>('general');
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [sharingFullRanking, setSharingFullRanking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Ordenar perfis baseado na aba ativa
  const sortedProfiles = useMemo(() => {
    const sorted = [...profiles];
    if (activeTab === 'cravadas') {
      // Ordenar por exact_matches DESC, depois total_points DESC
      sorted.sort((a, b) => {
        if (b.exact_matches !== a.exact_matches) {
          return b.exact_matches - a.exact_matches;
        }
        return b.total_points - a.total_points;
      });
    } else {
      // Ordenar por total_points DESC, depois exact_matches DESC
      sorted.sort((a, b) => {
        if (b.total_points !== a.total_points) {
          return b.total_points - a.total_points;
        }
        return b.exact_matches - a.exact_matches;
      });
    }
    return sorted;
  }, [profiles, activeTab]);

  const showCravadas = activeTab === 'cravadas';


  function getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  const handleShareRanking = async (profile: Profile, position: number) => {
    setSharingId(profile.id);
    setToast(null);

    try {
      const cardId = `share-ranking-card-${profile.id}`;
      
      // Aguardar um frame para garantir que o card está renderizado
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Gerar e compartilhar imagem
      await shareAsImage(cardId, `bolao-ranking-${profile.id}.png`);
      
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
      await shareAsImage('share-full-ranking-card', `bolao-ranking-completo-${activeTab}.png`);
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
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-foreground px-4 py-3 rounded-md shadow-lg">
          {toast}
        </div>
      )}

      {/* Cards ocultos para compartilhamento individual */}
      <div style={{ position: 'fixed', left: '-9999px', top: '0', pointerEvents: 'none' }}>
        {sortedProfiles.map((profile, index) => {
          const position = index + 1;
          return (
            <div key={`share-ranking-card-${profile.id}`} id={`share-ranking-card-${profile.id}`}>
              <ShareRankingCard
                position={position}
                username={profile.username}
                userAvatarUrl={profile.avatar_url}
                totalPoints={profile.total_points}
                exactMatches={profile.exact_matches}
                rankingName={tournamentName}
              />
            </div>
          );
        })}
      </div>

      {/* Card oculto para compartilhamento do ranking completo */}
      <div style={{ position: 'fixed', left: '-9999px', top: '0', pointerEvents: 'none' }}>
        <ShareFullRankingCard
          profiles={sortedProfiles.map((profile, index) => ({
            position: index + 1,
            username: profile.username,
            avatar_url: profile.avatar_url,
            total_points: profile.total_points,
            exact_matches: profile.exact_matches,
          }))}
          tournamentName={tournamentName}
          showCravadas={showCravadas}
          cardId="share-full-ranking-card"
        />
      </div>
      
      {/* Tabs com botão de compartilhar */}
      <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'general' | 'cravadas' | 'daily')}>
          <TabsList className="bg-card">
            <TabsTrigger value="general">Classificação Geral</TabsTrigger>
            <TabsTrigger value="cravadas">Reis da Cravada</TabsTrigger>
            <TabsTrigger value="daily" className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Hoje {todayLabel ? `(${todayLabel})` : ''}
            </TabsTrigger>
          </TabsList>
        </Tabs>
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

      {/* Cards Mobile (md:hidden) — ranking geral e cravadas */}
      {activeTab !== 'daily' && <div className="md:hidden space-y-3">
        {sortedProfiles.length > 0 ? (
          sortedProfiles.map((profile, index) => {
            const position = index + 1;
            const isTop3 = position <= 3;

            return (
              <Card
                key={profile.id}
                className={`bg-card border-border ${
                  isTop3 ? 'border-primary/50 bg-primary/5' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 flex-1">
                      <span className={`font-bold text-lg min-w-[40px] ${
                        isTop3 ? 'text-primary' : 'text-muted-foreground'
                      }`}>
                        {position}º
                      </span>
                      <Avatar className="w-12 h-12 border-2 border-border">
                        <AvatarImage src={profile.avatar_url || undefined} />
                        <AvatarFallback className="bg-muted text-foreground">
                          {getInitials(profile.username)}
                        </AvatarFallback>
                      </Avatar>
                      <Link 
                        href={tournamentSlug ? `/${tournamentSlug}/desempenho/${profile.id}` : `/profile/${profile.id}`}
                        className="text-foreground font-semibold flex-1 truncate hover:text-primary transition-colors"
                      >
                        {profile.username}
                      </Link>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleShareRanking(profile, position)}
                      disabled={sharingId === profile.id}
                      className="text-primary hover:text-primary hover:bg-primary/10"
                    >
                      {sharingId === profile.id ? (
                        'Gerando...'
                      ) : (
                        <Share2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <div className="space-y-2 pt-2 border-t border-border">
                    {showCravadas ? (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Cravadas</span>
                        <div className="flex items-center gap-1">
                          <Trophy className="w-4 h-4 text-primary" />
                          <span className="text-primary font-bold text-lg">
                            {profile.exact_matches}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Pontos</span>
                        <span className="text-primary font-bold text-lg">
                          {profile.total_points.toLocaleString('pt-BR')}
                        </span>
                      </div>
                    )}
                    {!showCravadas && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground text-sm">Cravadas</span>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Trophy className="w-4 h-4" />
                          <span>{profile.exact_matches}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="p-8 text-center text-muted-foreground">
              Ainda não há participantes no ranking.
            </CardContent>
          </Card>
        )}
      </div>}

      {/* ── Aba: Mini-ranking do dia ──────────────────────────────────────────── */}
      {activeTab === 'daily' && (
        <div>
          {!hasMatchesToday ? (
            <div className="text-muted-foreground text-center py-16">
              <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-40" />
              <p className="text-lg mb-1">Nenhum jogo hoje.</p>
              <p className="text-sm">Volte nos dias de jogo para acompanhar o ranking do dia.</p>
            </div>
          ) : dailyEntries.length === 0 ? (
            <div className="text-muted-foreground text-center py-16">
              <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-40" />
              <p className="text-lg mb-1">Resultados ainda não registrados.</p>
              <p className="text-sm">O mini-ranking aparece após o admin lançar os placares de hoje.</p>
            </div>
          ) : (
            <>
              {/* Destaque da posição do usuário logado */}
              {currentUserId && (() => {
                const myPos = dailyEntries.findIndex(e => e.user_id === currentUserId);
                if (myPos === -1) return null;
                const me = dailyEntries[myPos];
                const pos = myPos + 1;
                const medal = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : null;
                return (
                  <div className="mb-6 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 flex items-center gap-3">
                    <span className="text-2xl font-bold text-primary">{pos}º</span>
                    {medal && <span className="text-2xl">{medal}</span>}
                    <div>
                      <p className="text-primary font-semibold text-sm">
                        {pos === 1
                          ? 'Você está liderando o dia!'
                          : `Hoje você está em ${pos}º lugar`}
                      </p>
                      <p className="text-amber-200/60 text-xs">
                        {me.daily_points} pts hoje
                        {me.daily_exact > 0 ? ` · ${me.daily_exact} cravada${me.daily_exact > 1 ? 's' : ''}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Cards Mobile */}
              <div className="md:hidden space-y-3">
                {dailyEntries.map((entry, index) => {
                  const position = index + 1;
                  const isMe = entry.user_id === currentUserId;
                  const isTop3 = position <= 3;
                  return (
                    <Card key={entry.user_id} className={`border ${
                      isMe
                        ? 'bg-primary/10 border-primary/50'
                        : isTop3
                        ? 'bg-card border-primary/30'
                        : 'bg-card border-border'
                    }`}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <span className={`font-bold text-lg min-w-[36px] ${isTop3 || isMe ? 'text-primary' : 'text-muted-foreground'}`}>
                          {position}º
                        </span>
                        <Avatar className="w-10 h-10 border-2 border-border">
                          <AvatarImage src={entry.avatar_url || undefined} />
                          <AvatarFallback className="bg-muted text-foreground">
                            {getInitials(entry.username)}
                          </AvatarFallback>
                        </Avatar>
                        <span className={`flex-1 font-semibold truncate ${isMe ? 'text-primary' : 'text-foreground'}`}>
                          {entry.username}{isMe ? ' (você)' : ''}
                        </span>
                        <div className="text-right">
                          <p className="text-primary font-bold">{entry.daily_points} pts</p>
                          {entry.daily_exact > 0 && (
                            <p className="text-muted-foreground text-xs flex items-center justify-end gap-1">
                              <Trophy className="w-3 h-3" />{entry.daily_exact}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Tabela Desktop */}
              <Card className="bg-card border-border hidden md:block">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="text-card-foreground w-16">#</TableHead>
                        <TableHead className="text-card-foreground">Jogador</TableHead>
                        <TableHead className="text-card-foreground text-center">Cravadas hoje</TableHead>
                        <TableHead className="text-card-foreground text-right">Pts hoje</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyEntries.map((entry, index) => {
                        const position = index + 1;
                        const isMe = entry.user_id === currentUserId;
                        const isTop3 = position <= 3;
                        return (
                          <TableRow key={entry.user_id} className={`border-border ${
                            isMe
                              ? 'bg-primary/15 hover:bg-primary/20'
                              : isTop3
                              ? 'bg-primary/5 hover:bg-primary/10'
                              : 'hover:bg-accent/50'
                          }`}>
                            <TableCell className={`font-bold ${isTop3 || isMe ? 'text-primary' : 'text-card-foreground'}`}>
                              {position}º
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="w-9 h-9 border-2 border-border">
                                  <AvatarImage src={entry.avatar_url || undefined} />
                                  <AvatarFallback className="bg-muted text-foreground">
                                    {getInitials(entry.username)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className={`font-medium ${isMe ? 'text-primary' : 'text-foreground'}`}>
                                  {entry.username}{isMe ? ' (você)' : ''}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {entry.daily_exact > 0 ? (
                                <div className="flex items-center justify-center gap-1 text-primary">
                                  <Trophy className="w-4 h-4" />
                                  <span className="font-bold">{entry.daily_exact}</span>
                                </div>
                              ) : (
                                <span className="text-[hsl(var(--faint))]">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-bold text-primary">
                              {entry.daily_points}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Tabela Desktop (hidden md:block) */}
      {activeTab !== 'daily' && <Card className="bg-card border-border hidden md:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-card-foreground w-16">#</TableHead>
                  <TableHead className="text-card-foreground">Jogador</TableHead>
                  <TableHead className="text-card-foreground text-center">Cravadas</TableHead>
                  <TableHead className="text-card-foreground text-right">Pontos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProfiles.length > 0 ? (
                  sortedProfiles.map((profile, index) => {
                    const position = index + 1;
                    const isTop3 = position <= 3;

                    return (
                      <TableRow
                        key={profile.id}
                        className={`border-border ${
                          isTop3
                            ? 'bg-primary/10 hover:bg-primary/20'
                            : 'hover:bg-accent/50'
                        }`}
                      >
                        <TableCell className="text-card-foreground font-bold">
                          {position}º
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-10 h-10 border-2 border-border">
                              <AvatarImage
                                src={profile.avatar_url || undefined}
                              />
                              <AvatarFallback className="bg-muted text-foreground">
                                {getInitials(profile.username)}
                              </AvatarFallback>
                            </Avatar>
                            <Link
                              href={tournamentSlug ? `/${tournamentSlug}/desempenho/${profile.id}` : `/profile/${profile.id}`}
                              className="text-foreground font-medium hover:text-primary transition-colors"
                            >
                              {profile.username}
                            </Link>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleShareRanking(profile, position)}
                              disabled={sharingId === profile.id}
                              className="text-primary hover:text-primary hover:bg-primary/10 ml-auto"
                            >
                              {sharingId === profile.id ? (
                                'Gerando...'
                              ) : (
                                <Share2 className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className={`flex items-center justify-center gap-1 ${
                            showCravadas 
                              ? 'text-primary' 
                              : 'text-muted-foreground'
                          }`}>
                            <Trophy className={`${showCravadas ? 'w-5 h-5' : 'w-4 h-4'}`} />
                            <span className={showCravadas ? 'font-bold text-lg' : ''}>
                              {profile.exact_matches}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-card-foreground text-right">
                          {profile.total_points.toLocaleString('pt-BR')}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Ainda não há participantes no ranking.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>}
    </div>
  );
}

