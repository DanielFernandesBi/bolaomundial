'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { Calendar, Award, BarChart3, Crown, User, Settings } from 'lucide-react';

// ============================================================================
// Navegação inferior (mobile)
// ============================================================================
// Componente NOVO. A navbar.tsx continua sendo a barra do desktop e não foi
// tocada. Aqui não há estado, efeito nem chamada de servidor: só links.
//
// Cinco destinos com rótulo, no lugar da fileira de 9 ícones sem rótulo.
// "Trocar campeonato" e "Simulador" saem da nav (viram folha no topo e aba do
// Ranking, na Fase 6). O acesso de admin entra como 6º item, para permitir
// lançar resultado pelo celular.
// ============================================================================

interface BottomNavProps {
  isAdmin?: boolean;
}

interface Destination {
  href: string;
  label: string;
  icon: typeof Calendar;
  /** Casa a rota ativa; recebe o pathname atual. */
  isActive: (pathname: string) => boolean;
}

export function BottomNav({ isAdmin = false }: BottomNavProps) {
  const pathname = usePathname();
  const params = useParams();
  const tournamentSlug = params?.tournament as string | undefined;

  // Fora de um torneio (perfil, hall, ranking geral) não há slug: os destinos
  // do torneio apontam para a home, que é onde se escolhe o campeonato.
  const inTournament = (path: string) => (tournamentSlug ? `/${tournamentSlug}${path}` : '/');

  const destinations: Destination[] = [
    {
      href: inTournament('/matches'),
      label: 'Partidas',
      icon: Calendar,
      isActive: (p) => !!tournamentSlug && p.startsWith(`/${tournamentSlug}/matches`),
    },
    {
      href: inTournament('/ranking'),
      label: 'Ranking',
      icon: Award,
      isActive: (p) => !!tournamentSlug && p.startsWith(`/${tournamentSlug}/ranking`),
    },
    {
      href: inTournament('/desempenho'),
      label: 'Desempenho',
      icon: BarChart3,
      isActive: (p) => !!tournamentSlug && p.startsWith(`/${tournamentSlug}/desempenho`),
    },
    {
      href: '/hall-of-fame',
      label: 'Hall',
      icon: Crown,
      isActive: (p) => p === '/hall-of-fame',
    },
    {
      href: '/profile',
      label: 'Perfil',
      icon: User,
      isActive: (p) => p.startsWith('/profile'),
    },
  ];

  // Engrenagem do admin: só faz sentido dentro de um torneio.
  const showAdmin = isAdmin && !!tournamentSlug;
  if (showAdmin) {
    destinations.push({
      href: `/${tournamentSlug}/admin`,
      label: 'Admin',
      icon: Settings,
      isActive: (p) => p.startsWith(`/${tournamentSlug}/admin`),
    });
  }

  return (
    <nav
      aria-label="Navegação principal"
      className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-hairline bg-background/90 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className={`grid ${showAdmin ? 'grid-cols-6' : 'grid-cols-5'}`}>
        {destinations.map((d) => {
          const active = d.isActive(pathname);
          const Icon = d.icon;
          return (
            <li key={d.href + d.label}>
              <Link
                href={d.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[52px] flex-col items-center justify-center gap-1 px-1 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active ? 'text-primary font-bold' : 'text-muted-foreground font-medium'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                <span className="text-[10.5px] leading-none truncate max-w-full">{d.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
