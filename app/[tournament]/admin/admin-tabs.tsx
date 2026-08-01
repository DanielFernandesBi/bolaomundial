'use client';

import { useState } from 'react';
import { BarChart3, CalendarDays, Gift, GitBranch, Tags, Trophy } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ============================================================================
// Abas do painel do admin.
//
// O painel era uma coluna só: premiação, sugestões, chaveamento, pódio e a
// lista inteira de jogos, um abaixo do outro. Com 48 jogos o scroll já era
// grande, e cresce a cada torneio.
//
// Mesmo padrão visual de Partidas e Ranking — TabsList em grid, uma coluna por
// aba, ativa em `primary`. Quem já sabe usar aquelas telas sabe usar esta.
//
// As abas recebem conteúdo JÁ RENDERIZADO pelo servidor: a página continua
// server component e nada disso vira busca no cliente. O custo é que todas as
// abas chegam no HTML — o que aqui é o certo, porque já chegavam antes, só que
// empilhadas.
// ============================================================================

const ICONES: Record<string, typeof Trophy> = {
  jogos: CalendarDays,
  chaveamento: GitBranch,
  podio: Trophy,
  apelidos: Tags,
  torneio: Gift,
  uso: BarChart3,
};

export interface AbaAdmin {
  key: string;
  label: string;
  content: React.ReactNode;
}

export function AdminTabs({ abas }: { abas: AbaAdmin[] }) {
  const [ativa, setAtiva] = useState(abas[0]?.key ?? '');

  if (abas.length === 0) return null;
  if (abas.length === 1) return <>{abas[0].content}</>;

  return (
    <>
      <Tabs value={ativa} onValueChange={setAtiva} className="mb-6 w-full">
        <TabsList className="grid w-full auto-cols-fr grid-flow-col gap-1 rounded-[12px] border border-border bg-card p-1">
          {abas.map((a) => {
            const Icon = ICONES[a.key];
            return (
              <TabsTrigger
                key={a.key}
                value={a.key}
                className="flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-[9px] text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />}
                <span className="truncate">{a.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* `hidden` em vez de desmontar: os formulários de premiação e pódio
          guardam rascunho em estado local, e desmontar apagaria o que o admin
          digitou ao trocar de aba sem querer. */}
      {abas.map((a) => (
        <div key={a.key} hidden={a.key !== ativa}>
          {a.content}
        </div>
      ))}
    </>
  );
}
