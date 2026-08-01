'use server';

// ============================================================================
// Projeção do bolão de clubes: confrontos e ranking.
//
// Roda o motor de lib/club-model sobre os dados reais — prior Opta congelado
// em 31/07/2026 mais os jogos oficiais posteriores coletados da API-Football.
//
// O ajuste acontece AQUI, em TypeScript, e não em plpgsql no cron. Manter a
// matemática num lugar só evita a divergência silenciosa entre duas
// implementações da mesma fórmula.
//
// ATENÇÃO: arquivo 'use server'. Todo export precisa ser função async — um
// `export const` invalida o módulo inteiro e derruba o build.
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase';
import {
  DEFAULT_MU_AWAY,
  DEFAULT_MU_HOME,
  KAPPA,
  MODEL_VERSION,
  estimateBaselines,
  fitStrengths,
  poolBaseline,
  projectTie,
  runPoolSimulation,
} from '@/lib/club-model';
import type {
  ClubPrior,
  ClubStrength,
  CompetitionBaseline,
  ModelMatch,
  PoolPlayer,
  PoolPodiumPick,
  PoolResult,
  PoolTie,
} from '@/lib/club-model';

export interface TieProjecao {
  tieId: number;
  competition: string;
  round: string | null;
  homeName: string;
  awayName: string;
  homeCrest: string | null;
  awayCrest: string | null;
  advance: number;
  low: number;
  high: number;
  decided: boolean;
  idaScore: string | null;
  voltaScore: string | null;
}

/** Chance de o clube levantar a taça daquela competição. */
export interface TituloClube {
  competition: string;
  team: string;
  crest: string | null;
  chance: number;
}

export interface ProjecaoData {
  ties: TieProjecao[];
  titulosClube: TituloClube[];
  ranking: PoolResult | null;
  modelVersion: string;
  matchesUsed: number;
  clubsFitted: number;
  jogosEncerrados: number;
  jogosEmAberto: number;
  palpitesEmAberto: number;
  palpitesDePodio: number;
}

const ROUND_ORDER = ['oitavas', 'quartas', 'semi', 'final'];

// ── Ajuste, compartilhado pelas duas projeções ──────────────────────────────
interface Ajuste {
  strengths: Map<string, ClubStrength>;
  baselines: Map<string, CompetitionBaseline>;
  resolver: (nome: string | null) => string | null;
  /** Escudo por chave, vindo da API-Football. */
  escudoDaApi: Map<string, string>;
  matchesUsed: number;
  clubsFitted: number;
}

async function ajustarForcas(supabase: any): Promise<Ajuste> {
  const [{ data: ratingsRaw }, { data: matchesRaw }, { data: apelidosRaw }, { data: escudosRaw }] =
    await Promise.all([
    supabase.rpc('club_model_ratings'),
    supabase.rpc('club_model_matches'),
    supabase.from('club_aliases').select('alias, team_key'),
    supabase.from('club_source_ids').select('team_key, crest_url').not('crest_url', 'is', null),
  ]);

  const priors: ClubPrior[] = ((ratingsRaw ?? []) as any[]).map((r) => ({
    teamKey: r.team_key,
    rating: Number(r.rating),
  }));
  const anchorKeys = ((ratingsRaw ?? []) as any[]).filter((r) => r.is_bolao_team).map((r) => r.team_key);

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

  const baselines = new Map<string, CompetitionBaseline>();
  for (const [comp, weight] of pesos) {
    baselines.set(comp, { muHome: DEFAULT_MU_HOME, muAway: DEFAULT_MU_AWAY, weight });
  }

  let fit = fitStrengths(priors, observados, baselines, { anchorKeys, kappa: KAPPA });
  // Alterna força e baseline: é o que impede o viés por competição descrito em
  // §2.1 do plano. Só vale a pena com amostra — abaixo disso o encolhimento de
  // estimateBaselines devolveria praticamente a média global.
  for (let i = 0; i < 3 && observados.length >= 20; i++) {
    const novas = estimateBaselines(observados, fit.strengths, { weights: pesos });
    for (const [k, v] of novas) baselines.set(k, v);
    fit = fitStrengths(priors, observados, baselines, { anchorKeys, kappa: KAPPA });
  }

  const apelidos = new Map<string, string>();
  for (const a of (apelidosRaw ?? []) as any[]) apelidos.set(a.alias, a.team_key);
  const chaves = new Set(priors.map((p) => p.teamKey));

  // Escudo que a própria API-Football manda. Chega sozinho para todo clube que
  // entra em campo — não depende de ninguém cadastrar.
  const escudoDaApi = new Map<string, string>();
  for (const e of (escudosRaw ?? []) as any[]) escudoDaApi.set(e.team_key, e.crest_url);

  return {
    strengths: fit.strengths,
    baselines,
    resolver: (nome: string | null) => {
      if (!nome) return null;
      const n = normalizar(nome);
      return apelidos.get(n) ?? (chaves.has(n) ? n : null);
    },
    escudoDaApi,
    matchesUsed: observados.length,
    clubsFitted: fit.strengths.size,
  };
}

