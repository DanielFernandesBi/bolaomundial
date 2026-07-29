// ============================================================================
// Auto-progressão do chaveamento (mata-mata ida/volta)
// ============================================================================
// Ao finalizar as duas pernas de um confronto (tie), calcula o classificado:
//   • placar AGREGADO das duas pernas;
//   • se empatar no agregado, decide pelos PÊNALTIS da volta (sem prorrogação).
// Em seguida joga o vencedor no confronto seguinte (next_tie_id/next_slot_side) e,
// quando o próximo confronto fica com os dois times, cria a ida e a volta dele.
// No confronto final, grava campeão/vice em tournament_competition_results.
//
// Roda no contexto do server action de admin (RLS de admin permite escrever em
// ties/matches/tournament_competition_results). NÃO é trigger de banco.
// ============================================================================

import { legPhaseLabel, type Round } from './competitions';

export interface BracketResult {
  advanced: boolean;
  warning?: string;          // ex.: agregado empatado sem pênaltis definidos
  info?: string;             // mensagem amigável de sucesso
  createdNextMatches?: boolean;
  championSet?: boolean;
}

// gols de um time numa partida, casando pelo nome (robusto à ordem mandante/visitante)
function goalsFor(match: any, team: string): number | null {
  if (match.team_home === team) return match.score_home;
  if (match.team_away === team) return match.score_away;
  return null;
}

/** Ponto de entrada: recebe o id da partida que acabou de ser salva. */
export async function advanceBracketForMatch(supabase: any, matchId: number): Promise<BracketResult> {
  const { data: m } = await supabase.from('matches').select('tie_id').eq('id', matchId).single();
  if (!m?.tie_id) return { advanced: false };
  return advanceTie(supabase, m.tie_id);
}

