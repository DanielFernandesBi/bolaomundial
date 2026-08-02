'use server';

import { createServerSupabaseClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { brasiliaLocalInputToISO } from '@/lib/utils/datetime';
import { advanceBracketForMatch } from '@/lib/bracket';
import { COMPETITIONS } from '@/lib/competitions';

export async function checkAdminAccess() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { isAdmin: false, error: 'Usuário não autenticado' };
  }

  // Buscar perfil do usuário
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.is_admin) {
    return { isAdmin: false, error: 'Acesso negado. Apenas administradores podem acessar esta página.' };
  }

  return { isAdmin: true, userId: user.id };
}

export async function getAdminMatches(tournamentSlug: string) {
  // Verificar acesso de admin primeiro
  const accessCheck = await checkAdminAccess();

  if (!accessCheck.isAdmin) {
    return { matches: [], error: accessCheck.error || 'Acesso negado' };
  }

  const supabase = await createServerSupabaseClient();

  // Buscar o torneio pelo slug
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();

  if (tournamentError || !tournament) {
    return { matches: [], error: 'Torneio não encontrado' };
  }

  // Buscar todos os jogos do torneio ordenados por data
  const { data: matches, error } = await supabase
    .from('matches')
    .select('*')
    .eq('tournament_id', tournament.id)
    .order('match_date', { ascending: true });

  if (error) {
    return { matches: [], error: error.message };
  }

  return { matches: matches || [], error: null };
}

interface KnockoutResult {
  extraTimeResult?: 'home' | 'draw' | 'away' | null;
  penHome?: number | null;
  penAway?: number | null;
  penWinner?: 'home' | 'away' | null;
}

export async function updateMatchScore(
  matchId: number,
  scoreHome: number | null,
  scoreAway: number | null,
  status: string,
  tournamentSlug: string,
  knockout?: KnockoutResult
) {
  // Verificar acesso de admin primeiro
  const accessCheck = await checkAdminAccess();

  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado' };
  }

  const supabase = await createServerSupabaseClient();

  // Validar dados
  if (status === 'FINISHED' && (scoreHome === null || scoreAway === null)) {
    return { error: 'Para finalizar um jogo, é necessário informar o placar' };
  }

  // Buscar o jogo para saber se é mata-mata
  const { data: existing } = await supabase
    .from('matches')
    .select('is_knockout')
    .eq('id', matchId)
    .single();

  const updatePayload: Record<string, unknown> = {
    score_home: scoreHome,
    score_away: scoreAway,
    status: status,
  };

  // Resultado de prorrogação/pênaltis só faz sentido em jogos de mata-mata.
  // NULL nesses campos = "não houve" (e os palpites eventuais são ignorados).
  if (existing?.is_knockout) {
    updatePayload.extra_time_result = knockout?.extraTimeResult ?? null;
    updatePayload.pen_home = knockout?.penHome ?? null;
    updatePayload.pen_away = knockout?.penAway ?? null;
    updatePayload.pen_winner = knockout?.penWinner ?? null;
  }

  const { error } = await supabase.from('matches').update(updatePayload).eq('id', matchId);

  if (error) {
    return { error: error.message || 'Erro ao atualizar jogo' };
  }

  // Auto-progressão do chaveamento: se este jogo faz parte de um confronto (tie) e
  // as duas pernas terminaram, calcula o classificado e gera a próxima fase.
  let bracketWarning: string | undefined;
  let bracketInfo: string | undefined;
  if (status === 'FINISHED') {
    try {
      const result = await advanceBracketForMatch(supabase, matchId);
      bracketWarning = result.warning;
      bracketInfo = result.info;
    } catch (e: any) {
      bracketWarning = `Placar salvo, mas houve um erro ao processar o chaveamento: ${e?.message || e}`;
    }
  }

  revalidatePath(`/${tournamentSlug}/admin`);
  revalidatePath(`/${tournamentSlug}/matches`);
  revalidatePath(`/${tournamentSlug}/ranking`);
  revalidatePath('/profile');

  return { success: true, bracketWarning, bracketInfo };
}

