'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getFlagUrl } from '@/lib/utils/flags';
import { PredictionSummary } from '@/components/prediction-summary';

interface Prediction {
  id: number;
  pred_home: number;
  pred_away: number;
  pred_extra_result?: 'home' | 'draw' | 'away' | null;
  pred_pen_home?: number | null;
  pred_pen_away?: number | null;
  pred_pen_winner?: 'home' | 'away' | null;
  user_id: string;
  username: string;
  avatar_url: string | null;
}

interface AuditMatchCardProps {
  match: {
    id: number;
    team_home: string;
    team_away: string;
    home_iso: string | null;
    away_iso: string | null;
    match_date: string;
    is_knockout?: boolean;
    venue?: string | null;
    all_predictions: Prediction[];
  };
  tournamentSlug: string;
  /** Página de cada clube, quando existe. Nulo nos torneios de seleções. */
  homeHref?: string | null;
  awayHref?: string | null;
}

/** Escudo + nome de um dos lados, clicável quando o clube tem página. */
function TimeLinha({ nome, iso, href }: { nome: string; iso: string | null; href?: string | null }) {
  const conteudo = (
    <>
      {iso &&
        (iso.toLowerCase().startsWith('http') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iso}
            alt={nome}
            className="w-6 h-6 sm:w-8 sm:h-8 rounded object-contain flex-shrink-0"
            loading="lazy"
          />
        ) : (
          <Image
            src={getFlagUrl(iso)}
            alt={nome}
            width={32}
            height={32}
            className="w-6 h-auto sm:w-8 sm:h-auto rounded flex-shrink-0"
          />
        ))}
      <span className="text-foreground font-semibold text-sm sm:text-base truncate flex-1 transition-colors group-hover:text-primary">
        {nome}
      </span>
    </>
  );
  if (!href) {
    return <div className="flex items-center gap-2">{conteudo}</div>;
  }
  return (
    <Link href={href} aria-label={`Ver os jogos do ${nome}`} className="group flex items-center gap-2">
      {conteudo}
    </Link>
  );
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function extraLabel(r: 'home' | 'draw' | 'away' | null | undefined, home: string, away: string): string | null {
  if (r === 'home') return `Prorrog.: ${home}`;
  if (r === 'away') return `Prorrog.: ${away}`;
  if (r === 'draw') return 'Prorrog.: empate';
  return null;
}

export function AuditMatchCard({ match, tournamentSlug, homeHref, awayHref }: AuditMatchCardProps) {
  const matchDate = new Date(match.match_date);
  const formattedDate = matchDate.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Card className="bg-card border-border">
      <CardHeader className="p-4">
        <CardTitle className="text-foreground">
          {/* Layout Mobile-First: Times em coluna */}
          <div className="flex flex-col gap-3 mb-2">
            {/* Time Casa */}
            <TimeLinha nome={match.team_home} iso={match.home_iso} href={homeHref} />

            {/* Separador VS */}
            <div className="flex items-center justify-center">
              <span className="text-muted-foreground text-xs sm:text-sm">vs</span>
            </div>
            
            {/* Time Visitante */}
            <TimeLinha nome={match.team_away} iso={match.away_iso} href={awayHref} />
          </div>
          
          {/* Data */}
          <div className="text-muted-foreground text-xs sm:text-sm text-center mt-2">
            {formattedDate}
          </div>
          {match.venue && (
            <div className="text-[hsl(var(--faint))] text-xs text-center">🏟️ {match.venue}</div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {match.all_predictions.length > 0 && (
          <PredictionSummary
            title="O que a galera espera"
            teamHome={match.team_home}
            teamAway={match.team_away}
            predictions={match.all_predictions}
            className="mb-4"
          />
        )}

        {match.all_predictions.length === 0 ? (
          <div className="text-muted-foreground text-center py-8">
            Nenhum palpite registrado para esta partida.
          </div>
        ) : (
          <div className="space-y-2">
            {match.all_predictions.map((prediction) => (
              <div
                key={prediction.id}
                className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="w-10 h-10 border-2 border-border flex-shrink-0">
                    <AvatarImage src={prediction.avatar_url || undefined} />
                    <AvatarFallback className="bg-muted text-foreground text-sm">
                      {getInitials(prediction.username)}
                    </AvatarFallback>
                  </Avatar>
                  <Link
                    href={`/${tournamentSlug}/desempenho/${prediction.user_id}`}
                    className="text-foreground font-medium hover:text-primary transition-colors truncate flex-1"
                  >
                    {prediction.username}
                  </Link>
                </div>
                <div className="flex flex-col items-end ml-4">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-bold text-lg">{prediction.pred_home}</span>
                    <span className="text-muted-foreground">x</span>
                    <span className="text-foreground font-bold text-lg">{prediction.pred_away}</span>
                  </div>
                  {(prediction.pred_extra_result || prediction.pred_pen_home != null || prediction.pred_pen_winner) && (
                    <div className="text-[10px] text-muted-foreground text-right leading-tight mt-0.5">
                      {extraLabel(prediction.pred_extra_result, match.team_home, match.team_away) && (
                        <div>{extraLabel(prediction.pred_extra_result, match.team_home, match.team_away)}</div>
                      )}
                      {prediction.pred_pen_home != null && prediction.pred_pen_away != null && (
                        <div>Pên.: {prediction.pred_pen_home} x {prediction.pred_pen_away}</div>
                      )}
                      {prediction.pred_pen_winner && (
                        <div>Pên.: {prediction.pred_pen_winner === 'home' ? match.team_home : match.team_away}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
