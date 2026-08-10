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
  /** Minuto de jogo no instante da varredura. */
  elapsed: number | null;
  /** Placar corrente, preenchido enquanto a bola rola. Só exibição. */
  goals_home_agora: number | null;
  goals_away_agora: number | null;
  /** Quando esta linha foi atualizada — o parcial é sempre "até este instante". */
  synced_at: string;
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
  /**
   * Veio da CHAVE do bolão, não da API. Ver `agendaDoBolao()`.
   *
   * Só existe em jogo futuro que a API ainda não entregou. Some sozinho assim
   * que a partida é capturada — e é por isso que quem consome precisa saber
   * distinguir: esta linha não está no `club_fixtures` e portanto não entra em
   * nenhuma contagem agregada.
   */
  da_agenda_do_bolao?: boolean;
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

/**
 * `matches.competition` -> como a partida aparece nesta tela.
 *
 * Os nomes são os que a própria API-Football devolve nestas ligas, copiados
 * letra por letra ("Sudamericana" sem hífen, "Copa Do Brasil" com D maiúsculo).
 * Não são a grafia bonita de lib/competitions.ts de propósito: uma linha da
 * agenda tem de ser indistinguível de uma linha capturada, senão o mesmo
 * campeonato apareceria escrito de dois jeitos na mesma lista.
 */
const LIGA_DA_COMPETICAO: Record<string, { id: number; nome: string }> = {
  libertadores: { id: 13, nome: 'CONMEBOL Libertadores' },
  sudamericana: { id: 11, nome: 'CONMEBOL Sudamericana' },
  copa_do_brasil: { id: 73, nome: 'Copa Do Brasil' },
};

/** Quantos dias de histórico a lista mostra, contando hoje. */
const DIAS_NA_TELA = 7;

/**
 * Início da janela: 00:00 de Brasília do primeiro dia que aparece.
 *
 * O corte é por DIA e não por "168 horas atrás" — senão o card mais antigo
 * viria pela metade, com os jogos da noite e sem os da tarde, o que pareceria
 * dado faltando. O Brasil não tem mais horário de verão, então o -03:00 fixo
 * vale o ano inteiro (mesma premissa de lib/utils/datetime.ts).
 */
function inicioDaJanela(): string {
  const hojeBrasilia = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
  const inicio = new Date(`${hojeBrasilia}T00:00:00-03:00`);
  inicio.setDate(inicio.getDate() - (DIAS_NA_TELA - 1));
  return inicio.toISOString();
}

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
            'goals_home_agora, goals_away_agora, elapsed, synced_at, ' +
            'goals_home_extra, goals_away_extra, ' +
            'penalties_home, penalties_away, venue_name, venue_city, referee'
        )
        // Sete dias corridos, contando hoje. A agenda (amanhã) não é cortada:
        // o filtro só tem piso.
        //
        // O teto de 1000 linhas que existia aqui era uma bomba-relógio: a
        // captura guarda ~90 jogos por dia, então em duas semanas a lista
        // começaria a ser truncada em silêncio, e o card mais antigo apareceria
        // pela metade sem nada avisar. Uma janela por DIA é previsível — o que
        // cai fora é sempre um dia inteiro, e o usuário sabe qual.
        //
        // Cortar aqui é seguro porque nada mais depende desta lista: as
        // estatísticas de clube e de liga são agregadas em SQL, sobre a base
        // inteira (estatisticas_clubes / estatisticas_ligas).
        .gte('kickoff_at', inicioDaJanela())
        .order('kickoff_at', { ascending: false, nullsFirst: false })
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
        .select('id, match_date, competition, score_home, team_home, home_iso, team_away, away_iso')
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
  // Escudo do clube, servido pelo NOSSO Storage. A coluna se chama crest_url
  // desde quando guardava a URL da API-Football; hoje ela guarda o endereço do
  // arquivo que baixamos uma vez (ver a migração `escudos_hospedados_por_nos`),
  // e a procedência ficou em crest_origem_url. Vale para qualquer clube que já
  // apareceu, não só os 40 do bolão.
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
  //   1. o ESPELHADO no nosso Storage (club_source_ids.crest_url);
  //   2. o da própria partida, para clube que ainda não foi espelhado;
  //   3. o que o admin cadastrou em `matches`, última reserva.
  //
  // O espelho vem primeiro, e essa ordem é o ponto todo. Antes o escudo da
  // partida ganhava — e ele é uma URL do media.api-sports.io, um host que não
  // é nosso. Era por isso que esta tela mostrava 2 escudos de 10 mesmo com
  // todos os arquivos íntegros e respondendo 200: a imagem dependia de aquele
  // host atender dezenas de requisições do aparelho do jogador, a cada visita.
  //
  // Os dois de baixo continuam porque o espelho não cobre tudo: clube
  // descoberto pela captura entra sem chave, e clube com URL de origem morta
  // (há um, do Wikipedia) nunca é espelhado.
  const escudoDe = (key: string | null, daPartida: string | null): string | null =>
    (key ? escudoDaApi.get(key) ?? null : null) ??
    daPartida ??
    (key ? escudoPorChave.get(key) ?? null : null);

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
    fixtures: [...fixtures, ...agendaDoBolao(escudosRaw ?? [], fixtures, { resolver, nomeCanonico, bolao, escudoDe })],
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

