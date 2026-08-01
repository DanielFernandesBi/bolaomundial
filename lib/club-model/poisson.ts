// ============================================================================
// Da força ao placar: lambdas, matriz de placares (Poisson, com a correção
// Dixon-Coles opcional) e probabilidades de resultado.
// ============================================================================

import { MAX_GOALS, RHO } from './constants';
import type { ClubStrength, CompetitionBaseline } from './types';

/** Gols esperados de cada lado. `neutral` anula a vantagem de mando. */
export function lambdas(
  home: ClubStrength,
  away: ClubStrength,
  baseline: CompetitionBaseline,
  neutral = false
): [number, number] {
  const muH = neutral
    ? baseline.muNeutral ?? (baseline.muHome + baseline.muAway) / 2
    : baseline.muHome;
  const muA = neutral
    ? baseline.muNeutral ?? (baseline.muHome + baseline.muAway) / 2
    : baseline.muAway;
  // Piso pequeno: lambda zero quebraria o log e não descreve time nenhum.
  return [
    Math.max(0.02, muH * home.attack * away.defense),
    Math.max(0.02, muA * away.attack * home.defense),
  ];
}

function poissonPmf(lambda: number, kMax: number): number[] {
  const p = new Array<number>(kMax + 1);
  let termo = Math.exp(-lambda);
  p[0] = termo;
  for (let k = 1; k <= kMax; k++) {
    termo = (termo * lambda) / k;
    p[k] = termo;
  }
  return p;
}

/**
 * Faixa em que a correção Dixon-Coles não produz probabilidade negativa.
 *
 * tau(0,0) = 1 − lH·lA·rho, tau(0,1) = 1 + lH·rho, tau(1,0) = 1 + lA·rho,
 * tau(1,1) = 1 − rho. Todos precisam ser positivos. Sem essa trava, um rho
 * calibrado numa competição e aplicado a lambdas maiores em outra devolve
 * célula negativa e a matriz para de ser distribuição.
 */
export function rhoBounds(lambdaHome: number, lambdaAway: number): [number, number] {
  const min = Math.max(-1 / lambdaHome, -1 / lambdaAway);
  const max = Math.min(1 / (lambdaHome * lambdaAway), 1);
  return [min, max];
}

/**
 * Matriz de probabilidade de cada placar. `m[x][y]` = P(mandante x, visitante y).
 *
 * A matriz é truncada em MAX_GOALS e renormalizada, então soma exatamente 1.
 */
export function scoreMatrix(
  lambdaHome: number,
  lambdaAway: number,
  rho: number = RHO,
  maxGoals: number = MAX_GOALS
): number[][] {
  const ph = poissonPmf(lambdaHome, maxGoals);
  const pa = poissonPmf(lambdaAway, maxGoals);

  let rhoUsado = rho;
  if (rho !== 0) {
    const [min, max] = rhoBounds(lambdaHome, lambdaAway);
    // Grampeia em vez de lançar: isto roda dentro do Monte Carlo, e derrubar a
    // simulação inteira por causa de um confronto extremo seria pior do que
    // aplicar a correção no limite em que ela ainda é válida.
    rhoUsado = Math.min(Math.max(rho, min * 0.999), max * 0.999);
  }

  const m: number[][] = [];
  let soma = 0;
  for (let x = 0; x <= maxGoals; x++) {
    m[x] = new Array<number>(maxGoals + 1);
    for (let y = 0; y <= maxGoals; y++) {
      let v = ph[x] * pa[y];
      if (rhoUsado !== 0) {
        if (x === 0 && y === 0) v *= 1 - lambdaHome * lambdaAway * rhoUsado;
        else if (x === 0 && y === 1) v *= 1 + lambdaHome * rhoUsado;
        else if (x === 1 && y === 0) v *= 1 + lambdaAway * rhoUsado;
        else if (x === 1 && y === 1) v *= 1 - rhoUsado;
      }
      m[x][y] = v;
      soma += v;
    }
  }
  if (soma > 0) {
    for (let x = 0; x <= maxGoals; x++) {
      for (let y = 0; y <= maxGoals; y++) m[x][y] /= soma;
    }
  }
  return m;
}

/** [vitória do mandante, empate, vitória do visitante]. */
export function outcomeProbs(matrix: number[][]): [number, number, number] {
  let casa = 0;
  let empate = 0;
  let fora = 0;
  for (let x = 0; x < matrix.length; x++) {
    for (let y = 0; y < matrix[x].length; y++) {
      if (x > y) casa += matrix[x][y];
      else if (x === y) empate += matrix[x][y];
      else fora += matrix[x][y];
    }
  }
  return [casa, empate, fora];
}

/** Placar mais provável da matriz. */
export function mostLikelyScore(matrix: number[][]): { home: number; away: number; p: number } {
  let melhor = { home: 0, away: 0, p: -1 };
  for (let x = 0; x < matrix.length; x++) {
    for (let y = 0; y < matrix[x].length; y++) {
      if (matrix[x][y] > melhor.p) melhor = { home: x, away: y, p: matrix[x][y] };
    }
  }
  return melhor;
}

/**
 * Distribuição do saldo agregado de um confronto de ida e volta, na
 * perspectiva do clube A (mandante da ida).
 *
 * Sem regra de gol fora: nenhuma das três competições a usa desde 2022–23. Os
 * dois jogos são independentes dado lambda, o que ignora que um time perdendo
 * por 2 no segundo jogo ataca mais — limitação conhecida de todo modelo
 * Poisson, aceitável nesta versão.
 */
export function aggregateDistribution(
  matrizIda: number[][],
  matrizVolta: number[][]
): Map<number, number> {
  // Saldo de cada jogo primeiro: reduz de O(n^4) para O(n^2) + convolução.
  const saldoIda = new Map<number, number>();
  for (let x = 0; x < matrizIda.length; x++) {
    for (let y = 0; y < matrizIda[x].length; y++) {
      const d = x - y;
      saldoIda.set(d, (saldoIda.get(d) ?? 0) + matrizIda[x][y]);
    }
  }
  // Na volta o mandante é B, então o saldo de A é (golsB - golsA) invertido.
  const saldoVolta = new Map<number, number>();
  for (let x = 0; x < matrizVolta.length; x++) {
    for (let y = 0; y < matrizVolta[x].length; y++) {
      const d = y - x;
      saldoVolta.set(d, (saldoVolta.get(d) ?? 0) + matrizVolta[x][y]);
    }
  }

  const agregado = new Map<number, number>();
  for (const [d1, p1] of saldoIda) {
    if (p1 < 1e-12) continue;
    for (const [d2, p2] of saldoVolta) {
      if (p2 < 1e-12) continue;
      const d = d1 + d2;
      agregado.set(d, (agregado.get(d) ?? 0) + p1 * p2);
    }
  }
  return agregado;
}

/**
 * Probabilidade de o clube A avançar num confronto de ida e volta.
 *
 * `pDesempateA` é a chance de A vencer quando o agregado empata (prorrogação
 * e/ou pênaltis, conforme o regulamento da competição). O padrão 0,5 é o
 * neutro; quem chamar pode refinar com a força relativa.
 */
export function tieAdvanceProbability(
  matrizIda: number[][],
  matrizVolta: number[][],
  pDesempateA = 0.5
): { advance: number; drawnAggregate: number } {
  const agregado = aggregateDistribution(matrizIda, matrizVolta);
  let vence = 0;
  let empata = 0;
  for (const [d, p] of agregado) {
    if (d > 0) vence += p;
    else if (d === 0) empata += p;
  }
  return { advance: vence + empata * pDesempateA, drawnAggregate: empata };
}
