'use server';

import { createServerSupabaseClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { COMPETITIONS } from '@/lib/competitions';

// ============================================================================
// Prazo do palpite
// ============================================================================
// O prazo de uma FASE de uma competição é o horário do PRIMEIRO jogo daquela
// fase — ida e volta fecham juntos. Cada competição tem o seu, e cada fase abre
// um prazo novo: as quartas só fecham no 1º jogo das quartas.
//
// A fase de verdade é `ties.round`, alcançada por `matches.tie_id`. NÃO se usa
// `matches.phase`: é rótulo de texto e separa ida de volta ("Oitavas de final –
// ida" / "– volta"), o que daria dois prazos para o mesmo confronto.
//
// Partida sem competição (Mundial, grupos) ou sem confronto associado mantém a
// regra antiga, o início dela mesma.
//
// A trava de verdade é a função public.prediction_deadline + o gatilho
// check_prediction_window, no banco (migração 20260730000001). O que está aqui é
// o espelho para a tela e para a mensagem de erro — não é a única defesa.
// ============================================================================
type MatchParaPrazo = { competition?: string | null; match_date?: string | null; tie_id?: number | null };

function chaveDoPrazo(match: MatchParaPrazo, roundByTie: Map<number, string>): string | null {
  if (!match.competition || !match.tie_id) return null;
  const round = roundByTie.get(match.tie_id);
  if (!round) return null;
  return `${match.competition}|${round}`;
}

function buildDeadlineByPhase(matches: MatchParaPrazo[], roundByTie: Map<number, string>) {
  const mapa = new Map<string, string>();
  for (const m of matches) {
    if (!m.match_date) continue;
    const chave = chaveDoPrazo(m, roundByTie);
    if (!chave) continue;
    const atual = mapa.get(chave);
    if (!atual || new Date(m.match_date) < new Date(atual)) mapa.set(chave, m.match_date);
  }
  return mapa;
}

// Fases que JÁ ROLARAM, com o instante em que fecharam.
//
// O prazo é MIN(match_date) e é recalculado a cada consulta, então ele anda nos
// dois sentidos quando o admin mexe nas datas. Se o jogo mais cedo for adiado
// DEPOIS de já ter sido disputado, o MIN salta para frente e a fase reabriria —
// com os resultados na mesa. O banco impede isso (phase_already_started); aqui
// a mesma conta é refeita para a TELA não mostrar aberto o que o banco bloqueia.
//
// Adiar sem ter disputado nada é diferente e continua reabrindo: aí a fase de
// fato não aconteceu.
function buildPhaseClosedAt(
  matches: (MatchParaPrazo & { status?: string | null })[],
  roundByTie: Map<number, string>,
  now: Date
) {
  const mapa = new Map<string, string>();
  for (const m of matches) {
    const chave = chaveDoPrazo(m, roundByTie);
    if (!chave) continue;
    const jaComecou = m.match_date ? new Date(m.match_date) <= now : false;
    if (m.status !== 'FINISHED' && !jaComecou) continue;
    const quando = m.match_date && jaComecou ? m.match_date : now.toISOString();
    const atual = mapa.get(chave);
    if (!atual || new Date(quando) < new Date(atual)) mapa.set(chave, quando);
  }
  return mapa;
}

/** Instante em que o palpite DESTA partida fecha. null = sem prazo. */
function deadlineForMatch(
  match: MatchParaPrazo,
  porFase: Map<string, string>,
  fechadaEm: Map<string, string>,
  roundByTie: Map<number, string>
): string | null {
  const chave = chaveDoPrazo(match, roundByTie);
  if (!chave) return match.match_date ?? null;
  // Fase já disputada manda: nunca reabre, mesmo que o MIN das datas tenha ido
  // para o futuro.
  const fechada = fechadaEm.get(chave);
  if (fechada) return fechada;
  return porFase.get(chave) ?? null;
}

export async function getMatchesWithPredictions(tournamentSlug: string) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { matches: [], error: 'Usuário não autenticado', tournamentFormat: 'groups' };
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, format')
    .eq('slug', tournamentSlug)
    .single();

  if (tournamentError || !tournament) {
    return { matches: [], error: 'Torneio não encontrado', tournamentFormat: 'groups' };
  }

  const { data: matches, error } = await supabase
    .from('matches')
    .select('*')
    .eq('tournament_id', tournament.id)
    .order('match_date', { ascending: true });

  if (error) {
    return { matches: [], error: error.message, tournamentFormat: tournament.format };
  }

  // (Aqui havia `tournamentStartDate`: calculado, devolvido e declarado como prop
  // do MatchCard, nunca passado nem usado — resquício de um prazo único de
  // torneio que existiu antes. Removido junto com a prop órfã.)
  //
  // A fase vem de ties.round; `matches` não tem essa coluna.
  const { data: ties } = await supabase
    .from('ties')
    .select('id, round')
    .eq('tournament_id', tournament.id);
  const roundByTie = new Map<number, string>((ties as any[])?.map((t: any) => [t.id, t.round]) ?? []);
  const prazoPorFase = buildDeadlineByPhase((matches as any[]) || [], roundByTie);
  const faseFechadaEm = buildPhaseClosedAt((matches as any[]) || [], roundByTie, new Date());

  const matchIds = matches?.map((m: any) => m.id) || [];
  const { data: predictions } = await supabase
    .from('predictions')
    .select('*')
    .eq('user_id', user.id)
    .in('match_id', matchIds);

  const predictionsMap = new Map(predictions?.map((p: any) => [p.match_id, p]) || []);

  const processedMatches =
    matches?.map((match: any) => {
      const prediction = predictionsMap.get(match.id);

      return {
        ...match,
        // Instante em que ESTE palpite fecha. A tela não recalcula a regra:
        // consome este campo.
        lock_at: deadlineForMatch(match, prazoPorFase, faseFechadaEm, roundByTie),
        user_prediction: prediction
          ? {
              id: prediction.id,
              pred_home: prediction.pred_home,
              pred_away: prediction.pred_away,
              pred_extra_result: prediction.pred_extra_result ?? null,
              pred_pen_home: prediction.pred_pen_home ?? null,
              pred_pen_away: prediction.pred_pen_away ?? null,
              pred_pen_winner: prediction.pred_pen_winner ?? null,
              points_earned: prediction.points_earned,
              points_regular: prediction.points_regular ?? 0,
              points_extra: prediction.points_extra ?? 0,
              points_pen: prediction.points_pen ?? 0,
            }
          : null,
      };
    }) || [];

  return { matches: processedMatches, error: null, tournamentFormat: tournament.format };
}

