/**
 * Utilitários de data/hora no fuso de Brasília (São Paulo / Brasília).
 *
 * O Brasil não adota mais horário de verão desde 2019, então o fuso é fixo em
 * UTC-3. Os jogos são lançados pelo admin em horário de Brasília, e o sistema
 * precisa bloquear os palpites exatamente nesse horário.
 */

export const BRASILIA_UTC_OFFSET = '-03:00';

/**
 * Converte um valor de <input type="datetime-local"> ("YYYY-MM-DDTHH:mm"),
 * interpretado como horário de Brasília, para um instante absoluto em ISO (UTC).
 *
 * Ex.: "2026-06-28T20:00" (Brasília) -> "2026-06-28T23:00:00.000Z"
 */
export function brasiliaLocalInputToISO(localInput: string): string | null {
  if (!localInput) return null;
  // Garante segundos para um ISO bem formado e anexa o offset de Brasília
  const withSeconds = localInput.length === 16 ? `${localInput}:00` : localInput;
  const date = new Date(`${withSeconds}${BRASILIA_UTC_OFFSET}`);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Converte um instante ISO (UTC) para o formato de <input type="datetime-local">
 * exibindo o horário de Brasília ("YYYY-MM-DDTHH:mm").
 */
export function isoToBrasiliaLocalInput(iso: string): string {
  const date = new Date(iso);
  // Desloca para o horário de Brasília e formata os componentes UTC resultantes
  const brasilia = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const y = brasilia.getUTCFullYear();
  const mo = String(brasilia.getUTCMonth() + 1).padStart(2, '0');
  const d = String(brasilia.getUTCDate()).padStart(2, '0');
  const h = String(brasilia.getUTCHours()).padStart(2, '0');
  const mi = String(brasilia.getUTCMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d}T${h}:${mi}`;
}
