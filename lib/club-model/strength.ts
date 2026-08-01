// ============================================================================
// Força de ataque e defesa dos clubes: prior Opta + jogos oficiais pós-T0.
//
// POR QUE UM AJUSTE CONJUNTO ITERADO, e não a conta de uma passada só que a
// especificação propunha:
//
// A fórmula original corrige cada observação pela força do adversário tomada
// do prior (`Def_adversário,0`) e faz a média ponderada das razões. Testei
// contra a alternativa óbvia — razão de somas, que é o estimador de máxima
// verossimilhança do Poisson — num estudo Monte Carlo pareado com verdade
// conhecida:
//
//   • com a força do adversário conhecida EXATAMENTE, a razão de somas ganha,
//     e o ganho cresce com a heterogeneidade do adversário (até +10% de RMSE);
//   • com a força do adversário vinda do prior, que é o caso real, ela INVERTE
//     e perde até 12%, porque concentra o peso nos jogos contra adversários
//     fracos — justamente os de estimativa mais incerta — e o erro do
//     denominador vira viés.
//
// A saída não é escolher entre as duas: é estimar a força do adversário a
// partir dos dados em vez de plugá-la do prior. Cada iteração usa a razão de
// somas com o valor CORRENTE de todo mundo, até o ponto fixo. Isso ganha
// sempre (+0,15% a +0,29% de log-loss preditivo), nunca explode, e de quebra
// resolve dois defeitos que não teriam outra solução: o adversário congelado
// no valor inicial e o mu_c mal identificado.
//
// Ver MODELO_CLUBES_PLANO.md §2.1.
// ============================================================================

import {
  BETA,
  KAPPA,
  HALF_LIFE_DAYS,
  FIT_MAX_ITERATIONS,
  FIT_TOLERANCE,
  assertBeta,
} from './constants';
import type {
  ClubPrior,
  ClubStrength,
  CompetitionBaseline,
  FitParams,
  FitResult,
  ModelMatch,
} from './types';

/**
 * Rating Opta -> ataque e defesa iniciais.
 *
 * `anchorKeys` define o conjunto cuja média centra a escala: força 1,0 quer
 * dizer "um clube médio DESSE conjunto". Adversários de fora usam o mesmo beta
 * e a mesma média, senão as duas escalas não conversam.
 */
export function buildPriors(
  priors: ClubPrior[],
  opts: { beta?: number; anchorKeys?: Iterable<string> } = {}
): Map<string, { attack: number; defense: number; rating: number }> {
  const beta = opts.beta ?? BETA;
  assertBeta(beta);

  const anchor = opts.anchorKeys ? new Set(opts.anchorKeys) : null;
  const usados = anchor ? priors.filter((p) => anchor.has(p.teamKey)) : priors;
  if (usados.length === 0) {
    throw new Error('buildPriors: conjunto de ancoragem vazio.');
  }
  const media = usados.reduce((s, p) => s + p.rating, 0) / usados.length;

  const out = new Map<string, { attack: number; defense: number; rating: number }>();
  for (const p of priors) {
    const theta = beta * (p.rating - media);
    out.set(p.teamKey, {
      attack: Math.exp(theta / 2),
      defense: Math.exp(-theta / 2),
      rating: p.rating,
    });
  }
  return out;
}

/** Peso de uma partida: recência × importância da competição. */
export function matchWeight(
  match: ModelMatch,
  baseline: CompetitionBaseline | undefined,
  halfLifeDays: number = HALF_LIFE_DAYS
): number {
  const wComp = baseline?.weight ?? 1;
  if (wComp <= 0) return 0;
  const idade = Math.max(0, match.ageDays);
  return Math.pow(2, -idade / halfLifeDays) * wComp;
}

interface Acumulador {
  numA: number;
  denA: number;
  numD: number;
  denD: number;
}

/**
 * Ajusta ataque e defesa de todos os clubes ao mesmo tempo.
 *
 * Partidas cujo mandante ou visitante não tenha prior são ignoradas — é a
 * regra `model_eligible = false` da especificação. Elas continuam existindo
 * para exibição, só não movem o modelo.
 */