export async function createMatch(
  teamHome: string,
  teamAway: string,
  homeIso: string,
  awayIso: string,
  matchDate: string,
  tournamentSlug: string,
  phase?: string | null,
  isKnockout?: boolean,
  competition?: string | null,
  leg?: string | null,
  hasExtraTime?: boolean,
  venue?: string | null,
  penaltyMode?: 'score' | 'winner' | null,
  extraEnabled?: boolean
) {
  // Verificar acesso de admin primeiro
  const accessCheck = await checkAdminAccess();

  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado' };
  }

  // Validar dados (a data é opcional: pode ser criada "a definir")
  if (!teamHome || !teamAway || !homeIso || !awayIso) {
    return { error: 'Times e escudos são obrigatórios' };
  }

  // Validar ISO: pode ser código (mínimo 2 caracteres) ou URL (deve começar com http)
  const isHomeIsoUrl = homeIso.trim().toLowerCase().startsWith('http');
  const isAwayIsoUrl = awayIso.trim().toLowerCase().startsWith('http');

  if (!isHomeIsoUrl && homeIso.trim().length < 2) {
    return { error: 'O código ISO da casa deve ter pelo menos 2 caracteres ou ser uma URL válida' };
  }

  if (!isAwayIsoUrl && awayIso.trim().length < 2) {
    return { error: 'O código ISO do visitante deve ter pelo menos 2 caracteres ou ser uma URL válida' };
  }

  // O input datetime-local ("YYYY-MM-DDTHH:mm") é horário de Brasília (UTC-3).
  // Data vazia => match_date NULL ("a definir").
  let matchDateISO: string | null = null;
  if (matchDate && matchDate.trim()) {
    matchDateISO = brasiliaLocalInputToISO(matchDate);
    if (!matchDateISO) {
      return { error: 'Data inválida' };
    }
  }

  const supabase = await createServerSupabaseClient();

  // Buscar o torneio pelo slug
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id, format')
    .eq('slug', tournamentSlug)
    .single();

  if (tournamentError || !tournament) {
    return { error: 'Torneio não encontrado' };
  }

  // Inserir novo jogo
  // Se for URL, manter como está; se for código ISO, converter para lowercase
  const homeIsoFinal = isHomeIsoUrl ? homeIso.trim() : homeIso.trim().toLowerCase();
  const awayIsoFinal = isAwayIsoUrl ? awayIso.trim() : awayIso.trim().toLowerCase();

  const phaseValue = phase?.trim() || null;
  // Default do mata-mata: torneio 'knockout' => true; senão usa o que veio (ex.: 'mixed')
  const knockoutValue = isKnockout ?? tournament.format === 'knockout';
  const competitionValue = competition?.trim() || null;
  const legValue = leg?.trim() || null;
  // Jogos de clubes NÃO dependem dos defaults legados do banco:
  const isClub = competitionValue !== null;
  const finalPenMode = penaltyMode ?? (isClub ? 'winner' : null);
  const finalExtraEnabled = extraEnabled ?? (isClub ? false : undefined);

  const { error } = await supabase
    .from('matches')
    .insert({
      team_home: teamHome.trim(),
      team_away: teamAway.trim(),
      home_iso: homeIsoFinal,
      away_iso: awayIsoFinal,
      match_date: matchDateISO,
      status: 'SCHEDULED',
      tournament_id: tournament.id,
      is_knockout: knockoutValue,
      ...(hasExtraTime !== undefined && { has_extra_time: hasExtraTime }),
      ...(finalPenMode != null && { penalty_prediction_mode: finalPenMode }),
      ...(finalExtraEnabled !== undefined && { extra_prediction_enabled: finalExtraEnabled }),
      ...(competitionValue !== null && { competition: competitionValue }),
      ...(legValue !== null && { leg: legValue }),
      ...(venue != null && venue.trim() !== '' && { venue: venue.trim() }),
      ...(phaseValue !== null && { phase: phaseValue }),
    });

  if (error) {
    return { error: error.message || 'Erro ao criar jogo' };
  }

  revalidatePath(`/${tournamentSlug}/admin`);
  revalidatePath(`/${tournamentSlug}/matches`);

  return { success: true };
}

