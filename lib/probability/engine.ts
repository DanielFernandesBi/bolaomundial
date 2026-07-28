// ============================================================================
// Motor de probabilidades do bolão (Monte Carlo) — com chaveamento, prior FIFA
// e histórico de grupos. Simula a chave inteira (R32 -> ... -> final + 3º),
// resolvendo cada confronto 90min -> prorrogação -> pênaltis, pontua os palpites
// de todos contra o MESMO desfecho (camadas A/B/C + pódio D), ranqueia e agrega.
// Ver motor_probabilidade.md.
// ============================================================================

import { teamKey, getGroupResults, FIFA_POINTS, type HistGame } from './data';

export interface SimPlayer {
  user_id: string;
  username: string;
  avatar_url: string | null;
  base_points: number;
  base_exacts: number;
}

export interface SimMatchFull {
  id: number;
  team_home: string;
  team_away: string;
  is_knockout: boolean;
  status: string;
  score_home: number | null;
  score_away: number | null;
  extra_time_result: 'home' | 'draw' | 'away' | null;
  pen_home: number | null;
  pen_away: number | null;
}

export interface SimPrediction {
  user_id: string;
  match_id: number;
  pred_home: number;
  pred_away: number;
  pred_extra_result: 'home' | 'draw' | 'away' | null;
  pred_pen_home: number | null;
  pred_pen_away: number | null;
}

export interface SimPodiumPick {
  user_id: string;
  champion_team: string | null;
  runner_up_team: string | null;
  third_place_team: string | null;
}

export interface SimInput {
  players: SimPlayer[];
  matches: SimMatchFull[];
  predictions: SimPrediction[];
  podiumPredictions: SimPodiumPick[];
  bracketOrder: [string, string][]; // 16 pares do R32 na ordem da chave
  thirdPlace: boolean;
  podiumDecided: boolean; // se o pódio real já foi lançado (não projetar)
  nScenarios?: number;
}

export interface PlayerResult {
  user_id: string;
  username: string;
  avatar_url: string | null;
  base_points: number;
  projected_points: number;
  chance_title: number;
  chance_top3: number;
  chance_z4: number;
  chance_lanterna: number;
}

export interface TeamChance {
  team: string;
  iso?: string | null;
  p_champion: number;
  p_final: number;
}

export interface SimResult {
  players: PlayerResult[];
  teams: TeamChance[];
  nScenarios: number;
  pendingCount: number;
  calibrated: boolean;
  generatedAt: string;
}

// ── PRNG / Poisson ──────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function samplePoisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

// ── Parâmetros (calibráveis) ────────────────────────────────────────────────
const DEFAULT_GOALS = 1.35;
const ET_FACTOR = (30 / 90) * 0.9;
const PEN_CONVERSION = 0.75;
const WEIGHT_GROUP = 1.0; // peso dos jogos de grupo
const WEIGHT_KNOCKOUT = 2.0; // mata-mata pesa mais (mais recente)
const FIFA_PRIOR_GAMES = 4; // força do prior FIFA (em "jogos equivalentes")
const FIFA_BETA = 0.3; // sensibilidade da força aos pontos FIFA
const FIFA_SCALE = 150; // dispersão dos pontos FIFA

// ── Calibração (ataque/defesa com encolhimento para o prior FIFA) ───────────
interface Calibration {
  leagueAvg: number;
  attack: Map<string, number>;
  defense: Map<string, number>;
  ok: boolean;
}

function fifaMean(): number {
  let s = 0;
  let n = 0;
  for (const v of FIFA_POINTS.values()) {
    s += v;
    n++;
  }
  return n ? s / n : 1600;
}

