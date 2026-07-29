// ============================================================================
// Apresentação da pontuação — escala de 3 níveis
// ============================================================================
// SÓ APARÊNCIA. Nenhuma regra de cálculo mora aqui: os pontos continuam vindo
// prontos do banco (points_regular / points_extra / points_pen). Este módulo
// apenas decide COMO exibir um valor que já foi calculado.
//
// Substitui as 8 cores anteriores (âmbar, roxo, azul, verde, ciano, laranja,
// esmeralda, slate) por 3 faixas legíveis num relance.
// ============================================================================

export type ScoreTier = 'exact' | 'partial' | 'none';

/**
 * Recebe os pontos do TEMPO NORMAL (points_regular), como o app já faz.
 *
 * O corte em 20 é proposital: cobre tanto a escala atual (placar exato = 30)
 * quanto a dos torneios antigos, em que a cravada valia 25 — sem isso, o
 * histórico da Copa 2026 e do Paulistão apareceria como acerto parcial.
 */
export function scoreTier(pointsRegular: number): ScoreTier {
  if (pointsRegular >= 20) return 'exact'; // 30/25/20 = cravada
  if (pointsRegular > 0) return 'partial'; // 17/15/12/10/9/3
  return 'none';
}

// NOTA: as opacidades precisam ser múltiplos de 5. A escala de opacidade do
// Tailwind 3 anda de 5 em 5, então /9 e /12 (valores do handoff) não geram
// CSS nenhum e a etiqueta sairia sem fundo. Trocados por /10 — diferença
// visual imperceptível, e verificado no CSS gerado.

/** Etiqueta de pontos (pílula). */
export const tierBadge: Record<ScoreTier, string> = {
  exact: 'bg-score-exact text-primary-foreground font-bold',
  partial: 'bg-score-partial/15 text-score-partial border border-score-partial/35 font-bold',
  none: 'bg-score-none/10 text-muted-foreground font-semibold',
};

/** Fundo da linha de lista / card conforme a faixa. */
export const tierRow: Record<ScoreTier, string> = {
  exact: 'bg-score-exact/10 border-score-exact/45',
  partial: 'bg-card border-hairline',
  none: 'bg-surface-sunken border-hairline',
};

/**
 * Bônus de mata-mata (prorrogação e pênaltis). Deixam de ser índigo/rosa e
 * passam a etiqueta neutra com contorno — somam ao tempo normal, mas não
 * competem visualmente com a faixa de acerto.
 */
export const bonusBadge = 'border border-hairline text-foreground/80 font-semibold';

/** Rótulo curto da faixa, para agrupamentos e legendas. */
export const tierLabel: Record<ScoreTier, string> = {
  exact: 'Cravada',
  partial: 'Acerto parcial',
  none: 'Sem pontos',
};
