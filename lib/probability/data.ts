// ============================================================================
// Dados de referência do motor de probabilidades (torneio mata-mata 2026):
// - Pontos FIFA (prior de força das seleções)
// - Resultados da fase de grupos (histórico para calibração)
// - Ordem do chaveamento (para montar a árvore até a final + 3º lugar)
// Mantido aqui para não exigir SQL/migração de dados de referência.
// ============================================================================

// Normalização e apelidos (o seed usa "Holanda", "Bósnia", "Congo"; aqui é
// canônico "Países Baixos", "Bósnia e Herzegovina", "RD Congo").
const ALIASES: Record<string, string> = {
  holanda: 'paises baixos',
  bosnia: 'bosnia e herzegovina',
  congo: 'rd congo',
};

const _keyCache = new Map<string, string>();
export function teamKey(name: string): string {
  const cached = _keyCache.get(name);
  if (cached !== undefined) return cached;
  const k = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  const result = ALIASES[k] ?? k;
  _keyCache.set(name, result);
  return result;
}

// ── Pontos FIFA (32 seleções da chave) ──────────────────────────────────────
const FIFA_RAW: [string, number][] = [
  ['Argentina', 1877], ['Espanha', 1875], ['França', 1871], ['Inglaterra', 1828],
  ['Portugal', 1768], ['Brasil', 1766], ['Marrocos', 1755], ['Países Baixos', 1754],
  ['Bélgica', 1742], ['Alemanha', 1736], ['Croácia', 1715], ['Colômbia', 1698],
  ['México', 1687], ['Senegal', 1684], ['Estados Unidos', 1671], ['Japão', 1662],
  ['Suíça', 1650], ['Equador', 1599], ['Áustria', 1597], ['Austrália', 1579],
  ['Argélia', 1571], ['Egito', 1562], ['Canadá', 1559], ['Noruega', 1557],
  ['Costa do Marfim', 1541], ['Suécia', 1510], ['Paraguai', 1505], ['RD Congo', 1474],
  ['África do Sul', 1428], ['Bósnia e Herzegovina', 1387], ['Cabo Verde', 1371], ['Gana', 1347],
];

export const FIFA_POINTS = new Map<string, number>(FIFA_RAW.map(([n, p]) => [teamKey(n), p]));