function calibrate(finishedKO: HistGame[], group: HistGame[]): Calibration {
  const gf = new Map<string, number>();
  const ga = new Map<string, number>();
  const w = new Map<string, number>();
  let totalGoals = 0;
  let totalGames = 0;

  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) || 0) + v);

  const ingest = (games: HistGame[], weight: number) => {
    for (const g of games) {
      const h = teamKey(g.home);
      const a = teamKey(g.away);
      // só acumulamos para seleções da chave (têm FIFA)
      if (FIFA_POINTS.has(h)) {
        add(gf, h, g.sh * weight);
        add(ga, h, g.sa * weight);
        add(w, h, weight);
      }
      if (FIFA_POINTS.has(a)) {
        add(gf, a, g.sa * weight);
        add(ga, a, g.sh * weight);
        add(w, a, weight);
      }
      totalGoals += (g.sh + g.sa) * weight;
      totalGames += 2 * weight;
    }
  };

  ingest(group, WEIGHT_GROUP);
  ingest(finishedKO, WEIGHT_KNOCKOUT);

  const leagueAvg = totalGames > 0 ? totalGoals / totalGames : DEFAULT_GOALS;
  const mean = fifaMean();

  const attack = new Map<string, number>();
  const defense = new Map<string, number>();

  for (const [team, pts] of FIFA_POINTS) {
    const rel = (pts - mean) / FIFA_SCALE;
    const m = Math.exp(FIFA_BETA * rel);
    const atkPrior = m;
    const defPrior = 1 / m;

    const tw = w.get(team) || 0;
    const tgf = gf.get(team) || 0;
    const tga = ga.get(team) || 0;

    const atk =
      (tgf + FIFA_PRIOR_GAMES * leagueAvg * atkPrior) / (tw + FIFA_PRIOR_GAMES) / leagueAvg;
    const def =
      (tga + FIFA_PRIOR_GAMES * leagueAvg * defPrior) / (tw + FIFA_PRIOR_GAMES) / leagueAvg;

    attack.set(team, atk);
    defense.set(team, def);
  }

  return { leagueAvg, attack, defense, ok: true };
}

function lambdasFor(cal: Calibration, home: string, away: string): [number, number] {
  const h = teamKey(home);
  const a = teamKey(away);
  const atkH = cal.attack.get(h) ?? 1;
  const defH = cal.defense.get(h) ?? 1;
  const atkA = cal.attack.get(a) ?? 1;
  const defA = cal.defense.get(a) ?? 1;
  return [Math.max(0.05, cal.leagueAvg * atkH * defA), Math.max(0.05, cal.leagueAvg * atkA * defH)];
}

// ── Pontuação (espelha o SQL atual: empate 15, vitória 10) ──────────────────
export function scoreRegular(ph: number, pa: number, sh: number, sa: number): number {
  if (ph === sh && pa === sa) return 30;
  const pr = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
  const ar = sh > sa ? 'H' : sh < sa ? 'A' : 'D';
  if (ar === 'D') {
    if (pr === 'D') return 15;
    return ph === sh || pa === sa ? 3 : 0;
  }
  if (pr === ar) {
    const pdiff = Math.abs(ph - pa);
    const adiff = Math.abs(sh - sa);
    const pwin = pr === 'H' ? ph : pa;
    const plos = pr === 'H' ? pa : ph;
    const awin = ar === 'H' ? sh : sa;
    const alos = ar === 'H' ? sa : sh;
    if (pdiff === adiff) return 15;
    if (pwin === awin) return 17;
    if (plos === alos) return 12;
    return 10;
  }
  return ph === sh || pa === sa ? 3 : 0;
}
function scoreExtra(pe: 'home' | 'draw' | 'away' | null, ae: 'home' | 'draw' | 'away' | null): number {
  if (!ae || !pe) return 0;
  return pe === ae ? 5 : 0;
}
function scorePens(ph: number | null, pa: number | null, ah: number | null, aa: number | null): number {
  if (ah == null || aa == null || ph == null || pa == null) return 0;
  if (ph === ah && pa === aa) return 10;
  const pw = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
  const aw = ah > aa ? 'H' : ah < aa ? 'A' : 'D';
  if (pw !== 'D' && pw === aw) return 5;
  return 0;
}
function scorePodium(
  pick: SimPodiumPick,
  champ: string,
  vice: string,
  third: string | null
): number {
  const c = pick.champion_team ? teamKey(pick.champion_team) : null;
  const r = pick.runner_up_team ? teamKey(pick.runner_up_team) : null;
  const t = pick.third_place_team ? teamKey(pick.third_place_team) : null;
  const rc = teamKey(champ);
  const rr = teamKey(vice);
  const rt = third ? teamKey(third) : null;
  let pts = 0;
  if (c) {
    if (c === rc) pts += 40;
    else if (c === rr || (rt && c === rt)) pts += 10;
  }
  if (r && r !== c) {
    if (r === rr) pts += 20;
    else if (r === rc || (rt && r === rt)) pts += 10;
  }
  if (t && t !== c && t !== r) {
    if (rt && t === rt) pts += 25;
    else if (t === rc || t === rr) pts += 10;
  }
  return pts;
}

