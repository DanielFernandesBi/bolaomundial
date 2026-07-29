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
    all_predictions: Prediction[];
  };
  tournamentSlug: string;
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

export function AuditMatchCard({ match, tournamentSlug }: AuditMatchCardProps) {
  const matchDate = new Date(match.match_date);
  const formattedDate = matchDate.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="p-4">
        <CardTitle className="text-white">
          {/* Layout Mobile-First: Times em coluna */}
          <div className="flex flex-col gap-3 mb-2">
            {/* Time Casa */}
            <div className="flex items-center gap-2">
              {match.home_iso && (
                match.home_iso.toLowerCase().startsWith('http') ? (
                  <img
                    src={match.home_iso}
                    alt={match.team_home}
                    className="w-6 h-6 sm:w-8 sm:h-8 rounded object-contain flex-shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <Image
                    src={getFlagUrl(match.home_iso)}
                    alt={match.team_home}
                    width={32}
                    height={32}
                    className="w-6 h-auto sm:w-8 sm:h-auto rounded flex-shrink-0"
                  />
                )
              )}
              <span className="text-white font-semibold text-sm sm:text-base truncate flex-1">{match.team_home}</span>
            </div>
            
            {/* Separador VS */}
            <div className="flex items-center justify-center">
              <span className="text-slate-400 text-xs sm:text-sm">vs</span>
            </div>
            
            {/* Time Visitante */}
            <div className="flex items-center gap-2">
              {match.away_iso && (
                match.away_iso.toLowerCase().startsWith('http') ? (
                  <img
                    src={match.away_iso}
                    alt={match.team_away}
                    className="w-6 h-6 sm:w-8 sm:h-8 rounded object-contain flex-shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <Image
                    src={getFlagUrl(match.away_iso)}
                    alt={match.team_away}
                    width={32}
                    height={32}
                    className="w-6 h-auto sm:w-8 sm:h-auto rounded flex-shrink-0"
                  />
                )
              )}
              <span className="text-white font-semibold text-sm sm:text-base truncate flex-1">{match.team_away}</span>
            </div>
          </div>
          
          {/* Data */}
          <div className="text-slate-400 text-xs sm:text-sm text-center mt-2">
            {formattedDate}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {match.all_predictions.length > 0 && (
          <PredictionSummary
            teamHome={match.team_home}
            teamAway={match.team_away}
            predictions={match.all_predictions}
            className="mb-4"
          />
        )}

        {match.all_predictions.length === 0 ? (
          <div className="text-slate-400 text-center py-8">
            Nenhum palpite registrado para esta partida.
          </div>
        ) : (
          <div className="space-y-2">
            {match.all_predictions.map((prediction) => (
              <div
                key={prediction.id}
                className="flex items-center justify-between p-3 bg-slate-800 rounded-lg border border-slate-700"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="w-10 h-10 border-2 border-slate-700 flex-shrink-0">
                    <AvatarImage src={prediction.avatar_url || undefined} />
                    <AvatarFallback className="bg-slate-700 text-white text-sm">
                      {getInitials(prediction.username)}
                    </AvatarFallback>
                  </Avatar>
                  <Link
                    href={`/${tournamentSlug}/desempenho/${prediction.user_id}`}
                    className="text-white font-medium hover:text-amber-500 transition-colors truncate flex-1"
                  >
                    {prediction.username}
                  </Link>
                </div>
                <div className="flex flex-col items-end ml-4">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-lg">{prediction.pred_home}</span>
                    <span className="text-slate-400">x</span>
                    <span className="text-white font-bold text-lg">{prediction.pred_away}</span>
                  </div>
                  {(prediction.pred_extra_result || prediction.pred_pen_home != null || prediction.pred_pen_winner) && (
                    <div className="text-[10px] text-slate-400 text-right leading-tight mt-0.5">
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
