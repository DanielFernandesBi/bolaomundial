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

// Escudo de cada competição, na mesma fonte dos escudos dos clubes: a
// API-Football, que manda `league.logo` em toda resposta de /fixtures. O ID da
// liga é a chave — 13 Libertadores, 11 Sul-Americana, 73 Copa do Brasil — e
// está cadastrado em club_competition_weights, de onde estes valores saíram.
//
// Antes daqui saíam duas miniaturas do cache do Google Imagens
// (encrypted-tbn0.gstatic.com), que são links temporários e expiram. Estes são
// endereços de arquivo do CDN que já serve todos os outros escudos do app. Se
// algum falhar, o botão volta sozinho para o ícone (ver `falhou` abaixo).
const ESCUDOS: Record<string, string | undefined> = {
  libertadores: 'https://media.api-sports.io/football/leagues/13.png',
  sudamericana: 'https://media.api-sports.io/football/leagues/11.png',
  copa_do_brasil: 'https://media.api-sports.io/football/leagues/73.png',
};

// Reserva para quando não há escudo — ou quando ele falha ao carregar.
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
  // Escudos que não carregaram: caem para o ícone em vez de deixar a imagem
  // quebrada no lugar. Nenhum hook antes do return de baixo — a lista de
  // competições não muda entre renders da mesma tela.
  const [falhou, setFalhou] = useState<Record<string, boolean>>({});
  if (comps.length < 2) return null;

  const total = comps.reduce((s, c) => s + c.count, 0);
  const itens: (CompetitionChip & { Icone: LucideIcon; escudo?: string })[] = [
    { key: TODAS, short: 'Todas', count: total, Icone: LayoutGrid },
    ...comps.map((c) => ({
      ...c,
      Icone: ICONES[c.key] ?? Trophy,
      escudo: falhou[c.key] ? undefined : ESCUDOS[c.key],
    })),
  ];

  const escolhida = itens.find((i) => i.key === selecionada);
  const vazia = !!escolhida && escolhida.count === 0;

  return (
    <div className={className}>
      {/* 2×2 no celular em vez de rolagem horizontal: com quatro opções, todas
          cabem na tela e nenhuma fica escondida fora da borda. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Filtrar por competição">
        {itens.map(({ key, short, count, Icone, escudo }) => {
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
              {escudo ? (
                // <img> e não next/image: são URLs de terceiros, e é assim que o
                // app já exibe os escudos dos clubes. Sem opacidade quando
                // inativo — escudo lavado fica pior que escudo pequeno.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={escudo}
                  alt=""
                  className="h-[22px] w-[22px] flex-shrink-0 object-contain"
                  referrerPolicy="no-referrer"
                  onError={() => setFalhou((f) => ({ ...f, [key]: true }))}
                />
              ) : (
                <Icone
                  className={`h-4 w-4 flex-shrink-0 ${ativa ? 'text-primary' : ''}`}
                  aria-hidden="true"
                />
              )}
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
