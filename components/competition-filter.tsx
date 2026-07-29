'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Trophy, Medal, Flag, LayoutGrid, type LucideIcon } from 'lucide-react';

// ============================================================================
// Filtro por competição (bolão unificado de clubes)
// ============================================================================
// No bolão unificado as partidas das três competições ficam empilhadas, uma
// seção abaixo da outra. Como cada competição tem seu próprio calendário, um
// jogo que acontece ANTES podia aparecer bem mais abaixo na página — e quem
// abre a tela para palpitar no jogo de hoje precisava rolar até achar.
//
// Estes botões filtram a tela inteira para uma competição. A escolha é
// compartilhada entre as abas (Próximas, Transparência, Encerradas): quem
// escolheu "Libertadores" continua na Libertadores ao trocar de aba.
//
// Nada é recarregado do servidor: as seções já vêm renderizadas e só se
// escondem. Nenhuma regra de bloqueio, prazo ou pontuação passa por aqui.
// ============================================================================

const TODAS = 'todas';

interface Ctx {
  selecionada: string;
  selecionar: (v: string) => void;
}

const FiltroCtx = createContext<Ctx>({ selecionada: TODAS, selecionar: () => {} });

export function CompetitionFilterProvider({ children }: { children: ReactNode }) {
  const [selecionada, selecionar] = useState<string>(TODAS);
  const valor = useMemo(() => ({ selecionada, selecionar }), [selecionada]);
  return <FiltroCtx.Provider value={valor}>{children}</FiltroCtx.Provider>;
}

/**
 * Envolve uma seção de competição. Some quando o filtro aponta para outra.
 * `compKey` nulo = seção sem competição (torneios antigos): nunca some.
 */
export function CompetitionSection({
  compKey,
  children,
}: {
  compKey: string | null | undefined;
  children: ReactNode;
}) {
  const { selecionada } = useContext(FiltroCtx);
  if (compKey && selecionada !== TODAS && selecionada !== compKey) return null;
  return <>{children}</>;
}

// Ícone por competição. Não existe escudo das competições no banco (logo_url é
// do torneio, e as três vivem dentro de um só), então o ícone é a marca visual
// possível hoje. Se um dia entrarem os escudos, é aqui que eles substituem.
const ICONES: Record<string, LucideIcon> = {
  libertadores: Trophy,
  sudamericana: Medal,
  copa_do_brasil: Flag,
};

export interface CompetitionChip {
  key: string;
  short: string;
  count: number;
}

export function CompetitionFilterBar({
  comps,
  className = '',
}: {
  comps: CompetitionChip[];
  className?: string;
}) {
  const { selecionada, selecionar } = useContext(FiltroCtx);
  if (comps.length < 2) return null;

  const total = comps.reduce((s, c) => s + c.count, 0);
  const itens: (CompetitionChip & { Icone: LucideIcon })[] = [
    { key: TODAS, short: 'Todas', count: total, Icone: LayoutGrid },
    ...comps.map((c) => ({ ...c, Icone: ICONES[c.key] ?? Trophy })),
  ];

  const escolhida = itens.find((i) => i.key === selecionada);
  const vazia = !!escolhida && escolhida.count === 0;

  return (
    <div className={className}>
      {/* 2×2 no celular em vez de rolagem horizontal: com quatro opções, todas
          cabem na tela e nenhuma fica escondida fora da borda. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Filtrar por competição">
        {itens.map(({ key, short, count, Icone }) => {
          const ativa = selecionada === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => selecionar(key)}
              aria-pressed={ativa}
              className={`flex min-h-[44px] items-center gap-2 rounded-[12px] border px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                ativa
                  ? 'border-primary/50 bg-primary/10 text-foreground'
                  : 'border-hairline bg-surface-sunken text-muted-foreground hover:border-primary/30 hover:text-foreground'
              }`}
            >
              <Icone
                className={`h-4 w-4 flex-shrink-0 ${ativa ? 'text-primary' : ''}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-left text-[12.5px] font-semibold">{short}</span>
              <span
                className={`flex-shrink-0 font-mono text-[10px] tabular-nums ${
                  ativa ? 'text-primary' : 'text-[hsl(var(--faint))]'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {vazia && (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Nenhum jogo da {escolhida.short} nesta aba.
        </p>
      )}
    </div>
  );
}
