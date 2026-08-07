'use client';

import { useMemo, useState } from 'react';
import { Check, Clock, Info, Pencil, Share2, ShieldCheck } from 'lucide-react';
import { shareAsImage } from '@/lib/shareUtils';
import { Toast } from '@/components/toast';
import { COMPETITIONS, competitionName } from '@/lib/competitions';
import type { ComprovanteData, EventoDoPalpite, ItemDoExtrato } from './actions';

// ============================================================================
// Comprovante: o que eu palpitei, quando gravei, e o que eu mesmo mudei.
//
// A tela existe para um problema de CONFIANÇA, não de dado. Por isso ela evita
// duas tentações:
//
//   1. não afirma nada que não possa mostrar. Onde a trilha não cobre (palpite
//      anterior a 01/08), diz que não cobre, em vez de deixar a ausência de
//      alteração parecer prova de que não houve alteração;
//
//   2. não pede que ninguém acredite em nós. O código de conferência é o
//      mecanismo: o jogador guarda o comprovante no momento em que aposta — no
//      grupo, no rolo da câmera — e depois compara o código de então com o de
//      agora. A verificação acontece na mão dele.
// ============================================================================

const FUSO = 'America/Sao_Paulo';

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dia(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Placar + desempates, do jeito que o jogador preencheu. */
function palpiteEmTexto(p: {
  pred_home: number;
  pred_away: number;
  pred_extra_result?: string | null;
  pred_pen_home?: number | null;
  pred_pen_away?: number | null;
  pred_pen_winner?: string | null;
}, casa: string, fora: string): string {
  const partes = [`${p.pred_home} x ${p.pred_away}`];
  if (p.pred_extra_result) {
    partes.push(
      `prorrogação: ${
        p.pred_extra_result === 'home' ? casa : p.pred_extra_result === 'away' ? fora : 'empate'
      }`
    );
  }
  if (p.pred_pen_home != null && p.pred_pen_away != null) {
    partes.push(`pênaltis ${p.pred_pen_home} x ${p.pred_pen_away}`);
  }
  if (p.pred_pen_winner) {
    partes.push(`pênaltis: ${p.pred_pen_winner === 'home' ? casa : fora}`);
  }
  return partes.join(' · ');
}

/** O que mudou entre dois estados, em palavras. */
function descreverMudanca(e: EventoDoPalpite, casa: string, fora: string): string {
  const a = e.antes as any;
  const d = e.depois as any;
  if (!a || !d) return '';

  const mudou: string[] = [];
  if (a.pred_home !== d.pred_home || a.pred_away !== d.pred_away) {
    mudou.push(`placar ${a.pred_home}x${a.pred_away} → ${d.pred_home}x${d.pred_away}`);
  }
  const lado = (v: string | null) => (v === 'home' ? casa : v === 'away' ? fora : v === 'draw' ? 'empate' : '—');
  if (a.pred_extra_result !== d.pred_extra_result) {
    mudou.push(`prorrogação ${lado(a.pred_extra_result)} → ${lado(d.pred_extra_result)}`);
  }
  if (a.pred_pen_winner !== d.pred_pen_winner) {
    mudou.push(`vencedor nos pênaltis ${lado(a.pred_pen_winner)} → ${lado(d.pred_pen_winner)}`);
  }
  if (a.pred_pen_home !== d.pred_pen_home || a.pred_pen_away !== d.pred_pen_away) {
    mudou.push(`pênaltis ${a.pred_pen_home ?? '—'}x${a.pred_pen_away ?? '—'} → ${d.pred_pen_home ?? '—'}x${d.pred_pen_away ?? '—'}`);
  }
  return mudou.join(' · ');
}

function Linha({ item }: { item: ItemDoExtrato }) {
  const [aberto, setAberto] = useState(false);
  const alteracoes = item.alteracoes.filter((e) => e.operacao === 'UPDATE');

  return (
    <div className="border-t border-hairline px-3.5 py-3 first:border-t-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
          {item.team_home} <span className="text-[hsl(var(--faint))]">x</span> {item.team_away}
        </span>
        <span className="flex-shrink-0 font-mono text-sm font-bold tabular-nums text-foreground">
          {item.pred_home} x {item.pred_away}
        </span>
      </div>

      {(item.pred_extra_result || item.pred_pen_winner || item.pred_pen_home != null) && (
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--faint))]">
          {palpiteEmTexto(item, item.team_home, item.team_away).split(' · ').slice(1).join(' · ')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          gravado em {dataHora(item.salvo_em)}
        </span>

        {alteracoes.length > 0 ? (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="inline-flex items-center gap-1 font-semibold text-state-urgent"
          >
            <Pencil className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            {alteracoes.length} {alteracoes.length === 1 ? 'alteração sua' : 'alterações suas'}
            {aberto ? ' (ocultar)' : ' (ver)'}
          </button>
        ) : item.cobertura_completa ? (
          <span className="inline-flex items-center gap-1 text-state-open">
            <Check className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            nunca alterado
          </span>
        ) : null}
      </div>

      {/* Onde a trilha não cobre, dizer que não cobre. A ausência de alteração
          registrada não é prova de que não houve alteração. */}
      {!item.cobertura_completa && alteracoes.length === 0 && (
        <p className="mt-1 text-[11px] text-[hsl(var(--faint))]">
          Gravado antes de a trilha existir — o histórico deste palpite começa depois.
        </p>
      )}

      {aberto && alteracoes.length > 0 && (
        <ol className="mt-2 space-y-1.5 border-l-2 border-state-urgent/40 pl-3">
          {alteracoes.map((e, i) => (
            <li key={i} className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-mono text-[hsl(var(--faint))]">{dataHora(e.quando)}</span>
              <br />
              {descreverMudanca(e, item.team_home, item.team_away) || 'alteração registrada'}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function ComprovanteContent({
  username,
  tournamentName,
  itens,
  podio,
  trilhaDesde,
  trilha,
  erro,
}: ComprovanteData) {
  const [toast, setToast] = useState<string | null>(null);
  const [tom, setTom] = useState<'success' | 'error'>('success');
  const [compartilhando, setCompartilhando] = useState(false);

  // Agrupa por competição e ROUND, não por `phase`: `phase` separa ida e volta,
  // mas as duas TRAVAM juntas, no primeiro jogo da fase. O código precisa ser
  // da unidade que trava — é o que faz ele congelar no fechamento e nunca mais
  // mudar. Dois códigos para uma trava só seriam dois códigos sem significado.
  const grupos = useMemo(() => {
    const mapa = new Map<
      string,
      {
        competition: string | null;
        round: string | null;
        codigo: string;
        fechaEm: string | null;
        jaFechou: boolean;
        itens: ItemDoExtrato[];
      }
    >();
    for (const it of itens) {
      const chave = `${it.competition ?? ''}|${it.round ?? ''}`;
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          competition: it.competition,
          round: it.round,
          codigo: it.codigo_da_fase,
          fechaEm: it.fecha_em,
          jaFechou: it.ja_fechou,
          itens: [],
        });
      }
      mapa.get(chave)!.itens.push(it);
    }
    const ordem = (c: string | null) => {
      const i = COMPETITIONS.findIndex((x) => x.key === c);
      return i === -1 ? 99 : i;
    };
    return [...mapa.values()].sort(
      (a, b) => ordem(a.competition) - ordem(b.competition) || (a.round ?? '').localeCompare(b.round ?? '')
    );
  }, [itens]);

  const totalAlteracoes = itens.reduce(
    (s, i) => s + i.alteracoes.filter((e) => e.operacao === 'UPDATE').length,
    0
  );

  async function compartilhar() {
    setCompartilhando(true);
    try {
      await shareAsImage('comprovante', `comprovante-${username}.png`);
      setTom('success');
      setToast('Comprovante gerado.');
    } catch {
      setTom('error');
      setToast('Não foi possível gerar a imagem.');
    }
    setCompartilhando(false);
  }

  if (erro) {
    return (
      <div className="rounded-[12px] border border-border bg-card px-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">{erro}</p>
      </div>
    );
  }

  return (
    <div>
      <Toast message={toast} tone={tom} />

      {/* Por que esta tela existe. Vem antes dos dados de propósito: quem
          chega aqui está com uma dúvida, e a dúvida se responde explicando o
          mecanismo, não mostrando mais números. */}
      <div className="mb-4 flex gap-2.5 rounded-[12px] border border-border bg-card px-3.5 py-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--faint))]" aria-hidden="true" />
        <div className="min-w-0 text-xs leading-relaxed text-muted-foreground">
          Aqui está tudo que você palpitou, <strong className="text-card-foreground">com a hora de cada
          gravação</strong> e cada alteração que você mesmo fez. Nada nesta página vem de digitação:
          sai da trilha do banco, que só aceita acréscimo — nem o administrador consegue apagar ou
          reescrever uma linha dela.
          <span className="mt-1.5 block">
            Guarde este comprovante quando apostar (compartilhe no grupo, ou salve a imagem). Se um
            dia bater a dúvida, compare o <strong className="text-card-foreground">código</strong> de
            cada fase com o de hoje: código igual, nada mudou.
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={compartilhar}
        disabled={compartilhando || itens.length === 0}
        className="mb-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))] disabled:opacity-60"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {compartilhando ? 'Gerando…' : 'Salvar / compartilhar comprovante'}
      </button>

      {/* O que vira imagem. */}
      <div id="comprovante" className="bg-background">
        <div className="mb-4 rounded-[12px] border border-border bg-card px-3.5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--faint))]">
            Comprovante de palpites
          </p>
          <p className="mt-1 text-lg font-bold text-foreground">{username}</p>
          <p className="text-xs text-muted-foreground">{tournamentName}</p>
          <p className="mt-2 font-mono text-[10px] text-[hsl(var(--faint))]">
            emitido em {dataHora(new Date().toISOString())} · {itens.length}{' '}
            {itens.length === 1 ? 'palpite' : 'palpites'}
            {totalAlteracoes > 0 &&
              ` · ${totalAlteracoes} ${totalAlteracoes === 1 ? 'alteração' : 'alterações'}`}
          </p>
        </div>

        {grupos.map((g) => (
          <section key={`${g.competition}|${g.round}`} className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <h2 className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--faint))]">
                {competitionName(g.competition ?? '') || g.competition || 'Palpites'}
                {g.round ? ` · ${g.round}` : ''}
              </h2>
              <span
                className="flex-shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-[11px] font-bold tracking-[0.1em] text-primary"
                title="Código desta fase. Muda se qualquer palpite dela mudar."
              >
                {g.codigo}
              </span>
            </div>
            {/* Fase aberta ainda dá para mudar — então o código de hoje pode não
                ser o de amanhã, e dizer isso evita que alguém guarde um
                comprovante achando que ele já está congelado. */}
            <p className="mb-1.5 text-[11px] text-[hsl(var(--faint))]">
              {g.jaFechou
                ? 'Fase fechada: este código não muda mais.'
                : g.fechaEm
                  ? `Aberta até ${dataHora(g.fechaEm)} — se você alterar algum palpite, o código muda.`
                  : 'Fase aberta — se você alterar algum palpite, o código muda.'}
            </p>
            <div className="overflow-hidden rounded-[12px] border border-border bg-card">
              {g.itens.map((it) => (
                <Linha key={it.match_id} item={it} />
              ))}
            </div>
          </section>
        ))}

        {podio.length > 0 && (
          <section className="mb-4">
            <h2 className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--faint))]">
              Pódio
            </h2>
            <div className="overflow-hidden rounded-[12px] border border-border bg-card">
              {podio.map((p) => (
                <div key={p.competition} className="border-t border-hairline px-3.5 py-3 first:border-t-0">
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                      {competitionName(p.competition) || p.competition}
                    </span>
                    <span className="flex-shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-[11px] font-bold tracking-[0.1em] text-primary">
                      {p.codigo}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    campeão <strong className="text-card-foreground">{p.champion_team ?? '—'}</strong>
                    {p.runner_up_team && (
                      <> · vice <strong className="text-card-foreground">{p.runner_up_team}</strong></>
                    )}
                    {p.third_place_team && (
                      <> · 3º <strong className="text-card-foreground">{p.third_place_team}</strong></>
                    )}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                    gravado em {dataHora(p.salvo_em)}
                    {p.alterado_em && ` · alterado em ${dataHora(p.alterado_em)}`}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {itens.length === 0 && podio.length === 0 && (
          <div className="rounded-[12px] border border-border bg-card px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">Você ainda não tem palpites neste bolão.</p>
          </div>
        )}

        {/* Lacre da trilha. Não é para o jogador conferir sozinho — é para
            dizer, com um número, que a trilha inteira continua fechada. */}
        {trilha && (
          <div className="rounded-[12px] border border-border bg-card px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck
                className={`h-3.5 w-3.5 flex-shrink-0 ${trilha.intacta ? 'text-state-open' : 'text-destructive'}`}
                aria-hidden="true"
              />
              {trilha.intacta ? (
                <>
                  Trilha íntegra: <strong className="text-card-foreground">{trilha.linhas}</strong>{' '}
                  registros encadeados, lacre{' '}
                  <span className="font-mono text-card-foreground">{trilha.lacre}</span>
                </>
              ) : (
                <strong className="text-destructive">
                  A trilha não fecha. Avise o administrador.
                </strong>
              )}
            </p>
            {trilhaDesde && (
              <p className="mt-1 text-[11px] text-[hsl(var(--faint))]">
                A trilha registra alterações desde {dia(trilhaDesde)}. Palpites gravados antes disso
                aparecem com a hora da gravação, mas sem histórico anterior a essa data.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
