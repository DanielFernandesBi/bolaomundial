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

// ============================================================================
// Faixas de pontuação, para agrupar histórico de bolões DE ESCALAS DIFERENTES.
//
// A régua mudou duas vezes, e o banco guarda o que valia na época. Medido:
//
//   torneio                  cravada   vencedor seco
//   paulistao-2026              25          9
//   copa-2026                   30          9
//   mundial-mata-mata-2026      30         10
//   mata-mata-clubes-2026       30         10
//
// As faixas do meio (17, 15, 12, 3) nunca mudaram de valor.
//
// Quem contar `points_regular === 30` acha 11 cravadas onde há 20, e quem
// contar `=== 10` acha zero "vencedor seco" onde há 8. Foi exatamente o que a
// tela de perfil fazia. Esta função é a fonte única — se aparecer uma quinta
// escala, muda-se aqui.
// ============================================================================

export type FaixaPontos = 'exata' | 'p17' | 'p15' | 'p12' | 'seca' | 'consolacao' | 'zero' | 'outra';

export const FAIXAS: { key: FaixaPontos; rotulo: string; tier: ScoreTier }[] = [
  { key: 'exata', rotulo: 'Cravada — placar exato', tier: 'exact' },
  { key: 'p17', rotulo: 'Vencedor + gols do vencedor', tier: 'partial' },
  { key: 'p15', rotulo: 'Vencedor + saldo, ou empate', tier: 'partial' },
  { key: 'p12', rotulo: 'Vencedor + gols do perdedor', tier: 'partial' },
  { key: 'seca', rotulo: 'Só o vencedor', tier: 'partial' },
  { key: 'consolacao', rotulo: 'Consolação — um dos placares', tier: 'partial' },
  { key: 'zero', rotulo: 'Sem pontos', tier: 'none' },
  { key: 'outra', rotulo: 'Outras', tier: 'partial' },
];

/**
 * Classifica um valor de `points_regular` na faixa correspondente, seja ele da
 * escala atual ou de qualquer bolão antigo.
 *
 * A faixa `outra` existe para o total FECHAR: sem ela, um valor que ninguém
 * previu simplesmente some da distribuição e a soma não bate com o número de
 * palpites — que foi como o problema apareceu.
 */
export function faixaDePontos(pontos: number | null | undefined): FaixaPontos {
  const p = pontos ?? 0;
  if (p === 0) return 'zero';
  if (p === 30 || p === 25) return 'exata';       // 25 = escala do Paulistão
  if (p === 17) return 'p17';
  if (p === 15) return 'p15';
  if (p === 12) return 'p12';
  if (p === 10 || p === 9) return 'seca';         // 9 = escala antiga
  if (p === 3) return 'consolacao';
  return 'outra';
}

/** Conta os palpites por faixa. A soma é sempre igual ao total recebido. */
export function distribuicaoPorFaixa(
  pontos: (number | null | undefined)[]
): Record<FaixaPontos, number> {
  const out: Record<FaixaPontos, number> = {
    exata: 0, p17: 0, p15: 0, p12: 0, seca: 0, consolacao: 0, zero: 0, outra: 0,
  };
  for (const p of pontos) out[faixaDePontos(p)]++;
  return out;
}
