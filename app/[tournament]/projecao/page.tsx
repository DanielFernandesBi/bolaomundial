import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getProjecao } from './actions';
import { ProjecaoContent } from './projecao-content';

interface ProjecaoPageProps {
  params: Promise<{ tournament: string }>;
}

// O ajuste roda a cada requisição não cacheada, mas só muda quando entra jogo
// novo — e jogo novo entra pelo cron, de hora em hora. Dez minutos de cache
// evita refazer a conta a cada toque sem atrasar nada perceptível.
export const revalidate = 600;

export default async function ProjecaoPage({ params }: ProjecaoPageProps) {
  const { tournament: tournamentSlug } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, slug')
    .eq('slug', tournamentSlug)
    .single();

  if (!tournament) notFound();

  const dados = await getProjecao(tournamentSlug);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="container mx-auto max-w-full px-4 py-8 pb-28 md:pb-8">
        <div className="mb-6">
          <h1 className="mb-2 text-4xl font-bold text-foreground">Projeção</h1>
          <p className="text-muted-foreground">
            Quem leva a taça, como o bolão pode terminar e a chance de cada clube avançar
          </p>
        </div>

        <ProjecaoContent {...dados} />
      </div>
    </div>
  );
}