export async function updateMatch(
  matchId: number,
  teamHome: string,
  teamAway: string,
  homeIso: string,
  awayIso: string,
  matchDate: string,
  tournamentSlug: string,
  phase?: string | null,
  isKnockout?: boolean,
  competition?: string | null,
  leg?: string | null,
  hasExtraTime?: boolean,
  venue?: string | null,
  penaltyMode?: 'score' | 'winner' | null,
  extraEnabled?: boolean
) {
  // Verificar acesso de admin primeiro
  const accessCheck = await checkAdminAccess();

  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado' };
  }

  // Validar dados (a data é opcional: pode ficar "a definir")
  if (!teamHome || !teamAway || !homeIso || !awayIso) {
    return { error: 'Times e escudos são obrigatórios' };
  }

  // Validar ISO: pode ser código (mínimo 2 caracteres) ou URL (deve começar com http)
  const isHomeIsoUrl = homeIso.trim().toLowerCase().startsWith('http');
  const isAwayIsoUrl = awayIso.trim().toLowerCase().startsWith('http');

  if (!isHomeIsoUrl && homeIso.trim().length < 2) {
    return { error: 'O código ISO da casa deve ter pelo menos 2 caracteres ou ser uma URL válida' };
  }

  if (!isAwayIsoUrl && awayIso.trim().length < 2) {
    return { error: 'O código ISO do visitante deve ter pelo menos 2 caracteres ou ser uma URL válida' };
  }

  // O input datetime-local ("YYYY-MM-DDTHH:mm") é horário de Brasília (UTC-3).
  // Data vazia => match_date NULL ("a definir").
  let matchDateISO: string | null = null;
  if (matchDate && matchDate.trim()) {
    matchDateISO = brasiliaLocalInputToISO(matchDate);
    if (!matchDateISO) {
      return { error: 'Data inválida' };
    }
  }

  const supabase = await createServerSupabaseClient();

  // Verificar se o jogo existe e pertence ao torneio
  const { data: existingMatch, error: matchError } = await supabase
    .from('matches')
    .select('id, tournament_id')
    .eq('id', matchId)
    .single();

  if (matchError || !existingMatch) {
    return { error: 'Jogo não encontrado' };
  }

  // Buscar o torneio pelo slug para validar
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();

  if (tournamentError || !tournament) {
    return { error: 'Torneio não encontrado' };
  }

  // Verificar se o jogo pertence ao torneio correto
  if (existingMatch.tournament_id !== tournament.id) {
    return { error: 'Jogo não pertence a este torneio' };
  }

  // Se for URL, manter como está; se for código ISO, converter para lowercase
  // (isHomeIsoUrl e isAwayIsoUrl já foram declaradas acima na validação)
  const homeIsoFinal = isHomeIsoUrl ? homeIso.trim() : homeIso.trim().toLowerCase();
  const awayIsoFinal = isAwayIsoUrl ? awayIso.trim() : awayIso.trim().toLowerCase();

  const updatePayload: Record<string, unknown> = {
    team_home: teamHome.trim(),
    team_away: teamAway.trim(),
    home_iso: homeIsoFinal,
    away_iso: awayIsoFinal,
    match_date: matchDateISO,
  };
  const phaseValue = phase !== undefined ? (phase?.trim() || null) : undefined;
  if (phaseValue !== undefined) {
    updatePayload.phase = phaseValue;
  }
  if (isKnockout !== undefined) {
    updatePayload.is_knockout = isKnockout;
  }
  if (competition !== undefined) {
    updatePayload.competition = competition?.trim() || null;
  }
  if (leg !== undefined) {
    updatePayload.leg = leg?.trim() || null;
  }
  if (hasExtraTime !== undefined) {
    updatePayload.has_extra_time = hasExtraTime;
  }
  if (penaltyMode !== undefined) {
    updatePayload.penalty_prediction_mode = penaltyMode ?? 'score';
  }
  if (extraEnabled !== undefined) {
    updatePayload.extra_prediction_enabled = extraEnabled;
  }
  if (venue !== undefined) {
    updatePayload.venue = venue?.trim() || null;
  }
  // Jogo de clubes: aplica os defaults corretos (não os legados) quando não vier explícito.
  const effComp = competition !== undefined ? (competition?.trim() || null) : undefined;
  if (effComp) {
    if (penaltyMode === undefined) updatePayload.penalty_prediction_mode = 'winner';
    if (extraEnabled === undefined) updatePayload.extra_prediction_enabled = false;
  }

  const { error } = await supabase
    .from('matches')
    .update(updatePayload)
    .eq('id', matchId);

  if (error) {
    return { error: error.message || 'Erro ao atualizar jogo' };
  }

  revalidatePath(`/${tournamentSlug}/admin`);
  revalidatePath(`/${tournamentSlug}/matches`);

  return { success: true };
}

// ============================================
// PÓDIO REAL (lançado pelo admin ao encerrar o torneio)
// ============================================
interface PodiumResult {
  championTeam: string | null;
  championIso: string | null;
  runnerUpTeam: string | null;
  runnerUpIso: string | null;
  thirdPlaceTeam: string | null;
  thirdPlaceIso: string | null;
}

export async function getAdminTournamentInfo(tournamentSlug: string) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado' } as const;
  }

  const supabase = await createServerSupabaseClient();

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select(
      'id, name, slug, format, active, logo_url, prize_first, prize_second, prize_third, champion_team, champion_iso, runner_up_team, runner_up_iso, third_place_team, third_place_iso'
    )
    .eq('slug', tournamentSlug)
    .single();

  if (error || !tournament) {
    return { error: 'Torneio não encontrado' } as const;
  }

  const { data: matches } = await supabase
    .from('matches')
    .select('team_home, home_iso, team_away, away_iso')
    .eq('tournament_id', tournament.id);

  const teamsMap = new Map<string, { name: string; iso: string | null }>();
  (matches || []).forEach((m: any) => {
    if (m.team_home && !teamsMap.has(m.team_home)) teamsMap.set(m.team_home, { name: m.team_home, iso: m.home_iso });
    if (m.team_away && !teamsMap.has(m.team_away)) teamsMap.set(m.team_away, { name: m.team_away, iso: m.away_iso });
  });
  const teams = Array.from(teamsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return { error: null, tournament, teams } as const;
}

export async function setTournamentPodium(tournamentSlug: string, podium: PodiumResult) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado' };
  }

  const supabase = await createServerSupabaseClient();

  const picked = [podium.championTeam, podium.runnerUpTeam, podium.thirdPlaceTeam].filter(Boolean) as string[];
  if (new Set(picked).size !== picked.length) {
    return { error: 'Campeão, vice e terceiro devem ser times diferentes.' };
  }

  // O trigger process_tournament_podium recalcula os pontos de pódio de todos.
  const { error } = await supabase
    .from('tournaments')
    .update({
      champion_team: podium.championTeam,
      champion_iso: podium.championIso,
      runner_up_team: podium.runnerUpTeam,
      runner_up_iso: podium.runnerUpIso,
      third_place_team: podium.thirdPlaceTeam,
      third_place_iso: podium.thirdPlaceIso,
    })
    .eq('slug', tournamentSlug);

  if (error) {
    return { error: error.message || 'Erro ao lançar o pódio' };
  }

  revalidatePath(`/${tournamentSlug}/admin`);
  revalidatePath(`/${tournamentSlug}/ranking`);
  revalidatePath('/ranking-geral');
  return { success: true };
}

