// ============================================================================
// Monte Carlo do RANKING DO BOLÃO de clubes.
//
// O que ele simula — e é isto que responde "de onde sai a chance de cada
// jogador terminar em primeiro":
//
//   1. os jogos ainda não disputados, a partir da força medida dos clubes;
//   2. os PALPITES já registrados, pontuados contra o mesmo desfecho sorteado.
//      Todos os jogadores no mesmo cenário, nunca cada um no seu — senão as
//      chances não somariam 100%;
//   3. o avanço pela chave até a final de cada competição;
//   4. o palpite de campeão e vice, que neste bolão é POR COMPETIÇÃO.
//
// Jogo já lançado entra como FATO. O que já virou ponto vem em `basePoints` e
// não é ressimulado, senão o passado mudaria a cada carregamento.
//
// SORTEIO DA CHAVE: na Copa do Brasil as quartas são sorteadas, e o banco diz
// isso — as oitavas dela não têm `next_tie_id`, enquanto as da Libertadores e
// da Sul-Americana têm. Onde a ligação existe, o vencedor sobe para o lugar
// certo; onde não existe, cada cenário sorteia o emparelhamento. Sem isso, a
// chance de título sairia de uma chave inventada e fixa.
// ============================================================================

import { makeRng, strengthSigma } from './knockout';
import type { ClubStrength, CompetitionBaseline } from './types';

export interface PoolPlayer {
  userId: string;
  username: string;
  avatarUrl: string | null;
  /** Pontos já consolidados (jogos encerrados). Não é ressimulado. */
  basePoints: number;
}

export interface PoolMatchPrediction {
  userId: string;
  matchId: number;
  predHome: number;
  predAway: number;
  /** Neste bolão o palpite de pênalti é QUEM SE CLASSIFICA, só no jogo de volta. */
  predPenWinner: 'home' | 'away' | null;
}

export interface PoolPodiumPick {
  userId: string;
  competition: string;
  champion: string | null;
  runnerUp: string | null;
}

export interface PoolTie {
  tieId: number;
  competition: string;
  round: string;
  slot: number;
  teamA: string | null;
  teamB: string | null;
  keyA: string | null;
  keyB: string | null;
  seriesType: 'two_leg' | 'single';
  hasExtraTime: boolean;
  nextTieId: number | null;
  nextSlotSide: 'a' | 'b' | null;
  idaMatchId: number | null;
  voltaMatchId: number | null;
  idaPlayed: { home: number; away: number } | null;
  voltaPlayed: { home: number; away: number } | null;
  /** Confronto já resolvido pelo admin. */
  winnerTeam: string | null;
}

export interface PoolInput {
  players: PoolPlayer[];
  ties: PoolTie[];
  predictions: PoolMatchPrediction[];
  podiumPicks: PoolPodiumPick[];
  strengths: Map<string, ClubStrength>;
  baselines: Map<string, CompetitionBaseline>;
  /** Fases da primeira à última, ex.: ['oitavas','quartas','semi','final']. */
  roundOrder: string[];
  scenarios?: number;
  seed?: number;
}

export interface PoolPlayerResult {
  userId: string;
  username: string;
  avatarUrl: string | null;
  basePoints: number;
  meanPoints: number;
  p5: number;
  p95: number;
  titleChance: number;
  top3Chance: number;
  lastChance: number;
}

export interface PoolResult {
  players: PoolPlayerResult[];
  scenarios: number;
  clubTitleChance: { competition: string; team: string; chance: number }[];
  /** Partidas ainda em aberto que já têm palpite registrado. */
  openPredictedMatches: number;
}

