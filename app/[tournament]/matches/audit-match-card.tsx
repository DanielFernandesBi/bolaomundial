'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Clock } from 'lucide-react';
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
  /** Quando este palpite foi gravado. */
  salvo_em?: string | null;
  /** Última alteração REGISTRADA. Nulo = não há registro de alteração. */
  alterado_em?: string | null;
  alteracoes?: number;
  /** Alteração depois do prazo da fase. Não deveria existir: é alarme. */
  alterado_apos_fechamento?: boolean;
  /** A trilha já existia quando o palpite foi gravado? */
  cobertura_completa?: boolean;
}

const FUSO = 'America/Sao_Paulo';

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * A hora do palpite, à vista de todos.
 *
 * É o que transforma a fiscalização de individual em coletiva: quem não
 * guardou comprovante nenhum enxerga, do mesmo jeito, que aquele palpite foi
 * gravado às 17:00 e nunca mais tocado. E se um dia aparecer alteração depois
 * do fechamento — que `check_prediction_window` recusa —, aparece em vermelho
 * para todo mundo ao mesmo tempo.
 */
function Carimbo({ p }: { p: Prediction }) {
  if (!p.salvo_em) return null;
  return (
    <p className="mt-1 text-[10px] leading-tight text-[hsl(var(--faint))]">
      <Clock className="mr-1 inline h-2.5 w-2.5 align-[-1px]" aria-hidden="true" />
      {quando(p.salvo_em)}
      {p.alterado_em && (
        <span className={p.alterado_apos_fechamento ? 'font-bold text-destructive' : 'text-state-urgent'}>
          {' · '}
          {p.alterado_apos_fechamento ? 'ALTERADO APÓS O FECHAMENTO ' : 'alterado '}
          {quando(p.alterado_em)}
          {(p.alteracoes ?? 0) > 1 && ` (${p.alteracoes}×)`}
        </span>
      )}
      {/* Sem alteração registrada num palpite anterior à trilha não é prova de
          que não houve: dizer isso é o que impede a tela de afirmar demais. */}
      {!p.alterado_em && p.cobertura_completa === false && ' · anterior à trilha'}
    </p>
  );
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
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
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
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/${tournamentSlug}/desempenho/${prediction.user_id}`}
                      className="block truncate text-foreground font-medium transition-colors hover:text-primary"
                    >
                      {prediction.username}
                    </Link>
                    <Carimbo p={prediction} />
                  </div>
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
