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
  home_provider_id: number | null;
  away_provider_id: number | null;
  /** Escudo que a API mandou nesta partida. */
  home_crest_url: string | null;
  away_crest_url: string | null;
  goals_home_90: number | null;
  goals_away_90: number | null;
  goals_home_ht: number | null;
  goals_away_ht: number | null;
  goals_home_extra: number | null;
  goals_away_extra: number | null;
  penalties_home: number | null;
  penalties_away: number | null;
  venue_name: string | null;
  venue_city: string | null;
  referee: string | null;
  league_country: string | null;
  round_name_display?: string | null;
  /** Nome como o bolão exibe (com acento e grafia nossa), quando o clube é conhecido. */
  home_display: string;
  away_display: string;
  home_crest: string | null;
  away_crest: string | null;
  home_is_bolao: boolean;
  away_is_bolao: boolean;
}

/** Uma linha de estatisticas_clubes(). Agregado em SQL, não no cliente. */
export interface ClubeStats {
  /** Identidade: a chave do mapa quando existe, senão '#<id da API>'. */
  id: string;
  team_key: string | null;
  provider_id: number | null;
  /** false = time descoberto pela captura, ainda sem chave no nosso mapa. */
  mapeado: boolean;
  nome: string;
  crest_url: string | null;
  is_bolao: boolean;
  jogos: number;
  v: number;
  e: number;
  d: number;
  gols_pro: number;
  gols_contra: number;
  sem_sofrer: number;
  nao_marcou: number;
  casa_v: number; casa_e: number; casa_d: number;
  fora_v: number; fora_e: number; fora_d: number;
  /** Em quantos jogos o placar do intervalo é conhecido. */
  com_intervalo: number;
  ht_pro: number;
  ht_contra: number;
  /** Estava perdendo no intervalo e venceu. */
  virou: number;
  /** Estava vencendo no intervalo e não venceu. */
  entregou: number;
  /** Até 5 letras, do mais recente para o mais antigo. Ex.: "VEDVV". */
  ultimos: string;
  ultimo_jogo: string | null;
}

export interface LigaStats {
  league_id: number;
  nome: string;
  pais: string | null;
  logo_url: string | null;
  flag_url: string | null;
  categoria: string;
  model_weight: number;
  jogos: number;
  encerrados: number;
  agendados: number;
  gols: number;
  media_gols: number | null;
  vitorias_casa: number;
  empates: number;
  vitorias_fora: number;
  clubes: number;
  ultimo_jogo: string | null;
}

export interface ResultadosData {
  fixtures: ClubFixture[];
  clubes: { teamKey: string; nome: string; crest: string | null }[];
  stats: ClubeStats[];
  ligas: LigaStats[];
  ultimaSincronizacao: string | null;
  /** Ligas das três copas do bolão, para o filtro "só as copas". */
  ligasDasCopas: number[];
}

/** IDs das três competições do bolão na API-Football. */
const LIGAS_DAS_COPAS = [13, 11, 73];