// ── Projeção pública ────────────────────────────────────────────────────────
export async function getProjecao(tournamentSlug: string): Promise<ProjecaoData> {
  const supabase = await createServerSupabaseClient();

  const { data: tourn } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();
  const tid = (tourn as any)?.id as number | undefined;

  const ajuste = await ajustarForcas(supabase);

  const [{ data: tiesRaw }, { data: matchesRaw }, { data: predsRaw }, { data: podiosRaw }, { data: rankingRaw }] =
    await Promise.all([
      supabase
        .from('ties')
        .select(
          'id, competition, round, slot, team_a, team_b, series_type, match_has_extra_time, ' +
            'next_tie_id, next_slot_side, ida_match_id, volta_match_id, winner_team'
        )
        .eq('tournament_id', tid ?? -1),
      // `home_iso`/`away_iso` guardam o escudo que o admin cadastrou ao montar a
      // chave. É a mesma fonte usada em /resultados — uma imagem só por clube.
      supabase
        .from('matches')
        .select('id, status, score_home, score_away, team_home, home_iso, team_away, away_iso')
        .eq('tournament_id', tid ?? -1),
      supabase
        .from('predictions')
        .select('user_id, match_id, pred_home, pred_away, pred_pen_winner, matches!inner(tournament_id)')
        .eq('matches.tournament_id', tid ?? -1),
      supabase
        .from('podium_predictions')
        .select('user_id, competition, champion_team, runner_up_team')
        .eq('tournament_id', tid ?? -1),
      supabase
        .from('tournament_rankings')
        .select('user_id, total_points, profiles(username, avatar_url)')
        .eq('tournament_id', tid ?? -1),
    ]);

  const placar = new Map<number, { home: number; away: number } | null>();
  // Escudo por CHAVE canônica: `matches` grava "Vasco" numa competição e
  // "Vasco da Gama" noutra, e só a chave junta os dois. `iso` só vale como
  // escudo quando é URL — nos torneios de seleções a mesma coluna guardava
  // código de país, e renderizar <img src="br"> falharia.
  const escudoPorChave = new Map<string, string>();
  const registrarEscudo = (nome?: string | null, url?: string | null) => {
    if (!nome || !url || !url.startsWith('http')) return;
    const chave = ajuste.resolver(nome);
    if (chave && !escudoPorChave.has(chave)) escudoPorChave.set(chave, url);
  };
  let jogosEncerrados = 0;
  for (const m of (matchesRaw ?? []) as any[]) {
    const ok = m.status === 'FINISHED' && m.score_home !== null && m.score_away !== null;
    placar.set(m.id, ok ? { home: m.score_home, away: m.score_away } : null);
    if (ok) jogosEncerrados++;
    registrarEscudo(m.team_home, m.home_iso);
    registrarEscudo(m.team_away, m.away_iso);
  }
  // A API vem primeiro: ela cobre qualquer clube que já entrou em campo. O
  // cadastro do admin em `matches` é a reserva, para os clubes do bolão que
  // ainda não jogaram desde 31/07.
  const escudoDe = (nome: string | null): string | null => {
    const chave = ajuste.resolver(nome);
    if (!chave) return null;
    return ajuste.escudoDaApi.get(chave) ?? escudoPorChave.get(chave) ?? null;
  };

  const ties: PoolTie[] = ((tiesRaw ?? []) as any[]).map((t) => ({
    tieId: t.id,
    competition: t.competition,
    round: t.round,
    slot: t.slot,
    teamA: t.team_a,
    teamB: t.team_b,
    keyA: ajuste.resolver(t.team_a),
    keyB: ajuste.resolver(t.team_b),
    seriesType: t.series_type === 'single' ? 'single' : 'two_leg',
    hasExtraTime: !!t.match_has_extra_time,
    nextTieId: t.next_tie_id ?? null,
    nextSlotSide: t.next_slot_side === 'a' || t.next_slot_side === 'b' ? t.next_slot_side : null,
    idaMatchId: t.ida_match_id ?? null,
    voltaMatchId: t.volta_match_id ?? null,
    idaPlayed: t.ida_match_id ? placar.get(t.ida_match_id) ?? null : null,
    voltaPlayed: t.volta_match_id ? placar.get(t.volta_match_id) ?? null : null,
    winnerTeam: t.winner_team ?? null,
  }));

  // ── Confronto a confronto ────────────────────────────────────────────────
  const projecoes: TieProjecao[] = [];
  for (const t of ties) {
    // Só as fases já sorteadas têm participantes; as futuras entram no Monte
    // Carlo do ranking, mas não têm o que exibir aqui.
    if (!t.teamA || !t.teamB) continue;

    const A = t.keyA ? ajuste.strengths.get(t.keyA) : undefined;
    const B = t.keyB ? ajuste.strengths.get(t.keyB) : undefined;
    const base: TieProjecao = {
      tieId: t.tieId,
      competition: t.competition,
      round: t.round,
      homeName: t.teamA,
      awayName: t.teamB,
      homeCrest: escudoDe(t.teamA),
      awayCrest: escudoDe(t.teamB),
      advance: 0.5,
      low: 0.5,
      high: 0.5,
      decided: false,
      idaScore: t.idaPlayed ? `${t.idaPlayed.home}–${t.idaPlayed.away}` : null,
      voltaScore: t.voltaPlayed ? `${t.voltaPlayed.home}–${t.voltaPlayed.away}` : null,
    };

    // Clube sem prior não recebe projeção inventada: fica em 50/50 declarado.
    if (!A || !B) {
      projecoes.push(base);
      continue;
    }

    const p = projectTie(
      {
        homeFirstLeg: A,
        awayFirstLeg: B,
        // poolBaseline e não DEFAULT_*: a média do Paulistão dá mando de campo
        // grande demais para mata-mata (ver constants.ts).
        baseline: ajuste.baselines.get(t.competition) ?? poolBaseline(t.competition),
        firstLegPlayed: t.idaPlayed ?? undefined,
        secondLegPlayed: t.voltaPlayed ?? undefined,
      },
      2000,
      // Semente derivada do confronto: o mesmo dado dá sempre o mesmo número,
      // então a página não "pisca" valores diferentes a cada carregamento.
      1_000_003 + t.tieId * 7919
    );
    projecoes.push({ ...base, advance: p.advance, low: p.low, high: p.high, decided: p.decided });
  }

  projecoes.sort(
    (a, b) => a.competition.localeCompare(b.competition) || a.homeName.localeCompare(b.homeName, 'pt-BR')
  );

  // ── Ranking do bolão ─────────────────────────────────────────────────────
  const players: PoolPlayer[] = ((rankingRaw ?? []) as any[]).map((r) => ({
    userId: r.user_id,
    username: (r.profiles as any)?.username ?? 'jogador',
    avatarUrl: (r.profiles as any)?.avatar_url ?? null,
    // Pontos já consolidados. NÃO são ressimulados: o passado não pode mudar a
    // cada carregamento da página.
    basePoints: Number(r.total_points) || 0,
  }));

  const predictions = ((predsRaw ?? []) as any[]).map((p) => ({
    userId: p.user_id,
    matchId: p.match_id,
    predHome: p.pred_home,
    predAway: p.pred_away,
    predPenWinner: (p.pred_pen_winner as 'home' | 'away' | null) ?? null,
  }));

  const podiumPicks: PoolPodiumPick[] = ((podiosRaw ?? []) as any[]).map((p) => ({
    userId: p.user_id,
    competition: p.competition,
    champion: p.champion_team,
    runnerUp: p.runner_up_team,
  }));

  const emAberto = new Set<number>();
  for (const t of ties) {
    if (t.idaMatchId && !t.idaPlayed) emAberto.add(t.idaMatchId);
    if (t.voltaMatchId && !t.voltaPlayed) emAberto.add(t.voltaMatchId);
  }

  // O Monte Carlo procura a baseline pela chave da COMPETIÇÃO do confronto
  // ('libertadores', …), e o ajuste indexa por CATEGORIA da liga
  // ('continental', …). Sem estas entradas ele caía no default do Paulistão.
  const baselinesDoBolao = new Map(ajuste.baselines);
  for (const c of new Set(ties.map((t) => t.competition))) {
    if (!baselinesDoBolao.has(c)) baselinesDoBolao.set(c, poolBaseline(c));
  }

  const ranking =
    players.length > 0
      ? runPoolSimulation({
          players,
          ties,
          predictions,
          podiumPicks,
          strengths: ajuste.strengths,
          baselines: baselinesDoBolao,
          roundOrder: ROUND_ORDER,
          scenarios: 4000,
          seed: 20260801,
        })
      : null;

  return {
    ties: projecoes,
    titulosClube: (ranking?.clubTitleChance ?? []).map((c) => ({
      ...c,
      crest: escudoDe(c.team),
    })),
    ranking,
    modelVersion: MODEL_VERSION,
    matchesUsed: ajuste.matchesUsed,
    clubsFitted: ajuste.clubsFitted,
    jogosEncerrados,
    jogosEmAberto: emAberto.size,
    palpitesEmAberto: predictions.filter((p) => emAberto.has(p.matchId)).length,
    palpitesDePodio: podiumPicks.length,
  };
}

/** Espelha club_key_normalize() do banco. Se um mudar, o outro tem de mudar. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
