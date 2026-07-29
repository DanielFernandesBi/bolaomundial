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
  /** Desfecho real do tempo normal. Opcional: sem ele nenhuma barra é
      destacada, que é o caso do jogo em andamento (audit-match-card). */
  actual?: 'home' | 'draw' | 'away' | null;
  /** Título do bloco. Default serve ao jogo encerrado. */
  title?: string;
}

export function PredictionSummary({ teamHome, teamAway, predictions, className = '', actual = null, title = 'Resumo dos palpites (tempo normal)' }: Props) {
  const total = predictions.length;
  if (total === 0) return null;

  const homeWin = predictions.filter((p) => p.pred_home > p.pred_away).length;
  const draw = predictions.filter((p) => p.pred_home === p.pred_away).length;
  const awayWin = predictions.filter((p) => p.pred_away > p.pred_home).length;

  const pct = (n: number) => Math.round((n / total) * 100);

  // O desfecho que ACONTECEU ganha destaque âmbar; os outros ficam neutros.
  // Antes eram verde/cinza/azul, cores sem relação nenhuma com o resultado.
  const rows = [
    { key: 'home' as const, label: `Vitória ${teamHome}`, count: homeWin },
    { key: 'draw' as const, label: 'Empate', count: draw },
    { key: 'away' as const, label: `Vitória ${teamAway}`, count: awayWin },
  ].map((r) => {
    const aconteceu = !!actual && actual === r.key;
    return {
      ...r,
      aconteceu,
      bar: aconteceu ? 'bg-primary' : 'bg-[hsl(var(--score-none))]',
      text: aconteceu ? 'text-primary' : 'text-muted-foreground',
    };
  });

  return (
    <div className={`rounded-lg border border-border bg-surface-sunken p-3 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h4 className="text-foreground text-sm font-semibold">{title}</h4>
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const p = pct(r.count);
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`font-bold tabular-nums w-10 ${r.text}`}>{p}%</span>
                  <span className={`truncate ${r.aconteceu ? 'font-semibold text-primary' : 'text-card-foreground'}`}>
                    {r.label}
                    {r.aconteceu && <span className="text-[hsl(var(--faint))]"> · aconteceu</span>}
                  </span>
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
