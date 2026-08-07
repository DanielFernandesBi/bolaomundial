import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getComprovante } from './actions';
import { ComprovanteContent } from './comprovante-content';

interface PageProps {
  params: Promise<{ tournament: string }>;
}

// Nada de cache: o comprovante é do jogador que está logado, e uma página
// cacheada poderia servir o extrato de um para outro. É o mesmo motivo de
// /desempenho não cachear.
export const dynamic = 'force-dynamic';

export default async function ComprovantePage({ params }: PageProps) {
  const { tournament: tournamentSlug } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id')
    .eq('slug', tournamentSlug)
    .single();
  if (!tournament) notFound();

  const dados = await getComprovante(tournamentSlug);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="container mx-auto max-w-3xl px-4 py-8 pb-28 md:pb-8">
        <Link
          href={`/${tournamentSlug}/desempenho`}
          className="mb-6 inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para desempenho
        </Link>

        <div className="mb-6">
          <h1 className="mb-2 text-3xl font-bold text-foreground sm:text-4xl">Meu comprovante</h1>
          <p className="text-muted-foreground">
            Seus palpites, a hora de cada gravação e todas as alterações que você fez
          </p>
        </div>

        <ComprovanteContent {...dados} />
      </div>
    </div>
  );
}