export async function advanceTie(supabase: any, tieId: number): Promise<BracketResult> {
  const { data: tie } = await supabase.from('ties').select('*').eq('id', tieId).single();
  if (!tie) return { advanced: false };

  if (!tie.ida_match_id || !tie.volta_match_id) {
    return { advanced: false };
  }

  const { data: legs } = await supabase
    .from('matches')
    .select('id, team_home, team_away, score_home, score_away, status, pen_home, pen_away, pen_winner')
    .in('id', [tie.ida_match_id, tie.volta_match_id]);

  const ida = (legs || []).find((x: any) => x.id === tie.ida_match_id);
  const volta = (legs || []).find((x: any) => x.id === tie.volta_match_id);

  // As duas pernas precisam estar finalizadas e com placar
  if (!ida || !volta || ida.status !== 'FINISHED' || volta.status !== 'FINISHED') {
    return { advanced: false };
  }
  if ([ida.score_home, ida.score_away, volta.score_home, volta.score_away].some((v) => v == null)) {
    return { advanced: false };
  }

  const a = tie.team_a as string;
  const b = tie.team_b as string;
  const aIda = goalsFor(ida, a);
  const bIda = goalsFor(ida, b);
  const aVolta = goalsFor(volta, a);
  const bVolta = goalsFor(volta, b);
  if ([aIda, bIda, aVolta, bVolta].some((v) => v == null)) {
    return {
      advanced: false,
      warning:
        'Não consegui casar os times do confronto com as pernas cadastradas. Verifique se os nomes dos times batem exatamente.',
    };
  }

  const aggA = (aIda as number) + (aVolta as number);
  const aggB = (bIda as number) + (bVolta as number);

  let winnerSide: 'a' | 'b';
  let decidedBy: 'aggregate' | 'penalties';

  if (aggA !== aggB) {
    winnerSide = aggA > aggB ? 'a' : 'b';
    decidedBy = 'aggregate';
  } else {
    // Empate no agregado → pênaltis da volta (precisa ter um vencedor definido).
    // Clubes: vencedor por matches.pen_winner ('home'/'away'). Fallback: placar de pênaltis.
    let penWinnerTeam: string | null = null;
    if (volta.pen_winner === 'home') penWinnerTeam = volta.team_home;
    else if (volta.pen_winner === 'away') penWinnerTeam = volta.team_away;
    else if (volta.pen_home != null && volta.pen_away != null && volta.pen_home !== volta.pen_away) {
      penWinnerTeam = volta.pen_home > volta.pen_away ? volta.team_home : volta.team_away;
    }

    if (!penWinnerTeam) {
      return {
        advanced: false,
        warning: 'Agregado empatado: informe o vencedor dos pênaltis da volta para definir o classificado.',
      };
    }
    if (penWinnerTeam === a) winnerSide = 'a';
    else if (penWinnerTeam === b) winnerSide = 'b';
    else {
      return {
        advanced: false,
        warning: 'Não consegui mapear o vencedor dos pênaltis aos times do confronto.',
      };
    }
    decidedBy = 'penalties';
  }

  const winnerTeam = winnerSide === 'a' ? a : b;
  const winnerIso = winnerSide === 'a' ? tie.team_a_iso : tie.team_b_iso;
  const loserTeam = winnerSide === 'a' ? b : a;
  const loserIso = winnerSide === 'a' ? tie.team_b_iso : tie.team_a_iso;

  await supabase
    .from('ties')
    .update({
      winner_team: winnerTeam,
      winner_iso: winnerIso,
      winner_side: winnerSide,
      decided_by: decidedBy,
    })
    .eq('id', tie.id);

  // Final → grava campeão/vice (dispara o recálculo do pódio via trigger)
  if (tie.round === 'final') {
    await supabase.from('tournament_competition_results').upsert(
      {
        tournament_id: tie.tournament_id,
        competition: tie.competition,
        champion_team: winnerTeam,
        champion_iso: winnerIso,
        runner_up_team: loserTeam,
        runner_up_iso: loserIso,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tournament_id,competition' }
    );
    return { advanced: true, championSet: true, info: `${winnerTeam} é campeão — pódio atualizado.` };
  }

  // Avança o vencedor para o confronto seguinte
  if (tie.next_tie_id && tie.next_slot_side) {
    const patch =
      tie.next_slot_side === 'a'
        ? { team_a: winnerTeam, team_a_iso: winnerIso }
        : { team_b: winnerTeam, team_b_iso: winnerIso };
    await supabase.from('ties').update(patch).eq('id', tie.next_tie_id);

    const created = await maybeCreateNextMatches(supabase, tie.next_tie_id);
    return {
      advanced: true,
      createdNextMatches: created,
      info: created
        ? `${winnerTeam} avançou — próxima fase gerada (data a definir).`
        : `${winnerTeam} avançou.`,
    };
  }

  return { advanced: true, info: `${winnerTeam} avançou.` };
}

/** Cria a ida e a volta do confronto quando ele já tem os dois times definidos. */
async function maybeCreateNextMatches(supabase: any, nextTieId: number): Promise<boolean> {
  const { data: nt } = await supabase.from('ties').select('*').eq('id', nextTieId).single();
  if (!nt) return false;
  if (!nt.team_a || !nt.team_b) return false; // ainda aguardando o outro classificado
  if (nt.ida_match_id || nt.volta_match_id) return false; // já criado

  const round = nt.round as Round;
  const base = {
    tournament_id: nt.tournament_id,
    competition: nt.competition,
    status: 'SCHEDULED',
    has_extra_time: false,
    tie_id: nt.id,
    match_date: null as string | null, // data a definir
  };

  // Ida: team_a manda; Volta: team_b manda. Só a volta pode ir aos pênaltis.
  const { data: idaIns } = await supabase
    .from('matches')
    .insert({
      ...base,
      team_home: nt.team_a,
      home_iso: nt.team_a_iso,
      team_away: nt.team_b,
      away_iso: nt.team_b_iso,
      phase: legPhaseLabel(round, 'ida'),
      leg: 'ida',
      is_knockout: false,
    })
    .select('id')
    .single();

  const { data: voltaIns } = await supabase
    .from('matches')
    .insert({
      ...base,
      team_home: nt.team_b,
      home_iso: nt.team_b_iso,
      team_away: nt.team_a,
      away_iso: nt.team_a_iso,
      phase: legPhaseLabel(round, 'volta'),
      leg: 'volta',
      is_knockout: true,
    })
    .select('id')
    .single();

  await supabase
    .from('ties')
    .update({ ida_match_id: idaIns?.id ?? null, volta_match_id: voltaIns?.id ?? null })
    .eq('id', nt.id);

  return true;
}