export function fitStrengths(
  priors: ClubPrior[],
  matches: ModelMatch[],
  baselines: Map<string, CompetitionBaseline>,
  params: FitParams & { anchorKeys?: Iterable<string> } = {}
): FitResult {
  const beta = params.beta ?? BETA;
  const kappa = params.kappa ?? KAPPA;
  const halfLife = params.halfLifeDays ?? HALF_LIFE_DAYS;
  const maxIter = params.maxIterations ?? FIT_MAX_ITERATIONS;
  const tol = params.tolerance ?? FIT_TOLERANCE;

  const prior = buildPriors(priors, { beta, anchorKeys: params.anchorKeys });

  // Nível de referência do prior: a média dos mu das competições observadas.
  // Serve só para pôr os kappa pseudo-jogos na mesma unidade dos gols reais.
  const usadas = [...baselines.values()];
  const muBar =
    usadas.length > 0
      ? usadas.reduce((s, b) => s + (b.muHome + b.muAway) / 2, 0) / usadas.length
      : 1;

  const uteis = matches.filter(
    (m) =>
      prior.has(m.homeKey) &&
      prior.has(m.awayKey) &&
      matchWeight(m, baselines.get(m.competition), halfLife) > 0
  );

  const attack = new Map<string, number>();
  const defense = new Map<string, number>();
  const evidencia = new Map<string, number>();
  const contagem = new Map<string, number>();
  for (const [key, p] of prior) {
    attack.set(key, p.attack);
    defense.set(key, p.defense);
    evidencia.set(key, 0);
    contagem.set(key, 0);
  }

  for (const m of uteis) {
    const w = matchWeight(m, baselines.get(m.competition), halfLife);
    for (const k of [m.homeKey, m.awayKey]) {
      evidencia.set(k, (evidencia.get(k) ?? 0) + w);
      contagem.set(k, (contagem.get(k) ?? 0) + 1);
    }
  }

  let iteracoes = 0;
  let convergiu = false;

  for (let it = 1; it <= maxIter; it++) {
    iteracoes = it;
    const acc = new Map<string, Acumulador>();
    for (const [key, p] of prior) {
      acc.set(key, {
        numA: kappa * muBar * p.attack,
        denA: kappa * muBar,
        numD: kappa * muBar * p.defense,
        denD: kappa * muBar,
      });
    }

    for (const m of uteis) {
      const base = baselines.get(m.competition);
      const w = matchWeight(m, base, halfLife);
      // Em campo neutro o rótulo mandante é operacional: os dois lados usam a
      // mesma média, senão o sorteio de quem "é mandante" viraria vantagem.
      const muH = m.neutral ? base?.muNeutral ?? (base!.muHome + base!.muAway) / 2 : base!.muHome;
      const muA = m.neutral ? base?.muNeutral ?? (base!.muHome + base!.muAway) / 2 : base!.muAway;

      const h = acc.get(m.homeKey)!;
      const a = acc.get(m.awayKey)!;
      const atkH = attack.get(m.homeKey)!;
      const defH = defense.get(m.homeKey)!;
      const atkA = attack.get(m.awayKey)!;
      const defA = defense.get(m.awayKey)!;

      // Gols do mandante: informam o ataque dele e a defesa do visitante.
      h.numA += w * m.goalsHome;
      h.denA += w * muH * defA;
      a.numD += w * m.goalsHome;
      a.denD += w * muH * atkH;

      // Gols do visitante: espelho.
      a.numA += w * m.goalsAway;
      a.denA += w * muA * defH;
      h.numD += w * m.goalsAway;
      h.denD += w * muA * atkA;
    }

    let maiorMudanca = 0;
    for (const [key, v] of acc) {
      const novoA = v.numA / v.denA;
      const novoD = v.numD / v.denD;
      maiorMudanca = Math.max(
        maiorMudanca,
        Math.abs(Math.log(novoA / attack.get(key)!)),
        Math.abs(Math.log(novoD / defense.get(key)!))
      );
      attack.set(key, novoA);
      defense.set(key, novoD);
    }

    if (maiorMudanca < tol) {
      convergiu = true;
      break;
    }
  }

  const strengths = new Map<string, ClubStrength>();
  for (const [key, p] of prior) {
    strengths.set(key, {
      teamKey: key,
      attack: attack.get(key)!,
      defense: defense.get(key)!,
      attackPrior: p.attack,
      defensePrior: p.defense,
      evidence: evidencia.get(key) ?? 0,
      matches: contagem.get(key) ?? 0,
    });
  }

  return { strengths, iterations: iteracoes, converged: convergiu };
}

/**
 * Reestima os gols médios de cada competição dadas as forças correntes.
 *
 * Isto é o que impede o viés por competição: `muHome` precisa significar
 * "gols esperados entre dois clubes de força 1,0", não "média bruta de gols da
 * competição". Como a média dos 40 do bolão está acima da média do Brasileirão
 * e abaixo da média da Libertadores, usar a média bruta enviesaria cada
 * competição num sentido diferente.
 *
 * `shrinkK` puxa competições de amostra pequena para a média global (§16 da
 * especificação), evitando baselines extremas com meia dúzia de jogos.
 */
export function estimateBaselines(
  matches: ModelMatch[],
  strengths: Map<string, ClubStrength>,
  opts: { halfLifeDays?: number; shrinkK?: number; weights?: Map<string, number> } = {}
): Map<string, CompetitionBaseline> {
  const halfLife = opts.halfLifeDays ?? HALF_LIFE_DAYS;
  const shrinkK = opts.shrinkK ?? 20;

  interface Bucket {
    golsH: number;
    espH: number;
    golsA: number;
    espA: number;
    n: number;
  }
  const buckets = new Map<string, Bucket>();
  const global: Bucket = { golsH: 0, espH: 0, golsA: 0, espA: 0, n: 0 };

  for (const m of matches) {
    const h = strengths.get(m.homeKey);
    const a = strengths.get(m.awayKey);
    if (!h || !a) continue;
    const wComp = opts.weights?.get(m.competition) ?? 1;
    if (wComp <= 0) continue;
    const w = Math.pow(2, -Math.max(0, m.ageDays) / halfLife) * wComp;

    const b =
      buckets.get(m.competition) ??
      buckets.set(m.competition, { golsH: 0, espH: 0, golsA: 0, espA: 0, n: 0 }).get(m.competition)!;

    for (const alvo of [b, global]) {
      alvo.golsH += w * m.goalsHome;
      alvo.espH += w * h.attack * a.defense;
      alvo.golsA += w * m.goalsAway;
      alvo.espA += w * a.attack * h.defense;
      alvo.n += w;
    }
  }

  const muHGlobal = global.espH > 0 ? global.golsH / global.espH : 1;
  const muAGlobal = global.espA > 0 ? global.golsA / global.espA : 1;

  const out = new Map<string, CompetitionBaseline>();
  for (const [comp, b] of buckets) {
    const muH = b.espH > 0 ? b.golsH / b.espH : muHGlobal;
    const muA = b.espA > 0 ? b.golsA / b.espA : muAGlobal;
    const n = b.n;
    out.set(comp, {
      muHome: (n * muH + shrinkK * muHGlobal) / (n + shrinkK),
      muAway: (n * muA + shrinkK * muAGlobal) / (n + shrinkK),
      weight: opts.weights?.get(comp) ?? 1,
    });
  }
  return out;
}