// ============================================
// PÓDIO REAL POR COMPETIÇÃO (bolão unificado de clubes)
// ============================================

export async function getAdminCompetitionResults(tournamentSlug: string) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado' } as const;
  }

  const supabase = await createServerSupabaseClient();

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();

  if (error || !tournament) {
    return { error: 'Torneio não encontrado' } as const;
  }

  const { data: matches } = await supabase
    .from('matches')
    .select('competition, team_home, home_iso, team_away, away_iso')
    .eq('tournament_id', tournament.id);

  const byComp = new Map<string, Map<string, { name: string; iso: string | null }>>();
  (matches || []).forEach((m: any) => {
    if (!m.competition) return;
    if (!byComp.has(m.competition)) byComp.set(m.competition, new Map());
    const teams = byComp.get(m.competition)!;
    if (m.team_home && !teams.has(m.team_home)) teams.set(m.team_home, { name: m.team_home, iso: m.home_iso });
    if (m.team_away && !teams.has(m.team_away)) teams.set(m.team_away, { name: m.team_away, iso: m.away_iso });
  });

  const { data: results } = await supabase
    .from('tournament_competition_results')
    .select('*')
    .eq('tournament_id', tournament.id);

  const competitions = COMPETITIONS.filter((c) => byComp.has(c.key)).map((c) => {
    const teams = Array.from(byComp.get(c.key)!.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const res = (results || []).find((r: any) => r.competition === c.key) || null;
    return { key: c.key, name: c.name, teams, result: res };
  });

  return { error: null, competitions } as const;
}

interface CompetitionResultInput {
  championTeam: string | null;
  championIso: string | null;
  runnerUpTeam: string | null;
  runnerUpIso: string | null;
}

export async function setTournamentCompetitionResult(
  tournamentSlug: string,
  competition: string,
  result: CompetitionResultInput
) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado' };
  }

  if (result.championTeam && result.runnerUpTeam && result.championTeam === result.runnerUpTeam) {
    return { error: 'Campeão e vice devem ser times diferentes.' };
  }

  const supabase = await createServerSupabaseClient();

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();

  if (tErr || !tournament) {
    return { error: 'Torneio não encontrado' };
  }

  // O trigger trg_recompute_competition_podium recalcula o pódio de todos.
  const { error } = await supabase.from('tournament_competition_results').upsert(
    {
      tournament_id: tournament.id,
      competition,
      champion_team: result.championTeam,
      champion_iso: result.championIso,
      runner_up_team: result.runnerUpTeam,
      runner_up_iso: result.runnerUpIso,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tournament_id,competition' }
  );

  if (error) {
    return { error: error.message || 'Erro ao lançar o resultado da competição' };
  }

  revalidatePath(`/${tournamentSlug}/admin`);
  revalidatePath(`/${tournamentSlug}/ranking`);
  revalidatePath('/ranking-geral');
  return { success: true };
}

// ============================================
// CHAVEAMENTO: resolver participante pendente e aplicar sorteio de fase
// ============================================
export async function resolveTieParticipant(
  tournamentSlug: string,
  tieId: number,
  side: 'a' | 'b',
  team: string,
  logoUrl: string
) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado' };
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('resolve_tie_participant', {
    p_tie_id: tieId,
    p_side: side,
    p_team: team,
    p_iso: logoUrl,
  });
  if (error) {
    return { error: error.message || 'Erro ao resolver participante' };
  }
  revalidatePath(`/${tournamentSlug}/admin`);
  revalidatePath(`/${tournamentSlug}/matches`);
  return { success: true, result: data };
}

export async function swapTieHomeAway(tournamentSlug: string, tieId: number) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado' };
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc('swap_tie_home_away', { p_tie_id: tieId });
  if (error) {
    return { error: error.message || 'Erro ao inverter mandos' };
  }
  revalidatePath(`/${tournamentSlug}/admin`);
  revalidatePath(`/${tournamentSlug}/matches`);
  return { success: true };
}

