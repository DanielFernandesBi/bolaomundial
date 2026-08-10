// ============================================================================
// Layout de qualquer tela dentro de um torneio.
// ============================================================================
// Existe por uma razão só: pôr o aviso de "bolão encerrado" ACIMA de tudo, em
// todas as telas, sem depender de cada página lembrar de renderizá-lo.
//
// O aviso e o bloqueio são coisas separadas de propósito. O bloqueio vive em
// `exigirRotaPermitida()`, chamado por cada página que deixa de existir num
// torneio terminado — um layout não recebe a rota atual, então não teria como
// decidir isso. Aqui fica só a parte que vale para todas.
// ============================================================================

import Link from 'next/link';
import { Archive } from 'lucide-react';
import { situacaoDoTorneio } from '@/lib/tournament-access';

export default async function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tournament: string }>;
}) {
  const { tournament: slug } = await params;
  const t = await situacaoDoTorneio(slug);
  const encerrado = t?.situacao === 'encerrado';

  return (
    <>
      {encerrado && (
        // Faixa, não card: ela precisa ser a primeira coisa da tela e ocupar a
        // largura inteira, porque o que ela corrige é uma pessoa achando que
        // está noutro lugar. Um aviso discreto no meio do conteúdo não teria
        // evitado o engano que motivou isto.
        <div
          role="status"
          className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-900 dark:text-amber-200"
        >
          <div className="container mx-auto flex max-w-full items-start gap-2.5">
            <Archive className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold">Este bolão já terminou.</p>
              <p className="mt-0.5 text-[13px] leading-relaxed opacity-90">
                Você está em <strong className="font-semibold">{t?.name}</strong>, que está
                encerrado — dá para ver o ranking e o desempenho, mas não há mais palpites a dar
                aqui.{' '}
                <Link href="/" className="whitespace-nowrap font-semibold underline underline-offset-2">
                  Ver os bolões em disputa
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