interface ExtraPrediction {
  predExtraResult?: 'home' | 'draw' | 'away' | null;
  predPenHome?: number | null;
  predPenAway?: number | null;
  predPenWinner?: 'home' | 'away' | null;
}

export async function savePrediction(
  matchId: number,
  predHome: number,
  predAway: number,
  tournamentSlug: string,
  extra?: ExtraPrediction
) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Usuário não autenticado' };
  }

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('match_date, status, tournament_id, is_knockout, competition')
    .eq('id', matchId)
    .single();

  if (matchError || !match) {
    return { error: 'Jogo não encontrado' };
  }

  if (match.status === 'FINISHED') {
    return { error: 'Não é possível alterar palpite de um jogo finalizado' };
  }

  // Prazo: consulta a MESMA função que o gatilho usa, em vez de reimplementar a
  // regra aqui. Duas definições do prazo divergiriam com o tempo — e a do banco é
  // a que manda. Se a RPC falhar, o upsert segue e o gatilho barra de qualquer
  // forma; a checagem daqui existe para dar mensagem decente, não para proteger.
  const now = new Date();
  const { data: prazo } = await supabase.rpc('prediction_deadline', { p_match_id: matchId });
  if (prazo && now > new Date(prazo as string)) {
    return {
      error: (match as any).competition
        ? 'Os palpites desta fase já encerraram — o prazo era o horário do primeiro jogo da fase.'
        : 'A partida já começou. Não é mais possível fazer ou alterar este palpite.',
    };
  }

  const payload: Record<string, unknown> = {
    user_id: user.id,
    match_id: matchId,
    pred_home: predHome,
    pred_away: predAway,
  };

  // Só grava prorrogação/pênaltis em jogos de mata-mata
  if (match.is_knockout && extra) {
    payload.pred_extra_result = extra.predExtraResult ?? null;
    payload.pred_pen_home = extra.predPenHome ?? null;
    payload.pred_pen_away = extra.predPenAway ?? null;
    payload.pred_pen_winner = extra.predPenWinner ?? null;
  }

  const { error: upsertError } = await supabase
    .from('predictions')
    .upsert(payload, { onConflict: 'user_id,match_id' });

  if (upsertError) {
    return { error: upsertError.message || 'Erro ao salvar palpite' };
  }

  revalidatePath(`/${tournamentSlug}/matches`);
  return { success: true };
}

