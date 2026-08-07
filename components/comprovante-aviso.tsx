'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileCheck, ShieldCheck, X } from 'lucide-react';
import { competitionName } from '@/lib/competitions';
import type { FaseAGuardar } from '@/app/[tournament]/comprovante/actions';

// ============================================================================
// "Guarde o seu comprovante" — o aviso que fecha a janela cega.
//
// O problema que ele resolve, nas palavras de quem o descreveu: "apostou 1x0 e
// deixou assim; quando fechou o relógio, mudou para 1x1, e o jogador não tem
// como se proteger disso".
//
// Está certo, e é o furo que a transparência não cobre. Ela mostra os palpites
// quando a fase FECHA — então um print dela prova o que estava NO FECHAMENTO,
// e não o que a pessoa deixou gravado antes. O intervalo entre apostar e
// fechar é cego, e é justamente nele que a desconfiança mora.
//
// A única prova que cobre esse intervalo é uma que o jogador já tenha em mãos
// ANTES do fechamento. Por isso este aviso existe, e por isso ele aparece
// enquanto a fase está ABERTA — depois não adianta mais.
//
// QUANDO ELE VOLTA A APARECER é a parte que faz diferença: a dispensa é
// guardada junto com os CÓDIGOS do momento. Trocou um palpite? O código muda,
// a dispensa deixa de valer e o aviso volta — porque o comprovante que a
// pessoa guardou ficou desatualizado, e ela precisa saber disso. Um "não ver
// mais" que ignorasse isso daria uma falsa sensação de proteção.
// ============================================================================

const CHAVE_NUNCA = 'comprovante:nunca';
const CHAVE_VISTO = 'comprovante:visto';

function prazo(iso: string | null): string {
  if (!iso) return 'sem data definida';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ComprovanteAviso({
  fases,
  tournamentSlug,
}: {
  fases: FaseAGuardar[];
  tournamentSlug: string;
}) {
  const [aberto, setAberto] = useState(false);

  // A assinatura é o conjunto de códigos abertos. Ela É o critério de
  // reaparecimento — ver o cabeçalho.
  const assinatura = fases.map((f) => f.codigo).join('.');

  useEffect(() => {
    if (fases.length === 0) return;
    try {
      if (localStorage.getItem(CHAVE_NUNCA) === '1') return;
      if (localStorage.getItem(`${CHAVE_VISTO}:${tournamentSlug}`) === assinatura) return;
    } catch {
      // Navegador sem localStorage (aba anônima com storage bloqueado): mostrar
      // é melhor que esconder — o aviso é curto e tem saída.
    }
    setAberto(true);
  }, [fases.length, assinatura, tournamentSlug]);

  function fechar(paraSempre = false) {
    try {
      if (paraSempre) localStorage.setItem(CHAVE_NUNCA, '1');
      else localStorage.setItem(`${CHAVE_VISTO}:${tournamentSlug}`, assinatura);
    } catch {
      /* sem storage: fecha só nesta visita */
    }
    setAberto(false);
  }

  if (!aberto || fases.length === 0) return null;

  const total = fases.reduce((s, f) => s + f.palpites, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aviso-comprovante-titulo"
      onClick={() => fechar()}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[16px] border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
            <h2 id="aviso-comprovante-titulo" className="text-base font-bold text-foreground">
              Guarde o seu comprovante
            </h2>
          </span>
          <button
            type="button"
            onClick={() => fechar()}
            aria-label="Fechar"
            className="-m-1 flex-shrink-0 rounded p-1 text-[hsl(var(--faint))] transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          Quando a fase fecha, os palpites de todos aparecem na Transparência — mas ela mostra o que
          estava <strong className="text-card-foreground">no fechamento</strong>. Ela não prova o que
          você deixou gravado antes disso.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          O comprovante prova. Salve ou mande no grupo{' '}
          <strong className="text-card-foreground">enquanto a fase está aberta</strong>: ele leva a
          hora de cada palpite e um código. Se um dia bater a dúvida, é só comparar o código de
          então com o de depois — igual, nada mudou.
        </p>

        <div className="my-4 overflow-hidden rounded-[12px] border border-border">
          {fases.map((f) => (
            <div
              key={`${f.competition}|${f.round}`}
              className="flex items-center justify-between gap-3 border-t border-hairline px-3 py-2.5 first:border-t-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-card-foreground">
                  {competitionName(f.competition ?? '') || f.competition || 'Palpites'}
                  {f.round ? ` · ${f.round}` : ''}
                </span>
                <span className="block font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--faint))]">
                  {f.palpites} {f.palpites === 1 ? 'palpite' : 'palpites'} · fecha {prazo(f.fecha_em)}
                </span>
              </span>
              <span className="flex-shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-[11px] font-bold tracking-[0.1em] text-primary">
                {f.codigo}
              </span>
            </div>
          ))}
        </div>

        <Link
          href={`/${tournamentSlug}/comprovante`}
          onClick={() => fechar()}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))]"
        >
          <FileCheck className="h-4 w-4" aria-hidden="true" />
          Ver e guardar meus {total} palpites
        </Link>

        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => fechar()}
            className="text-xs font-semibold text-muted-foreground"
          >
            Agora não
          </button>
          {/* "Não mostrar de novo" é permanente de propósito, e por isso vem
              discreto: quem desliga um aviso de proteção deve fazê-lo de
              propósito, não por engano ao procurar o botão de fechar. */}
          <button
            type="button"
            onClick={() => fechar(true)}
            className="text-xs text-[hsl(var(--faint))] underline underline-offset-2"
          >
            Não mostrar de novo
          </button>
        </div>
      </div>
    </div>
  );
}
