'use server';

import { createServerSupabaseClient } from '@/lib/supabase';

// ============================================================================
// Forma recente — os últimos N jogos
// ============================================================================
// SUBSTITUI o antigo "ranking do dia", que era temporal e tinha três problemas:
//
//   1. `new Date(m.match_date)` com data NULA não dá erro em JavaScript: dá
//      1970-01-01, que em Brasília é 31/12/1969. Como todos os jogos com data
//      estavam no futuro, esse dia fantasma virava o "dia de hoje" e a aba
//      exibia "31/12" com um ranking de zeros. Estava acontecendo em produção.
//   2. O dia virava à MEIA-NOITE. Num calendário de dias consecutivos (a Copa
//      joga 01 a 06/08), o ranking de um jogo das 21h só existia entre o
//      lançamento do placar e as 23:59 — e sumia para sempre se o placar fosse
//      lançado depois da meia-noite.
//   3. Antes de os placares saírem, o "ranking do dia" listava todo mundo com
//      zero ponto.
//
// A pergunta que o jogador faz é "estou indo bem nos últimos jogos?" — que é
// forma recente, não calendário. Então o recorte passa a ser os N últimos jogos
// FINALIZADOS do bolão, os MESMOS para todo mundo (senão as colunas não seriam
// comparáveis), misturando as competições.
//
// Nenhuma data é interpretada aqui, e jogo sem data nunca entra: o filtro é
// status = FINISHED. O bug do 31/12 não tem como voltar.
// ============================================================================

export const RECENT_FORM_SIZE = 5;

export async function getRecentFormRanking(tournamentSlug: string, size: number = RECENT_FORM_SIZE) {
  const supabase = await createServerSupabaseClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();

  if (!tournament) {
    return { matches: [], entries: [], error: 'Torneio não encontrado' };
  }

  // Últimos jogos finalizados. `nullsFirst: false` importa: em ordem
  // decrescente o Postgres põe NULL na frente, e um jogo finalizado sem data
  // apareceria como o "mais recente".
  const { data: ultimos, error: erroJogos } = await supabase
    .from('matches')
    .select('id, team_home, team_away, home_iso, away_iso, match_date, competition, score_home, score_away')
    .eq('tournament_id', tournament.id)
    .eq('status', 'FINISHED')
    .order('match_date', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(size);

  if (erroJogos) {
    return { matches: [], entries: [], error: erroJogos.message };
  }

  const jogos = ((ultimos as any[]) || []).map((m) => ({
    id: m.id as number,
    team_home: m.team_home as string,
    team_away: m.team_away as string,
    home_iso: (m.home_iso ?? null) as string | null,
    away_iso: (m.away_iso ?? null) as string | null,
    match_date: (m.match_date ?? null) as string | null,
    competition: (m.competition ?? null) as string | null,
    score_home: (m.score_home ?? null) as number | null,
    score_away: (m.score_away ?? null) as number | null,
  }));

  if (jogos.length === 0) {
    return { matches: [], entries: [], error: null };
  }

  // A ordem de exibição é do mais ANTIGO para o mais recente, como se lê uma
  // sequência de resultados. A consulta veio ao contrário, para pegar os N
  // últimos.
  jogos.reverse();

  const ids = jogos.map((m) => m.id);
  const { data: predictions, error } = await supabase
    .from('predictions')
    .select('user_id, match_id, points_earned, points_regular, profiles:user_id ( id, username, avatar_url )')
    .in('match_id', ids);

  if (error) {
    return { matches: jogos, entries: [], error: error.message };
  }

  const porUsuario = new Map<
    string,
    {
      user_id: string;
      username: string;
      avatar_url: string | null;
      // null = não palpitou naquele jogo; 0 = palpitou e não pontuou. A
      // distinção importa: "não jogou" e "jogou mal" não são a mesma coisa.
      points: (number | null)[];
      total: number;
      exact: number;
    }
  >();

  const indicePorJogo = new Map<number, number>(jogos.map((m, idx) => [m.id, idx]));

  for (const pred of (predictions as any[]) || []) {
    const profile = Array.isArray(pred.profiles) ? pred.profiles[0] : pred.profiles;
    if (!profile) continue;

    let entrada = porUsuario.get(pred.user_id);
    if (!entrada) {
      entrada = {
        user_id: pred.user_id,
        username: profile.username || 'Usuário',
        avatar_url: profile.avatar_url || null,
        points: new Array(jogos.length).fill(null),
        total: 0,
        exact: 0,
      };
      porUsuario.set(pred.user_id, entrada);
    }

    const idx = indicePorJogo.get(pred.match_id);
    if (idx === undefined) continue;

    const pts = pred.points_earned ?? 0;
    entrada.points[idx] = pts;
    entrada.total += pts;
    // Cravada = placar exato do tempo normal (30 em points_regular), não pela
    // soma points_earned, que pode passar disso com prorrogação/pênaltis.
    if ((pred.points_regular ?? 0) === 30) entrada.exact += 1;
  }

  const entries = Array.from(porUsuario.values()).sort(
    (a, b) =>
      b.total - a.total ||
      b.exact - a.exact ||
      a.username.localeCompare(b.username, 'pt-BR')
  );

  return { matches: jogos, entries, error: null };
}

export async function getRanking(tournamentSlug: string) {
  const supabase = await createServerSupabaseClient();

  // Buscar o torneio pelo slug
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();

  if (tournamentError || !tournament) {
    return { profiles: [], error: 'Torneio não encontrado' };
  }

  // Buscar rankings do torneio com dados dos perfis
  const { data: rankings, error } = await supabase
    .from('tournament_rankings')
    .select(`
      user_id,
      total_points,
      exact_matches,
      profiles:user_id (
        id,
        username,
        avatar_url
      )
    `)
    .eq('tournament_id', tournament.id)
    .order('total_points', { ascending: false })
    .order('exact_matches', { ascending: false });

  if (error) {
    return { profiles: [], error: error.message };
  }

  // Processar os dados para o formato esperado
  const profiles = (rankings || []).map((ranking: any) => {
    const profile = Array.isArray(ranking.profiles) 
      ? ranking.profiles[0] 
      : ranking.profiles;
    
    return {
      id: profile.id,
      username: profile.username,
      avatar_url: profile.avatar_url,
      total_points: ranking.total_points,
      exact_matches: ranking.exact_matches,
    };
  });

  return { profiles, error: null };
}

