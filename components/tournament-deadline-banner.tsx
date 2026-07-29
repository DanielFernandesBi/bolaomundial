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

interface Props {
  // Horário do próximo jogo a fechar os palpites (bloqueio é por partida)
  nextMatchDate: string | null;
  missingPredictionsCount: number;
}

export function TournamentDeadlineBanner({ nextMatchDate, missingPredictionsCount }: Props) {
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

  return (
    <div className={`mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border px-3 py-3 text-xs ${tone}`}>
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

      {/* Pendência, à direita */}
      {!tournamentStarted && (
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
  );
}
