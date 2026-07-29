import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Trophy } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getFlagUrl } from '@/lib/utils/flags';
import { PredictionSummary } from '@/components/prediction-summary';
import { getMatchResultDetail } from '../actions';

interface PageProps {
  params: Promise<{ tournament: string; matchId: string }>;
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

// Cor de fundo da linha conforme a faixa de acerto (tempo normal)
function tierClass(pointsRegular: number, totalPoints: number): string {
  if (pointsRegular === 30) return 'bg-amber-500/15 border-amber-500/40';
  if (pointsRegular === 17) return 'bg-purple-500/15 border-purple-500/30';
  if (pointsRegular === 15) return 'bg-blue-500/15 border-blue-500/30';
  if (pointsRegular === 12) return 'bg-green-500/15 border-green-500/30';
  if (pointsRegular === 10 || pointsRegular === 9) return 'bg-cyan-500/15 border-cyan-500/30';
  if (pointsRegular === 3) return 'bg-orange-500/15 border-orange-500/30';
  if (totalPoints > 0) return 'bg-slate-700/40 border-slate-600/40';
  return 'bg-slate-800/40 border-slate-700/40';
}

function TeamLogo({ iso, alt }: { iso: string | null; alt: string }) {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (trimmed.toLowerCase().startsWith('http')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={trimmed} alt={alt} className="w-10 h-10 rounded object-contain bg-slate-800" loading="lazy" />;
  }
  return <Image src={getFlagUrl(iso)} alt={alt} width={40} height={40} className="w-10 h-auto rounded" />;
}

export default async function MatchResultDetailPage({ params }: PageProps) {
  const { tournament: tournamentSlug, matchId } = await params;
  const id = parseInt(matchId);
  if (isNaN(id)) notFound();

  const { match, predictions, error } = await getMatchResultDetail(id);

  if (error || !match) {
    notFound();
  }

  const isKnockout = !!match.is_knockout;

  return (
    <div className="min-h-screen bg-slate-950 overflow-x-hidden">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link
          href={`/${tournamentSlug}/matches`}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para partidas
        </Link>

        {/* Resultado da partida */}
        <Card className="bg-slate-900 border-slate-800 mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex flex-col items-center gap-2 flex-1">
                <TeamLogo iso={match.home_iso} alt={match.team_home} />
                <span className="text-white font-bold text-center text-sm">{match.team_home}</span>
              </div>
              <div className="flex flex-col items-center gap-1 mx-4">
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold text-white bg-slate-800 px-4 py-2 rounded">{match.score_home ?? '-'}</span>
                  <span className="text-white">x</span>
                  <span className="text-3xl font-bold text-white bg-slate-800 px-4 py-2 rounded">{match.score_away ?? '-'}</span>
                </div>
                {isKnockout && match.extra_time_result && (
                  <span className="text-xs text-slate-400">
                    Prorrogação:{' '}
                    {match.extra_time_result === 'home'
                      ? match.team_home
                      : match.extra_time_result === 'away'
                      ? match.team_away
                      : 'empate'}
                  </span>
                )}
                {isKnockout && match.pen_home != null && match.pen_away != null && (
                  <span className="text-xs text-slate-400">Pênaltis: {match.pen_home} x {match.pen_away}</span>
                )}
                {isKnockout && match.pen_winner && (
                  <span className="text-xs text-slate-400">
                    Pênaltis: {match.pen_winner === 'home' ? match.team_home : match.team_away}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-center gap-2 flex-1">
                <TeamLogo iso={match.away_iso} alt={match.team_away} />
                <span className="text-white font-bold text-center text-sm">{match.team_away}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {predictions.length > 0 && (
          <PredictionSummary
            teamHome={match.team_home}
            teamAway={match.team_away}
            predictions={predictions}
            className="mb-6"
          />
        )}

        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h2 className="text-xl font-bold text-white">Palpites desta partida</h2>
          <span className="text-slate-500 text-sm">({predictions.length})</span>
        </div>

        {predictions.length === 0 ? (
          <p className="text-slate-400 text-center py-8">Nenhum palpite registrado para esta partida.</p>
        ) : (
          <div className="space-y-2">
            {predictions.map((p, index) => (
              <div
                key={p.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${tierClass(p.points_regular, p.points_earned)}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-slate-400 font-bold w-6 text-center">{index + 1}º</span>
                  <Avatar className="w-9 h-9 border-2 border-slate-700 flex-shrink-0">
                    <AvatarImage src={p.avatar_url || undefined} />
                    <AvatarFallback className="bg-slate-700 text-white text-xs">{getInitials(p.username)}</AvatarFallback>
                  </Avatar>
                  <Link
                    href={`/${tournamentSlug}/desempenho/${p.user_id}`}
                    className="text-white font-medium hover:text-amber-500 transition-colors truncate"
                  >
                    {p.username}
                  </Link>
                </div>

                <div className="flex items-center gap-3 ml-3">
                  <div className="text-right">
                    <div className="text-white font-bold">
                      {p.pred_home} x {p.pred_away}
                    </div>
                    {isKnockout && (p.pred_extra_result || p.pred_pen_home != null || p.pred_pen_winner) && (
                      <div className="text-[10px] text-slate-400 leading-tight">
                        {p.pred_extra_result && (
                          <span>
                            P:{' '}
                            {p.pred_extra_result === 'home'
                              ? match.team_home
                              : p.pred_extra_result === 'away'
                              ? match.team_away
                              : 'emp.'}
                          </span>
                        )}
                        {p.pred_pen_home != null && <span> · Pên {p.pred_pen_home}x{p.pred_pen_away}</span>}
                        {p.pred_pen_winner && (
                          <span> · Pên {p.pred_pen_winner === 'home' ? match.team_home : match.team_away}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-amber-500 font-bold text-lg w-12 text-right">{p.points_earned}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
