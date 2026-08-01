'use server';

// ============================================================================
// Projeção dos confrontos do bolão de clubes.
//
// Roda o motor de lib/club-model sobre os dados reais: prior Opta congelado em
// 31/07/2026 + jogos oficiais posteriores coletados da API-Football.
//
// O ajuste acontece AQUI, em TypeScript, e não em plpgsql no cron. Manter a
// matemática num lugar só evita a divergência silenciosa entre duas
// implementações da mesma fórmula — que é o defeito mais caro que este tipo de
// sistema costuma acumular.
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase';
import {
  DEFAULT_MU_AWAY,
  DEFAULT_MU_HOME,
  KAPPA,
  MODEL_VERSION,
  estimateBaselines,
  fitStrengths,
  projectTie,
} from '@/lib/club-model';
import type { ClubPrior, CompetitionBaseline, ModelMatch } from '@/lib/club-model';

export interface TieProjecao {
  tieId: number;
  competition: string;
  round: string | null;
  /** Mandante da IDA. */
  homeName: string;
  awayName: string;
  homeKey: string | null;
  awayKey: string | null;
  advance: number;
  low: number;
  high: number;
  decided: boolean;
  /** Jogos equivalentes de evidência pós-T0 por trás da estimativa. */
  evidence: number;
  idaScore: string | null;
  voltaScore: string | null;
}

export interface ProjecaoData {
  ties: TieProjecao[];
  modelVersion: string;
  /** Partidas pós-T0 que efetivamente entraram no ajuste. */
  matchesUsed: number;
  clubsFitted: number;
  calculatedAt: string;
}

export async function getProjecao(tournamentSlug: string): Promise<ProjecaoData> {
  const supabase = await createServerSupabaseClient();

  const [{ data: ratingsRaw }, { data: matchesRaw }, { data: tourn }] = await Promise.all([
    supabase.rpc('club_model_ratings'),
    supabase.rpc('club_model_matches'),
    supabase.from('tournaments').select('id').eq('slug', tournamentSlug).single(),
  ]);

  const priors: ClubPrior[] = ((ratingsRaw ?? []) as any[]).map((r) => ({
    teamKey: r.team_key,
    rating: Number(r.rating),
  }));
  const anchorKeys = ((ratingsRaw ?? []) as any[])
    .filter((r) => r.is_bolao_team)
    .map((r) => r.team_key);

  const observados: ModelMatch[] = ((matchesRaw ?? []) as any[]).map((m) => ({
    homeKey: m.home_key,
    awayKey: m.away_key,
    goalsHome: m.goals_home,
    goalsAway: m.goals_away,
    competition: m.competition,
    ageDays: Number(m.age_days),
  }));

  const pesos = new Map<string, number>();
  for (const m of (matchesRaw ?? []) as any[]) pesos.set(m.competition, Number(m.weight));

  // Baseline inicial calibrada no Paulistão (§1.3 do plano). Assim que houver
  // amostra própria, estimateBaselines a substitui pela da competição.
  let baselines = new Map<string, CompetitionBaseline>();
  for (const [comp, weight] of pesos) {
    baselines.set(comp, { muHome: DEFAULT_MU_HOME, muAway: DEFAULT_MU_AWAY, weight });
  }

  let fit = fitStrengths(priors, observados, baselines, { anchorKeys, kappa: KAPPA });
  // Alterna força e baseline algumas rodadas: é o que impede o viés por
  // competição descrito em §2.1 do plano. Com pouquíssimos jogos as baselines
  // mal se movem, e o encolhimento de estimateBaselines segura o exagero.
  for (let i = 0; i < 3 && observados.length >= 20; i++) {
    const novas = estimateBaselines(observados, fit.strengths, { weights: pesos });
    for (const [k, v] of novas) baselines.set(k, v);
    fit = fitStrengths(priors, observados, baselines, { anchorKeys, kappa: KAPPA });
  }

  // ── Confrontos do bolão ───────────────────────────────────────────────────
  const { data: partidas } = await supabase
    .from('matches')
    .select('tie_id, leg, competition, team_home, team_away, score_home, score_away, status, ties(round)')
    .eq('tournament_id', (tourn as any)?.id ?? -1)
    .not('tie_id', 'is', null);

  const { data: apelidosRaw } = await supabase.from('club_aliases').select('alias, team_key');
  const apelidos = new Map<string, string>();
  for (const a of (apelidosRaw ?? []) as any[]) apelidos.set(a.alias, a.team_key);
  const chaves = new Set(priors.map((p) => p.teamKey));
  const resolver = (nome: string): string | null => {
    const n = normalizar(nome);
    return apelidos.get(n) ?? (chaves.has(n) ? n : null);
  };

  const porTie = new Map<number, any[]>();
  for (const m of (partidas ?? []) as any[]) {
    if (!porTie.has(m.tie_id)) porTie.set(m.tie_id, []);
    porTie.get(m.tie_id)!.push(m);
  }

  const media = { muHome: DEFAULT_MU_HOME, muAway: DEFAULT_MU_AWAY, weight: 1 };
  const ties: TieProjecao[] = [];

  for (const [tieId, jogos] of porTie) {
    const ida = jogos.find((j) => j.leg === 'ida');
    const volta = jogos.find((j) => j.leg === 'volta');
    if (!ida) continue;

    const hk = resolver(ida.team_home);
    const ak = resolver(ida.team_away);
    const A = hk ? fit.strengths.get(hk) : undefined;
    const B = ak ? fit.strengths.get(ak) : undefined;

    const placar = (j: any) =>
      j && j.status === 'FINISHED' && j.score_home !== null && j.score_away !== null
        ? { home: j.score_home as number, away: j.score_away as number }
        : undefined;

    const base: TieProjecao = {
      tieId,
      competition: ida.competition,
      round: (ida.ties as any)?.round ?? null,
      homeName: ida.team_home,
      awayName: ida.team_away,
      homeKey: hk,
      awayKey: ak,
      advance: 0.5,
      low: 0.5,
      high: 0.5,
      decided: false,
      evidence: 0,
      idaScore: placar(ida) ? `${ida.score_home}–${ida.score_away}` : null,
      voltaScore: placar(volta) ? `${volta.score_home}–${volta.score_away}` : null,
    };

    // Clube sem prior não recebe projeção inventada: fica em 50/50 declarado.
    if (!A || !B) {
      ties.push(base);
      continue;
    }

    const p = projectTie(
      {
        homeFirstLeg: A,
        awayFirstLeg: B,
        baseline: baselines.get(ida.competition) ?? media,
        firstLegPlayed: placar(ida),
        secondLegPlayed: placar(volta),
      },
      2000,
      // Semente derivada do confronto: a mesma chave dá sempre o mesmo número,
      // então a página não "pisca" valores diferentes a cada carregamento.
      1_000_003 + tieId * 7919
    );

    ties.push({ ...base, advance: p.advance, low: p.low, high: p.high, decided: p.decided, evidence: p.evidence });
  }

  ties.sort(
    (a, b) => a.competition.localeCompare(b.competition) || a.homeName.localeCompare(b.homeName, 'pt-BR')
  );

  return {
    ties,
    modelVersion: MODEL_VERSION,
    matchesUsed: observados.length,
    clubsFitted: fit.strengths.size,
    calculatedAt: new Date().toISOString(),
  };
}

/** Espelha club_key_normalize() do banco. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
