import { createBrowserClient as createSupabaseBrowserClient, createServerClient } from '@supabase/ssr';
import { Database } from './database.types';

// Variáveis de ambiente do Supabase
// Certifique-se de criar um arquivo .env.local com essas variáveis
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env.local file.'
  );
}

// ============================================
// CLIENTE PARA USO NO BROWSER (Client Components)
// ============================================
// Use esta função APENAS em componentes com 'use client'
// Exemplo: upload de arquivos, interações do usuário, etc.
export function createBrowserClient() {
  return createSupabaseBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}

// Alias para compatibilidade (mantém o nome antigo)
// Use esta função em Client Components
export function createClient() {
  return createSupabaseBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}

// ============================================
// CLIENTE PARA USO NO SERVIDOR (Server Components/Actions)
// ============================================
// Use esta função APENAS em Server Components, Server Actions, API Routes, etc.
// Esta função importa 'cookies' dinamicamente para evitar erros em Client Components
export async function createServerSupabaseClient() {
  // Importar cookies apenas quando necessário (dentro da função)
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
}

// Tipos TypeScript para o banco de dados
// Execute: npx supabase gen types typescript --project-id <your-project-id> > lib/database.types.ts
// Ou use o Supabase CLI para gerar automaticamente os tipos
export type { Database } from './database.types';

