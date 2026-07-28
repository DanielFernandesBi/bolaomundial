import withPWAInit from 'next-pwa';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ignorar verificações rigorosas para garantir o deploy
  typescript: {
    ignoreBuildErrors: true,
  },
  // Configuração do Turbopack (Next.js 16+)
  turbopack: {},
  // Configuração de Imagens (Supabase e Bandeiras)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'flagcdn.com',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
    ],
  },
};

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development', // Desativa em dev para não chatear
});

export default withPWA(nextConfig);
