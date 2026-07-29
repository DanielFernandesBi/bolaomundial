'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Trophy, Share2, CalendarDays, TrendingUp } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShareRankingCard } from '@/components/share-ranking-card';
import { ShareFullRankingCard } from '@/components/share-full-ranking-card';
import { shareAsImage } from '@/lib/shareUtils';
import { Toast } from '@/components/toast';
import { SimuladorContent } from '@/app/[tournament]/simulador/simulador-content';
import { RankingGeralContent } from '@/app/ranking-geral/ranking-geral-content';
import type { GeneralRankingProfile } from '@/app/ranking-geral/load';

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
  generalProfiles?: GeneralRankingProfile[];
  tournamentName?: string;
  tournamentSlug?: string;
  dailyEntries?: DailyEntry[];
  hasMatchesToday?: boolean;
  todayLabel?: string;
}

export function RankingContent({ profiles, currentUserId, generalProfiles = [], tournamentName, tournamentSlug, dailyEntries = [], hasMatchesToday = false, todayLabel }: RankingContentProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'cravadas' | 'daily' | 'projecao'>('general');
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [sharingFullRanking, setSharingFullRanking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Escopo: torneio (padrão) ou todos os bolões, renderizado aqui mesmo.
  const [escopo, setEscopo] = useState<'torneio' | 'geral'>('torneio');

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

  // Barra fixa "Você": aparece quando a sua linha sai da viewport e some
  // quando ela volta — nunca as duas ao mesmo tempo. É só apresentação; não
  // altera dado nenhum do ranking.
  const myRowRef = useRef<HTMLDivElement | null>(null);
  const [myRowVisible, setMyRowVisible] = useState(true);

  useEffect(() => {
    const el = myRowRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setMyRowVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => setMyRowVisible(entry.isIntersecting),
      { rootMargin: '-8px 0px -88px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [activeTab, currentUserId, sortedProfiles.length]);

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
      
      setToast('Imagem gerada! Compartilhe com a galera');
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
      setToast('Ranking completo gerado! Compartilhe com a galera');
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
      
      {/* Seletor de escopo. Renderiza na própria tela (decisão do Daniel); a
          rota /ranking-geral continua existindo e respondendo. */}
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-[12px] border border-border bg-card p-1">
        {([['torneio', tournamentName], ['geral', 'Todos os bolões']] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setEscopo(v)}
            className={`flex h-9 items-center justify-center rounded-[9px] px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              escopo === v
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {escopo === 'geral' && (
        <RankingGeralContent profiles={generalProfiles} currentUserId={currentUserId} embedded />
      )}

      {escopo === 'torneio' && (
      <div className="mb-8 flex items-center justify-between gap-4 flex-wrap">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'general' | 'cravadas' | 'daily' | 'projecao')}>
          <TabsList className="grid auto-cols-fr grid-flow-col gap-1 rounded-[12px] border border-border bg-card p-1">
            <TabsTrigger
              value="general"
              className="h-9 rounded-[9px] text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Pontos
            </TabsTrigger>
            <TabsTrigger
              value="cravadas"
              className="h-9 rounded-[9px] text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Cravadas
            </TabsTrigger>
            <TabsTrigger
              value="daily"
              className="flex h-9 items-center gap-1.5 rounded-[9px] text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Hoje {todayLabel ? `(${todayLabel})` : ''}
            </TabsTrigger>
            <TabsTrigger
              value="projecao"
              className="flex h-9 items-center gap-1.5 rounded-[9px] text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              Projeção
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {activeTab !== 'projecao' && (
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
        )}
      </div>
      )}

      {/* Aba Projeção: o simulador passa a morar aqui. A rota
          /[tournament]/simulador continua existindo e funcionando — só o
          caminho de navegação mudou. O componente carrega os próprios dados,
          e o Radix só o monta quando a aba é aberta. */}
      {escopo === 'torneio' && activeTab === 'projecao' && (
        <SimuladorContent tournamentSlug={tournamentSlug ?? ''} tournamentName={tournamentName ?? ''} />
      )}

      {/* Lista única, responsiva. Antes eram DOIS blocos com o mesmo conteúdo:
          cards md:hidden e tabela hidden md:block. */}
      {escopo === 'torneio' && activeTab !== 'daily' && activeTab !== 'projecao' && (
        <div className="space-y-2">
          {sortedProfiles.length > 0 ? (
            sortedProfiles.map((profile, index) => {
              const position = index + 1;
              const isMe = !!currentUserId && profile.id === currentUserId;
              const isTop3 = position <= 3;
              const row = isMe
                ? 'border-primary/45 bg-primary/10'
                : isTop3
                ? 'border-border bg-card'
                : 'border-hairline bg-surface-sunken';

              return (
                <div
                  key={profile.id}
                  ref={isMe ? myRowRef : undefined}
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
                      href={tournamentSlug ? `/${tournamentSlug}/desempenho/${profile.id}` : `/profile/${profile.id}`}
                      className="block truncate text-sm font-semibold text-foreground transition-colors hover:text-primary"
                    >
                      {profile.username}
                      {isMe && <span className="ml-1.5 text-[11px] font-normal text-primary">você</span>}
                    </Link>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {showCravadas
                        ? `${profile.total_points.toLocaleString('pt-BR')} pontos`
                        : `${profile.exact_matches} ${profile.exact_matches === 1 ? 'cravada' : 'cravadas'}`}
                    </p>
                  </div>

                  <span className="flex-shrink-0 text-base font-bold tabular-nums text-foreground">
                    {showCravadas ? profile.exact_matches : profile.total_points.toLocaleString('pt-BR')}
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
              Ainda não há participantes no ranking.
            </div>
          )}
        </div>
      )}

      {/* ── Aba: Mini-ranking do dia ──────────────────────────────────────────── */}
      {escopo === 'torneio' && activeTab === 'daily' && (
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
                      <p className="text-primary/70 text-xs">
                        {me.daily_points} pts hoje
                        {me.daily_exact > 0 ? ` · ${me.daily_exact} cravada${me.daily_exact > 1 ? 's' : ''}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Lista única do dia (antes: cards md:hidden + tabela desktop) */}
              <div className="space-y-2">
                {dailyEntries.map((entry, index) => {
                  const position = index + 1;
                  const isMe = entry.user_id === currentUserId;
                  const isTop3 = position <= 3;
                  const row = isMe
                    ? 'border-primary/45 bg-primary/10'
                    : isTop3
                    ? 'border-border bg-card'
                    : 'border-hairline bg-surface-sunken';
                  return (
                    <div
                      key={entry.user_id}
                      className={`flex items-center gap-3 rounded-[14px] border px-3 py-2.5 ${row}`}
                    >
                      <span
                        className={`w-7 flex-shrink-0 text-center text-[15px] font-bold tabular-nums ${
                          isTop3 || isMe ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      >
                        {position}
                      </span>
                      <Avatar className="h-9 w-9 flex-shrink-0 border border-border">
                        <AvatarImage src={entry.avatar_url || undefined} />
                        <AvatarFallback className="bg-muted text-xs text-foreground">
                          {getInitials(entry.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {entry.username}
                          {isMe && <span className="ml-1.5 text-[11px] font-normal text-primary">você</span>}
                        </p>
                        {entry.daily_exact > 0 && (
                          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Trophy className="h-3 w-3" />
                            {entry.daily_exact} {entry.daily_exact === 1 ? 'cravada' : 'cravadas'} hoje
                          </p>
                        )}
                      </div>
                      <span className="flex-shrink-0 text-base font-bold tabular-nums text-foreground">
                        {entry.daily_points}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}


      {/* Barra fixa "Você" — só quando a sua linha não está visível */}
      {(() => {
        if (myRowVisible) return null;
        if (escopo !== 'torneio') return null;
        if (activeTab === 'daily' || activeTab === 'projecao') return null;
        const idx = sortedProfiles.findIndex((pr) => pr.id === currentUserId);
        if (idx < 0) return null;
        const me = sortedProfiles[idx];
        return (
          <div
            className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-4"
            aria-hidden="true"
          >
            <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-[14px] border border-primary/45 bg-card/95 px-3 py-2.5 shadow-lg backdrop-blur">
              <span className="w-7 flex-shrink-0 text-center text-[15px] font-bold tabular-nums text-primary">
                {idx + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                {me.username} <span className="text-[11px] font-normal text-primary">você</span>
              </span>
              <span className="flex-shrink-0 text-base font-bold tabular-nums text-foreground">
                {showCravadas ? me.exact_matches : me.total_points.toLocaleString('pt-BR')}
              </span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