/**
 * Os jogos do bolão que a API AINDA NÃO entregou, para a agenda não mentir.
 *
 * ============================================================================
 * O PROBLEMA. A API-Football organiza partidas por data UTC, e o plano free só
 * libera até "hoje + 1" nesse calendário. Jogo às 21h30 de Brasília acontece
 * às 00h30 UTC do dia seguinte — ou seja, cai no balde de DEPOIS de amanhã, que
 * o plano recusa com todas as letras:
 *
 *     "Free plans do not have access to this date, try from X to Y."
 *
 * Em 10/08/2026 isso deixou a tela anunciando 2 jogos para o dia seguinte
 * quando havia 5: os três das 21h30 simplesmente não existiam no banco. Não é
 * defeito da varredura — ela já pede exatamente o teto que o plano permite.
 *
 * A SAÍDA. Esses jogos já estão na CHAVE do bolão, com data e hora certas,
 * cadastrados pelo admin. Então a agenda passa a ser completada por eles em vez
 * de esperar pela API.
 *
 * ============================================================================
 * O QUE ESTA FUNÇÃO NÃO FAZ, e é o ponto mais importante dela:
 *
 *  · não devolve NENHUM jogo com placar. O corte é `score_home IS NULL` mais
 *    `match_date > agora`. Placar — final ou parcial — continua vindo só da
 *    API, de uma fonte única. Misturar as duas origens no mesmo card é
 *    exatamente o risco que justificaria não fazer isto;
 *  · não entra em `estatisticas_clubes` nem em `estatisticas_ligas`. Aqueles
 *    números são agregados em SQL sobre `club_fixtures`, e nada aqui os toca;
 *  · não duplica. Assim que a partida é capturada, a linha da API vence e a da
 *    agenda desaparece — o casamento é por par de clubes no mesmo dia de
 *    Brasília, e não por horário exato, porque a Conmebol remarca horário sem
 *    remarcar dia.
 *
 * O `id` sai NEGATIVO. É a chave de lista do React e precisa não colidir com
 * `club_fixtures.id`, que é sempre positivo.
 */
function agendaDoBolao(
  matchesRaw: any[],
  jaCapturados: ClubFixture[],
  ctx: {
    resolver: (nome: string) => string | null;
    nomeCanonico: Map<string, string>;
    bolao: Map<string, string>;
    escudoDe: (key: string | null, daPartida: string | null) => string | null;
  }
): ClubFixture[] {
  const agora = Date.now();
  const diaBrasilia = (iso: string | Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

  // TETO: amanhã, e nem um dia a mais.
  //
  // A chave do bolão vai até o fim do mata-mata, então sem este corte a lista
  // passaria a exibir as 32 partidas restantes de uma vez — e esta tela não é
  // isso. Ela se apresenta como "os últimos 7 dias e a agenda de amanhã", e é
  // exatamente esse horizonte que a captura alcança. O objetivo aqui é COMPLETAR
  // o que a tela já promete, não esticá-la para outra coisa.
  const amanha = new Date();
  amanha.setUTCDate(amanha.getUTCDate() + 1);
  const ultimoDia = diaBrasilia(amanha);

  // Quem a API já trouxe, por "dia de Brasília + os dois clubes".
  //
  // Por dia, e não por horário exato, porque a Conmebol remarca horário sem
  // remarcar dia — e uma diferença de 30 minutos entre o que o admin cadastrou e
  // o que a API devolve faria a mesma partida aparecer duas vezes.
  const jaTem = new Set<string>();
  const assinatura = (dataIso: string, casa: string | null, fora: string | null) =>
    `${diaBrasilia(dataIso)}|${casa ?? '?'}|${fora ?? '?'}`;
  for (const f of jaCapturados) {
    jaTem.add(assinatura(f.kickoff_at, f.home_team_key, f.away_team_key));
  }

  const saida: ClubFixture[] = [];
  for (const m of matchesRaw) {
    if (m.score_home !== null) continue;
    if (!m.match_date || new Date(m.match_date).getTime() <= agora) continue;
    if (diaBrasilia(m.match_date) > ultimoDia) continue;

    const chaveCasa = ctx.resolver(m.team_home ?? '');
    const chaveFora = ctx.resolver(m.team_away ?? '');
    if (jaTem.has(assinatura(m.match_date, chaveCasa, chaveFora))) continue;

    const liga = LIGA_DA_COMPETICAO[m.competition ?? ''] ?? null;

    saida.push({
      id: -m.id,
      kickoff_at: m.match_date,
      // 'NS' (not started) é o mesmo status que a API manda em jogo por
      // começar, então a pílula de estado sai idêntica à das outras linhas.
      status: 'NS',
      league_id: liga?.id ?? null,
      league_name: liga?.nome ?? null,
      round_name: null,
      home_team_key: chaveCasa,
      away_team_key: chaveFora,
      home_team_name: m.team_home,
      away_team_name: m.team_away,
      home_provider_id: null,
      away_provider_id: null,
      home_crest_url: null,
      away_crest_url: null,
      goals_home_90: null,
      goals_away_90: null,
      elapsed: null,
      goals_home_agora: null,
      goals_away_agora: null,
      synced_at: m.match_date,
      goals_home_ht: null,
      goals_away_ht: null,
      goals_home_extra: null,
      goals_away_extra: null,
      penalties_home: null,
      penalties_away: null,
      venue_name: null,
      venue_city: null,
      referee: null,
      league_country: null,
      home_display: chaveCasa ? ctx.nomeCanonico.get(chaveCasa) ?? m.team_home : m.team_home,
      away_display: chaveFora ? ctx.nomeCanonico.get(chaveFora) ?? m.team_away : m.team_away,
      home_crest: ctx.escudoDe(chaveCasa, m.home_iso?.startsWith('http') ? m.home_iso : null),
      away_crest: ctx.escudoDe(chaveFora, m.away_iso?.startsWith('http') ? m.away_iso : null),
      home_is_bolao: !!chaveCasa && ctx.bolao.has(chaveCasa),
      away_is_bolao: !!chaveFora && ctx.bolao.has(chaveFora),
      da_agenda_do_bolao: true,
    });
  }
  return saida;
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
