// ============================================================================
// Situação de um torneio, e o que se pode fazer dentro dele.
// ============================================================================
// POR QUE ISTO EXISTE. Dois jogadores entraram no bolão do ano passado — "Copa
// do Brasil, Libertadores, Sul Americana" — achando que era o deste ano, que se
// chama "LIBERTADORES / SULA / COPA DO BRASIL 2026". Os nomes são quase iguais e
// só um traz o ano. Lá dentro eles tentaram palpitar, não conseguiram, e
// reportaram como defeito.
//
// E não era defeito: era um bolão terminado se comportando como um bolão vivo. A
// home e a folha de troca de campeonato já mandavam torneio encerrado para o
// /ranking, mas NADA impedia de chegar às outras telas — bastava tocar
// "Partidas" na barra de baixo, que aparecia igual em qualquer torneio. O
// desvio da home era uma sugestão, não uma regra.
//
// TRÊS SITUAÇÕES, as mesmas que a home e a folha já distinguem:
//   · em disputa → `active = true`. Acesso total.
//   · encerrado  → inativo COM partida finalizada. Só o histórico.
//   · pendente   → inativo SEM partida finalizada. Nem começou; não há o que ver.
// ============================================================================

import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase';

export type SituacaoTorneio = 'em_disputa' | 'encerrado' | 'pendente';

export interface TorneioSituacao {
  id: number;
  name: string;
  slug: string;
  situacao: SituacaoTorneio;
}

/**
 * Rotas que um torneio ENCERRADO continua servindo.
 *
 * `ranking` é o que foi pedido. As outras três estão aqui por necessidade, e
 * cada uma por um motivo diferente:
 *   · `desempenho` é o detalhe do próprio ranking — clicar num nome da lista
 *     leva para lá. Bloquear deixaria o ranking pela metade;
 *   · `comprovante` é o registro dos palpites que a pessoa deu. É dela;
 *   · `admin` precisa continuar aberto, senão não haveria como reativar um
 *     torneio arquivado por engano — o bloqueio se tornaria irreversível pela
 *     interface. Quem não é admin já esbarra no `checkAdminAccess()`.
 */
export const ROTAS_DO_ENCERRADO = ['ranking', 'desempenho', 'comprovante', 'admin'] as const;

/** Só o admin entra num torneio que ainda não começou. */
export const ROTAS_DO_PENDENTE = ['admin'] as const;

export async function situacaoDoTorneio(slug: string): Promise<TorneioSituacao | null> {
  const supabase = await createServerSupabaseClient();

  const { data: t } = await supabase
    .from('tournaments')
    .select('id, name, slug, active')
    .eq('slug', slug)
    .single();
  if (!t) return null;

  const torneio = t as { id: number; name: string; slug: string; active: boolean };
  if (torneio.active) {
    return { id: torneio.id, name: torneio.name, slug: torneio.slug, situacao: 'em_disputa' };
  }

  // `head: true` traz só a contagem: a pergunta é "existe alguma?", e carregar
  // as 72 partidas de um torneio antigo para descobrir isso seria desperdício
  // em toda navegação.
  const { count } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', torneio.id)
    .eq('status', 'FINISHED');

  return {
    id: torneio.id,
    name: torneio.name,
    slug: torneio.slug,
    situacao: (count ?? 0) > 0 ? 'encerrado' : 'pendente',
  };
}

/**
 * Barra a rota quando o torneio não a serve mais. Chamar no topo da página.
 *
 * O destino do desvio não é a home: é o /ranking do MESMO torneio. Quem clicou
 * em "Partidas" do bolão do ano passado quer ver aquele bolão — mandá-lo para a
 * home o faria escolher tudo de novo sem entender por quê. Caindo no ranking,
 * com o aviso do layout no topo, a resposta chega junto com o desvio.
 */
export async function exigirRotaPermitida(slug: string, rota: string): Promise<TorneioSituacao> {
  const t = await situacaoDoTorneio(slug);
  if (!t) redirect('/');

  if (t.situacao === 'encerrado' && !ROTAS_DO_ENCERRADO.includes(rota as any)) {
    redirect(`/${slug}/ranking`);
  }
  if (t.situacao === 'pendente' && !ROTAS_DO_PENDENTE.includes(rota as any)) {
    redirect('/');
  }
  return t;
}