export async function getAdminBracket(tournamentSlug: string) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado', competitions: [] } as const;
  }
  const supabase = await createServerSupabaseClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();
  if (!tournament) return { error: 'Torneio não encontrado', competitions: [] } as const;

  const { data: ties } = await supabase
    .from('ties')
    .select(
      'id, competition, round, slot, series_type, team_a, team_a_iso, team_a_source_label, team_b, team_b_iso, team_b_source_label, winner_team, ida_match_id, volta_match_id'
    )
    .eq('tournament_id', tournament.id)
    .order('slot', { ascending: true });

  if (!ties || ties.length === 0) {
    return { error: null, tournamentId: tournament.id, competitions: [] as any[] } as const;
  }

  const matchIds = ties.flatMap((t: any) => [t.ida_match_id, t.volta_match_id].filter(Boolean));
  const { data: matches } = matchIds.length
    ? await supabase.from('matches').select('id, leg, status, match_date, venue').in('id', matchIds)
    : { data: [] as any[] };
  const matchMap = new Map((matches || []).map((m: any) => [m.id, m]));

  const ROUNDS = ['oitavas', 'quartas', 'semi', 'final'];
  const ROUND_LABELS: Record<string, string> = {
    oitavas: 'Oitavas de final',
    quartas: 'Quartas de final',
    semi: 'Semifinal',
    final: 'Final',
  };

  const view = (t: any) => {
    const ms = [t.ida_match_id, t.volta_match_id].filter(Boolean).map((id: number) => matchMap.get(id)).filter(Boolean);
    const hasMatches = ms.length > 0;
    const allScheduledFuture = ms.every(
      (m: any) => m.status === 'SCHEDULED' && (!m.match_date || new Date(m.match_date) > new Date())
    );
    return {
      id: t.id,
      round: t.round,
      slot: t.slot,
      series_type: t.series_type,
      winner_team: t.winner_team,
      sideA: { team: t.team_a, iso: t.team_a_iso, label: t.team_a_source_label },
      sideB: { team: t.team_b, iso: t.team_b_iso, label: t.team_b_source_label },
      hasMatches,
      canSwap: t.series_type === 'two_leg' && ms.length === 2 && allScheduledFuture,
      matches: ms.map((m: any) => ({ id: m.id, leg: m.leg, status: m.status, match_date: m.match_date, venue: m.venue })),
    };
  };

  const competitions = COMPETITIONS.filter((c) => ties.some((t: any) => t.competition === c.key)).map((c) => {
    const compTies = ties.filter((t: any) => t.competition === c.key);
    return {
      key: c.key,
      name: c.name,
      rounds: ROUNDS.filter((r) => compTies.some((t: any) => t.round === r)).map((r) => ({
        round: r,
        label: ROUND_LABELS[r],
        ties: compTies.filter((t: any) => t.round === r).sort((a: any, b: any) => a.slot - b.slot).map(view),
      })),
    };
  });

  return { error: null, tournamentId: tournament.id, competitions } as const;
}

interface DrawMapping {
  source_slot: number;
  target_slot: number;
  target_side: 'a' | 'b';
}

export async function applyRoundDraw(
  tournamentSlug: string,
  tournamentId: number,
  competition: string,
  sourceRound: string,
  targetRound: string,
  mappings: DrawMapping[]
) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado' };
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('apply_round_draw', {
    p_tournament_id: tournamentId,
    p_competition: competition,
    p_source_round: sourceRound,
    p_target_round: targetRound,
    p_mappings: mappings,
  });
  if (error) {
    return { error: error.message || 'Erro ao aplicar o sorteio' };
  }
  revalidatePath(`/${tournamentSlug}/admin`);
  revalidatePath(`/${tournamentSlug}/matches`);
  return { success: true, result: data };
}

export async function updateTournament(
  tournamentSlug: string,
  data: { name?: string; logoUrl?: string | null; format?: 'groups' | 'knockout' | 'mixed'; active?: boolean }
) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado' };
  }

  const supabase = await createServerSupabaseClient();

  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) {
    if (!data.name.trim()) return { error: 'O nome não pode ficar vazio' };
    payload.name = data.name.trim();
  }
  if (data.logoUrl !== undefined) payload.logo_url = data.logoUrl?.trim() || null;
  if (data.format !== undefined) payload.format = data.format;
  if (data.active !== undefined) payload.active = data.active;

  if (Object.keys(payload).length === 0) {
    return { error: 'Nada para atualizar' };
  }

  const { error } = await supabase.from('tournaments').update(payload).eq('slug', tournamentSlug);

  if (error) {
    return { error: error.message || 'Erro ao atualizar torneio' };
  }

  revalidatePath(`/${tournamentSlug}/admin`);
  revalidatePath(`/${tournamentSlug}/matches`);
  revalidatePath('/');
  return { success: true };
}

export async function setTournamentPrizes(
  tournamentSlug: string,
  prizes: { first: number; second: number; third: number }
) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado' };
  }

  const clean = (v: number) => (isNaN(v) || v < 0 ? 0 : v);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('tournaments')
    .update({
      prize_first: clean(prizes.first),
      prize_second: clean(prizes.second),
      prize_third: clean(prizes.third),
    })
    .eq('slug', tournamentSlug);

  if (error) {
    return { error: error.message || 'Erro ao salvar a premiação' };
  }

  revalidatePath(`/${tournamentSlug}/admin`);
  revalidatePath(`/${tournamentSlug}/matches`);
  revalidatePath(`/${tournamentSlug}/ranking`);
  return { success: true };
}

export async function distributePrizes(tournamentSlug: string) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado' };
  }

  const supabase = await createServerSupabaseClient();

  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();

  if (tErr || !tournament) {
    return { error: 'Torneio não encontrado' };
  }

  const { error } = await supabase.rpc('distribute_tournament_prizes', {
    p_tournament_id: tournament.id,
  });

  if (error) {
    return { error: error.message || 'Erro ao distribuir os prêmios' };
  }

  revalidatePath(`/${tournamentSlug}/admin`);
  revalidatePath(`/${tournamentSlug}/ranking`);
  revalidatePath('/ranking-geral');
  revalidatePath('/hall-of-fame');
  return { success: true };
}

