'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, X, Check, Lock } from 'lucide-react';
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
//
// TRÊS estados, não dois. A primeira versão dividia em `active` / `!active` e
// chamava todo inativo de "Encerrado", com link para /matches. Mas o sistema
// distingue três casos, e a home age sobre eles:
//   · ativo     → em disputa, link para /matches
//   · encerrado → inativo COM partida finalizada; a home manda para /ranking
//   · pendente  → inativo SEM partida finalizada; a home BLOQUEIA o card
// Com dois grupos, a folha virava um desvio em volta desse bloqueio: dava para
// entrar num torneio que ainda não começou. Agora ela espelha a home.
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
  // ids dos torneios inativos que JÁ têm partida finalizada = encerrados.
  // Os inativos que não estão aqui são os pendentes.
  const [encerradosIds, setEncerradosIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // NOTA: a sobreposição depende de o cabeçalho NÃO ter backdrop-filter — um
  // filtro cria bloco de contenção para descendentes `fixed`, e o inset-0
  // passaria a resolver para a caixa do cabeçalho (a folha abria como faixa
  // fina no topo). Por isso o blur do mobile-header vive numa camada interna.

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
      const lista = (data as TournamentRow[]) ?? [];
      setRows(lista);

      // UMA consulta para separar encerrado de pendente — não uma por torneio.
      // A home faz um count por torneio porque lá cada card já é uma linha da
      // iteração; aqui vale trazer de uma vez os tournament_id que têm partida
      // finalizada e contar em memória.
      const inativos = lista.filter((t) => !t.active).map((t) => t.id);
      if (inativos.length > 0) {
        const { data: comJogos } = await supabase
          .from('matches')
          .select('tournament_id')
          .eq('status', 'FINISHED')
          .in('tournament_id', inativos);
        setEncerradosIds(new Set((comJogos ?? []).map((m: any) => m.tournament_id)));
      }
    } catch (e: any) {
      setErro(e?.message ?? 'Falha ao carregar os campeonatos.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const todos = rows ?? [];
  const emDisputa = todos.filter((t) => t.active);
  const encerrados = todos.filter((t) => !t.active && encerradosIds.has(t.id));
  const emBreve = todos.filter((t) => !t.active && !encerradosIds.has(t.id));

  function Grupo({
    titulo,
    itens,
    destino,
  }: {
    titulo: string;
    itens: TournamentRow[];
    /** null = grupo bloqueado; renderiza linha sem link, como a home faz. */
    destino: ((slug: string) => string) | null;
  }) {
    if (itens.length === 0) return null;
    return (
      <div className="mb-6">
        <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">
          {titulo}
        </p>
        <div className="space-y-2">
          {itens.map((t) => {
            const atual = t.slug === currentSlug;
            const conteudo = (
              <>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.name}</span>
                {atual && <Check className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />}
                {!destino && (
                  <Lock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
              </>
            );
            const base = 'flex min-h-[52px] items-center gap-3 rounded-[14px] border px-3';

            if (!destino) {
              return (
                <div
                  key={t.id}
                  aria-disabled="true"
                  className={`${base} border-hairline bg-surface-sunken text-muted-foreground`}
                >
                  {conteudo}
                </div>
              );
            }

            return (
              <Link
                key={t.id}
                href={destino(t.slug)}
                onClick={() => setOpen(false)}
                className={`${base} text-foreground ${
                  atual
                    ? 'border-primary/45 bg-primary/10'
                    : 'border-hairline bg-surface-sunken hover:border-primary/40'
                }`}
              >
                {conteudo}
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

            <Grupo titulo="Em disputa" itens={emDisputa} destino={(slug) => `/${slug}/matches`} />
            {/* Encerrado vai para o ranking, não para as partidas — é o mesmo
                destino que a home usa. */}
            <Grupo titulo="Encerrados" itens={encerrados} destino={(slug) => `/${slug}/ranking`} />
            <Grupo titulo="Em breve" itens={emBreve} destino={null} />
          </div>
        </div>
      )}
    </>
  );
}
