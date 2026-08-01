'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeftRight, Check, Clock, RefreshCw, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Toast } from '@/components/toast';
import { competitionName } from '@/lib/competitions';
import {
  aplicarResultadoSugerido,
  aplicarTodosResultadosSugeridos,
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
// divergência com o que já foi lançado. É o que decide se o admin confere
// antes ou aplica direto.
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
  tone: 'aviso' | 'neutro' | 'erro';
  icon: typeof Zap;
  children: React.ReactNode;
}) {
  const cores = {
    aviso: 'border-state-closing/40 bg-state-closing/10 text-state-closing',
    neutro: 'border-border bg-surface-sunken text-muted-foreground',
    erro: 'border-destructive/40 bg-destructive/10 text-destructive',
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

export function ResultadosSugeridos({
  sugestoes,
  ultimaSincronizacao,
  tournamentSlug,
}: {
  sugestoes: ResultadoSugerido[];
  ultimaSincronizacao: string | null;
  tournamentSlug: string;
}) {
  const router = useRouter();
  const [aplicando, setAplicando] = useState<number | 'todos' | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const pendentes = sugestoes.filter((s) => s.status !== 'FINISHED');
  const divergentes = sugestoes.filter((s) => s.divergente);

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
                Placar oficial que a API-Football já registrou. Nada é lançado sem o seu clique.
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

          {sugestoes.length === 0 ? (
            <p className="rounded-md border border-hairline bg-surface-sunken px-3 py-4 text-sm text-muted-foreground">
              Nenhum jogo do bolão encerrado na API ainda. A varredura roda de hora em hora entre
              14h e 2h, e a janela do plano gratuito é de três dias.
            </p>
          ) : (
            <div className="space-y-2">
              {sugestoes.map((s) => {
                const jaLancado = s.status === 'FINISHED';
                return (
                  <div
                    key={s.match_id}
                    className={`rounded-md border p-3 ${
                      s.divergente
                        ? 'border-destructive/40 bg-destructive/5'
                        : jaLancado
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

                        {jaLancado && !s.divergente ? (
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

                    {(s.divergente || s.invertido || s.teve_prorrogacao) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {s.divergente && (
                          <Etiqueta tone="erro" icon={AlertTriangle}>
                            lançado {s.score_home}–{s.score_away}, API diz {s.sug_home}–{s.sug_away}
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
              })}
            </div>
          )}

          <p className="mt-3 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            {ultimaSincronizacao
              ? `última varredura em ${hora(ultimaSincronizacao)}`
              : 'nenhuma varredura registrada'}
            {divergentes.length > 0 && ` · ${divergentes.length} divergência(s)`}
          </p>
        </CardContent>
      </Card>
    </>
  );
}
