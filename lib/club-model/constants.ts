// ============================================================================
// Parâmetros do modelo de clubes. Todos calibráveis — e versionados, porque
// mudar qualquer um deles muda toda projeção já publicada.
//
// A calibração está documentada em MODELO_CLUBES_PLANO.md §1.3 e §2.2.
// ============================================================================

// v2: baseline própria do mata-mata (o mando do Paulistão engolia o rating) e
// os 7 pontos de pênalti só quando há disputa de pênaltis.
export const MODEL_VERSION = 'clubs-2026-v2';

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

/**
 * Baseline dos MATA-MATAS do bolão (Libertadores, Sul-Americana, Copa do
 * Brasil). NÃO é o DEFAULT acima, e a diferença importa.
 *
 * O DEFAULT saiu dos 72 jogos do Paulistão 2026 e dá mu_H/mu_A = 1,79 — mando
 * de campo valendo +0,65 gol. Aplicado a estas competições, esse número
 * produz um absurdo verificável: para o visitante ter expectativa de gols
 * maior que a do mandante é preciso
 *
 *     beta · dR > ln(1,79)  =>  dR > 16,2 pontos de Opta
 *
 * e a amplitude INTEIRA dos 40 clubes do bolão é de 16,7 pontos (73,7 a 90,4).
 * Ou seja: com a baseline do Paulistão, praticamente nenhum visitante é
 * favorito, por melhor que seja. O mando engolia o rating.
 *
 * O Paulistão não descreve estas competições — clube do interior recebendo
 * grande, viagem longa, elenco misto. Mata-mata continental e Copa do Brasil
 * são mais equilibrados e mais travados.
 *
 * Estes valores são PRIOR, não medição: ordem de grandeza do mata-mata
 * (total ~2,25 gols, mando ~1,37). Assim que houver 20 jogos das copas no
 * banco, estimateBaselines() os substitui por estimativa própria — é o mesmo
 * caminho que o RHO e o BETA seguem.
 */
export const KNOCKOUT_MU_HOME = 1.3;
export const KNOCKOUT_MU_AWAY = 0.95;

/** Competições do bolão de clubes, pelas chaves usadas em `ties.competition`. */
const MATA_MATA = new Set(['libertadores', 'sudamericana', 'copa_do_brasil']);

/** Baseline a usar para uma competição do bolão. */
export function poolBaseline(competition: string): { muHome: number; muAway: number; weight: number } {
  return MATA_MATA.has(competition)
    ? { muHome: KNOCKOUT_MU_HOME, muAway: KNOCKOUT_MU_AWAY, weight: 1 }
    : { muHome: DEFAULT_MU_HOME, muAway: DEFAULT_MU_AWAY, weight: 1 };
}

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
