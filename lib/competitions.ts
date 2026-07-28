// ============================================================================
// Constantes compartilhadas do bolão de mata-mata de clubes (bolão unificado)
// ============================================================================

export type CompetitionKey = 'copa_do_brasil' | 'sudamericana' | 'libertadores';
export type Round = 'oitavas' | 'quartas' | 'semi' | 'final';

export const COMPETITIONS: { key: CompetitionKey; name: string; short: string }[] = [
  { key: 'libertadores', name: 'CONMEBOL Libertadores', short: 'Libertadores' },
  { key: 'sudamericana', name: 'CONMEBOL Sul-Americana', short: 'Sul-Americana' },
  { key: 'copa_do_brasil', name: 'Copa do Brasil', short: 'Copa do Brasil' },
];

export function competitionName(key?: string | null): string {
  return COMPETITIONS.find((c) => c.key === key)?.name ?? (key ?? '');
}

export const ROUND_LABELS: Record<Round, string> = {
  oitavas: 'Oitavas de final',
  quartas: 'Quartas de final',
  semi: 'Semifinal',
  final: 'Final',
};

// Ordem das fases (para gerar rótulos e a fase seguinte)
export const ROUND_ORDER: Round[] = ['oitavas', 'quartas', 'semi', 'final'];

export function nextRound(round: Round): Round | null {
  const i = ROUND_ORDER.indexOf(round);
  return i >= 0 && i < ROUND_ORDER.length - 1 ? ROUND_ORDER[i + 1] : null;
}

// Rótulo de fase usado em matches.phase (ex.: "Quartas de final – ida")
export function legPhaseLabel(round: Round, leg: 'ida' | 'volta'): string {
  return `${ROUND_LABELS[round]} – ${leg}`;
}