// ── Pontuação ───────────────────────────────────────────────────────────────
// Espelha calculate_prediction_points() do banco, que é a verdade. Escrito
// aqui em vez de importado do motor de seleções para este módulo não depender
// daquele — mas os dois têm de continuar batendo com o SQL.
export function scoreLine(ph: number, pa: number, sh: number, sa: number): number {
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

/**
 * Espelha calc_pen_winner_points(): 7 por acertar quem VENCE A DISPUTA DE
 * PÊNALTIS. Não é por acertar quem se classifica — se o confronto se decidir
 * nos 180 minutos, este palpite não paga nada.
 */
export const PONTOS_PENALTIS = 7;

/** Espelha calc_podium_points_cv(): 40 campeão, 25 vice, 10 de consolação. */
export function scorePodium(
  pickChamp: string | null,
  pickVice: string | null,
  realChamp: string,
  realVice: string
): number {
  const n = (s: string | null) => (s ? s.toLowerCase().trim() : null);
  const c = n(pickChamp);
  const v = n(pickVice);
  const rc = n(realChamp)!;
  const rv = n(realVice)!;
  let pts = 0;
  if (c) {
    if (c === rc) pts += 40;
    else if (c === rv) pts += 10;
  }
  if (v && v !== c) {
    if (v === rv) pts += 25;
    else if (v === rc) pts += 10;
  }
  return pts;
}

// ── Amostragem ──────────────────────────────────────────────────────────────
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

function gauss(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

const FORCA_NEUTRA: ClubStrength = {
  teamKey: '__desconhecido',
  attack: 1,
  defense: 1,
  attackPrior: 1,
  defensePrior: 1,
  evidence: 0,
  matches: 0,
};
const MEDIA_PADRAO: CompetitionBaseline = { muHome: 1.468, muAway: 0.819, weight: 1 };
const FATOR_PRORROGACAO = (30 / 90) * 0.9;
const CONVERSAO_PENALTI = 0.75;

function disputaPenaltis(rng: () => number): boolean {
  let h = 0;
  let a = 0;
  for (let i = 0; i < 5; i++) {
    if (rng() < CONVERSAO_PENALTI) h++;
    if (rng() < CONVERSAO_PENALTI) a++;
  }
  while (h === a) {
    if (rng() < CONVERSAO_PENALTI) h++;
    if (rng() < CONVERSAO_PENALTI) a++;
  }
  return h > a;
}

interface Participante {
  nome: string | null;
  key: string | null;
}

export function runPoolSimulation(input: PoolInput): PoolResult {
  const {
    players,
    ties,
    predictions,
    podiumPicks,
    strengths,
    baselines,
    roundOrder,
    scenarios = 4000,
    seed = 20260801,
  } = input;

  const rng = makeRng(seed);
  const idx = new Map(players.map((p, i) => [p.userId, i]));
  const n = players.length;
  const ultimaFase = roundOrder[roundOrder.length - 1];

  const porPartida = new Map<number, PoolMatchPrediction[]>();
  for (const p of predictions) {
    if (!porPartida.has(p.matchId)) porPartida.set(p.matchId, []);
    porPartida.get(p.matchId)!.push(p);
  }

  const podioPorComp = new Map<string, PoolPodiumPick[]>();
  for (const p of podiumPicks) {
    if (!podioPorComp.has(p.competition)) podioPorComp.set(p.competition, []);
    podioPorComp.get(p.competition)!.push(p);
  }

  const tiesPorComp = new Map<string, PoolTie[]>();
  for (const t of ties) {
    if (!tiesPorComp.has(t.competition)) tiesPorComp.set(t.competition, []);
    tiesPorComp.get(t.competition)!.push(t);
  }
  const competicoes = [...tiesPorComp.keys()];

  const totais: number[][] = players.map(() => []);
  const titulos = new Array<number>(n).fill(0);
  const top3 = new Array<number>(n).fill(0);
  const lanternas = new Array<number>(n).fill(0);
  const titulosClube = new Map<string, number>();

  for (let s = 0; s < scenarios; s++) {
    // A força é sorteada UMA vez por cenário: dentro do mesmo cenário o clube é
    // o mesmo em todas as partidas, como na realidade. Sortear por partida
    // apagaria a correlação e estreitaria as chances artificialmente.
    const forcaCenario = new Map<string, ClubStrength>();
    const forca = (key: string | null): ClubStrength => {
      if (!key) return FORCA_NEUTRA;
      const cache = forcaCenario.get(key);
      if (cache) return cache;
      const base = strengths.get(key) ?? FORCA_NEUTRA;
      const sd = strengthSigma(base.evidence);
      const v: ClubStrength = {
        ...base,
        attack: base.attack * Math.exp(gauss(rng) * sd),
        defense: base.defense * Math.exp(gauss(rng) * sd),
      };
      forcaCenario.set(key, v);
      return v;
    };

    const pontos = new Array<number>(n).fill(0);

    for (const comp of competicoes) {
      const doComp = tiesPorComp.get(comp)!;
      const baseline = baselines.get(comp) ?? MEDIA_PADRAO;

      // Estado LOCAL do cenário. Estava no escopo do módulo numa primeira
      // versão, e isso vazaria participantes de um cenário para o seguinte.
      const ladoA = new Map<number, Participante>();
      const ladoB = new Map<number, Participante>();
      for (const t of doComp) {
        ladoA.set(t.tieId, { nome: t.teamA, key: t.keyA });
        ladoB.set(t.tieId, { nome: t.teamB, key: t.keyB });
      }
      /** Vencedores da fase anterior que ainda não têm lugar: o bolo do sorteio. */
      let bolo: Participante[] = [];

      let campeao: string | null = null;
      let vice: string | null = null;

      for (const round of roundOrder) {
        const daFase = doComp.filter((t) => t.round === round).sort((a, b) => a.slot - b.slot);
        if (daFase.length === 0) continue;

        // ── Sorteio ────────────────────────────────────────────────────────
        // Vaga vazia = a chave não diz quem joga ali. É o caso da Copa do
        // Brasil, cujas oitavas não apontam para as quartas.
        const vagas: { tieId: number; lado: 'a' | 'b' }[] = [];
        for (const t of daFase) {
          if (!ladoA.get(t.tieId)?.nome) vagas.push({ tieId: t.tieId, lado: 'a' });
          if (!ladoB.get(t.tieId)?.nome) vagas.push({ tieId: t.tieId, lado: 'b' });
        }
        if (vagas.length > 0 && bolo.length > 0) {
          for (let i = bolo.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [bolo[i], bolo[j]] = [bolo[j], bolo[i]];
          }
          for (const vaga of vagas) {
            const v = bolo.pop();
            if (!v) break;
            (vaga.lado === 'a' ? ladoA : ladoB).set(vaga.tieId, v);
          }
        }

        const semDestino: Participante[] = [];

        for (const t of daFase) {
          const A = ladoA.get(t.tieId)!;
          const B = ladoB.get(t.tieId)!;

          let vencedor: Participante;
          let perdedor: Participante;

          if (t.winnerTeam) {
            // Confronto que o admin já resolveu: fato, não simulação.
            const venceuA = t.winnerTeam === A.nome;
            vencedor = venceuA ? A : B;
            perdedor = venceuA ? B : A;
          } else {
            const fa = forca(A.key);
            const fb = forca(B.key);
            const sorteia = (mandante: ClubStrength, visitante: ClubStrength): [number, number] => [
              samplePoisson(Math.max(0.02, baseline.muHome * mandante.attack * visitante.defense), rng),
              samplePoisson(Math.max(0.02, baseline.muAway * visitante.attack * mandante.defense), rng),
            ];

            // Palpite de PÊNALTIS. Só vale quando o confronto de fato vai aos
            // pênaltis — é o que diz calc_pen_winner_points() e o que a régua
            // na tela promete ("só conta quando o confronto vai aos pênaltis").
            // Uma versão anterior pagava por acertar quem se classifica, o que
            // inflava o ranking projetado: acontece sempre, e não em ~1 de
            // cada 5 confrontos.
            const aguardando: { i: number; pred: 'home' | 'away' }[] = [];
            const pontuarPartida = (
              matchId: number | null,
              casa: number,
              fora: number,
              ehVolta: boolean
            ) => {
              if (matchId === null) return;
              for (const pr of porPartida.get(matchId) ?? []) {
                const i = idx.get(pr.userId);
                if (i === undefined) continue;
                pontos[i] += scoreLine(pr.predHome, pr.predAway, casa, fora);
                if (ehVolta && pr.predPenWinner) aguardando.push({ i, pred: pr.predPenWinner });
              }
            };

            let golsA = 0;
            let golsB = 0;

            if (t.seriesType === 'two_leg') {
              let ida = t.idaPlayed;
              if (!ida) {
                const [h, a] = sorteia(fa, fb);
                ida = { home: h, away: a };
                pontuarPartida(t.idaMatchId, h, a, false);
              }
              golsA += ida.home;
              golsB += ida.away;

              // Na volta o mandante é B.
              let volta = t.voltaPlayed;
              if (!volta) {
                const [h, a] = sorteia(fb, fa);
                volta = { home: h, away: a };
                pontuarPartida(t.voltaMatchId, h, a, true);
              }
              golsB += volta.home;
              golsA += volta.away;
            } else {
              // Jogo único — as três finais. O "mandante" é A.
              const jogo = t.idaPlayed ?? t.voltaPlayed;
              if (jogo) {
                golsA = jogo.home;
                golsB = jogo.away;
              } else {
                const [h, a] = sorteia(fa, fb);
                golsA = h;
                golsB = a;
                pontuarPartida(t.idaMatchId ?? t.voltaMatchId, h, a, true);
              }
            }

            let venceuA: boolean;
            let foiNosPenaltis = false;
            if (golsA !== golsB) {
              venceuA = golsA > golsB;
            } else {
              // Prorrogação só onde o regulamento prevê. Neste bolão o empate
              // no agregado vai direto para os pênaltis nas três competições.
              let ea = 0;
              let eb = 0;
              if (t.hasExtraTime) {
                ea = samplePoisson(baseline.muHome * fa.attack * fb.defense * FATOR_PRORROGACAO, rng);
                eb = samplePoisson(baseline.muAway * fb.attack * fa.defense * FATOR_PRORROGACAO, rng);
              }
              if (ea !== eb) {
                venceuA = ea > eb;
              } else {
                venceuA = disputaPenaltis(rng);
                foiNosPenaltis = true;
              }
            }

            // Os 7 pontos são do PÊNALTI, não da classificação: sem disputa,
            // ninguém pontua, mesmo tendo apontado quem passou.
            if (foiNosPenaltis) {
              // O palpite é gravado na orientação do jogo de VOLTA, onde o
              // mandante é B. Então "home" quer dizer que B vence a disputa.
              const venceuPenaltis: 'home' | 'away' = venceuA ? 'away' : 'home';
              for (const a of aguardando) {
                if (a.pred === venceuPenaltis) pontos[a.i] += PONTOS_PENALTIS;
              }
            }

            vencedor = venceuA ? A : B;
            perdedor = venceuA ? B : A;
          }

          if (round === ultimaFase) {
            campeao = vencedor.nome;
            vice = perdedor.nome;
          } else if (t.nextTieId !== null && t.nextSlotSide) {
            (t.nextSlotSide === 'a' ? ladoA : ladoB).set(t.nextTieId, vencedor);
          } else {
            semDestino.push(vencedor);
          }
        }

        bolo = semDestino;
      }

      if (campeao && vice) {
        const chave = `${comp}|${campeao}`;
        titulosClube.set(chave, (titulosClube.get(chave) ?? 0) + 1);
        for (const pick of podioPorComp.get(comp) ?? []) {
          const i = idx.get(pick.userId);
          if (i === undefined) continue;
          pontos[i] += scorePodium(pick.champion, pick.runnerUp, campeao, vice);
        }
      }
    }

    // ── Classificação deste cenário ─────────────────────────────────────────
    const finais = players.map((p, i) => ({ i, total: p.basePoints + pontos[i] }));
    finais.sort((a, b) => b.total - a.total);
    for (const f of finais) totais[f.i].push(f.total);

    // Empate divide o crédito. Premiar quem apareceu primeiro na ordenação
    // seria um desempate arbitrário do array, não do bolão.
    const melhor = finais[0].total;
    const pior = finais[finais.length - 1].total;
    const noTopo = finais.filter((f) => f.total === melhor);
    for (const f of noTopo) titulos[f.i] += 1 / noTopo.length;
    for (const f of finais.slice(0, 3)) top3[f.i] += 1;
    const noFundo = finais.filter((f) => f.total === pior);
    for (const f of noFundo) lanternas[f.i] += 1 / noFundo.length;
  }

  const quantil = (arr: number[], q: number) => {
    const ord = [...arr].sort((a, b) => a - b);
    return ord[Math.min(ord.length - 1, Math.floor(q * ord.length))];
  };

  const abertas = new Set<number>();
  for (const t of ties) {
    if (!t.idaPlayed && t.idaMatchId && porPartida.has(t.idaMatchId)) abertas.add(t.idaMatchId);
    if (!t.voltaPlayed && t.voltaMatchId && porPartida.has(t.voltaMatchId)) abertas.add(t.voltaMatchId);
  }

  return {
    players: players
      .map((p, i) => ({
        userId: p.userId,
        username: p.username,
        avatarUrl: p.avatarUrl,
        basePoints: p.basePoints,
        meanPoints: totais[i].reduce((a, b) => a + b, 0) / scenarios,
        p5: quantil(totais[i], 0.05),
        p95: quantil(totais[i], 0.95),
        titleChance: titulos[i] / scenarios,
        top3Chance: top3[i] / scenarios,
        lastChance: lanternas[i] / scenarios,
      }))
      .sort((a, b) => b.meanPoints - a.meanPoints),
    scenarios,
    clubTitleChance: [...titulosClube.entries()]
      .map(([k, v]) => {
        const [competition, team] = k.split('|');
        return { competition, team, chance: v / scenarios };
      })
      .sort((a, b) => a.competition.localeCompare(b.competition) || b.chance - a.chance),
    openPredictedMatches: abertas.size,
  };
}
