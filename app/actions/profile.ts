'use server';

import { createServerSupabaseClient } from '@/lib/supabase';

export async function updateProfileAvatar(avatarUrl: string) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Usuário não autenticado' };
  }

  // Atualizar avatar_url no perfil
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', user.id);

  if (error) {
    return { error: error.message || 'Erro ao atualizar foto de perfil' };
  }

  return { success: true };
}

