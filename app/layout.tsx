import type { Metadata, Viewport } from 'next';
import { DM_Sans, DM_Mono } from 'next/font/google';
import './globals.css';

// Auto-hospedadas pelo next/font no build: nenhuma requisição em runtime e
// nenhum salto de layout. A DM Mono serve aos rótulos em caixa alta (fases,
// metadados, etiquetas) — sem ela cada sistema escolheria uma mono diferente.
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const dmMono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });
import { Navbar } from '@/components/navbar';
import { BottomNav } from '@/components/bottom-nav';
import { MobileHeader } from '@/components/mobile-header';
import { createServerSupabaseClient } from '@/lib/supabase';

export const metadata: Metadata = {
  title: 'Arena de Bolões',
  description: 'O melhor bolão da Copa e Estaduais',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Bolões',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
};

// No Next 16 themeColor e viewport moram no export `viewport`, não em `metadata`
// (o build avisava sobre isso desde antes deste redesign).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // maximumScale/userScalable removidos de propósito: bloquear o zoom é falha
  // de acessibilidade (WCAG) e atrapalha quem precisa ampliar a tela.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
    { media: '(prefers-color-scheme: light)', color: '#f4f1ea' },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();
    
    isAdmin = profile?.is_admin || false;
  }

  return (
    <html lang="pt-BR" className={`${dmSans.variable} ${dmMono.variable} overflow-x-hidden`}>
      <head>
        {/*
          Anti-flash: aplica o tema ANTES da primeira pintura, senão a tela
          pisca escura antes de virar clara. Roda síncrono de propósito.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
  try {
    var t = localStorage.getItem('tema');
    var claro = t === 'claro' || (!t && window.matchMedia('(prefers-color-scheme: light)').matches);
    if (claro) document.documentElement.classList.add('light');
  } catch (e) {}
            `.trim(),
          }}
        />
      </head>
      <body className="overflow-x-hidden">
        {user && (
          <>
            <div className="hidden md:block">
              <Navbar isAdmin={isAdmin} />
            </div>
            <MobileHeader />
          </>
        )}
        {children}
        {user && <BottomNav isAdmin={isAdmin} />}
      </body>
    </html>
  );
}

