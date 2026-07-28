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
    { label: `Vitória ${teamHome}`, count: homeWin, bar: 'bg-green-500', text: 'text-green-300' },
    { label: 'Empate', count: draw, bar: 'bg-slate-400', text: 'text-slate-300' },
    { label: `Vitória ${teamAway}`, count: awayWin, bar: 'bg-blue-500', text: 'text-blue-300' },
  ];

  return (
    <div className={`rounded-lg border border-slate-700 bg-slate-950/40 p-3 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-amber-500" />
        <h4 className="text-white text-sm font-semibold">Resumo dos palpites (tempo normal)</h4>
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const p = pct(r.count);
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`font-bold tabular-nums w-10 ${r.text}`}>{p}%</span>
                  <span className="text-slate-300 truncate">{r.label}</span>
                </div>
                <span className="text-slate-400 text-xs flex-shrink-0">
                  {r.count} {r.count === 1 ? 'palpite' : 'palpites'}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div className={`h-full ${r.bar}`} style={{ width: `${p}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-slate-500 text-[11px] mt-2 text-right">Total: {total} {total === 1 ? 'palpite' : 'palpites'}</p>
    </div>
  );
}
