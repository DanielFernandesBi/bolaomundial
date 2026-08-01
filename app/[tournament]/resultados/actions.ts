'use server';

// ============================================================================
// Dados da página de últimos resultados dos clubes do bolão.
//
// Lê SÓ o Supabase. A API-Football nunca é chamada daqui: quem fala com ela é
// o cron (`sync_club_fixtures_recent`, 2×/dia), e a chave nem sequer existe
// fora do Vault. Uma página que chamasse a API direto queimaria a cota de 100
// requisições/dia em poucos acessos.
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase';

export interface ClubFixture {
  id: number;
  kickoff_at: string;
  status: string;
  league_id: number | null;
  league_name: string | null;
  round_name: string | null;
  home_team_key: string | null;
  away_team_key: string | null;
  home_team_name: string;
  away_team_name: string;
  goals_home_90: number | null;
  goals_away_90: number | null;
  goals_home_extra: number | null;
  goals_away_extra: number | null;
  penalties_home: number | null;
  penalties_away: number | null;
  venue_name: string | null;
  /** Nome como o bolão exibe (com acento e grafia nossa), quando o clube é conhecido. */
  home_display: string;
  away_display: string;
  home_crest: string | null;
  away_crest: string | null;
  home_is_bolao: boolean;
  away_is_bolao: boolean;
}

export interface ResultadosData {
  fixtures: ClubFixture[];
  clubes: { teamKey: string; nome: string; crest: string | null }[];
  ultimaSincronizacao: string | null;
  /** Ligas das três copas do bolão, para o filtro "só as copas". */
  ligasDasCopas: number[];
}

/** IDs das três competições do bolão na API-Football. */
const LIGAS_DAS_COPAS = [13, 11, 73];

export async function getResultados(): Promise<ResultadosData> {
  const supabase = await createServerSupabaseClient();

  const [
    { data: fixturesRaw },
    { data: clubesRaw },
    { data: logRaw },
    { data: escudosRaw },
    { data: apelidosRaw },
  ] = await Promise.all([
      supabase
        .from('club_fixtures')
        .select(
          'id, kickoff_at, status, league_id, league_name, round_name, ' +
            'home_team_key, away_team_key, home_team_name, away_team_name, ' +
            'goals_home_90, goals_away_90, goals_home_extra, goals_away_extra, ' +
            'penalties_home, penalties_away, venue_name'
        )
        .order('kickoff_at', { ascending: false, nullsFirst: false })
        .limit(400),
      supabase
        .from('club_source_ids')
        .select('team_key, canonical_name, is_bolao_team')
        .eq('is_bolao_team', true)
        .order('canonical_name'),
      supabase
        .from('club_sync_log')
        .select('finished_at')
        .eq('status', 'ok')
        .order('finished_at', { ascending: false, nullsFirst: false })
        .limit(1),
      // Os escudos já existem em `matches` (o admin cadastrou ao montar a
      // chave). Reaproveitar evita uma segunda fonte de imagem para o mesmo
      // clube — e uma segunda chance de elas divergirem.
      supabase.from('matches').select('team_home, home_iso, team_away, away_iso'),
      supabase.from('club_aliases').select('alias, team_key'),
    ]);

  const bolao = new Map<string, string>();
  for (const c of (clubesRaw ?? []) as any[]) bolao.set(c.team_key, c.canonical_name);

  // Espelha club_resolve(): apelido primeiro, depois a própria chave. Sem isto
  // o escudo do Vasco se perderia — `matches` grava "Vasco" na Copa do Brasil
  // e "Vasco da Gama" na Sul-Americana, e a chave canônica é a segunda.
  const apelidos = new Map<string, string>();
  for (const a of (apelidosRaw ?? []) as any[]) apelidos.set(a.alias, a.team_key);
  const resolver = (nome: string): string | null => {
    const n = normalizar(nome);
    return apelidos.get(n) ?? (bolao.has(n) ? n : null);
  };

  const escudoPorChave = new Map<string, string>();
  const registrarEscudo = (nome?: string | null, url?: string | null) => {
    if (!nome || !url) return;
    const chave = resolver(nome);
    if (chave && !escudoPorChave.has(chave)) escudoPorChave.set(chave, url);
  };
  for (const m of (escudosRaw ?? []) as any[]) {
    registrarEscudo(m.team_home, m.home_iso);
    registrarEscudo(m.team_away, m.away_iso);
  }

  const fixtures: ClubFixture[] = ((fixturesRaw ?? []) as any[]).map((f) => ({
    ...f,
    home_display: f.home_team_key ? bolao.get(f.home_team_key) ?? f.home_team_name : f.home_team_name,
    away_display: f.away_team_key ? bolao.get(f.away_team_key) ?? f.away_team_name : f.away_team_name,
    home_crest: f.home_team_key ? escudoPorChave.get(f.home_team_key) ?? null : null,
    away_crest: f.away_team_key ? escudoPorChave.get(f.away_team_key) ?? null : null,
    home_is_bolao: !!f.home_team_key && bolao.has(f.home_team_key),
    away_is_bolao: !!f.away_team_key && bolao.has(f.away_team_key),
  }));

  return {
    fixtures,
    clubes: [...bolao.entries()]
      .map(([teamKey, nome]) => ({ teamKey, nome, crest: escudoPorChave.get(teamKey) ?? null }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    ultimaSincronizacao: (logRaw?.[0] as any)?.finished_at ?? null,
    ligasDasCopas: LIGAS_DAS_COPAS,
  };
}

/** Espelha club_key_normalize() do banco. Se um mudar, o outro tem de mudar. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
