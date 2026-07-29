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


// ============================================================================
// RECUPERAÇÃO DE SENHA
// ============================================================================
// Funcionalidade NOVA (não faz parte do redesign visual). Antes não existia
// nenhum caminho de "esqueci minha senha": quem perdesse a senha dependia de
// um admin mexer no painel do Supabase, um a um.
//
// As telas vivem sob /login/... de propósito: o middleware libera rotas com
// startsWith('/login'), então não foi preciso tocar em middleware.ts.
// ============================================================================

/** Envia o e-mail de recuperação. Não revela se o e-mail existe. */
export async function requestPasswordResetAction(formData: FormData) {
  const email = (formData.get('email') as string)?.trim();

  if (!email) {
    return { error: 'Informe o seu e-mail.' };
  }

  const supabase = await createServerSupabaseClient();
  const { headers } = await import('next/headers');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const origin = `${proto}://${host}`;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // O callback troca o código por sessão e devolve o usuário já autenticado
    // na tela de definir a nova senha.
    redirectTo: `${origin}/auth/callback?next=/login/redefinir`,
  });

  if (error) {
    return { error: error.message };
  }

  // Resposta igual exista ou não a conta: não serve para descobrir e-mails.
  return {
    success: true,
    message: 'Se existir uma conta com esse e-mail, o link de recuperação foi enviado. Confira a caixa de entrada e o spam.',
  };
}

/** Define a nova senha. Exige a sessão criada pelo link de recuperação. */
export async function updatePasswordAction(formData: FormData) {
  const password = formData.get('password') as string;
  const confirm = formData.get('confirm') as string;

  if (!password || password.length < 6) {
    return { error: 'A senha precisa ter pelo menos 6 caracteres.' };
  }
  if (password !== confirm) {
    return { error: 'As senhas não conferem.' };
  }

  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'O link de recuperação expirou. Peça um novo e tente de novo.' };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/', 'layout');
  return { success: true, message: 'Senha alterada. Você já está logado.' };
}