// ── Resultados da fase de grupos [mandante, gols, gols, visitante] ──────────
// Inclui adversários de fora da chave (viram dado de gols). Duplicatas (mesmo
// jogo listado pelos dois times) são removidas em runtime por par de times.
const GROUP_RAW: [string, number, number, string][] = [
  ['Argentina', 3, 0, 'Argélia'], ['Argentina', 2, 0, 'Áustria'], ['Argentina', 3, 1, 'Jordânia'],
  ['Espanha', 0, 0, 'Cabo Verde'], ['Espanha', 4, 0, 'Arábia Saudita'], ['Espanha', 1, 0, 'Uruguai'],
  ['França', 3, 1, 'Senegal'], ['França', 3, 0, 'Iraque'], ['França', 4, 1, 'Noruega'],
  ['Inglaterra', 4, 2, 'Croácia'], ['Inglaterra', 0, 0, 'Gana'], ['Inglaterra', 2, 0, 'Panamá'],
  ['Portugal', 1, 1, 'RD Congo'], ['Portugal', 5, 0, 'Uzbequistão'], ['Portugal', 0, 0, 'Colômbia'],
  ['Brasil', 1, 1, 'Marrocos'], ['Brasil', 3, 0, 'Haiti'], ['Brasil', 3, 0, 'Escócia'],
  ['Marrocos', 1, 1, 'Brasil'], ['Marrocos', 1, 0, 'Escócia'], ['Marrocos', 4, 2, 'Haiti'],
  ['Países Baixos', 2, 2, 'Japão'], ['Países Baixos', 5, 1, 'Suécia'], ['Países Baixos', 3, 1, 'Tunísia'],
  ['Bélgica', 1, 1, 'Egito'], ['Bélgica', 0, 0, 'Irã'], ['Bélgica', 5, 1, 'Nova Zelândia'],
  ['Alemanha', 7, 1, 'Curaçao'], ['Alemanha', 2, 1, 'Costa do Marfim'], ['Alemanha', 1, 2, 'Equador'],
  ['Croácia', 2, 4, 'Inglaterra'], ['Croácia', 1, 0, 'Panamá'], ['Croácia', 2, 1, 'Gana'],
  ['Colômbia', 3, 1, 'Uzbequistão'], ['Colômbia', 1, 0, 'RD Congo'], ['Colômbia', 0, 0, 'Portugal'],
  ['México', 2, 0, 'África do Sul'], ['México', 1, 0, 'Coreia do Sul'], ['México', 3, 0, 'Rep. Tcheca'],
  ['Senegal', 1, 3, 'França'], ['Senegal', 2, 3, 'Noruega'], ['Senegal', 5, 0, 'Iraque'],
  ['Estados Unidos', 4, 1, 'Paraguai'], ['Estados Unidos', 2, 0, 'Austrália'], ['Estados Unidos', 2, 3, 'Turquia'],
  ['Japão', 2, 2, 'Países Baixos'], ['Japão', 4, 0, 'Tunísia'], ['Japão', 1, 1, 'Suécia'],
  ['Suíça', 1, 1, 'Catar'], ['Suíça', 4, 1, 'Bósnia e Herzegovina'], ['Suíça', 2, 1, 'Canadá'],
  ['Equador', 0, 1, 'Costa do Marfim'], ['Equador', 0, 0, 'Curaçao'], ['Equador', 2, 1, 'Alemanha'],
  ['Áustria', 3, 1, 'Jordânia'], ['Áustria', 0, 2, 'Argentina'], ['Áustria', 3, 3, 'Argélia'],
  ['Austrália', 2, 0, 'Turquia'], ['Austrália', 0, 2, 'Estados Unidos'], ['Austrália', 0, 0, 'Paraguai'],
  ['Argélia', 0, 3, 'Argentina'], ['Argélia', 2, 1, 'Jordânia'], ['Argélia', 3, 3, 'Áustria'],
  ['Egito', 1, 1, 'Bélgica'], ['Egito', 3, 1, 'Nova Zelândia'], ['Egito', 1, 1, 'Irã'],
  ['Canadá', 1, 1, 'Bósnia e Herzegovina'], ['Canadá', 6, 0, 'Catar'], ['Canadá', 1, 3, 'Suíça'],
  ['Noruega', 4, 1, 'Iraque'], ['Noruega', 3, 2, 'Senegal'], ['Noruega', 1, 4, 'França'],
  ['Costa do Marfim', 1, 0, 'Equador'], ['Costa do Marfim', 1, 2, 'Alemanha'], ['Costa do Marfim', 2, 0, 'Curaçao'],
  ['Suécia', 5, 1, 'Tunísia'], ['Suécia', 1, 5, 'Países Baixos'], ['Suécia', 1, 1, 'Japão'],
  ['Paraguai', 1, 4, 'Estados Unidos'], ['Paraguai', 1, 0, 'Turquia'], ['Paraguai', 0, 0, 'Austrália'],
  ['RD Congo', 1, 1, 'Portugal'], ['RD Congo', 0, 1, 'Colômbia'], ['RD Congo', 3, 1, 'Uzbequistão'],
  ['África do Sul', 0, 2, 'México'], ['África do Sul', 1, 1, 'Rep. Tcheca'], ['África do Sul', 1, 0, 'Coreia do Sul'],
  ['Bósnia e Herzegovina', 1, 1, 'Canadá'], ['Bósnia e Herzegovina', 1, 4, 'Suíça'], ['Bósnia e Herzegovina', 3, 1, 'Catar'],
  ['Cabo Verde', 0, 0, 'Espanha'], ['Cabo Verde', 2, 2, 'Uruguai'], ['Cabo Verde', 0, 0, 'Arábia Saudita'],
  ['Gana', 1, 0, 'Panamá'], ['Gana', 0, 0, 'Inglaterra'], ['Gana', 1, 2, 'Croácia'],
];

export interface HistGame {
  home: string;
  away: string;
  sh: number;
  sa: number;
}

// Remove duplicatas (mesmo par de times) preservando o primeiro registro.
export function getGroupResults(): HistGame[] {
  const seen = new Set<string>();
  const out: HistGame[] = [];
  for (const [home, sh, sa, away] of GROUP_RAW) {
    const a = teamKey(home);
    const b = teamKey(away);
    const key = [a, b].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ home, away, sh, sa });
  }
  return out;
}

// ── Chaveamento (16 jogos do R32 na ordem da chave) ─────────────────────────
// R16-1 = V(1)×V(2), R16-2 = V(3)×V(4), ... e assim por diante.
export const BRACKET_ORDER_BY_SLUG: Record<string, [string, string][]> = {
  'mundial-mata-mata-2026': [
    ['África do Sul', 'Canadá'],
    ['Países Baixos', 'Marrocos'],
    ['Alemanha', 'Paraguai'],
    ['França', 'Suécia'],
    ['Bélgica', 'Senegal'],
    ['Estados Unidos', 'Bósnia e Herzegovina'],
    ['Espanha', 'Áustria'],
    ['Portugal', 'Croácia'],
    ['Brasil', 'Japão'],
    ['Costa do Marfim', 'Noruega'],
    ['México', 'Equador'],
    ['Inglaterra', 'RD Congo'],
    ['Suíça', 'Argélia'],
    ['Colômbia', 'Gana'],
    ['Austrália', 'Egito'],
    ['Argentina', 'Cabo Verde'],
  ],
};

export const THIRD_PLACE_BY_SLUG: Record<string, boolean> = {
  'mundial-mata-mata-2026': true,
};
