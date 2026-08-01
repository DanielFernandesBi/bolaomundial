// ============================================================================
// Confronto de ida e volta, com a incerteza do modelo embutida.
//
// POR QUE NÃO BASTA UM NÚMERO: o Monte Carlo comum sorteia só o acaso do
// placar, com Atk/Def fixos no ponto estimado. Isso produz probabilidade
// SUPERCONFIANTE justamente quando há pouca evidência — que é exatamente o
// nosso caso, com o bolão começando um dia depois do snapshot.
//
// Aqui cada cenário também sorteia a força, de uma lognormal cuja dispersão
// cai com a evidência acumulada (kappa + soma dos pesos). Com zero jogos, a
// incerteza é a do prior; com muitos jogos, encolhe. O resultado sai como
// FAIXA, não como ponto — que é o único jeito honesto de exibir 53% quando o
// intervalo é 39–66%.
// ============================================================================

import { KAPPA } from './constants';
import { scoreMatrix, tieAdvanceProbability } from './poisson';
import type { ClubStrength, CompetitionBaseline } from './types';

/** Dispersão da força, em log, dada a evidência acumulada. */
export function strengthSigma(evidence: number, kappa: number = KAPPA): number {
  // 0,35 é o desvio típico de log-ataque entre clubes sul-americanos no prior
  // (dp de 3,35 pontos Opta × beta ≈ 0,12 por lado, mais o que o prior não
  // enxerga). Cai com 1/sqrt(evidência), como qualquer média.
  return 0.35 / Math.sqrt(kappa + Math.max(0, evidence));
}

/** Gerador determinístico — mesma projeção sempre que os dados forem os mesmos. */
export function makeRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal padrão por Box-Muller. */
function gauss(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function jitter(s: ClubStrength, rng: () => number): ClubStrength {
  const sd = strengthSigma(s.evidence);
  return {
    ...s,
    attack: s.attack * Math.exp(gauss(rng) * sd),
    defense: s.defense * Math.exp(gauss(rng) * sd),
  };
}

export interface TieInput {
  /** Clube que joga a IDA em casa. */
  homeFirstLeg: ClubStrength;
  awayFirstLeg: ClubStrength;
  baseline: CompetitionBaseline;
  /** Placar da ida, quando já foi jogada. */
  firstLegPlayed?: { home: number; away: number };
  /** Placar da volta, quando já foi jogada. */
  secondLegPlayed?: { home: number; away: number };
}

export interface TieProjection {
  /** Probabilidade de o mandante da ida avançar. */
  advance: number;
  /** Faixa de 90%: mostra a incerteza do modelo, não só a do sorteio. */
  low: number;
  high: number;
  /** Chance de o agregado terminar empatado (prorrogação/pênaltis). */
  drawnAggregate: number;
  /** Evidência acumulada dos dois clubes, em jogos equivalentes. */
  evidence: number;
  decided: boolean;
}

/**
 * Probabilidade de classificação num confronto de ida e volta.
 *
 * Jogo já disputado entra como FATO, não é ressimulado. Se os dois já foram,
 * o confronto está decidido e a função devolve 0 ou 1 — nunca uma projeção
 * sobre algo que já aconteceu.
 */
export function projectTie(input: TieInput, scenarios = 2000, seed = 20260801): TieProjection {
  const { homeFirstLeg: A, awayFirstLeg: B, baseline, firstLegPlayed, secondLegPlayed } = input;
  const evidence = (A.evidence + B.evidence) / 2;

  // Confronto encerrado: aritmética, não simulação.
  if (firstLegPlayed && secondLegPlayed) {
    const saldo =
      firstLegPlayed.home - firstLegPlayed.away + (secondLegPlayed.away - secondLegPlayed.home);
    return {
      advance: saldo > 0 ? 1 : saldo < 0 ? 0 : 0.5,
      low: saldo > 0 ? 1 : saldo < 0 ? 0 : 0.5,
      high: saldo > 0 ? 1 : saldo < 0 ? 0 : 0.5,
      drawnAggregate: saldo === 0 ? 1 : 0,
      evidence,
      decided: saldo !== 0,
    };
  }

  const rng = makeRng(seed);
  const amostras: number[] = [];
  let empateAgregado = 0;

  for (let i = 0; i < scenarios; i++) {
    const a = jitter(A, rng);
    const b = jitter(B, rng);

    // Ida: A em casa. Volta: B em casa.
    const mIda = firstLegPlayed
      ? null
      : scoreMatrix(
          Math.max(0.02, baseline.muHome * a.attack * b.defense),
          Math.max(0.02, baseline.muAway * b.attack * a.defense)
        );
    const mVolta = secondLegPlayed
      ? null
      : scoreMatrix(
          Math.max(0.02, baseline.muHome * b.attack * a.defense),
          Math.max(0.02, baseline.muAway * a.attack * b.defense)
        );

    // Um jogo já disputado vira uma matriz degenerada com toda a massa no
    // placar real. Assim a mesma convolução serve para os três casos.
    const fixa = (p: { home: number; away: number }) => {
      const m: number[][] = Array.from({ length: 13 }, () => new Array(13).fill(0));
      m[Math.min(12, p.home)][Math.min(12, p.away)] = 1;
      return m;
    };

    const r = tieAdvanceProbability(
      mIda ?? fixa(firstLegPlayed!),
      mVolta ?? fixa(secondLegPlayed!),
      0.5
    );
    amostras.push(r.advance);
    empateAgregado += r.drawnAggregate;
  }

  amostras.sort((x, y) => x - y);
  const q = (p: number) => amostras[Math.min(amostras.length - 1, Math.floor(p * amostras.length))];

  return {
    advance: amostras.reduce((s, v) => s + v, 0) / amostras.length,
    low: q(0.05),
    high: q(0.95),
    drawnAggregate: empateAgregado / scenarios,
    evidence,
    decided: false,
  };
}
