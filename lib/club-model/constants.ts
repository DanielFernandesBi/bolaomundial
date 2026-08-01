// ============================================================================
// Parâmetros do modelo de clubes. Todos calibráveis — e versionados, porque
// mudar qualquer um deles muda toda projeção já publicada.
//
// A calibração está documentada em MODELO_CLUBES_PLANO.md §1.3 e §2.2.
// ============================================================================

export const MODEL_VERSION = 'clubs-2026-v1';

/**
 * Sensibilidade da força ao rating Opta, na escala CRUA do Opta (0–100).
 *
 * Ajustado por máxima verossimilhança sobre os 72 jogos do Paulistão 2026:
 * beta = 0,0361, IC95% aproximado [0,017 ; 0,057].
 *
 * ATENÇÃO à escala. O motor de seleções usa FIFA_BETA = 0,3 sobre pontos FIFA
 * já divididos por FIFA_SCALE = 150. Aqui não há divisor: o beta multiplica a
 * diferença de rating direto. Reaproveitar 0,3 daria exp(0,3 × 16,7 / 2) ≈ 12×
 * de vantagem entre o melhor e o pior clube do bolão. Ver assertBeta().
 */
export const BETA = 0.0361;

/**
 * Peso do prior Opta, em "jogos equivalentes".
 *
 * A especificação sugeria 5. O estudo de sensibilidade mostrou que kappa é o
 * parâmetro que mais importa — errar para baixo custa 5% de log-loss, muito
 * mais do que errar beta ou a meia-vida — e que 5 é baixo demais: com 8 jogos
 * observados, a probabilidade de classificação oscilava 42 pontos percentuais
 * por puro ruído de placar. Com 12 essa faixa cai para ~27 pp.
 */
export const KAPPA = 12;

/** Meia-vida do peso temporal, em dias. Parâmetro pouco sensível (≤ 1%). */
export const HALF_LIFE_DAYS = 60;

/**
 * Correção Dixon-Coles. Desligada na v1.
 *
 * Medida nos 72 jogos do Paulistão: ganho de 0,0038 nats/jogo — 4% do que o
 * mando de campo entrega — e não distinguível de zero (delta de log-
 * verossimilhança 0,27, precisaria > 1,92). Em troca traria um parâmetro a
 * calibrar e um modo de falha (tau negativo). Entra quando houver amostra das
 * três copas que justifique.
 */
export const RHO = 0;

/** Gols médios quando não há baseline calibrada para a competição. */
export const DEFAULT_MU_HOME = 1.468;
export const DEFAULT_MU_AWAY = 0.819;

/** Iterações do ajuste conjunto e critério de parada (em log). */
export const FIT_MAX_ITERATIONS = 60;
export const FIT_TOLERANCE = 1e-7;

/** Maior placar considerado na matriz de probabilidades, por lado. */
export const MAX_GOALS = 12;

/**
 * Faixa aceitável para beta. Existe para transformar em erro barulhento o
 * acidente silencioso de reaproveitar uma constante calibrada noutra escala.
 */
export function assertBeta(beta: number): void {
  if (!(beta >= 0.005 && beta <= 0.2)) {
    throw new Error(
      `beta fora da faixa plausível para a escala Opta 0–100: ${beta}. ` +
        `Esperado entre 0,005 e 0,2 (calibrado: ${BETA}). ` +
        `Se veio do motor de seleções, a escala é outra — ver lib/club-model/constants.ts.`
    );
  }
}