/**
 * Transparência por partida: jogos cujo horário de início já passou
 * (apostas encerradas) mas que ainda não foram finalizados pelo admin.
 */
export async function getMatchesInProgressWithAllPredictions(tournamentSlug: string) {
  const supabase = await createServerSupabaseClient();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();

  if (tournamentError || !tournament) {
    return { matches: [], error: 'Torneio não encontrado' };
  }

  const now = new Date();

  const { data: matches, error } = await supabase
    .from('matches')
    .select('*')
    .eq('tournament_id', tournament.id)
    .eq('status', 'SCHEDULED')
    .lte('match_date', now.toISOString())
    .order('match_date', { ascending: true });

  if (error) {
    return { matches: [], error: error.message };
  }

  const inProgressMatches = matches || [];
  if (inProgressMatches.length === 0) {
    return { matches: [], error: null };
  }

  const matchIds = inProgressMatches.map((m: any) => m.id);
  const { data: allPredictions, error: predictionsError } = await supabase
    .from('predictions')
    .select(`*, profiles:user_id ( id, username, avatar_url )`)
    .in('match_id', matchIds);

  if (predictionsError) {
    return { matches: [], error: predictionsError.message };
  }

  const predictionsByMatch = new Map<number, any[]>();
  allPredictions?.forEach((pred: any) => {
    const profile = Array.isArray(pred.profiles) ? pred.profiles[0] : pred.profiles;
    if (!predictionsByMatch.has(pred.match_id)) predictionsByMatch.set(pred.match_id, []);
    predictionsByMatch.get(pred.match_id)!.push({
      id: pred.id,
      pred_home: pred.pred_home,
      pred_away: pred.pred_away,
      pred_extra_result: pred.pred_extra_result ?? null,
      pred_pen_home: pred.pred_pen_home ?? null,
      pred_pen_away: pred.pred_pen_away ?? null,
      pred_pen_winner: pred.pred_pen_winner ?? null,
      user_id: pred.user_id,
      username: profile?.username || 'Usuário',
      avatar_url: profile?.avatar_url || null,
    });
  });

  const processedMatches = inProgressMatches.map((match: any) => ({
    ...match,
    all_predictions: predictionsByMatch.get(match.id) || [],
  }));

  return { matches: processedMatches, error: null };
}

/**
 * Detalhe de uma partida encerrada: todos os palpites ordenados por pontuação
 * (maior -> menor), com o resultado real da partida.
 */