// ── Resolução de confronto (na orientação home/away dada) ───────────────────
interface Outcome {
  sh: number;
  sa: number;
  hadET: boolean;
  etResult: 'home' | 'draw' | 'away' | null;
  hadPens: boolean;
  penH: number | null;
  penA: number | null;
  winner: 'home' | 'away';
}

function shootout(rng: () => number): [number, number] {
  let h = 0;
  let a = 0;
  for (let i = 0; i < 5; i++) {
    if (rng() < PEN_CONVERSION) h++;
    if (rng() < PEN_CONVERSION) a++;
  }
  while (h === a) {
    if (rng() < PEN_CONVERSION) h++;
    if (rng() < PEN_CONVERSION) a++;
  }
  return [h, a];
}

function simulate(lh: number, la: number, rng: () => number): Outcome {
  const sh = samplePoisson(lh, rng);
  const sa = samplePoisson(la, rng);
  if (sh !== sa) {
    return { sh, sa, hadET: false, etResult: null, hadPens: false, penH: null, penA: null, winner: sh > sa ? 'home' : 'away' };
  }
  const eh = samplePoisson(lh * ET_FACTOR, rng);
  const ea = samplePoisson(la * ET_FACTOR, rng);
  if (eh !== ea) {
    return { sh, sa, hadET: true, etResult: eh > ea ? 'home' : 'away', hadPens: false, penH: null, penA: null, winner: eh > ea ? 'home' : 'away' };
  }
  const [penH, penA] = shootout(rng);
  return { sh, sa, hadET: true, etResult: 'draw', hadPens: true, penH, penA, winner: penH > penA ? 'home' : 'away' };
}

function actualOutcome(m: SimMatchFull): Outcome {
  const sh = m.score_home ?? 0;
  const sa = m.score_away ?? 0;
  let winner: 'home' | 'away';
  if (m.pen_home != null && m.pen_away != null) winner = m.pen_home > m.pen_away ? 'home' : 'away';
  else if (m.extra_time_result === 'home' || m.extra_time_result === 'away') winner = m.extra_time_result;
  else winner = sh >= sa ? 'home' : 'away';
  return {
    sh,
    sa,
    hadET: m.extra_time_result != null,
    etResult: m.extra_time_result,
    hadPens: m.pen_home != null,
    penH: m.pen_home,
    penA: m.pen_away,
    winner,
  };
}

// ── Bracket ─────────────────────────────────────────────────────────────────
interface BracketNode {
  code: string;
  home: { team?: string; win?: string; lose?: string };
  away: { team?: string; win?: string; lose?: string };
}

