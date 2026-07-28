'use server';

import { createServerSupabaseClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function logoutAction() {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    return {
      error: error.message || 'Erro ao fazer logout.',
    };
  }

  revalidatePath('/', 'layout');
  redirect('/login');
}

