import { BarChart3 } from 'lucide-react';

interface Pred {
  pred_home: number;
  pred_away: number;
}

interface Props {
  teamHome: string;
  teamAway: string;
  predictions: Pred[];
  className?: string;
}

export function PredictionSummary({ teamHome, teamAway, predictions, className = '' }: Props) {
  const total = predictions.length;
  if (total === 0) return null;

  const homeWin = predictions.filter((p) => p.pred_home > p.pred_away).length;
  const draw = predictions.filter((p) => p.pred_home === p.pred_away).length;
  const awayWin = predictions.filter((p) => p.pred_away > p.pred_home).length;

  const pct = (n: number) => Math.round((n / total) * 100);

  const rows = [
    { label: `Vitória ${teamHome}`, count: homeWin, bar: 'bg-green-500', text: 'text-state-open' },
    { label: 'Empate', count: draw, bar: 'bg-slate-400', text: 'text-card-foreground' },
    { label: `Vitória ${teamAway}`, count: awayWin, bar: 'bg-blue-500', text: 'text-muted-foreground' },
  ];

  return (
    <div className={`rounded-lg border border-border bg-surface-sunken p-3 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h4 className="text-foreground text-sm font-semibold">Resumo dos palpites (tempo normal)</h4>
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const p = pct(r.count);
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`font-bold tabular-nums w-10 ${r.text}`}>{p}%</span>
                  <span className="text-card-foreground truncate">{r.label}</span>
                </div>
                <span className="text-muted-foreground text-xs flex-shrink-0">
                  {r.count} {r.count === 1 ? 'palpite' : 'palpites'}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${r.bar}`} style={{ width: `${p}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[hsl(var(--faint))] text-[11px] mt-2 text-right">Total: {total} {total === 1 ? 'palpite' : 'palpites'}</p>
    </div>
  );
}
