// ============================================================================
// Auto-progressão do chaveamento (mata-mata ida/volta)
// ============================================================================
// A lógica roda inteira no banco, de forma ATÔMICA, na função SQL
// `advance_bracket_for_match(p_match_id)` (SECURITY DEFINER, checagem de admin):
//   • soma o agregado das duas pernas; empate → pênaltis da volta (pen_winner);
//   • grava o vencedor no confronto;
//   • na final, grava campeão/vice (dispara o pódio);
//   • avança o vencedor ao próximo confronto e cria a ida/volta quando os dois
//     times estão definidos (índice único (tie_id, leg) evita duplicar em corrida);
//   • se uma correção invalida o classificado, propaga aos jogos seguintes se eles
//     ainda não começaram/receberam palpites, senão bloqueia (transação revertida).
//
// Este módulo é só um wrapper: uma falha na RPC não deixa estado parcial.
// ============================================================================

export interface BracketResult {
  advanced: boolean;
  warning?: string;
  info?: string;
  createdNextMatches?: boolean;
  championSet?: boolean;
}

/** Chama a RPC transacional para processar o confronto da partida salva. */
export async function advanceBracketForMatch(supabase: any, matchId: number): Promise<BracketResult> {
  const { data, error } = await supabase.rpc('advance_bracket_for_match', { p_match_id: matchId });

  if (error) {
    // Inclui o bloqueio de correção não-segura (item 18), que vem como exceção da função.
    return { advanced: false, warning: error.message };
  }

  const r = (data ?? {}) as any;
  return {
    advanced: !!r.advanced,
    warning: r.warning ?? undefined,
    info: r.info ?? undefined,
    createdNextMatches: r.createdNextMatches ?? undefined,
    championSet: r.championSet ?? undefined,
  };
}
