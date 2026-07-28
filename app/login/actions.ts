'use server';

import { createServerSupabaseClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function loginAction(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return {
      error: 'Por favor, preencha todos os campos.',
    };
  }

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      error: error.message || 'Erro ao fazer login. Verifique suas credenciais.',
    };
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function signupAction(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const username = formData.get('username') as string;

  if (!email || !password || !username) {
    return {
      error: 'Por favor, preencha todos os campos.',
    };
  }

  const supabase = await createServerSupabaseClient();

  // Criar usuário
  // emailRedirectTo: null desabilita o redirecionamento de confirmação
  // Mas a confirmação de e-mail deve ser desabilitada no dashboard do Supabase
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: null, // Não redirecionar para confirmação
      data: {
        username,
      },
    },
  });

  if (authError) {
    return {
      error: authError.message || 'Erro ao criar conta.',
    };
  }

  // O perfil será criado automaticamente pelo trigger no banco de dados
  // Mas vamos garantir que o username seja atualizado
  if (authData.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ username })
      .eq('id', authData.user.id);

    if (profileError) {
      console.error('Erro ao atualizar perfil:', profileError);
    }
  }

  // Se o usuário foi criado com sucesso, fazer login automático
  if (authData.user) {
    // Tentar fazer login automaticamente após o cadastro
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!signInError) {
      revalidatePath('/', 'layout');
      redirect('/');
    }
  }

  return {
    success: true,
    message: 'Conta criada com sucesso! Você já está logado.',
  };
}

