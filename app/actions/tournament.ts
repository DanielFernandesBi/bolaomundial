'use server';

import { createServerSupabaseClient } from '@/lib/supabase';
import { situacaoDoTorneio } from '@/lib/tournament-access';

export async function getTournamentName(slug: string) {
  const supabase = await createServerSupabaseClient();
  
  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('name')
    .eq('slug', slug)
    .single();

  if (error || !tournament) {
    return null;
  }

  return tournament.name;
}

export async function getTournamentNavInfo(slug: string) {
  const supabase = await createServerSupabaseClient();

  const { data: tournament, error } = await supabase
    .from('tournaments')
    .select('name, has_simulator')
    .eq('slug', slug)
    .single();

  if (error || !tournament) {
    return null;
  }

  // A situação vai junto porque a navegação PRECISA dela. A barra de baixo
  // mostrava "Partidas" em qualquer torneio, inclusive nos que já acabaram — e
  // foi por esse botão que dois jogadores entraram no bolão do ano passado e
  // relataram não conseguir palpitar. Um destino que só existe para desviar
  // quem clica é pior do que destino nenhum.
  const situacao = (await situacaoDoTorneio(slug))?.situacao ?? 'em_disputa';

  return {
    name: tournament.name,
    hasSimulator: !!tournament.has_simulator,
    situacao,
    encerrado: situacao === 'encerrado',
  };
}

