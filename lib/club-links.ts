// ============================================================================
// Nome de clube → chave canônica, para linkar o time para a página dele.
//
// Existe porque o nome NÃO é identidade: `matches` grava "Vasco" na Copa do
// Brasil e "Vasco da Gama" na Sul-Americana, e a API-Football devolve "Atletico
// Paranaense" para o mesmo clube que o bolão chama de "Athletico-PR". Quem
// resolve isso no banco é club_resolve(); aqui está o espelho dela em
// TypeScript, para as telas que só têm o nome em mãos.
//
// A ordem é a mesma do banco: apelido primeiro, depois a própria chave
// normalizada. Se um lado mudar, o outro tem de mudar junto.
// ============================================================================

/** Espelha club_key_normalize() do banco. */
export function normalizarNomeDeClube(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Monta o resolvedor a partir do banco. Duas leituras pequenas — a lista de
 * clubes e a de apelidos — e nada mais: quem chama já tem o cliente do
 * Supabase, e uma terceira ida ao banco por tela seria desperdício.
 *
 * Devolve `null` para clube desconhecido, e quem chama decide o que fazer com
 * isso. Um link para uma página que não filtra nada é pior que texto simples.
 */
export async function criarResolvedorDeClube(
  supabase: any
): Promise<(nome: string | null | undefined) => string | null> {
  const [{ data: clubesRaw }, { data: apelidosRaw }] = await Promise.all([
    supabase.from('club_source_ids').select('team_key'),
    supabase.from('club_aliases').select('alias, team_key'),
  ]);

  const chaves = new Set<string>(((clubesRaw ?? []) as any[]).map((c) => c.team_key));
  const apelidos = new Map<string, string>();
  for (const a of (apelidosRaw ?? []) as any[]) apelidos.set(a.alias, a.team_key);

  return (nome) => {
    if (!nome) return null;
    const n = normalizarNomeDeClube(nome);
    return apelidos.get(n) ?? (chaves.has(n) ? n : null);
  };
}

/** Endereço da página do clube. Uma função só, para o destino não se espalhar. */
export function hrefDoClube(tournamentSlug: string, chave: string): string {
  return `/${tournamentSlug}/resultados?clube=${encodeURIComponent(chave)}`;
}

/**
 * Nome → endereço, pronto para atravessar a fronteira servidor/cliente.
 *
 * Um objeto simples e não o resolvedor: função não serializa como prop de
 * componente cliente. Nomes desconhecidos ficam de fora, e quem consulta trata
 * a ausência como "não é link".
 */
export async function mapaDeLinksDeClube(
  supabase: any,
  tournamentSlug: string,
  nomes: (string | null | undefined)[]
): Promise<Record<string, string>> {
  const resolver = await criarResolvedorDeClube(supabase);
  const mapa: Record<string, string> = {};
  for (const nome of nomes) {
    if (!nome || mapa[nome]) continue;
    const chave = resolver(nome);
    if (chave) mapa[nome] = hrefDoClube(tournamentSlug, chave);
  }
  return mapa;
}
