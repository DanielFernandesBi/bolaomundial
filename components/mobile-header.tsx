'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import { getTournamentNavInfo } from '@/app/actions/tournament';
import { ThemeToggle } from '@/components/theme-toggle';
import { TournamentSheet } from '@/components/tournament-sheet';

// ============================================================================
// Cabeçalho mobile
// ============================================================================
// A navbar.tsx passou a ser só do desktop (hidden md:block). Sem este cabeçalho
// o celular ficaria sem marca e — mais grave — sem o botão Sair, que só existia
// lá dentro.
//
// Na Fase 6 o nome do torneio aqui vira o gatilho da folha de troca de
// campeonato, e a Fase 5 encaixa o botão de tema ao lado do Sair.
// ============================================================================

export function MobileHeader() {
  const params = useParams();
  const tournamentSlug = params?.tournament as string | undefined;
  const [tournamentName, setTournamentName] = useState<string | null>(null);

  useEffect(() => {
    if (tournamentSlug) {
      getTournamentNavInfo(tournamentSlug).then((info) => setTournamentName(info?.name ?? null));
    } else {
      setTournamentName(null);
    }
  }, [tournamentSlug]);

  return (
    <header className="md:hidden sticky top-0 z-40 border-b border-hairline bg-background/90 backdrop-blur">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={tournamentSlug ? `/${tournamentSlug}/matches` : '/'} className="flex-shrink-0">
            <div className="relative h-7 w-7">
              <Image src="/icon-192.png" alt="Arena de Bolões" fill className="rounded-lg object-contain" sizes="28px" />
            </div>
          </Link>
          {/* O nome do torneio abre a folha de troca de campeonato. */}
          <TournamentSheet currentSlug={tournamentSlug} currentName={tournamentName || 'Arena de Bolões'} />
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <ThemeToggle />
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Sair da conta"
              className="flex items-center justify-center w-11 h-11 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="w-5 h-5" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
