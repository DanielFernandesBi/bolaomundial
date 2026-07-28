'use server';

import { createServerSupabaseClient } from '@/lib/supabase';
import { runSimulation, type SimResult } from '@/lib/probability/engine';
import { BRACKET_ORDER_BY_SLUG, THIRD_PLACE_BY_SLUG, teamKey } from '@/lib/probability/data';

export interface SimulationResponse {
  error: string | null;
  result: SimResult | null;
  playersCount: number;
  finishedCount: number;
  hasBracket: boolean;
}

export async function getSimulation(tournamentSlug: string): Promise<SimulationResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('id, champion_team')
    .eq('slug', tournamentSlug)
    .single();

  if (tErr || !tournament) {
    return { error: 'Torneio não encontrado', result: null, playersCount: 0, finishedCount: 0, hasBracket: false };
  }

  const bracketOrder = BRACKET_ORDER_BY_SLUG[tournamentSlug];
  const thirdPlace = THIRD_PLACE_BY_SLUG[tournamentSlug] ?? true;

  if (!bracketOrder) {
    return {
      error: 'Este torneio ainda não tem o chaveamento configurado para o simulador.',
      result: null,
      playersCount: 0,
      finishedCount: 0,
      hasBracket: false,
    };
  }

  const { data: matches, error: mErr } = await supabase
    .from('matches')
    .select('id, team_home, team_away, home_iso, away_iso, is_knockout, status, score_home, score_away, extra_time_result, pen_home, pen_away')
    .eq('tournament_id', tournament.id);

  if (mErr) {
    return { error: mErr.message, result: null, playersCount: 0, finishedCount: 0, hasBracket: true };
  }

  const allMatches = (matches || []).map((m: any) => ({
    id: m.id,
    team_home: m.team_home,
    team_away: m.team_away,
    is_knockout: !!m.is_knockout,
    status: m.status,
    score_home: m.score_home,
    score_away: m.score_away,
    extra_time_result: m.extra_time_result ?? null,
    pen_home: m.pen_home ?? null,
    pen_away: m.pen_away ?? null,
  }));

  const finishedCount = allMatches.filter((m) => m.status === 'FINISHED').length;

  // Jogadores
  const { data: rankings } = await supabase
    .from('tournament_rankings')
    .select('user_id, total_points, exact_matches, profiles:user_id ( username, avatar_url )')
    .eq('tournament_id', tournament.id);

  const players = (rankings || []).map((r: any) => {
    const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      user_id: r.user_id,
      username: profile?.username || 'Usuário',
      avatar_url: profile?.avatar_url || null,
      base_points: r.total_points || 0,
      base_exacts: r.exact_matches || 0,
    };
  });

  if (players.length < 2) {
    return {
      error: 'Ainda não há participantes suficientes para projetar o ranking.',
      result: null,
      playersCount: players.length,
      finishedCount,
      hasBracket: true,
    };
  }

  // Palpites de partidas
  const matchIds = allMatches.map((m) => m.id);
  let predictions: any[] = [];
  if (matchIds.length > 0) {
    const { data: preds } = await supabase
      .from('predictions')
      .select('user_id, match_id, pred_home, pred_away, pred_extra_result, pred_pen_home, pred_pen_away')
      .in('match_id', matchIds);
    predictions = preds || [];
  }

  // Palpites de pódio
  const { data: podium } = await supabase
    .from('podium_predictions')
    .select('user_id, champion_team, runner_up_team, third_place_team')
    .eq('tournament_id', tournament.id);

  const result = runSimulation({
    players,
    matches: allMatches,
    predictions,
    podiumPredictions: podium || [],
    bracketOrder,
    thirdPlace,
    podiumDecided: !!tournament.champion_team,
    nScenarios: 20000,
  });

  // Anexa a bandeira (iso) de cada seleção a partir das partidas
  const isoByKey = new Map<string, string | null>();
  for (const m of matches || []) {
    isoByKey.set(teamKey((m as any).team_home), (m as any).home_iso ?? null);
    isoByKey.set(teamKey((m as any).team_away), (m as any).away_iso ?? null);
  }
  for (const t of result.teams) {
    t.iso = isoByKey.get(teamKey(t.team)) ?? null;
  }

  return { error: null, result, playersCount: players.length, finishedCount, hasBracket: true };
}
