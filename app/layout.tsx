import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/navbar';
import { createServerSupabaseClient } from '@/lib/supabase';

export const metadata: Metadata = {
  title: 'Arena de Bolões',
  description: 'O melhor bolão da Copa e Estaduais',
  manifest: '/manifest.json',
  themeColor: '#0f172a',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Bolões',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
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
    <html lang="pt-BR" className="overflow-x-hidden">
      <body className="overflow-x-hidden">
        {user && <Navbar isAdmin={isAdmin} />}
        {children}
      </body>
    </html>
  );
}

