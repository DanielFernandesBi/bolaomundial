// ============================================================================
// Tipos do modelo de clubes.
// ============================================================================

/** Rating congelado de um clube no snapshot Opta ativo. */
export interface ClubPrior {
  teamKey: string;
  rating: number;
}

/**
 * Uma partida oficial já encerrada, posterior ao T0 do snapshot.
 *
 * `goalsHome`/`goalsAway` são SÓ o tempo regulamentar. Gols de prorrogação e
 * pênaltis nunca entram aqui — são desempate de confronto, não evidência de
 * força ofensiva (ver §6.9 da especificação).
 *
 * Os dois clubes precisam ter prior. Partida com adversário não mapeado é
 * inelegível para o modelo e não deve chegar nesta função (ela ainda aparece
 * na página de resultados — ver §4.2 da especificação).
 */
export interface ModelMatch {
  homeKey: string;
  awayKey: string;
  goalsHome: number;
  goalsAway: number;
  /** Chave da baseline de competição (a categoria: continental, estadual, …). */
  competition: string;
  /** Idade da partida em dias, no instante do cálculo. Nunca negativa. */
  ageDays: number;
  /**
   * Peso da competição DESTA partida (`club_competition_weights.model_weight`).
   *
   * Existe porque a baseline é por CATEGORIA e o peso é por LIGA — e uma
   * categoria mistura pesos: `segunda_divisao` tem Brasileirão B e Primera
   * Nacional a 0,80 e Série D, Primera B Metro e Chile Segunda a 0,60. Sem
   * este campo, todas as partidas da categoria herdavam o peso de UMA delas,
   * escolhida por ordem de chegada.
   *
   * Ausente, cai no peso da baseline — o comportamento antigo.
   */
  weight?: number;
  /** Campo neutro: o rótulo mandante é operacional e não deve gerar vantagem. */
  neutral?: boolean;
}

/**
 * Gols médios e peso de uma competição.
 *
 * `muHome`/`muAway` NÃO são a média bruta de gols da competição: são os gols
 * esperados entre dois clubes de força média do conjunto ancorado no prior.
 * Estimá-los junto com as forças (é o que fitStrengths faz quando recebe
 * `estimateBaselines`) evita o viés por competição descrito em §2.1 do plano.
 */
export interface CompetitionBaseline {
  muHome: number;
  muAway: number;
  muNeutral?: number;
  /** 1,00 para copas e primeiras divisões; 0,60 estaduais; 0 amistosos. */
  weight: number;
}

/** Força ajustada de um clube. */
export interface ClubStrength {
  teamKey: string;
  /** > 1 ataca acima da média do conjunto. */
  attack: number;
  /** < 1 defende melhor que a média. Cuidado com o sinal. */
  defense: number;
  attackPrior: number;
  defensePrior: number;
  /** Soma dos pesos das partidas observadas. Zero = força puramente Opta. */
  evidence: number;
  matches: number;
}

export interface FitParams {
  beta?: number;
  kappa?: number;
  halfLifeDays?: number;
  maxIterations?: number;
  tolerance?: number;
}

export interface FitResult {
  strengths: Map<string, ClubStrength>;
  iterations: number;
  converged: boolean;
}
