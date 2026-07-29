'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, X, Check } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase';

// ============================================================================
// Folha de troca de campeonato
// ============================================================================
// "Trocar campeonato" saiu da barra de navegação (Fase 4) e passa a ser aberta
// pelo nome do torneio no cabeçalho — que é onde o usuário já olha para saber
// onde está.
//
// Consulta a lista com o cliente de browser, SÓ ao abrir (não no mount), para
// não custar nada em quem nunca troca de bolão. Não foi criada nenhuma server
// action e lib/supabase.ts não foi tocado — apenas usado.
// ============================================================================

interface TournamentRow {
  id: number;
  name: string;
  slug: string;
  active: boolean;
}

interface Props {
  currentSlug?: string;
  currentName: string;
}

export function TournamentSheet({ currentSlug, currentName }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TournamentRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir() {
    setOpen(true);
    if (rows || loading) return;
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, slug, active')
        .order('active', { ascending: false })
        .order('id', { ascending: false });
      // Antes eu engolia o erro num catch mudo e a folha aparecia vazia, sem
      // dizer o porquê. Agora a mensagem aparece na tela.
      if (error) setErro(error.message);
      setRows((data as TournamentRow[]) ?? []);
    } catch (e: any) {
      setErro(e?.message ?? 'Falha ao carregar os campeonatos.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const emDisputa = (rows ?? []).filter((t) => t.active);
  const encerrados = (rows ?? []).filter((t) => !t.active);

  function Grupo({ titulo, itens }: { titulo: string; itens: TournamentRow[] }) {
    if (itens.length === 0) return null;
    return (
      <div className="mb-6">
        <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">
          {titulo}
        </p>
        <div className="space-y-2">
          {itens.map((t) => {
            const atual = t.slug === currentSlug;
            return (
              <Link
                key={t.id}
                href={`/${t.slug}/matches`}
                onClick={() => setOpen(false)}
                className={`flex min-h-[52px] items-center gap-3 rounded-[14px] border px-3 ${
                  atual
                    ? 'border-primary/45 bg-primary/10'
                    : 'border-hairline bg-surface-sunken hover:border-primary/40'
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{t.name}</span>
                {atual && <Check className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />}
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label="Trocar de campeonato"
        aria-expanded={open}
        className="flex min-w-0 items-center gap-1 rounded-lg px-1 py-1 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate text-sm font-semibold text-primary">{currentName}</span>
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-background/97 backdrop-blur">
          <div className="mx-auto max-w-lg px-4 py-4">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-foreground">Trocar campeonato</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="flex h-[38px] w-[38px] items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {erro && (
              <p className="mb-4 rounded-[12px] border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </p>
            )}
            {!loading && rows?.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum campeonato encontrado.</p>
            )}

            <Grupo titulo="Em disputa" itens={emDisputa} />
            <Grupo titulo="Encerrados" itens={encerrados} />
          </div>
        </div>
      )}
    </>
  );
}
