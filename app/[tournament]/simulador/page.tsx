import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase';
import { SimuladorContent } from './simulador-content';

interface PageProps {
  params: Promise<{ tournament: string }>;
}

export default async function SimuladorPage({ params }: PageProps) {
  const { tournament: tournamentSlug } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('name, slug')
    .eq('slug', tournamentSlug)
    .single();

  if (!tournament) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden transition-colors">
      <div className="container mx-auto px-4 py-8 pb-28 md:pb-8 max-w-5xl">
        <SimuladorContent tournamentSlug={tournamentSlug} tournamentName={tournament.name} />
      </div>
    </div>
  );
}
