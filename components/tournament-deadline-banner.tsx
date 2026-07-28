'use client';

import { useState, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle, LockKeyhole } from 'lucide-react';

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

  // ── Cores e urgência do countdown ──────────────────────────────────────────
  const isUrgent   = timeLeft !== null && timeLeft.totalMs < 1000 * 60 * 60;        // < 1h
  const isWarning  = timeLeft !== null && timeLeft.totalMs < 1000 * 60 * 60 * 24;   // < 24h

  const countdownBg     = isUrgent  ? 'bg-red-500/10 border-red-500/40'
                        : isWarning ? 'bg-amber-500/10 border-amber-500/40'
                        :             'bg-blue-500/10 border-blue-500/30';

  const countdownText   = isUrgent  ? 'text-red-400'
                        : isWarning ? 'text-amber-400'
                        :             'text-blue-400';

  const countdownIcon   = isUrgent  ? <Clock className="w-5 h-5 text-red-400 flex-shrink-0" />
                        : isWarning ? <Clock className="w-5 h-5 text-amber-400 flex-shrink-0" />
                        :             <Clock className="w-5 h-5 text-blue-400 flex-shrink-0" />;

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
    <div className="space-y-3 mb-6">

      {/* ── Countdown do próximo jogo a fechar ─────────────────────────────── */}
      {tournamentStarted ? (
        <div className="flex items-center gap-3 rounded-lg border bg-slate-800/50 border-slate-600/40 px-4 py-3">
          <LockKeyhole className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <p className="text-slate-400 text-sm font-medium">
            Cada jogo encerra os palpites no seu próprio horário de início.
          </p>
        </div>
      ) : (
        <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${countdownBg}`}>
          {countdownIcon}
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
            <span className={`text-sm font-medium ${countdownText}`}>
              Próximo jogo fecha os palpites em:
            </span>
            <span className={`text-base font-bold tracking-wider ${countdownText}`}>
              {buildCountdownText()}
            </span>
          </div>
        </div>
      )}

      {/* ── Alerta de palpites em branco (só antes do prazo) ──────────────── */}
      {!tournamentStarted && missingPredictionsCount > 0 && (
        <div className="flex items-start gap-3 rounded-lg border bg-orange-500/10 border-orange-500/40 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-orange-400 text-sm font-semibold">
              {missingPredictionsCount === 1
                ? 'Você tem 1 jogo sem palpite!'
                : `Você tem ${missingPredictionsCount} jogos sem palpite!`}
            </p>
            <p className="text-orange-300/70 text-xs mt-0.5">
              Jogos sem palpite valem 0 pontos. Preencha antes do início de cada jogo.
            </p>
          </div>
        </div>
      )}

      {/* ── Tudo preenchido (só antes do prazo) ───────────────────────────── */}
      {!tournamentStarted && missingPredictionsCount === 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-green-500/10 border-green-500/30 px-4 py-3">
          <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
          <p className="text-green-400 text-sm font-medium">
            Todos os palpites preenchidos. Boa sorte!
          </p>
        </div>
      )}

    </div>
  );
}