export async function createTournament(
  name: string,
  slug: string,
  format: 'groups' | 'knockout' | 'mixed',
  logoUrl?: string | null
) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado' };
  }

  if (!name?.trim() || !slug?.trim()) {
    return { error: 'Nome e slug são obrigatórios' };
  }

  const normalizedSlug = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalizedSlug) {
    return { error: 'Slug inválido' };
  }

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from('tournaments').insert({
    name: name.trim(),
    slug: normalizedSlug,
    format,
    active: true,
    logo_url: logoUrl?.trim() || null,
  });

  if (error) {
    if (error.message?.includes('duplicate') || error.code === '23505') {
      return { error: 'Já existe um torneio com esse slug' };
    }
    return { error: error.message || 'Erro ao criar torneio' };
  }

  revalidatePath('/');
  return { success: true, slug: normalizedSlug };
}

export async function deleteMatch(matchId: number, tournamentSlug: string) {
  // Verificar acesso de admin primeiro
  const accessCheck = await checkAdminAccess();

  if (!accessCheck.isAdmin) {
    return { error: accessCheck.error || 'Acesso negado' };
  }

  const supabase = await createServerSupabaseClient();

  // Verificar se o jogo existe e pertence ao torneio
  const { data: existingMatch, error: matchError } = await supabase
    .from('matches')
    .select('id, tournament_id')
    .eq('id', matchId)
    .single();

  if (matchError || !existingMatch) {
    return { error: 'Jogo não encontrado' };
  }

  // Buscar o torneio pelo slug para validar
  const { data: tournament, error: tournamentError } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();

  if (tournamentError || !tournament) {
    return { error: 'Torneio não encontrado' };
  }

  // Verificar se o jogo pertence ao torneio correto
  if (existingMatch.tournament_id !== tournament.id) {
    return { error: 'Jogo não pertence a este torneio' };
  }

  // Verificar se há palpites associados ao jogo
  const { data: predictions, error: predictionsError } = await supabase
    .from('predictions')
    .select('id')
    .eq('match_id', matchId)
    .limit(1);

  if (predictionsError) {
    return { error: 'Erro ao verificar palpites associados' };
  }

  if (predictions && predictions.length > 0) {
    return { 
      error: 'Não é possível deletar um jogo que possui palpites. Delete os palpites primeiro ou altere o status do jogo.' 
    };
  }

  // Deletar o jogo
  const { error, data } = await supabase
    .from('matches')
    .delete()
    .eq('id', matchId)
    .select();

  if (error) {
    console.error('Erro ao deletar jogo:', error);
    // Se for erro de RLS, dar mensagem mais clara
    if (error.message?.includes('row-level security') || error.message?.includes('policy')) {
      return { 
        error: 'Erro de permissão: Verifique se a política RLS para DELETE está configurada corretamente no banco de dados.' 
      };
    }
    return { error: error.message || 'Erro ao deletar jogo' };
  }

  // Verificar se realmente deletou (data será vazio se deletou com sucesso)
  if (data && data.length === 0) {
    // Nenhuma linha foi deletada, mas também não houve erro
    // Isso pode acontecer se o jogo não existir mais ou se RLS bloqueou silenciosamente
    return { error: 'Nenhuma partida foi deletada. Verifique se a partida ainda existe e se você tem permissão para deletá-la.' };
  }

  revalidatePath(`/${tournamentSlug}/admin`);
  revalidatePath(`/${tournamentSlug}/matches`);

  return { success: true };
}


// ============================================================================
// Resultado sugerido pela API-Football.
//
// A sincronização horária já guarda o placar oficial dos jogos das três copas
// em `club_fixtures`. Estas funções cruzam com `matches` e devolvem o que o
// admin teria de digitar — sem gravar nada.
//
// A gravação continua sendo um clique humano, e passa pelo MESMO caminho de
// sempre (updateMatchScore -> pontuação -> progressão do chaveamento). Não é
// medo de duplicar ponto: process_match_finished é idempotente. É que um
// pareamento errado viraria pontuação sem ninguém olhar, e desfazer pontuação
// é bem mais caro do que conferir um placar.
//
// ATENÇÃO: arquivo 'use server'. Todo export precisa ser função async.
// ============================================================================

export interface ResultadoSugerido {
  match_id: number;
  team_home: string;
  team_away: string;
  match_date: string;
  competition: string;
  leg: string | null;
  status: string;
  score_home: number | null;
  score_away: number | null;
  sug_home: number;
  sug_away: number;
  sug_pen_winner: 'home' | 'away' | null;
  /** A API trouxe mandante e visitante invertidos em relação ao nosso cadastro. */
  invertido: boolean;
  /** A partida real teve prorrogação — que este bolão não pontua. */
  teve_prorrogacao: boolean;
  /** Jogo já lançado, com placar diferente do que a API registrou. */
  divergente: boolean;
  fonte_liga: string | null;
  fonte_kickoff: string;
  fonte_status: string;
  provider_fixture_id: number;
}

/** Quando um resultado foi lançado sem clique humano. */
export interface LancamentoAutomatico {
  match_id: number;
  aplicado_em: string;
}