function buildBracket(order: [string, string][], thirdPlace: boolean): BracketNode[] {
  const nodes: BracketNode[] = [];
  for (let i = 0; i < 16; i++) {
    nodes.push({ code: `R32-${i + 1}`, home: { team: order[i][0] }, away: { team: order[i][1] } });
  }
  for (let j = 1; j <= 8; j++) {
    nodes.push({ code: `R16-${j}`, home: { win: `R32-${2 * j - 1}` }, away: { win: `R32-${2 * j}` } });
  }
  for (let k = 1; k <= 4; k++) {
    nodes.push({ code: `QF-${k}`, home: { win: `R16-${2 * k - 1}` }, away: { win: `R16-${2 * k}` } });
  }
  for (let m = 1; m <= 2; m++) {
    nodes.push({ code: `SF-${m}`, home: { win: `QF-${2 * m - 1}` }, away: { win: `QF-${2 * m}` } });
  }
  nodes.push({ code: 'F', home: { win: 'SF-1' }, away: { win: 'SF-2' } });
  if (thirdPlace) nodes.push({ code: '3P', home: { lose: 'SF-1' }, away: { lose: 'SF-2' } });
  return nodes;
}

// ── Monte Carlo ─────────────────────────────────────────────────────────────
export function runSimulation(input: SimInput): SimResult {
  const { players, matches, predictions, podiumPredictions, bracketOrder, thirdPlace, podiumDecided } = input;
  const n = players.length;
  const N = input.nScenarios ?? 20000;

  const idxOf = new Map<string, number>();
  players.forEach((p, i) => idxOf.set(p.user_id, i));

  // Índice de partidas reais por par de times (independe da orientação)
  const pairIndex = new Map<string, SimMatchFull>();
  for (const m of matches) {
    const key = [teamKey(m.team_home), teamKey(m.team_away)].sort().join('|');
    pairIndex.set(key, m);
  }

  // Palpites por jogo
  const predsByMatch = new Map<number, SimPrediction[]>();
  for (const pr of predictions) {
    if (!idxOf.has(pr.user_id)) continue;
    if (!predsByMatch.has(pr.match_id)) predsByMatch.set(pr.match_id, []);
    predsByMatch.get(pr.match_id)!.push(pr);
  }

  // Palpites de pódio dos jogadores conhecidos
  const podiumByPlayer = podiumPredictions.filter((p) => idxOf.has(p.user_id));

  // Calibração
  const groupGames = getGroupResults();
  const finishedKO: HistGame[] = matches
    .filter((m) => m.status === 'FINISHED' && m.score_home != null && m.score_away != null)
    .map((m) => ({ home: m.team_home, away: m.team_away, sh: m.score_home as number, sa: m.score_away as number }));
  const cal = calibrate(finishedKO, groupGames);

  const bracket = buildBracket(bracketOrder, thirdPlace);

  const base = players.map((p) => p.base_points);
  const baseExacts = players.map((p) => p.base_exacts);
  const pendingCount = matches.filter((m) => m.status !== 'FINISHED').length;

  const seed = (finishedKO.length * 7919 + predictions.length * 104729 + n * 31 + 17) >>> 0;
  const rng = mulberry32(seed || 1);

  const titleCount = new Array(n).fill(0);
  const top3Count = new Array(n).fill(0);
  const z4Count = new Array(n).fill(0);
  const lanternaCount = new Array(n).fill(0);
  const sumPoints = new Array(n).fill(0);

  const championTeam = new Map<string, number>();
  const finalTeam = new Map<string, number>();

  const order = new Array(n);
  for (let i = 0; i < n; i++) order[i] = i;

  const winners = new Map<string, string>();
  const losers = new Map<string, string>();

  for (let s = 0; s < N; s++) {
    const total = base.slice();
    const exacts = baseExacts.slice();
    winners.clear();
    losers.clear();

    for (const node of bracket) {
      const homeTeam = node.home.team ?? (node.home.win ? winners.get(node.home.win)! : losers.get(node.home.lose!)!);
      const awayTeam = node.away.team ?? (node.away.win ? winners.get(node.away.win)! : losers.get(node.away.lose!)!);

      const pairKey = [teamKey(homeTeam), teamKey(awayTeam)].sort().join('|');
      const real = pairIndex.get(pairKey);

      let o: Outcome;
      let scoreHomeTeam = homeTeam;
      let scoreAwayTeam = awayTeam;

      if (real) {
        // orienta pela partida real (pred_home se refere a real.team_home)
        scoreHomeTeam = real.team_home;
        scoreAwayTeam = real.team_away;
        if (real.status === 'FINISHED') {
          o = actualOutcome(real); // resultado fixo; já está na base (não pontua)
        } else {
          const [lh, la] = lambdasFor(cal, scoreHomeTeam, scoreAwayTeam);
          o = simulate(lh, la, rng);
          const preds = predsByMatch.get(real.id);
          if (preds) {
            for (const pr of preds) {
              const i = idxOf.get(pr.user_id)!;
              let pts = scoreRegular(pr.pred_home, pr.pred_away, o.sh, o.sa);
              if (pts === 30) exacts[i] += 1;
              if (o.hadET) pts += scoreExtra(pr.pred_extra_result, o.etResult);
              if (o.hadPens) pts += scorePens(pr.pred_pen_home, pr.pred_pen_away, o.penH, o.penA);
              total[i] += pts;
            }
          }
        }
      } else {
        const [lh, la] = lambdasFor(cal, homeTeam, awayTeam);
        o = simulate(lh, la, rng);
      }

      const winTeam = o.winner === 'home' ? scoreHomeTeam : scoreAwayTeam;
      const loseTeam = o.winner === 'home' ? scoreAwayTeam : scoreHomeTeam;
      winners.set(node.code, winTeam);
      losers.set(node.code, loseTeam);
    }

    const champ = winners.get('F')!;
    const vice = losers.get('F')!;
    const third = thirdPlace ? winners.get('3P') ?? null : null;

    championTeam.set(teamKey(champ), (championTeam.get(teamKey(champ)) || 0) + 1);
    finalTeam.set(teamKey(champ), (finalTeam.get(teamKey(champ)) || 0) + 1);
    finalTeam.set(teamKey(vice), (finalTeam.get(teamKey(vice)) || 0) + 1);

    if (!podiumDecided) {
      for (const pick of podiumByPlayer) {
        const i = idxOf.get(pick.user_id)!;
        total[i] += scorePodium(pick, champ, vice, third);
      }
    }

    order.sort((x: number, y: number) => total[y] - total[x] || exacts[y] - exacts[x]);
    for (let rank = 0; rank < n; rank++) {
      const i = order[rank];
      if (rank === 0) titleCount[i]++;
      if (rank < 3) top3Count[i]++;
      if (rank >= n - 4) z4Count[i]++;
      if (rank === n - 1) lanternaCount[i]++;
    }
    for (let i = 0; i < n; i++) sumPoints[i] += total[i];
  }

  const playerResults: PlayerResult[] = players
    .map((p, i) => ({
      user_id: p.user_id,
      username: p.username,
      avatar_url: p.avatar_url,
      base_points: p.base_points,
      projected_points: sumPoints[i] / N,
      chance_title: titleCount[i] / N,
      chance_top3: top3Count[i] / N,
      chance_z4: z4Count[i] / N,
      chance_lanterna: lanternaCount[i] / N,
    }))
    .sort((a, b) => b.projected_points - a.projected_points);

  // Nome de exibição por teamKey (a partir do bracketOrder)
  const displayName = new Map<string, string>();
  for (const [h, a] of bracketOrder) {
    displayName.set(teamKey(h), h);
    displayName.set(teamKey(a), a);
  }

  const teams: TeamChance[] = Array.from(finalTeam.keys())
    .map((k) => ({
      team: displayName.get(k) ?? k,
      p_champion: (championTeam.get(k) || 0) / N,
      p_final: (finalTeam.get(k) || 0) / N,
    }))
    .sort((a, b) => b.p_champion - a.p_champion);

  return {
    players: playerResults,
    teams,
    nScenarios: N,
    pendingCount,
    calibrated: finishedKO.length > 0,
    generatedAt: new Date().toISOString(),
  };
}
