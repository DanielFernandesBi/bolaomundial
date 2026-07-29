'use client';

import { useState, useEffect } from 'react';

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

function calcTimeLeft(targetDate: Date): TimeLeft | null {
  const diff = targetDate.getTime() - new Date().getTime();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
    totalMs: diff,
  };
}

interface MissingByCompetition {
  key: string;
  short: string;
  count: number;
}

interface Props {
  // Horário do próximo jogo a fechar os palpites (bloqueio é por partida)
  nextMatchDate: string | null;
  missingPredictionsCount: number;
  /** Detalhamento do "sem palpite" por competição, no bolão unificado. Vazio
      (o padrão) mantém exatamente a etiqueta única de antes. */
  missingByCompetition?: MissingByCompetition[];
}

export function TournamentDeadlineBanner({
  nextMatchDate,
  missingPredictionsCount,
  missingByCompetition = [],
}: Props) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!nextMatchDate) return;

    const target = new Date(nextMatchDate);
    setTimeLeft(calcTimeLeft(target));
    setMounted(true);

    const interval = setInterval(() => {
      const remaining = calcTimeLeft(target);
      setTimeLeft(remaining);
    }, 1000);

    return () => clearInterval(interval);
  }, [nextMatchDate]);

  // Sem próximo jogo ou ainda hidratando: não renderiza nada
  if (!nextMatchDate || !mounted) return null;

  const tournamentStarted = timeLeft === null;

  // ── Aparência por urgência ─────────────────────────────────────────────────
  const isUrgent  = timeLeft !== null && timeLeft.totalMs < 1000 * 60 * 60;        // < 1h
  const isWarning = timeLeft !== null && timeLeft.totalMs < 1000 * 60 * 60 * 24;   // < 24h

  const tone = tournamentStarted
    ? 'border-border bg-surface-sunken text-muted-foreground'
    : isUrgent
    ? 'border-state-urgent/40 bg-state-urgent/10 text-state-urgent'
    : isWarning
    ? 'border-state-closing/30 bg-state-closing/10 text-state-closing'
    : 'border-border bg-card text-muted-foreground';

  const dot = tournamentStarted
    ? 'bg-state-locked'
    : isUrgent
    ? 'bg-state-urgent'
    : isWarning
    ? 'bg-state-closing'
    : 'bg-state-locked';

  // ── Texto do countdown ─────────────────────────────────────────────────────
  function buildCountdownText(): string {
    if (!timeLeft) return '';

    const parts: string[] = [];
    if (timeLeft.days > 0)    parts.push(`${timeLeft.days}d`);
    if (timeLeft.hours > 0 || timeLeft.days > 0)
                              parts.push(`${String(timeLeft.hours).padStart(2, '0')}h`);
    parts.push(`${String(timeLeft.minutes).padStart(2, '0')}m`);
    parts.push(`${String(timeLeft.seconds).padStart(2, '0')}s`);

    return parts.join(' ');
  }

  // No bolão unificado a etiqueta única ("36 sem palpite") não dizia de QUAL
  // competição faltava — e é essa a informação que faz o jogador agir. Vira uma
  // faixa: Total + uma célula por competição. Quatro colunas cabem em 360px com
  // o rótulo em 9px monoespaçado, mesmo padrão das faixas de métrica do
  // Desempenho e do Perfil.
  const detalhado = missingByCompetition.length > 0;

  return (
    <div className={`mb-6 rounded-[12px] border px-3 py-3 text-xs ${tone}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`} aria-hidden="true" />

        {tournamentStarted ? (
          <span className="font-medium">Cada jogo encerra os palpites no seu próprio horário</span>
        ) : (
          <>
            <span className="font-medium">Próximo jogo fecha em</span>
            <span className="font-mono text-sm font-bold tabular-nums tracking-wider">
              {buildCountdownText()}
            </span>
          </>
        )}

        {/* Etiqueta única: só quando NÃO há detalhamento por competição —
            torneio de competição única segue igual ao que era. */}
        {!detalhado && !tournamentStarted && (
          <span
            className={`ml-auto flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              missingPredictionsCount > 0
                ? 'bg-state-missing/15 text-state-missing'
                : 'bg-state-open/10 text-state-open'
            }`}
          >
            {missingPredictionsCount > 0
              ? `${missingPredictionsCount} sem palpite`
              : 'tudo em dia'}
          </span>
        )}
      </div>

      {detalhado && (
        <div className="mt-3 border-t border-hairline pt-2.5">
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[hsl(var(--faint))]">
            Sem palpite
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {[{ key: '__total', short: 'Total', count: missingPredictionsCount }, ...missingByCompetition].map(
              ({ key, short, count }) => {
                // Zero fica calmo; o que falta fica em state-missing. É assim
                // que se vê num relance ONDE está o buraco.
                const pendente = count > 0;
                const total = key === '__total';
                return (
                  <div
                    key={key}
                    className={`rounded-[10px] border px-1 py-1.5 text-center ${
                      pendente
                        ? 'border-state-missing/35 bg-state-missing/10'
                        : 'border-hairline bg-state-open/5'
                    }`}
                  >
                    <p
                      className={`text-base font-bold leading-none tabular-nums ${
                        pendente
                          ? 'text-state-missing'
                          : total
                          ? 'text-state-open'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {count}
                    </p>
                    {/* SEM truncate: numa tela de 360px cada coluna tem ~71px e
                        "COPA DO BRASIL" não cabe numa linha. Truncar viraria
                        "COPA DO BRASI…"; quebrar em duas linhas mantém o nome
                        inteiro, e o grid iguala a altura das quatro células. */}
                    <p
                      className={`mt-1 font-mono text-[8.5px] uppercase leading-[1.2] tracking-[0.06em] ${
                        total ? 'text-card-foreground' : 'text-[hsl(var(--faint))]'
                      }`}
                      title={short}
                    >
                      {short}
                    </p>
                  </div>
                );
              }
            )}
          </div>
        </div>
      )}
    </div>
  );
}