export async function getMatchResultDetail(matchId: number) {
  const supabase = await createServerSupabaseClient();

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('*')
    .eq('id', matchId)
    .single();

  if (matchError || !match) {
    return { match: null, predictions: [], error: 'Jogo não encontrado' };
  }

  const { data: preds, error: predsError } = await supabase
    .from('predictions')
    .select(`*, profiles:user_id ( id, username, avatar_url )`)
    .eq('match_id', matchId);

  if (predsError) {
    return { match, predictions: [], error: predsError.message };
  }

  const predictions = (preds || [])
    .map((pred: any) => {
      const profile = Array.isArray(pred.profiles) ? pred.profiles[0] : pred.profiles;
      return {
        id: pred.id,
        user_id: pred.user_id,
        username: profile?.username || 'Usuário',
        avatar_url: profile?.avatar_url || null,
        pred_home: pred.pred_home,
        pred_away: pred.pred_away,
        pred_extra_result: pred.pred_extra_result ?? null,
        pred_pen_home: pred.pred_pen_home ?? null,
        pred_pen_away: pred.pred_pen_away ?? null,
        pred_pen_winner: pred.pred_pen_winner ?? null,
        points_earned: pred.points_earned ?? 0,
        points_regular: pred.points_regular ?? 0,
        points_extra: pred.points_extra ?? 0,
        points_pen: pred.points_pen ?? 0,
      };
    })
    .sort((a, b) => b.points_earned - a.points_earned);

  return { match, predictions, error: null };
}

/**
 * Confrontos de oitavas ainda SEM os dois participantes (playoffs pendentes).
 * Retorna, por competição, os ties com rótulo de origem para exibir sem inputs.
 */
export async function getPendingBracketTies(tournamentSlug: string) {
  const supabase = await createServerSupabaseClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();
  if (!tournament) return { competitions: [] as any[] };

  const { data: ties } = await supabase
    .from('ties')
    .select('id, competition, round, slot, team_a, team_a_iso, team_a_source_label, team_b, team_b_iso, team_b_source_label, ida_match_id')
    .eq('tournament_id', tournament.id)
    .eq('round', 'oitavas')
    .order('slot', { ascending: true });

  // Pendente = falta um participante E ainda não há jogos criados
  const pending = (ties || []).filter(
    (t: any) => (t.team_a == null || t.team_b == null) && t.ida_match_id == null
  );

  const competitions = COMPETITIONS.filter((c) => pending.some((t: any) => t.competition === c.key)).map((c) => ({
    key: c.key,
    name: c.name,
    ties: pending
      .filter((t: any) => t.competition === c.key)
      .map((t: any) => ({
        id: t.id,
        sideA: { team: t.team_a, iso: t.team_a_iso, label: t.team_a_source_label },
        sideB: { team: t.team_b, iso: t.team_b_iso, label: t.team_b_source_label },
      })),
  }));

  return { competitions };
}

// ============================================
// PÓDIO — dois modos:
//   • 'competition' (bolão de clubes): campeão + vice por competição
//   • 'legacy' (Mundial): campeão + vice + 3º, resultado real em tournaments.*
// ============================================

export interface PodiumCompetition {
  key: string;
  name: string;
  mode: 'competition' | 'legacy';
  teams: { name: string; iso: string | null }[];
  locked: boolean;
  pending: boolean; // algum participante das oitavas ainda indefinido (bloqueia o pódio)
  firstMatchDate: string | null;
  userPick: {
    championTeam: string | null; championIso: string | null;
    viceTeam: string | null; viceIso: string | null;
    thirdTeam: string | null; thirdIso: string | null;
  } | null;
  actual: {
    championTeam: string | null; championIso: string | null;
    runnerUpTeam: string | null; runnerUpIso: string | null;
    thirdTeam: string | null; thirdIso: string | null;
  } | null;
}

