'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  RefreshCw,
  Trophy,
  Medal,
  AlertTriangle,
  ArrowDown,
  Sparkles,
  Info,
} from 'lucide-react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getFlagUrl } from '@/lib/utils/flags';
import { getSimulation } from './actions';
import type { PlayerResult, SimResult } from '@/lib/probability/engine';

type Metric = 'title' | 'top3' | 'z4' | 'lanterna';

const METRICS: { key: Metric; label: string; icon: any; bar: string; chip: string; field: keyof PlayerResult }[] = [
  { key: 'title', label: 'Campeão', icon: Trophy, bar: 'bg-primary', chip: 'text-primary', field: 'chance_title' },
  { key: 'top3', label: 'Top 3', icon: Medal, bar: 'bg-primary', chip: 'text-state-open', field: 'chance_top3' },
  { key: 'z4', label: 'Zona (Z4)', icon: AlertTriangle, bar: 'bg-primary', chip: 'text-state-missing', field: 'chance_z4' },
  { key: 'lanterna', label: 'Lanterna', icon: ArrowDown, bar: 'bg-primary', chip: 'text-destructive', field: 'chance_lanterna' },
];

function pct(x: number): string {
  if (x <= 0) return '0%';
  if (x < 0.01) return '<1%';
  return `${Math.round(x * 100)}%`;
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export function SimuladorContent({ tournamentSlug, tournamentName }: { tournamentSlug: string; tournamentName: string }) {
  const [data, setData] = useState<SimResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>('title');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getSimulation(tournamentSlug);
    if (res.error) setError(res.error);
    setData(res.result);
    setLoading(false);
  }, [tournamentSlug]);

  useEffect(() => {
    load();
  }, [load]);

  const activeMetric = METRICS.find((m) => m.key === metric)!;
  const players = data?.players ?? [];

  const sorted = [...players].sort((a, b) => {
    const fa = a[activeMetric.field] as number;
    const fb = b[activeMetric.field] as number;
    return fb - fa || b.projected_points - a.projected_points;
  });

  const favTitle = [...players].sort((a, b) => b.chance_title - a.chance_title)[0];
  const favLanterna = [...players].sort((a, b) => b.chance_lanterna - a.chance_lanterna)[0];
  const topPoints = [...players].sort((a, b) => b.projected_points - a.projected_points)[0];

  return (
    <div>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-8 h-8 text-primary" />
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Simulador</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Probabilidades projetadas para o {tournamentName}, via simulação de Monte Carlo.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
            loading ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Calculando...' : 'Recalcular'}
        </button>
      </div>

      {loading && (
        <div className="text-center py-20 text-muted-foreground">
          <RefreshCw className="w-10 h-10 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-lg">Rodando milhares de simulações...</p>
          <p className="text-sm">Cruzando os palpites de todos contra cada cenário sorteado.</p>
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-16">
          <Info className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
          <p className="text-foreground">{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Aviso de escopo */}
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/10 px-4 py-3 mb-6 text-sm">
            <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-foreground">
              Simulação do chaveamento inteiro (90min → prorrogação → pênaltis) até a final e o 3º lugar, com a
              força das seleções a partir do <strong>ranking FIFA</strong> + <strong>fase de grupos</strong>
              {data.calibrated ? ' + jogos do mata-mata já realizados' : ''}. Inclui a projeção de pódio.
            </p>
          </div>

          {/* Probabilidade das seleções */}
          {data.teams.length > 0 && (
            <Card className="bg-card border-border mb-6">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Trophy className="w-4 h-4 text-primary" />
                  <h3 className="text-foreground text-sm font-semibold">Quem leva a taça? — chance por seleção</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {data.teams.slice(0, 12).map((t) => (
                    <div key={t.team}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          {t.iso ? (
                            t.iso.trim().toLowerCase().startsWith('http') ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={t.iso.trim()} alt={t.team} className="w-5 h-5 rounded object-contain flex-shrink-0" />
                            ) : (
                              <Image src={getFlagUrl(t.iso)} alt={t.team} width={20} height={20} className="rounded flex-shrink-0" style={{ height: 'auto' }} />
                            )
                          ) : null}
                          <span className="text-foreground truncate">{t.team}</span>
                        </div>
                        <span className="text-primary font-bold tabular-nums flex-shrink-0">{pct(t.p_champion)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${Math.max(t.p_champion * 100, t.p_champion > 0 ? 2 : 0)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-muted-foreground text-[11px] mt-3">Mostrando as 12 seleções com maior chance de título.</p>
              </CardContent>
            </Card>
          )}

          {/* Destaques */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <HighlightCard
              icon={<Trophy className="w-5 h-5 text-primary" />}
              title="Favorito ao título"
              player={favTitle}
              value={favTitle ? pct(favTitle.chance_title) : '—'}
              accent="text-primary"
            />
            <HighlightCard
              icon={<Sparkles className="w-5 h-5 text-state-open" />}
              title="Maior pontuação projetada"
              player={topPoints}
              value={topPoints ? topPoints.projected_points.toFixed(0) + ' pts' : '—'}
              accent="text-state-open"
            />
            <HighlightCard
              icon={<ArrowDown className="w-5 h-5 text-destructive" />}
              title="Risco de lanterna"
              player={favLanterna}
              value={favLanterna ? pct(favLanterna.chance_lanterna) : '—'}
              accent="text-destructive"
            />
          </div>

          {/* Ranking projetado dos jogadores */}
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Ranking projetado dos jogadores</h2>
          </div>

          {/* Seletor de métrica — grid (sem scroll horizontal no mobile) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {METRICS.map((m) => {
              const Icon = m.icon;
              const active = m.key === metric;
              return (
                <button
                  key={m.key}
                  onClick={() => setMetric(m.key)}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-muted-foreground border-border hover:border-muted-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Ranking projetado */}
          <div className="space-y-2">
            {sorted.map((p, index) => {
              const metricVal = p[activeMetric.field] as number;
              const delta = p.projected_points - p.base_points;
              return (
                <Card key={p.user_id} className="bg-card border-border">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground font-bold w-6 text-center flex-shrink-0">{index + 1}º</span>
                      <Avatar className="w-9 h-9 border-2 border-border flex-shrink-0">
                        <AvatarImage src={p.avatar_url || undefined} />
                        <AvatarFallback className="bg-muted text-foreground text-xs">{getInitials(p.username)}</AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-foreground font-medium truncate">{p.username}</span>
                          <span className={`font-bold tabular-nums flex-shrink-0 ${activeMetric.chip}`}>{pct(metricVal)}</span>
                        </div>
                        {/* Barra da métrica selecionada */}
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden mt-1.5">
                          <div className={`h-full ${activeMetric.bar}`} style={{ width: `${Math.max(metricVal * 100, metricVal > 0 ? 2 : 0)}%` }} />
                        </div>
                        {/* Pontuação projetada + chips das 4 probabilidades */}
                        <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            Projeção: <strong className="text-foreground">{p.projected_points.toFixed(0)} pts</strong>
                            <span className="text-muted-foreground"> (atual {p.base_points}{delta >= 0 ? ` · +${delta.toFixed(0)}` : ''})</span>
                          </span>
                          <div className="flex items-center gap-2 text-[10px]">
                            {METRICS.map((m) => (
                              <span key={m.key} className={`${m.chip}`}>
                                {m.label.split(' ')[0]} {pct(p[m.field] as number)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <p className="text-muted-foreground text-xs text-center mt-6">
            {data.nScenarios.toLocaleString('pt-BR')} cenários simulados · gerado às{' '}
            {new Date(data.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </>
      )}
    </div>
  );
}

function HighlightCard({
  icon,
  title,
  player,
  value,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  player: PlayerResult | undefined;
  value: string;
  accent: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          {icon}
          <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{title}</span>
        </div>
        {player ? (
          <div className="flex items-center gap-2">
            <Avatar className="w-8 h-8 border border-border">
              <AvatarImage src={player.avatar_url || undefined} />
              <AvatarFallback className="bg-muted text-foreground text-xs">{getInitials(player.username)}</AvatarFallback>
            </Avatar>
            <span className="text-foreground font-semibold truncate flex-1">{player.username}</span>
            <span className={`font-bold ${accent}`}>{value}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </CardContent>
    </Card>
  );
}
