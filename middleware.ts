import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Ignorar arquivos estáticos (manifest, ícones, imagens, etc.)
  // Esta verificação deve vir ANTES de qualquer processamento
  const staticFilePatterns = [
    '/manifest.json',
    '/robots.txt',
    '/sitemap.xml',
  ];

  const isStaticFile = 
    staticFilePatterns.includes(pathname) ||
    /\.(ico|png|jpg|jpeg|gif|webp|svg|json|xml|txt)$/i.test(pathname);

  if (isStaticFile) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Verificar a sessão do usuário
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rotas públicas que não requerem autenticação
  const publicRoutes = ['/login', '/auth', '/hall-of-fame', '/ranking-geral', '/profile'];
  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Se o usuário está logado e tenta acessar /login, redirecionar para home
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Se o usuário não está logado e tenta acessar rota protegida, redirecionar para /login
  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json and other static files
     * - public folder files (images, icons, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|xml|txt)$).*)',
  ],
};

