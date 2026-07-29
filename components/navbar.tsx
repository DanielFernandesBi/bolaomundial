'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useParams } from 'next/navigation';
import { Calendar, Award, User, LogOut, Settings, Home, Crown, BarChart3, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logoutAction } from '@/app/actions/auth';
import { getTournamentNavInfo } from '@/app/actions/tournament';

interface NavbarProps {
  isAdmin?: boolean;
}

export function Navbar({ isAdmin = false }: NavbarProps) {
  const pathname = usePathname();
  const params = useParams();
  const [tournamentName, setTournamentName] = useState<string | null>(null);
  const [hasSimulator, setHasSimulator] = useState(false);

  // Obter o slug do torneio dos params (mais confiável que parsear pathname)
  const tournamentSlug = params?.tournament as string | undefined;

  // Buscar dados do torneio quando o slug mudar
  useEffect(() => {
    if (tournamentSlug) {
      getTournamentNavInfo(tournamentSlug).then((info) => {
        setTournamentName(info?.name ?? null);
        setHasSimulator(info?.hasSimulator ?? false);
      });
    } else {
      setTournamentName(null);
      setHasSimulator(false);
    }
  }, [tournamentSlug]);

  const isActive = (path: string) => {
    if (tournamentSlug) {
      return pathname === `/${tournamentSlug}${path}`;
    }
    return pathname === path;
  };

  const getHref = (path: string) => {
    if (tournamentSlug) {
      return `/${tournamentSlug}${path}`;
    }
    return path;
  };

  return (
    <nav className="bg-card border-b border-border">
      <div className="container mx-auto px-2 md:px-4 max-w-full overflow-x-hidden">
        <div className="flex items-center justify-between gap-2 py-2 min-h-16">
          {/* Esquerda: Logo/Título */}
          <Link href={tournamentSlug ? `/${tournamentSlug}/matches` : '/'} className="flex items-center gap-1 md:gap-2 hover:opacity-80 transition-opacity flex-shrink-0">
            <div className="relative w-8 h-8 md:w-10 md:h-10 flex-shrink-0">
              <Image
                src="/icon-192.png"
                alt="Arena de Bolões"
                fill
                className="rounded-lg object-contain"
                sizes="(max-width: 768px) 32px, 40px"
              />
            </div>
            <span className="text-primary font-semibold text-sm md:text-lg truncate max-w-[120px] md:max-w-none">
              {tournamentName || 'Arena de Bolões'}
            </span>
          </Link>

          {/* Centro: Links de Navegação (quebram linha no mobile, sem scroll) */}
          <div className="flex flex-wrap items-center justify-end gap-1">
            {/* 1. Partidas (quando dentro de um torneio) */}
            {tournamentSlug && (
              <Link
                href={getHref('/matches')}
                className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-md transition-colors ${
                  isActive('/matches')
                    ? 'bg-primary text-foreground'
                    : 'text-card-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Calendar className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium hidden md:inline">Partidas</span>
              </Link>
            )}

            {/* 2. Desempenho (quando dentro de um torneio) */}
            {tournamentSlug && (
              <Link
                href={`/${tournamentSlug}/desempenho`}
                className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-md transition-colors ${
                  pathname === `/${tournamentSlug}/desempenho`
                    ? 'bg-primary text-foreground'
                    : 'text-card-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <BarChart3 className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium hidden md:inline">Desempenho</span>
              </Link>
            )}

            {/* 3. Simulador (quando dentro de um torneio que tem simulador) */}
            {tournamentSlug && hasSimulator && (
              <Link
                href={getHref('/simulador')}
                className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-md transition-colors ${
                  isActive('/simulador')
                    ? 'bg-primary text-foreground'
                    : 'text-card-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <TrendingUp className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium hidden md:inline">Simulador</span>
              </Link>
            )}

            {/* 4. Ranking (quando dentro de um torneio) */}
            {tournamentSlug && (
              <Link
                href={getHref('/ranking')}
                className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-md transition-colors ${
                  isActive('/ranking')
                    ? 'bg-primary text-foreground'
                    : 'text-card-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Award className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium hidden md:inline">Ranking</span>
              </Link>
            )}

            {/* Separador visual (após links do torneio) */}
            {tournamentSlug && (
              <div className="h-6 w-px bg-muted mx-1 md:mx-2 flex-shrink-0" />
            )}

            {/* 4. Ranking Geral - sempre visível */}
            <Link
              href="/ranking-geral"
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-md transition-colors ${
                pathname === '/ranking-geral'
                  ? 'bg-primary text-foreground'
                  : 'text-card-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              <Award className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium hidden md:inline">Ranking Geral</span>
            </Link>

            {/* 5. Hall da Fama - sempre visível */}
            <Link
              href="/hall-of-fame"
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-md transition-colors ${
                pathname === '/hall-of-fame'
                  ? 'bg-primary text-foreground'
                  : 'text-card-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              <Crown className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium hidden md:inline">Hall da Fama</span>
            </Link>

            {/* Separador visual */}
            <div className="h-6 w-px bg-muted mx-1 md:mx-2 flex-shrink-0" />

            {/* 6. Trocar Campeonato (quando dentro de um torneio) */}
            {tournamentSlug && (
              <Link href="/">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-card-foreground hover:text-foreground hover:bg-accent px-2 md:px-3"
                >
                  <Home className="w-4 h-4 md:mr-2 flex-shrink-0" />
                  <span className="hidden md:inline">Trocar Campeonato</span>
                </Button>
              </Link>
            )}

            {/* 7. Perfil - sempre visível */}
            <Link href="/profile">
              <Button
                variant="ghost"
                size="sm"
                className={`text-card-foreground hover:text-foreground hover:bg-accent px-2 md:px-3 ${
                  pathname === '/profile' ? 'bg-muted' : ''
                }`}
              >
                <User className="w-4 h-4 md:mr-2 flex-shrink-0" />
                <span className="hidden md:inline">Perfil</span>
              </Button>
            </Link>

            {/* 8. Admin (quando admin e dentro de um torneio) */}
            {tournamentSlug && isAdmin && (
              <Link
                href={getHref('/admin')}
                className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-md transition-colors ${
                  isActive('/admin')
                    ? 'bg-primary text-foreground'
                    : 'text-card-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Settings className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium hidden md:inline">Admin</span>
              </Link>
            )}

            {/* Sair */}
            <form action={logoutAction}>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-card-foreground hover:text-foreground hover:bg-accent px-2 md:px-3"
              >
                <LogOut className="w-4 h-4 md:mr-2 flex-shrink-0" />
                <span className="hidden md:inline">Sair</span>
              </Button>
            </form>
          </div>
        </div>
      </div>
    </nav>
  );
}