export async function getResultados(tournamentId: number): Promise<ResultadosData> {
  const supabase = await createServerSupabaseClient();

  const [
    { data: fixturesRaw },
    { data: clubesRaw },
    { data: logRaw },
    { data: escudosRaw },
    { data: apelidosRaw },
    { data: statsRaw },
    { data: ligasRaw },
  ] = await Promise.all([
      supabase
        .from('club_fixtures')
        .select(
          'id, kickoff_at, status, league_id, league_name, round_name, ' +
            'home_team_key, away_team_key, home_team_name, away_team_name, ' +
            'home_crest_url, away_crest_url, league_country, ' +
            'home_provider_id, away_provider_id, ' +
            'goals_home_90, goals_away_90, goals_home_ht, goals_away_ht, ' +
            'goals_home_extra, goals_away_extra, ' +
            'penalties_home, penalties_away, venue_name, venue_city, referee'
        )
        .order('kickoff_at', { ascending: false, nullsFirst: false })
        // O retrospecto por clube é calculado no cliente, sobre esta lista.
        // Enquanto o histórico couber aqui, ele é exato; quando o teto começar
        // a cortar, o número vira "dos últimos N jogos carregados" sem avisar.
        // O sinal para migrar a conta para SQL é esta contagem encostar no
        // limite — hoje são 94 linhas.
        .limit(1000),
      // TODOS os clubes, não só os do bolão: o nome que a API devolve vem sem
      // acento e abreviado ("Rubio NU", "Tecnico Universitario", "Sportivo
      // Luqueno"). Tendo a forma canônica, o adversário aparece escrito certo.
      supabase
        .from('club_source_ids')
        .select('team_key, canonical_name, is_bolao_team, crest_url')
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
      // Restrito a ESTE torneio: `matches` guarda também os torneios antigos de
      // seleções, onde `iso` era código de país ("br") e não URL. Sem o filtro,
      // o Palmeiras herdava o "br" da Copa do Mundo e ficava sem escudo.
      supabase
        .from('matches')
        .select('team_home, home_iso, team_away, away_iso')
        .eq('tournament_id', tournamentId),
      supabase.from('club_aliases').select('alias, team_key'),
      // Agregados em SQL. Estavam no cliente, sobre a lista já carregada — o
      // que era exato com 94 partidas e vira "dos últimos N carregados" sem
      // avisar assim que a captura por liga engordar a base.
      supabase.rpc('estatisticas_clubes'),
      supabase.rpc('estatisticas_ligas'),
    ]);

  // Nome de exibição de qualquer clube conhecido; is_bolao_team só distingue
  // quem entra no filtro e ganha destaque.
  const nomeCanonico = new Map<string, string>();
  const bolao = new Map<string, string>();
  // Escudo que a própria API-Football manda, capturado na sincronização. Vale
  // para QUALQUER clube que já apareceu, não só para os 40 do bolão — é o que
  // acaba com o escudo genérico do adversário.
  const escudoDaApi = new Map<string, string>();
  for (const c of (clubesRaw ?? []) as any[]) {
    nomeCanonico.set(c.team_key, c.canonical_name);
    if (c.is_bolao_team) bolao.set(c.team_key, c.canonical_name);
    if (c.crest_url) escudoDaApi.set(c.team_key, c.crest_url);
  }

  // Espelha club_resolve(): apelido primeiro, depois a própria chave. Sem isto
  // o escudo do Vasco se perderia — `matches` grava "Vasco" na Copa do Brasil
  // e "Vasco da Gama" na Sul-Americana, e a chave canônica é a segunda.
  const apelidos = new Map<string, string>();
  for (const a of (apelidosRaw ?? []) as any[]) apelidos.set(a.alias, a.team_key);
  const resolver = (nome: string): string | null => {
    const n = normalizar(nome);
    return apelidos.get(n) ?? (nomeCanonico.has(n) ? n : null);
  };

  const escudoPorChave = new Map<string, string>();
  const registrarEscudo = (nome?: string | null, url?: string | null) => {
    // `iso` só é escudo quando é URL. Nos torneios de seleções a mesma coluna
    // guardava código de país de duas letras — aceitar isso renderia
    // <img src="br">, que falha e cai no placeholder.
    if (!nome || !url || !url.startsWith('http')) return;
    const chave = resolver(nome);
    if (chave && !escudoPorChave.has(chave)) escudoPorChave.set(chave, url);
  };
  for (const m of (escudosRaw ?? []) as any[]) {
    registrarEscudo(m.team_home, m.home_iso);
    registrarEscudo(m.team_away, m.away_iso);
  }

  // Ordem de preferência do escudo:
  //   1. o da própria partida (a API manda um por time, em toda resposta);
  //   2. o canônico do clube, para quando aquela partida veio sem;
  //   3. o que o admin cadastrou em `matches` — cobre os clubes do bolão que
  //      ainda não jogaram desde 31/07 e por isso nunca apareceram na API.
  const escudoDe = (key: string | null, daPartida: string | null): string | null =>
    daPartida ?? (key ? escudoDaApi.get(key) ?? escudoPorChave.get(key) ?? null : null);

  const fixtures: ClubFixture[] = ((fixturesRaw ?? []) as any[]).map((f) => ({
    ...f,
    home_display: f.home_team_key ? nomeCanonico.get(f.home_team_key) ?? f.home_team_name : f.home_team_name,
    away_display: f.away_team_key ? nomeCanonico.get(f.away_team_key) ?? f.away_team_name : f.away_team_name,
    home_crest: escudoDe(f.home_team_key, f.home_crest_url),
    away_crest: escudoDe(f.away_team_key, f.away_crest_url),
    home_is_bolao: !!f.home_team_key && bolao.has(f.home_team_key),
    away_is_bolao: !!f.away_team_key && bolao.has(f.away_team_key),
  }));

  return {
    fixtures,
    clubes: [...bolao.entries()]
      .map(([teamKey, nome]) => ({ teamKey, nome, crest: escudoDe(teamKey, null) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    stats: (statsRaw ?? []) as ClubeStats[],
    ligas: ((ligasRaw ?? []) as any[]).map((l) => ({
      ...l,
      model_weight: Number(l.model_weight),
      media_gols: l.media_gols === null ? null : Number(l.media_gols),
    })) as LigaStats[],
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
