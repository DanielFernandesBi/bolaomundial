'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckCheck,
  Clock,
  Inbox,
  Link2Off,
  RefreshCw,
  Tags,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toast } from '@/components/toast';
import { competitionName } from '@/lib/competitions';
import {
  aplicarApelido,
  aplicarResultadoSugerido,
  aplicarTodosResultadosSugeridos,
  type LancamentoAutomatico,
  type ResultadoNaoPareado,
  type ResultadoSugerido,
} from './actions';

// ============================================================================
// Resultado sugerido pela API-Football.
//
// O botão manda só o ID da partida — o placar é relido no servidor. Nada do
// que aparece aqui é aceito de volta como verdade.
//
// A tela mostra os avisos ANTES do clique, não depois: placar invertido em
// relação ao nosso cadastro, prorrogação que este bolão não pontua, e
// divergência com o que já foi lançado.
//
// POR QUE ABAS: a lista era uma só, e o jogo lançado continuava nela — só
// trocava o botão por um "lançado". A cada rodada a tela crescia, e o que
// exigia ação ia afundando no meio do que já estava resolvido. Agora o que
// pede ação fica na primeira aba e o resto vira conferência.
//
// "Divergências" só existe quando há alguma. É de propósito: o aparecimento da
// aba é o aviso. Guardar uma divergência dentro de "Lançados" seria esconder
// um problema no arquivo.
// ============================================================================

