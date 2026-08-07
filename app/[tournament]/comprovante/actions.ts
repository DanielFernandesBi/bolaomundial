'use server';

// ============================================================================
// Comprovante de palpites.
//
// Nasceu de uma queixa que a transparência não resolvia. A transparência prova
// que o ADMIN não mexe: uma vez público, mexer seria visto por todos. Mas um
// jogador achou que tinha apostado um placar e viu outro na tela — e contra a
// memória de alguém não adianta afirmar que o banco não erra, porque a
// afirmação é nossa e é justamente ela que está em dúvida.
//
// O que resolve é prova que o próprio jogador possa conferir sozinho: o que
// ele gravou, a que horas, e tudo que ele mesmo alterou depois. Isso já estava
// no banco desde 01/08, na trilha de auditoria — faltava chegar aos olhos dele.
//
// Tudo aqui sai de `meu_extrato()`, que é SECURITY DEFINER e filtra pelo
// próprio auth.uid(). Ninguém enxerga o extrato de outro, nem passando um id
// diferente: não há id para passar.
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase';

/** Um evento da trilha: o palpite mudou de `antes` para `depois`. */
export interface EventoDoPalpite {
  quando: string;
  operacao: 'INSERT' | 'UPDATE' | 'DELETE';
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
}

export interface ItemDoExtrato {
  match_id: number;
  competition: string | null;
  phase: string | null;
  /** A fase que TRAVA junto (oitavas, quartas…). Ida e volta compartilham. */
  round: string | null;
  team_home: string;
  team_away: string;
  match_date: string | null;
  is_knockout: boolean;
  pred_home: number;
  pred_away: number;
  pred_extra_result: 'home' | 'draw' | 'away' | null;
  pred_pen_home: number | null;
  pred_pen_away: number | null;
  pred_pen_winner: 'home' | 'away' | null;
  /** Quando a linha nasceu. Confiável: o palpite só é criado uma vez. */
  salvo_em: string;
  /** Última alteração REGISTRADA NA TRILHA. Nulo = não há registro de alteração. */
  alterado_em: string | null;
  alteracoes: EventoDoPalpite[];
  /** A trilha já existia quando este palpite foi gravado? */
  cobertura_completa: boolean;
  /** Quando a fase fecha para palpite. */
  fecha_em: string | null;
  ja_fechou: boolean;
  codigo_da_fase: string;
}

/** Uma fase ainda aberta em que o jogador tem palpite — dá tempo de guardar. */
export interface FaseAGuardar {
  competition: string | null;
  round: string | null;
  palpites: number;
  /** Jogos da fase ainda sem palpite. Só é > 0 quando o prazo está perto. */
  faltando: number;
  fecha_em: string | null;
  codigo: string;
}

export interface ItemDoPodio {
  competition: string;
  champion_team: string | null;
  runner_up_team: string | null;
  third_place_team: string | null;
  salvo_em: string;
  alterado_em: string | null;
  alteracoes: EventoDoPalpite[];
  cobertura_completa: boolean;
  codigo: string;
}

export interface ComprovanteData {
  username: string;
  tournamentName: string;
  itens: ItemDoExtrato[];
  podio: ItemDoPodio[];
  /** Instante a partir do qual a trilha consegue provar. */
  trilhaDesde: string | null;
  /** Estado da corrente de hashes da trilha inteira. */
  trilha: { linhas: number; intacta: boolean; lacre: string } | null;
  /** Lacres já publicados, do mais recente para o mais antigo. */
  lacres: { dia: string; linhas: number; lacre: string }[];
  erro?: string;
}

export async function getComprovante(tournamentSlug: string): Promise<ComprovanteData> {
  const supabase = await createServerSupabaseClient();

  const vazio: ComprovanteData = {
    username: '',
    tournamentName: '',
    itens: [],
    podio: [],
    trilhaDesde: null,
    trilha: null,
    lacres: [],
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...vazio, erro: 'Entre na sua conta para ver o comprovante.' };

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name')
    .eq('slug', tournamentSlug)
    .single();
  if (!tournament) return { ...vazio, erro: 'Torneio não encontrado.' };

  const tid = (tournament as any).id as number;

  const [
    { data: perfil },
    { data: itens },
    { data: podio },
    { data: desde },
    { data: trilha },
    { data: lacres },
  ] = await Promise.all([
    supabase.from('profiles').select('username').eq('id', user.id).single(),
    supabase.rpc('meu_extrato', { p_tournament_id: tid } as any),
    supabase.rpc('meu_extrato_podio', { p_tournament_id: tid } as any),
    supabase.rpc('trilha_comecou_em' as any),
    supabase.rpc('conferir_trilha' as any),
    // Últimos lacres publicados. Sete dias bastam: quem quiser conferir uma
    // data antiga compara com a mensagem que ficou no grupo, que é o ponto.
    supabase
      .from('trilha_lacre_diario')
      .select('dia, linhas, lacre')
      .order('dia', { ascending: false })
      .limit(7),
  ]);

  const conferencia = (trilha as any)?.[0];

  return {
    username: (perfil as any)?.username ?? 'jogador',
    tournamentName: (tournament as any).name,
    itens: ((itens ?? []) as any[]) as ItemDoExtrato[],
    podio: ((podio ?? []) as any[]) as ItemDoPodio[],
    trilhaDesde: (desde as any) ?? null,
    trilha: conferencia
      ? {
          linhas: Number(conferencia.linhas),
          intacta: !!conferencia.intacta,
          lacre: conferencia.lacre as string,
        }
      : null,
    lacres: ((lacres ?? []) as any[]).map((l) => ({
      dia: l.dia as string,
      linhas: Number(l.linhas),
      lacre: l.lacre as string,
    })),
  };
}

/**
 * Fases ainda abertas em que o jogador tem palpite.
 *
 * Alimenta o aviso, e existe separada de `getComprovante` porque é chamada em
 * OUTRA tela (Partidas) e não pode arrastar o extrato inteiro junto.
 *
 * Devolve vazio para quem não está logado, em vez de erro: o aviso simplesmente
 * não aparece, que é o comportamento certo para um visitante.
 */
export async function getFasesAGuardar(tournamentSlug: string): Promise<FaseAGuardar[]> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();
  if (!tournament) return [];

  const { data } = await supabase.rpc('meus_comprovantes_a_guardar', {
    p_tournament_id: (tournament as any).id,
  } as any);

  return ((data ?? []) as any[]).map((f) => ({
    competition: f.competition,
    round: f.round,
    palpites: Number(f.palpites),
    faltando: Number(f.faltando ?? 0),
    fecha_em: f.fecha_em,
    codigo: f.codigo,
  }));
}
