'use server';

import { createServerSupabaseClient } from '@/lib/supabase';

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

  return { name: tournament.name, hasSimulator: !!tournament.has_simulator };
}

