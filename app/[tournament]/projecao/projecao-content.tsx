'use client';

import { Info } from 'lucide-react';
import { COMPETITIONS, competitionName } from '@/lib/competitions';
import type { ProjecaoData, TieProjecao } from './actions';

// ============================================================================
// Chances de classificação, com a incerteza à vista.
//
// A decisão de produto mais importante desta tela é NÃO exibir um número
// sozinho. Os 40 clubes do bolão têm desvio-padrão de 3,35 pontos no Opta —
// são muito parecidos — e o modelo começou a acumular evidência há um dia.
// Nessas condições, "53%" sozinho passaria uma confiança que o dado não
// sustenta. A barra mostra a faixa; o número é só o centro dela.
// ============================================================================

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function Confronto({ t }: { t: TieProjecao }) {
  const favorito = t.advance >= 0.5;
  const nomeFav = favorito ? t.homeName : t.awayName;
  const pFav = favorito ? t.advance : 1 - t.advance;
  const loFav = favorito ? t.low : 1 - t.high;
  const hiFav = favorito ? t.high : 1 - t.low;

  return (
    <div className="border-t border-hairline px-3 py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] text-card-foreground">
          <span className={favorito ? 'font-semibold' : ''}>{t.homeName}</span>
          <span className="mx-1.5 text-[hsl(var(--faint))]">×</span>
          <span className={!favorito ? 'font-semibold' : ''}>{t.awayName}</span>
        </span>
        {t.decided ? (
          <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-wider text-state-locked">
            decidido
          </span>
        ) : (
          <span className="flex-shrink-0 font-mono text-sm font-bold tabular-nums text-card-foreground">
            {pct(pFav)}
          </span>
        )}
      </div>

      {!t.decided && (
        <>
          {/* Barra da faixa: o trecho claro é o intervalo de 90%, o traço é o
              centro. Quanto mais larga a barra, menos o modelo sabe. */}
          <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="absolute h-full rounded-full bg-primary/25"
              style={{ left: `${loFav * 100}%`, width: `${Math.max(1, (hiFav - loFav) * 100)}%` }}
            />
            <div
              className="absolute h-full w-[3px] rounded-full bg-primary"
              style={{ left: `calc(${pFav * 100}% - 1.5px)` }}
            />
          </div>
          <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[hsl(var(--faint))]">
            {nomeFav} avança · faixa {pct(loFav)}–{pct(hiFav)}
          </p>
        </>
      )}

      {(t.idaScore || t.voltaScore) && (
        <p className="mt-1.5 font-mono text-[10px] tabular-nums text-[hsl(var(--faint))]">
          {t.idaScore && <>ida {t.idaScore}</>}
          {t.idaScore && t.voltaScore && ' · '}
          {t.voltaScore && <>volta {t.voltaScore}</>}
        </p>
      )}
    </div>
  );
}

export function ProjecaoContent({ ties, matchesUsed, clubsFitted, modelVersion }: ProjecaoData) {
  const porCompeticao = COMPETITIONS.map((c) => ({
    ...c,
    itens: ties.filter((t) => t.competition === c.key),
  })).filter((g) => g.itens.length > 0);

  const outros = ties.filter((t) => !COMPETITIONS.some((c) => c.key === t.competition));
  if (outros.length) {
    porCompeticao.push({ key: 'outros' as any, name: 'Outros', short: 'Outros', itens: outros });
  }

  return (
    <div>
      {/* O aviso vem ANTES dos números, não em rodapé. Quem lê "53%" precisa
          saber, na mesma tela, de quanta evidência esse 53% saiu. */}
      <div className="mb-5 flex gap-2.5 rounded-[12px] border border-border bg-card px-3 py-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--faint))]" aria-hidden="true" />
        <div className="min-w-0 text-xs leading-relaxed text-muted-foreground">
          Os 40 clubes do bolão são muito parecidos entre si — por isso quase todo confronto
          fica perto de 50%. Isso não é o modelo se omitindo: é o que os dados dizem sobre um
          mata-mata entre clubes de nível semelhante.
          <span className="mt-1.5 block font-mono text-[10px] text-[hsl(var(--faint))]">
            {matchesUsed} {matchesUsed === 1 ? 'jogo' : 'jogos'} desde 31/07 · {clubsFitted} clubes ·{' '}
            {modelVersion}
          </span>
        </div>
      </div>

      <div className="space-y-5">
        {porCompeticao.map((g) => (
          <section key={g.key}>
            <h2 className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--faint))]">
              {competitionName(g.key) || g.name}
            </h2>
            <div className="overflow-hidden rounded-[12px] border border-border bg-card">
              {g.itens.map((t) => (
                <Confronto key={t.tieId} t={t} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {ties.length === 0 && (
        <div className="rounded-[12px] border border-border bg-card px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhum confronto cadastrado.</p>
        </div>
      )}
    </div>
  );
}