function hora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Etiqueta({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'aviso' | 'neutro' | 'erro' | 'auto';
  icon: typeof Zap;
  children: React.ReactNode;
}) {
  const cores = {
    aviso: 'border-state-closing/40 bg-state-closing/10 text-state-closing',
    neutro: 'border-border bg-surface-sunken text-muted-foreground',
    erro: 'border-destructive/40 bg-destructive/10 text-destructive',
    auto: 'border-primary/40 bg-primary/10 text-primary',
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cores}`}
    >
      <Icon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-hairline bg-surface-sunken px-3 py-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

const ABA_TRIGGER =
  'flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-[9px] text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground sm:text-sm';

export function ResultadosSugeridos({
  sugestoes,
  ultimaSincronizacao,
  automaticos = [],
  naoPareados = [],
  tournamentSlug,
}: {
  sugestoes: ResultadoSugerido[];
  ultimaSincronizacao: string | null;
  automaticos?: LancamentoAutomatico[];
  naoPareados?: ResultadoNaoPareado[];
  tournamentSlug: string;
}) {
  const router = useRouter();
  const [aplicando, setAplicando] = useState<number | 'todos' | null>(null);
  const [mapeando, setMapeando] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  // Três conjuntos que não se sobrepõem. Divergente é sempre um jogo JÁ
  // lançado, então precisa sair de "Lançados" para não ser dado como resolvido.
  const pendentes = sugestoes.filter((s) => s.status !== 'FINISHED');
  const divergentes = sugestoes.filter((s) => s.divergente);
  const conferidos = sugestoes.filter((s) => s.status === 'FINISHED' && !s.divergente);

  const autoPorJogo = new Map(automaticos.map((a) => [Number(a.match_id), a.aplicado_em]));

  function avisar(message: string, tone: 'success' | 'error', ms = 4000) {
    setToast({ message, tone });
    setTimeout(() => setToast(null), ms);
  }

  async function aplicarUm(s: ResultadoSugerido) {
    setAplicando(Number(s.match_id));
    const r = await aplicarResultadoSugerido(Number(s.match_id), tournamentSlug);
    setAplicando(null);
    if ((r as any)?.error) return avisar((r as any).error, 'error', 6000);
    avisar(
      (r as any)?.bracketInfo
        ? `Lançado. ${(r as any).bracketInfo}`
        : `${s.team_home} ${s.sug_home}–${s.sug_away} ${s.team_away} lançado.`,
      'success',
      5000
    );
    router.refresh();
  }

  async function aplicarTodos() {
    setAplicando('todos');
    const r = await aplicarTodosResultadosSugeridos(tournamentSlug);
    setAplicando(null);
    if ((r as any)?.error) return avisar((r as any).error, 'error', 6000);
    const { aplicados, total, avisos } = r as any;
    avisar(
      avisos?.length
        ? `${aplicados} de ${total} lançados. ${avisos[0]}`
        : `${aplicados} ${aplicados === 1 ? 'jogo lançado' : 'jogos lançados'}.`,
      avisos?.length ? 'error' : 'success',
      7000
    );
    router.refresh();
  }

  async function mapear(o: ResultadoNaoPareado) {
    setMapeando(o.nome_na_api);
    const r = await aplicarApelido(o.nome_na_api, o.team_key_deduzida, tournamentSlug);
    setMapeando(null);
    if ((r as any)?.error) return avisar((r as any).error, 'error', 6000);
    avisar(
      `"${o.nome_na_api}" mapeado para ${o.nome_do_clube}. O jogo foi para "Pendentes".`,
      'success',
      6000
    );
    router.refresh();
  }

  function Linha({ s, modo }: { s: ResultadoSugerido; modo: 'acao' | 'conferencia' }) {
    const auto = autoPorJogo.get(Number(s.match_id));
    return (
      <div
        className={`rounded-md border p-3 ${
          s.divergente
            ? 'border-destructive/40 bg-destructive/5'
            : modo === 'conferencia'
              ? 'border-hairline bg-surface-sunken'
              : 'border-border bg-background'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {s.team_home} <span className="text-muted-foreground">x</span> {s.team_away}
            </p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {competitionName(s.competition)}
              {s.leg ? ` · ${s.leg}` : ''} · {hora(s.match_date)}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="font-mono text-xl font-bold tabular-nums text-foreground">
                {s.sug_home}–{s.sug_away}
              </span>
              {s.sug_pen_winner && (
                <p className="font-mono text-[10px] uppercase tracking-wider text-primary">
                  pên: {s.sug_pen_winner === 'home' ? s.team_home : s.team_away}
                </p>
              )}
            </div>

            {modo === 'conferencia' ? (
              <span className="inline-flex items-center gap-1 text-xs text-state-open">
                <Check className="h-4 w-4" aria-hidden="true" />
                lançado
              </span>
            ) : (
              <Button
                onClick={() => aplicarUm(s)}
                disabled={aplicando !== null}
                size="sm"
                variant={s.divergente ? 'destructive' : 'default'}
                className={
                  s.divergente
                    ? ''
                    : 'bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]'
                }
              >
                {aplicando === Number(s.match_id)
                  ? 'Lançando...'
                  : s.divergente
                    ? 'Corrigir'
                    : 'Lançar'}
              </Button>
            )}
          </div>
        </div>

        {(s.divergente || s.invertido || s.teve_prorrogacao || auto) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {s.divergente && (
              <Etiqueta tone="erro" icon={AlertTriangle}>
                lançado {s.score_home}–{s.score_away}, API diz {s.sug_home}–{s.sug_away}
              </Etiqueta>
            )}
            {auto && (
              <Etiqueta tone="auto" icon={Zap}>
                lançado automaticamente em {hora(auto)}
              </Etiqueta>
            )}
            {s.invertido && (
              <Etiqueta tone="aviso" icon={ArrowLeftRight}>
                mando invertido na API — placar já virado para o nosso cadastro
              </Etiqueta>
            )}
            {s.teve_prorrogacao && (
              <Etiqueta tone="aviso" icon={Clock}>
                teve prorrogação — o placar sugerido é o dos 90 minutos
              </Etiqueta>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {toast && <Toast message={toast.message} tone={toast.tone} />}

      <Card className="mb-6 border-border bg-card">
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Zap className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                Resultado sugerido
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Placar oficial que a API-Football já registrou.
              </p>
            </div>
            {pendentes.length > 1 && (
              <Button
                onClick={aplicarTodos}
                disabled={aplicando !== null}
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]"
              >
                {aplicando === 'todos' ? (
                  'Lançando...'
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Lançar os {pendentes.length}
                  </>
                )}
              </Button>
            )}
          </div>

          {/* A condição inclui `naoPareados`: um jogo órfão pode existir SEM
              nenhuma sugestão, e foi exatamente assim que Athletico-PR × Vitória
              ficou invisível. Se a tela só considerasse `sugestoes`, a aba nova
              não apareceria justo no caso que ela existe para mostrar. */}
          {sugestoes.length === 0 && naoPareados.length === 0 ? (
            <Vazio>
              Nenhum jogo do bolão encerrado na API ainda. A varredura roda de 20 em 20 minutos
              entre 14h e 2h, e a janela do plano gratuito é de três dias.
            </Vazio>
          ) : (
            <Tabs
              defaultValue={naoPareados.length > 0 && pendentes.length === 0 ? 'orfaos' : 'pendentes'}
              className="w-full"
            >
              <TabsList className="grid w-full auto-cols-fr grid-flow-col gap-1 rounded-[12px] border border-border bg-card p-1">
                <TabsTrigger value="pendentes" className={ABA_TRIGGER}>
                  <Inbox className="h-3 w-3 flex-shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                  <span className="truncate">Pendentes</span>
                  <span className="hidden sm:inline">({pendentes.length})</span>
                </TabsTrigger>
                {naoPareados.length > 0 && (
                  <TabsTrigger value="orfaos" className={ABA_TRIGGER}>
                    <Link2Off className="h-3 w-3 flex-shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                    <span className="truncate">Não pareados</span>
                    <span className="hidden sm:inline">({naoPareados.length})</span>
                  </TabsTrigger>
                )}
                {divergentes.length > 0 && (
                  <TabsTrigger value="divergencias" className={ABA_TRIGGER}>
                    <AlertTriangle className="h-3 w-3 flex-shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                    <span className="truncate">Divergências</span>
                    <span className="hidden sm:inline">({divergentes.length})</span>
                  </TabsTrigger>
                )}
                <TabsTrigger value="conferidos" className={ABA_TRIGGER}>
                  <CheckCheck className="h-3 w-3 flex-shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
                  <span className="truncate">Lançados</span>
                  <span className="hidden sm:inline">({conferidos.length})</span>
                </TabsTrigger>
              </TabsList>

              {/* Pendentes — o que ainda espera decisão */}
              <TabsContent value="pendentes" className="mt-4 space-y-2">
                {pendentes.length === 0 ? (
                  <Vazio>
                    Nada aguardando lançamento. Os jogos que a API já confirmou estão em
                    &ldquo;Lançados&rdquo;.
                  </Vazio>
                ) : (
                  pendentes.map((s) => <Linha key={s.match_id} s={s} modo="acao" />)
                )}
              </TabsContent>

              {/* Não pareados — a API tem o jogo, nós não reconhecemos um dos clubes */}
              {naoPareados.length > 0 && (
                <TabsContent value="orfaos" className="mt-4 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    A API tem estes jogos, mas um dos clubes veio com um nome que não reconhecemos —
                    então eles não viram sugestão e não seriam lançados. O clube abaixo é{' '}
                    <strong className="text-foreground">deduzido pelo confronto</strong>, não por
                    semelhança de nome: como o outro lado bate com o nosso time, o nome que sobrou
                    só pode ser este. Jogo que ainda não começou aparece aqui de propósito — dá para
                    resolver antes da bola rolar.
                  </p>
                  {naoPareados.map((o) => (
                    <div
                      key={o.match_id}
                      className="rounded-md border border-state-closing/40 bg-state-closing/5 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">
                            {o.team_home} <span className="text-muted-foreground">x</span>{' '}
                            {o.team_away}
                          </p>
                          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            {competitionName(o.competition)}
                            {o.leg ? ` · ${o.leg}` : ''} · {hora(o.match_date)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Sem placar quando a partida ainda não terminou: o
                              aviso agora chega antes do jogo, e aí o que
                              importa é o status, não um "null–null". */}
                          {o.sug_home !== null && o.sug_away !== null ? (
                            <span className="font-mono text-xl font-bold tabular-nums text-foreground">
                              {o.sug_home}–{o.sug_away}
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                              {o.fonte_status}
                            </span>
                          )}
                          <Button
                            onClick={() => mapear(o)}
                            disabled={mapeando !== null}
                            size="sm"
                            className="bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]"
                          >
                            {mapeando === o.nome_na_api ? 'Mapeando...' : 'Mapear clube'}
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Etiqueta tone="aviso" icon={Link2Off}>
                          a API chama de &ldquo;{o.nome_na_api}&rdquo;
                        </Etiqueta>
                        <Etiqueta tone="auto" icon={Tags}>
                          deve ser {o.nome_do_clube}
                        </Etiqueta>
                      </div>
                    </div>
                  ))}
                </TabsContent>
              )}

              {/* Divergências — já lançado, mas com placar diferente do da fonte */}
              {divergentes.length > 0 && (
                <TabsContent value="divergencias" className="mt-4 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Jogos já lançados cujo placar não bate com o da API. Corrigir reabre a partida,
                    o que devolve os pontos antes de recalcular.
                  </p>
                  {divergentes.map((s) => (
                    <Linha key={s.match_id} s={s} modo="acao" />
                  ))}
                </TabsContent>
              )}

              {/* Lançados — conferência, sem ação */}
              <TabsContent value="conferidos" className="mt-4 space-y-2">
                {conferidos.length === 0 ? (
                  <Vazio>Nenhum jogo lançado ainda.</Vazio>
                ) : (
                  conferidos.map((s) => <Linha key={s.match_id} s={s} modo="conferencia" />)
                )}
              </TabsContent>
            </Tabs>
          )}

          <p className="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            {ultimaSincronizacao
              ? `última varredura em ${hora(ultimaSincronizacao)}`
              : 'nenhuma varredura registrada'}
            {autoPorJogo.size > 0 && ` · ${autoPorJogo.size} lançado(s) automaticamente`}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
