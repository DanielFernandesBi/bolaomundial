'use server';

import { createServerSupabaseClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { COMPETITIONS } from '@/lib/competitions';

export async function getMatchesWithPredictions(tournamentSlug: string) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { matches: [], error: 'Usuário não autenticado', tournamentStartDate: null, tournamentFormat: 'groups' };
  }

  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, format')
    .eq('slug', tournamentSlug)
    .single();

  if (tournamentError || !tournament) {
    return { matches: [], error: 'Torneio não encontrado', tournamentStartDate: null, tournamentFormat: 'groups' };
  }

  const { data: matches, error } = await supabase
    .from('matches')
    .select('*')
    .eq('tournament_id', tournament.id)
    .order('match_date', { ascending: true });

  if (error) {
    return { matches: [], error: error.message, tournamentStartDate: null, tournamentFormat: tournament.format };
  }

  const tournamentStartDate = matches && matches.length > 0 ? (matches[0].match_date as string) : null;

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

  return { matches: processedMatches, error: null, tournamentStartDate, tournamentFormat: tournament.format };
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
    .select('match_date, status, tournament_id, is_knockout')
    .eq('id', matchId)
    .single();

  if (matchError || !match) {
    return { error: 'Jogo não encontrado' };
  }

  if (match.status === 'FINISHED') {
    return { error: 'Não é possível alterar palpite de um jogo finalizado' };
  }

  // Prazo por partida: bloqueia no horário de início do jogo.
  // match_date NULL = "data a definir" (jogo gerado pela fase anterior) → palpite aberto.
  const now = new Date();
  if (match.match_date && now > new Date(match.match_date)) {
    return { error: 'A partida já começou. Não é mais possível fazer ou alterar este palpite.' };
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
  const hasCompetitionMatches = (matches || []).some((m: any) => m.competition);

  // ---- Modo por competição (clubes) ----
  if (hasCompetitionMatches) {
    const byComp = new Map<string, { teams: Map<string, { name: string; iso: string | null }>; firstDate: string | null }>();
    (matches || []).forEach((m: any) => {
      if (!m.competition) return;
      if (!byComp.has(m.competition)) byComp.set(m.competition, { teams: new Map(), firstDate: null });
      const g = byComp.get(m.competition)!;
      if (m.team_home && !g.teams.has(m.team_home)) g.teams.set(m.team_home, { name: m.team_home, iso: m.home_iso });
      if (m.team_away && !g.teams.has(m.team_away)) g.teams.set(m.team_away, { name: m.team_away, iso: m.away_iso });
      if (m.match_date && (!g.firstDate || new Date(m.match_date) < new Date(g.firstDate))) g.firstDate = m.match_date;
    });

    const { data: results } = await supabase
      .from('tournament_competition_results')
      .select('*')
      .eq('tournament_id', tournament.id);

    const competitions: PodiumCompetition[] = COMPETITIONS.filter((c) => byComp.has(c.key)).map((c) => {
      const g = byComp.get(c.key)!;
      const teams = Array.from(g.teams.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      const pick = picks.find((p) => p.competition === c.key) || null;
      const res = (results || []).find((r: any) => r.competition === c.key) || null;
      return {
        key: c.key,
        name: c.name,
        mode: 'competition',
        teams,
        locked: g.firstDate ? now > new Date(g.firstDate) : false,
        firstMatchDate: g.firstDate,
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
