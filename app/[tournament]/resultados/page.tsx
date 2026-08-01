import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getResultados } from './actions';
import { ResultadosContent } from './resultados-content';

interface ResultadosPageProps {
  params: Promise<{ tournament: string }>;
}

// Cache curto: o cron sincroniza 2×/dia, então nada muda de minuto a minuto —
// mas durante uma rodada o placar entra na sincronização seguinte, e cinco
// minutos é o suficiente para não servir uma página velha demais.
export const revalidate = 300;

export default async function ResultadosPage({ params }: ResultadosPageProps) {
  const { tournament: tournamentSlug } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, slug')
    .eq('slug', tournamentSlug)
    .single();

  if (!tournament) notFound();

  const dados = await getResultados((tournament as any).id);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="container mx-auto max-w-full px-4 py-8 pb-28 md:pb-8">
        {/* O nome do torneio saiu do subtítulo: ele já está no topbar, e aqui
            empurrava a frase para três linhas no celular. */}
        <div className="mb-5">
          <h1 className="mb-1 text-3xl font-bold text-foreground sm:text-4xl">Resultados</h1>
          <p className="text-sm text-muted-foreground">
            Como os clubes do bolão vêm jogando, em todas as competições
          </p>
        </div>

        <ResultadosContent {...dados} />
      </div>
    </div>
  );
}