async function lerSugestoes(tournamentSlug: string): Promise<{
  sugestoes: ResultadoSugerido[];
  ultimaSincronizacao: string | null;
  automaticos: LancamentoAutomatico[];
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();

  if (!tournament)
    return { sugestoes: [], ultimaSincronizacao: null, automaticos: [], error: 'Torneio não encontrado' };

  const [{ data, error }, { data: log }, { data: auto }] = await Promise.all([
    supabase.rpc('resultados_sugeridos', { p_tournament_id: (tournament as any).id }),
    supabase
      .from('club_sync_log')
      .select('finished_at')
      .eq('status', 'ok')
      .order('finished_at', { ascending: false, nullsFirst: false })
      .limit(1),
    // Quem lançou o quê. Numa aba de conferência é o dado que decide se o
    // admin precisa olhar a linha ou só passar o olho.
    supabase
      .from('resultado_automatico_log')
      .select('match_id, aplicado_em')
      .order('aplicado_em', { ascending: false }),
  ]);

  if (error) return { sugestoes: [], ultimaSincronizacao: null, automaticos: [], error: error.message };

  return {
    sugestoes: (data ?? []) as ResultadoSugerido[],
    ultimaSincronizacao: (log?.[0] as any)?.finished_at ?? null,
    automaticos: (auto ?? []) as LancamentoAutomatico[],
  };
}

export async function getResultadosSugeridos(tournamentSlug: string) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) {
    return {
      sugestoes: [],
      ultimaSincronizacao: null,
      automaticos: [],
      error: accessCheck.error || 'Acesso negado',
    };
  }
  return lerSugestoes(tournamentSlug);
}

/**
 * Lança UM resultado sugerido.
 *
 * O placar é relido do servidor, nunca aceito do cliente: o botão manda só o
 * id da partida. Assim não existe caminho para alguém postar um placar
 * arbitrário por esta porta.
 */
export async function aplicarResultadoSugerido(matchId: number, tournamentSlug: string) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) return { error: accessCheck.error || 'Acesso negado' };

  const { sugestoes, error } = await lerSugestoes(tournamentSlug);
  if (error) return { error };

  const s = sugestoes.find((x) => Number(x.match_id) === Number(matchId));
  if (!s) return { error: 'A API não tem mais resultado para este jogo. Recarregue a página.' };

  return updateMatchScore(matchId, s.sug_home, s.sug_away, 'FINISHED', tournamentSlug, {
    extraTimeResult: null,
    penHome: null,
    penAway: null,
    penWinner: s.sug_pen_winner,
  });
}

/**
 * Lança todos os sugeridos que ainda não foram lançados.
 *
 * Em ordem de data, e um a um pelo caminho normal — a progressão do
 * chaveamento depende da ordem, e lançar a volta antes da ida daria
 * classificado errado.
 *
 * Divergentes ficam de fora de propósito: jogo já lançado com placar
 * diferente é conversa para o admin ter olhando, não em lote.
 */
export async function aplicarTodosResultadosSugeridos(tournamentSlug: string) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) return { error: accessCheck.error || 'Acesso negado' };

  const { sugestoes, error } = await lerSugestoes(tournamentSlug);
  if (error) return { error };

  const pendentes = sugestoes
    .filter((s) => s.status !== 'FINISHED')
    .sort((a, b) => a.match_date.localeCompare(b.match_date));

  let aplicados = 0;
  const avisos: string[] = [];

  for (const s of pendentes) {
    const r = await updateMatchScore(
      Number(s.match_id),
      s.sug_home,
      s.sug_away,
      'FINISHED',
      tournamentSlug,
      { extraTimeResult: null, penHome: null, penAway: null, penWinner: s.sug_pen_winner }
    );
    if ((r as any)?.error) {
      avisos.push(`${s.team_home} x ${s.team_away}: ${(r as any).error}`);
      continue;
    }
    aplicados++;
    if ((r as any)?.bracketWarning) avisos.push((r as any).bracketWarning);
  }

  return { success: true, aplicados, total: pendentes.length, avisos };
}

// ============================================================================
// Rodada de apelidos.
//
// A elegibilidade exige os DOIS lados mapeados, então um nome que a
// API-Football escreve diferente do nosso cadastro descarta a partida inteira.
// Doze dos 21 primeiros jogos encerrados sumiram assim.
//
// O trabalho é sempre o mesmo: olhar os nomes desconhecidos, reconhecer o
// clube e cadastrar o apelido. O que muda aqui é que ele deixa de depender de
// alguém lembrar — a lista se monta sozinha, ordenada pelo prejuízo real
// (quantos jogos elegíveis o nome já custou).
//
// Nada é mapeado automaticamente. Nome não é chave: existem "Santos" no Brasil
// e no Peru, "Fortaleza" no Brasil e na Colômbia, "Santa Fe" na Argentina e na
// Colômbia. O banco marca o candidato como conflitante quando o ID dele na API
// já é conhecido e é OUTRO — e a interface não deixa mapear esses.
// ============================================================================

export interface CandidatoApelido {
  team_key: string;
  nome: string;
  similaridade: number;
  id_conflitante: boolean;
}

export interface ApelidoSugerido {
  nome_api: string;
  provider_id: number | null;
  ocorrencias: number;
  jogos_perdidos: number;
  ligas: string | null;
  candidatos: CandidatoApelido[];
}

export async function getApelidosSugeridos() {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) return { apelidos: [], error: accessCheck.error || 'Acesso negado' };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('apelidos_sugeridos', { p_limite: 40 } as any);
  if (error) return { apelidos: [], error: error.message };

  return { apelidos: (data ?? []) as ApelidoSugerido[], error: null };
}

