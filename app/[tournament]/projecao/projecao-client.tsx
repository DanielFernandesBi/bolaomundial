'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getProjecao, type ProjecaoData } from './actions';
import { ProjecaoContent } from './projecao-content';

// ============================================================================
// Mesma projeção da rota /[tournament]/projecao, embutida na aba "Projeção" do
// ranking. Carrega sob demanda: o Monte Carlo só roda quando alguém abre a
// aba, não em todo carregamento do ranking.
//
// A rota continua existindo e é a versão cacheada (revalidate = 600). Aqui o
// dado vem fresco a cada abertura — é o mesmo trade-off que o simulador de
// seleções já fazia na aba.
// ============================================================================

export function ProjecaoClient({ tournamentSlug }: { tournamentSlug: string }) {
  const [data, setData] = useState<ProjecaoData | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setData(await getProjecao(tournamentSlug));
    } catch {
      setErro('Não foi possível calcular a projeção agora.');
    }
    setCarregando(false);
  }, [tournamentSlug]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (carregando && !data) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-[12px] border border-border bg-card px-4 py-12 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
        Calculando os cenários…
      </div>
    );
  }

  if (erro || !data) {
    return (
      <div className="rounded-[12px] border border-border bg-card px-4 py-10 text-center">
        <p className="mb-3 text-sm text-muted-foreground">{erro ?? 'Sem dados de projeção.'}</p>
        <button
          type="button"
          onClick={carregar}
          className="text-xs font-semibold text-primary underline underline-offset-4"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  return <ProjecaoContent {...data} />;
}
