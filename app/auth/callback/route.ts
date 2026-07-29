import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// ============================================================================
// Callback de autenticação (troca do código PKCE pela sessão)
// ============================================================================
// O `setAll` gravava os cookies APENAS em `request.cookies` e depois a rota
// devolvia um `NextResponse.redirect()` novo. Num Route Handler, mexer nos
// cookies da REQUISIÇÃO não manda nada para o navegador — só o `Set-Cookie` da
// RESPOSTA faz isso. Resultado: o exchangeCodeForSession funcionava no
// servidor, mas a sessão morria ali; o navegador seguia sem cookie e a página
// de destino não encontrava usuário nenhum.
//
// Isso não aparecia antes porque nada usava esta rota. Passou a importar quando
// a recuperação de senha começou a mandar o usuário para
// /auth/callback?next=/login/redefinir, onde a troca da senha depende de estar
// autenticado.
//
// Correção: montar a resposta ANTES da troca e gravar os cookies NELA (mantendo
// também em request.cookies, para que uma leitura posterior dentro desta mesma
// requisição já veja a sessão).
// ============================================================================

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const forwardedHost = request.headers.get('x-forwarded-host'); // origem original antes do load balancer
    const isLocalEnv = process.env.NODE_ENV === 'development';
    const destino =
      isLocalEnv || !forwardedHost ? `${origin}${next}` : `https://${forwardedHost}${next}`;

    const response = NextResponse.redirect(destino);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) return response;
  }

  // Retornar o usuário para uma página de erro com instruções
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