export async function getPodiumData(tournamentSlug: string) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select(
      'id, format, champion_team, champion_iso, runner_up_team, runner_up_iso, third_place_team, third_place_iso'
    )
    .eq('slug', tournamentSlug)
    .single();

  if (tournamentError || !tournament) {
    return { error: 'Torneio não encontrado' } as const;
  }

  const { data: matches } = await supabase
    .from('matches')
    .select('competition, team_home, home_iso, team_away, away_iso, match_date')
    .eq('tournament_id', tournament.id);

  let picks: any[] = [];
  if (user) {
    const { data } = await supabase
      .from('podium_predictions')
      .select('*')
      .eq('user_id', user.id)
      .eq('tournament_id', tournament.id);
    picks = data || [];
  }

  const now = new Date();

  // Confrontos (bracket) — a fonte dos 16 clubes de cada competição vem dos ties de
  // oitavas (a Sul-Americana existe antes das partidas). Nunca usar source_label como time.
  const { data: ties } = await supabase
    .from('ties')
    .select('competition, round, team_a, team_a_iso, team_b, team_b_iso')
    .eq('tournament_id', tournament.id)
    .eq('round', 'oitavas');

  const hasTies = (ties || []).length > 0;

  // ---- Modo por competição (clubes), a partir dos ties de oitavas ----
  if (hasTies) {
    // 1ª data por competição (das partidas reais)
    const firstDateByComp = new Map<string, string | null>();
    (matches || []).forEach((m: any) => {
      if (!m.competition || !m.match_date) return;
      const cur = firstDateByComp.get(m.competition);
      if (!cur || new Date(m.match_date) < new Date(cur)) firstDateByComp.set(m.competition, m.match_date);
    });

    // times reais + pendência por competição
    const byComp = new Map<string, { teams: Map<string, { name: string; iso: string | null }>; pending: boolean }>();
    (ties || []).forEach((t: any) => {
      if (!t.competition) return;
      if (!byComp.has(t.competition)) byComp.set(t.competition, { teams: new Map(), pending: false });
      const g = byComp.get(t.competition)!;
      if (t.team_a) g.teams.set(t.team_a, { name: t.team_a, iso: t.team_a_iso });
      else g.pending = true;
      if (t.team_b) g.teams.set(t.team_b, { name: t.team_b, iso: t.team_b_iso });
      else g.pending = true;
    });

    const { data: results } = await supabase
      .from('tournament_competition_results')
      .select('*')
      .eq('tournament_id', tournament.id);

    const competitions: PodiumCompetition[] = COMPETITIONS.filter((c) => byComp.has(c.key)).map((c) => {
      const g = byComp.get(c.key)!;
      const teams = Array.from(g.teams.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      const firstDate = firstDateByComp.get(c.key) ?? null;
      const pick = picks.find((p) => p.competition === c.key) || null;
      const res = (results || []).find((r: any) => r.competition === c.key) || null;
      return {
        key: c.key,
        name: c.name,
        mode: 'competition',
        teams,
        pending: g.pending,
        locked: firstDate ? now > new Date(firstDate) : false,
        firstMatchDate: firstDate,
        userPick: pick
          ? { championTeam: pick.champion_team, championIso: pick.champion_iso, viceTeam: pick.runner_up_team, viceIso: pick.runner_up_iso, thirdTeam: null, thirdIso: null }
          : null,
        actual: res
          ? { championTeam: res.champion_team, championIso: res.champion_iso, runnerUpTeam: res.runner_up_team, runnerUpIso: res.runner_up_iso, thirdTeam: null, thirdIso: null }
          : null,
      };
    });

    return { error: null, format: tournament.format, competitions } as const;
  }

  // ---- Modo legado (Mundial): um único pódio campeão/vice/3º ----
  if (tournament.format !== 'knockout' && tournament.format !== 'mixed') {
    return { error: null, format: tournament.format, competitions: [] } as const;
  }

  const teamsMap = new Map<string, { name: string; iso: string | null }>();
  let firstDate: string | null = null;
  (matches || []).forEach((m: any) => {
    if (m.team_home && !teamsMap.has(m.team_home)) teamsMap.set(m.team_home, { name: m.team_home, iso: m.home_iso });
    if (m.team_away && !teamsMap.has(m.team_away)) teamsMap.set(m.team_away, { name: m.team_away, iso: m.away_iso });
    if (m.match_date && (!firstDate || new Date(m.match_date) < new Date(firstDate))) firstDate = m.match_date;
  });
  const teams = Array.from(teamsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const legacyPick = picks.find((p) => p.competition == null) || null;

  const legacyBlock: PodiumCompetition = {
    key: '__legacy__',
    name: 'Pódio',
    mode: 'legacy',
    teams,
    pending: false,
    locked: firstDate ? now > new Date(firstDate) : false,
    firstMatchDate: firstDate,
    userPick: legacyPick
      ? {
          championTeam: legacyPick.champion_team, championIso: legacyPick.champion_iso,
          viceTeam: legacyPick.runner_up_team, viceIso: legacyPick.runner_up_iso,
          thirdTeam: legacyPick.third_place_team, thirdIso: legacyPick.third_place_iso,
        }
      : null,
    actual: {
      championTeam: tournament.champion_team, championIso: tournament.champion_iso,
      runnerUpTeam: tournament.runner_up_team, runnerUpIso: tournament.runner_up_iso,
      thirdTeam: tournament.third_place_team, thirdIso: tournament.third_place_iso,
    },
  };

  return { error: null, format: tournament.format, competitions: [legacyBlock] } as const;
}

/**
 * Transparência do PÓDIO. Modo por competição: a partir do 1º jogo de cada competição.
 * Modo legado (Mundial): a partir do 1º jogo do torneio, com 3º lugar.
 */
export async function getPodiumTransparency(tournamentSlug: string) {
  const supabase = await createServerSupabaseClient();

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, format')
    .eq('slug', tournamentSlug)
    .single();

  if (tournamentError || !tournament) {
    return { available: false, started: false, competitions: [], error: 'Torneio não encontrado' as string | null };
  }

  if (tournament.format !== 'knockout' && tournament.format !== 'mixed') {
    return { available: false, started: false, competitions: [], error: null };
  }

  const { data: matches } = await supabase
    .from('matches')
    .select('competition, match_date')
    .eq('tournament_id', tournament.id);

  const { data: picks } = await supabase
    .from('podium_predictions')
    .select(`*, profiles:user_id ( id, username, avatar_url )`)
    .eq('tournament_id', tournament.id);

  const now = new Date();
  const hasCompetitionMatches = (matches || []).some((m: any) => m.competition);

  const mapPred = (p: any, withThird: boolean) => {
    const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
    return {
      user_id: p.user_id,
      username: profile?.username || 'Usuário',
      avatar_url: profile?.avatar_url || null,
      championTeam: p.champion_team,
      championIso: p.champion_iso,
      viceTeam: p.runner_up_team,
      viceIso: p.runner_up_iso,
      thirdTeam: withThird ? p.third_place_team : null,
      thirdIso: withThird ? p.third_place_iso : null,
    };
  };

  if (hasCompetitionMatches) {
    const firstByComp = new Map<string, string | null>();
    (matches || []).forEach((m: any) => {
      if (!m.competition || !m.match_date) return;
      const cur = firstByComp.get(m.competition);
      if (!cur || new Date(m.match_date) < new Date(cur)) firstByComp.set(m.competition, m.match_date);
    });

    const competitions = COMPETITIONS.filter((c) => firstByComp.has(c.key)).map((c) => {
      const first = firstByComp.get(c.key) || null;
      const started = first ? now > new Date(first) : false;
      const predictions = started
        ? (picks || [])
            .filter((p: any) => p.competition === c.key)
            .map((p: any) => mapPred(p, false))
            .sort((a, b) => a.username.localeCompare(b.username, 'pt-BR'))
        : [];
      return { key: c.key, name: c.name, hasThird: false, started, predictions };
    });

    return { available: true, started: competitions.some((c) => c.started), competitions, error: null };
  }

  // Legado (Mundial): 1º jogo do torneio, com 3º lugar
  let firstDate: string | null = null;
  (matches || []).forEach((m: any) => {
    if (m.match_date && (!firstDate || new Date(m.match_date) < new Date(firstDate))) firstDate = m.match_date;
  });
  const started = firstDate ? now > new Date(firstDate) : false;
  const predictions = started
    ? (picks || [])
        .filter((p: any) => p.competition == null)
        .map((p: any) => mapPred(p, true))
        .sort((a, b) => a.username.localeCompare(b.username, 'pt-BR'))
    : [];

  return {
    available: true,
    started,
    competitions: [{ key: '__legacy__', name: 'Pódio', hasThird: true, started, predictions }],
    error: null,
  };
}

interface PodiumPickInput {
  championTeam: string | null;
  championIso: string | null;
  viceTeam: string | null;
  viceIso: string | null;
  thirdTeam?: string | null;
  thirdIso?: string | null;
}

export async function savePodiumPrediction(
  tournamentSlug: string,
  competition: string | null,
  pick: PodiumPickInput
) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Usuário não autenticado' };
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();

  if (tournamentError || !tournament) {
    return { error: 'Torneio não encontrado' };
  }

  // Prazo do pódio: 1º jogo (da competição, ou do torneio no modo legado)
  let firstQuery = supabase
    .from('matches')
    .select('match_date')
    .eq('tournament_id', tournament.id)
    .not('match_date', 'is', null)
    .order('match_date', { ascending: true })
    .limit(1);
  if (competition) firstQuery = firstQuery.eq('competition', competition);
  const { data: firstMatch } = await firstQuery.maybeSingle();

  if (firstMatch?.match_date && new Date() > new Date(firstMatch.match_date)) {
    return { error: 'O prazo do palpite de pódio já encerrou.' };
  }

  // Não permite salvar pódio de uma competição com participantes de oitavas indefinidos.
  if (competition) {
    const { data: pendingTie } = await supabase
      .from('ties')
      .select('id')
      .eq('tournament_id', tournament.id)
      .eq('competition', competition)
      .eq('round', 'oitavas')
      .or('team_a.is.null,team_b.is.null')
      .limit(1)
      .maybeSingle();
    if (pendingTie) {
      return { error: 'Aguardando definição dos playoffs desta competição para liberar o palpite de pódio.' };
    }
  }

  // Times distintos (campeão/vice/3º)
  const picked = [pick.championTeam, pick.viceTeam, pick.thirdTeam].filter(Boolean) as string[];
  if (new Set(picked).size !== picked.length) {
    return { error: 'Escolha times diferentes para cada posição do pódio.' };
  }

  const payload = {
    user_id: user.id,
    tournament_id: tournament.id,
    competition,
    champion_team: pick.championTeam,
    champion_iso: pick.championIso,
    runner_up_team: pick.viceTeam,
    runner_up_iso: pick.viceIso,
    third_place_team: pick.thirdTeam ?? null,
    third_place_iso: pick.thirdIso ?? null,
  };

  let saveError: any = null;
  if (competition == null) {
    // Legado: competition NULL não casa no onConflict composto → select-then-write
    const { data: existing } = await supabase
      .from('podium_predictions')
      .select('id')
      .eq('user_id', user.id)
      .eq('tournament_id', tournament.id)
      .is('competition', null)
      .maybeSingle();
    if (existing) {
      ({ error: saveError } = await supabase.from('podium_predictions').update(payload).eq('id', existing.id));
    } else {
      ({ error: saveError } = await supabase.from('podium_predictions').insert(payload));
    }
  } else {
    ({ error: saveError } = await supabase
      .from('podium_predictions')
      .upsert(payload, { onConflict: 'user_id,tournament_id,competition' }));
  }

  if (saveError) {
    return { error: saveError.message || 'Erro ao salvar palpite de pódio' };
  }

  revalidatePath(`/${tournamentSlug}/matches`);
  return { success: true };
}