/**
 * Cadastra o apelido e reprocessa as partidas antigas.
 *
 * A checagem de admin acontece duas vezes de propósito: aqui, para dar erro
 * legível, e dentro da função do banco, que é quem realmente garante — a RPC
 * é chamável por qualquer autenticado.
 */
export async function aplicarApelido(nome: string, teamKey: string, tournamentSlug: string) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) return { error: accessCheck.error || 'Acesso negado' };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('aplicar_apelido', {
    p_nome: nome,
    p_team_key: teamKey,
  } as any);
  if (error) return { error: error.message };

  revalidatePath(`/${tournamentSlug}/admin`);
  revalidatePath(`/${tournamentSlug}/resultados`);
  revalidatePath(`/${tournamentSlug}/projecao`);
  return { success: true, reprocessadas: Number(data) || 0 };
}

export async function ignorarApelido(nome: string, motivo: string, tournamentSlug: string) {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) return { error: accessCheck.error || 'Acesso negado' };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc('ignorar_apelido', {
    p_nome: nome,
    p_motivo: motivo || null,
  } as any);
  if (error) return { error: error.message };

  revalidatePath(`/${tournamentSlug}/admin`);
  return { success: true };
}

// ============================================================================
// Telemetria de uso.
//
// Tudo agregado no banco (funções uso_*), não aqui: são seis consultas que
// varrem a tabela de visualizações inteira, e trazê-las cruas para o Node só
// para somar seria pagar rede por conta que o Postgres faz de graça.
//
// A checagem de admin acontece duas vezes: aqui, para dar erro legível, e
// dentro de cada função do banco, que é quem realmente garante.
// ============================================================================

export interface UsoResumo {
  sessoes: number;
  visualizacoes: number;
  usuarios: number;
  duracao_media_seg: number;
  tempo_total_seg: number;
  telas_por_sessao: number | null;
  ativos_hoje: number;
  ativos_7d: number;
  ativos_30d: number;
}

export interface UsoDia {
  dia: string;
  sessoes: number;
  visualizacoes: number;
  usuarios: number;
  tempo_total_seg: number;
}

export interface UsoArea {
  area: string;
  visualizacoes: number;
  usuarios: number;
  tempo_total_seg: number;
  tempo_medio_seg: number;
}

export interface UsoUsuario {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  sessoes: number;
  visualizacoes: number;
  tempo_total_seg: number;
  ultima_visita: string | null;
  dias_ativos: number;
  area_favorita: string | null;
}

export interface UsoHora {
  dia_semana: number;
  hora: number;
  visualizacoes: number;
}

export interface UsoDispositivo {
  dispositivo: string;
  instalado: boolean;
  sessoes: number;
  usuarios: number;
}

export interface UsoDados {
  dias: number;
  resumo: UsoResumo | null;
  porDia: UsoDia[];
  porArea: UsoArea[];
  porUsuario: UsoUsuario[];
  porHora: UsoHora[];
  dispositivos: UsoDispositivo[];
  error?: string;
}

const USO_VAZIO = { resumo: null, porDia: [], porArea: [], porUsuario: [], porHora: [], dispositivos: [] };

export async function getUso(dias: number = 30): Promise<UsoDados> {
  const accessCheck = await checkAdminAccess();
  if (!accessCheck.isAdmin) {
    return { dias, ...USO_VAZIO, error: accessCheck.error || 'Acesso negado' };
  }

  // Janela limitada a valores conhecidos: o número vem de um botão da tela,
  // mas nada impede uma chamada direta à server action com 100000.
  const p_dias = [7, 30, 90, 365].includes(dias) ? dias : 30;

  const supabase = await createServerSupabaseClient();
  const [resumo, porDia, porArea, porUsuario, porHora, dispositivos] = await Promise.all([
    supabase.rpc('uso_resumo', { p_dias } as any),
    supabase.rpc('uso_por_dia', { p_dias } as any),
    supabase.rpc('uso_por_area', { p_dias } as any),
    supabase.rpc('uso_por_usuario', { p_dias } as any),
    supabase.rpc('uso_por_hora', { p_dias } as any),
    supabase.rpc('uso_dispositivos', { p_dias } as any),
  ]);

  const erro = [resumo, porDia, porArea, porUsuario, porHora, dispositivos].find((r) => r.error);
  if (erro) return { dias: p_dias, ...USO_VAZIO, error: (erro as any).error.message };

  return {
    dias: p_dias,
    // `as any` e não `as any[]`: os tipos gerados do Supabase resolvem estas
    // RPCs para `null`, e o TS recusa a conversão direta de null para array.
    resumo: (((resumo.data as any) ?? []) as UsoResumo[])[0] ?? null,
    porDia: ((porDia.data as any) ?? []) as UsoDia[],
    porArea: ((porArea.data as any) ?? []) as UsoArea[],
    porUsuario: ((porUsuario.data as any) ?? []) as UsoUsuario[],
    porHora: ((porHora.data as any) ?? []) as UsoHora[],
    dispositivos: ((dispositivos.data as any) ?? []) as UsoDispositivo[],
  };
}
