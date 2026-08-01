'use client';

import { useMemo, useState } from 'react';
import { Shield, RefreshCw } from 'lucide-react';
import type { ClubFixture, ResultadosData } from './actions';

// ============================================================================
// Últimos resultados dos clubes do bolão.
//
// Escopo desta primeira versão, deliberadamente enxuto: lista por dia, filtro
// por clube e filtro "só as três copas". Os filtros de país e de janela de
// 7/15/30/60 dias que a especificação sugeria ficam para quando houver volume
// que os justifique — hoje o histórico começa em 31/07/2026 (o T0 do snapshot)
// e não existe backfill.
// ============================================================================

const ENCERRADOS = new Set(['FT', 'AET', 'PEN']);

/** Rótulos dos status que a API devolve. O que não estiver aqui aparece cru. */
const STATUS_LABEL: Record<string, string> = {
  NS: 'A começar',
  '1H': '1º tempo',
  HT: 'Intervalo',
  '2H': '2º tempo',
  ET: 'Prorrogação',
  P: 'Pênaltis',
  FT: 'Encerrado',
  AET: 'Após prorrogação',
  PEN: 'Nos pênaltis',
  PST: 'Adiado',
  CANC: 'Cancelado',
  ABD: 'Abandonado',
  SUSP: 'Suspenso',
  TBD: 'A definir',
};

// ── Fuso ────────────────────────────────────────────────────────────────────
// TUDO aqui é calculado em America/Sao_Paulo, explicitamente, e não no fuso de
// quem abre a página nem no do servidor. Dois motivos:
//
//   1. correção: `kickoff_at.slice(0,10)` seria a data em UTC. Um jogo às 21:30
//      de Brasília é 00:30 UTC do dia seguinte, e apareceria agrupado no dia
//      errado — a mesma armadilha que já produziu um "31/12" neste projeto;
//   2. hidratação: o servidor roda em UTC e o navegador no fuso do aparelho.
//      Sem fixar o fuso, servidor e cliente renderizariam rótulos diferentes.
//
// O bolão é brasileiro; o calendário dele é o de Brasília.
const FUSO = 'America/Sao_Paulo';

/** YYYY-MM-DD no fuso de Brasília. 'en-CA' devolve exatamente esse formato. */
function diaEmBrasilia(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(typeof iso === 'string' ? new Date(iso) : iso);
}

function diaLegivel(iso: string, hoje: string, amanha: string, ontem: string): string {
  const d = diaEmBrasilia(iso);
  if (d === hoje) return 'Hoje';
  if (d === amanha) return 'Amanhã';
  if (d === ontem) return 'Ontem';
  return new Date(iso).toLocaleDateString('pt-BR', {
    timeZone: FUSO,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    timeZone: FUSO,
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Escudo({ url }: { url: string | null }) {
  const [falhou, setFalhou] = useState(false);

  // <img> e não next/image: são URLs de terceiros, cadastradas pelo admin, e
  // podem apontar para qualquer host. next/image exigiria cada host em
  // remotePatterns — hoje só flagcdn, supabase e wikimedia estão lá, e os
  // escudos incluem espncdn. É a mesma escolha de podium-card e
  // competition-filter, pelo mesmo motivo.
  if (!url || falhou) {
    return (
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-sunken">
        <Shield className="h-3 w-3 text-[hsl(var(--faint))]" aria-hidden="true" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFalhou(true)}
      className="h-6 w-6 flex-shrink-0 object-contain"
    />
  );
}

function LinhaJogo({ f }: { f: ClubFixture }) {
  const encerrado = ENCERRADOS.has(f.status);
  const temPlacar = f.goals_home_90 !== null && f.goals_away_90 !== null;

  // Prorrogação e pênaltis vivem SEPARADOS do tempo regulamentar no banco. O
  // placar grande é sempre o de 90 minutos; o desempate vira etiqueta, senão
  // um 1x1 decidido nos pênaltis viraria "2x1" e mentiria sobre o jogo.
  const teveProrrogacao = f.goals_home_extra !== null || f.goals_away_extra !== null;
  const tevePenaltis = f.penalties_home !== null && f.penalties_away !== null;

  return (
    <div className="flex items-center gap-2 border-t border-hairline px-3 py-2.5 first:border-t-0">
      <span className="w-10 flex-shrink-0 font-mono text-[10px] tabular-nums text-[hsl(var(--faint))]">
        {hora(f.kickoff_at)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Escudo url={f.home_crest} />
          <span
            className={`min-w-0 flex-1 truncate text-[13px] ${
              f.home_is_bolao ? 'font-semibold text-card-foreground' : 'text-muted-foreground'
            }`}
          >
            {f.home_display}
          </span>
          {temPlacar && (
            <span className="font-mono text-sm font-bold tabular-nums text-card-foreground">
              {f.goals_home_90}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <Escudo url={f.away_crest} />
          <span
            className={`min-w-0 flex-1 truncate text-[13px] ${
              f.away_is_bolao ? 'font-semibold text-card-foreground' : 'text-muted-foreground'
            }`}
          >
            {f.away_display}
          </span>
          {temPlacar && (
            <span className="font-mono text-sm font-bold tabular-nums text-card-foreground">
              {f.goals_away_90}
            </span>
          )}
        </div>

        {(teveProrrogacao || tevePenaltis || !encerrado) && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {!encerrado && (
              <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--faint))]">
                {STATUS_LABEL[f.status] ?? f.status}
              </span>
            )}
            {teveProrrogacao && (
              <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--faint))]">
                Prorrogação {f.goals_home_extra ?? 0}–{f.goals_away_extra ?? 0}
              </span>
            )}
            {tevePenaltis && (
              <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--faint))]">
                Pênaltis {f.penalties_home}–{f.penalties_away}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ResultadosContent({ fixtures, clubes, ultimaSincronizacao, ligasDasCopas }: ResultadosData) {
  const [clube, setClube] = useState<string>('');
  const [soCopas, setSoCopas] = useState(false);

  const copas = useMemo(() => new Set(ligasDasCopas), [ligasDasCopas]);

  const filtrados = useMemo(() => {
    return fixtures.filter((f) => {
      // Por padrão só interessam jogos de quem está no bolão. O banco guarda
      // também jogos de adversários entre si, que servem ao modelo mas não ao
      // jogador.
      if (!f.home_is_bolao && !f.away_is_bolao) return false;
      if (clube && f.home_team_key !== clube && f.away_team_key !== clube) return false;
      if (soCopas && !(f.league_id !== null && copas.has(f.league_id))) return false;
      return true;
    });
  }, [fixtures, clube, soCopas, copas]);

  // Hoje/amanhã/ontem também em Brasília, pelo mesmo motivo dos rótulos.
  const dias = useMemo<[string, string, string]>(() => {
    const desloca = (offset: number) => {
      const x = new Date();
      x.setUTCDate(x.getUTCDate() + offset);
      return diaEmBrasilia(x);
    };
    return [desloca(0), desloca(1), desloca(-1)];
  }, []);

  const grupos = useMemo(() => {
    const porDia = new Map<string, ClubFixture[]>();
    for (const f of filtrados) {
      const d = diaEmBrasilia(f.kickoff_at);
      if (!porDia.has(d)) porDia.set(d, []);
      porDia.get(d)!.push(f);
    }
    const hoje = dias[0];
    const todos = [...porDia.entries()].map(([dia, itens]) => ({
      dia,
      futuro: dia > hoje,
      itens: itens.sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at)),
    }));

    // Quem abre esta tela quer saber o que JÁ aconteceu — por isso hoje e
    // ontem vêm primeiro, do mais recente para o mais antigo, e só depois a
    // agenda, do mais próximo para o mais distante. Uma ordenação única por
    // data não dá isso: ou enterra o passado, ou inverte a agenda.
    const passado = todos.filter((g) => !g.futuro).sort((a, b) => b.dia.localeCompare(a.dia));
    const futuro = todos.filter((g) => g.futuro).sort((a, b) => a.dia.localeCompare(b.dia));
    return [...passado, ...futuro];
  }, [filtrados, dias]);

  const primeiroFuturo = grupos.find((g) => g.futuro)?.dia;

  return (
    <div>
      {/* ── Filtros ────────────────────────────────────────────────────── */}
      <div className="mb-4 space-y-2">
        <select
          value={clube}
          onChange={(e) => setClube(e.target.value)}
          className="w-full rounded-[12px] border border-border bg-card px-3 py-2.5 text-sm text-card-foreground"
        >
          <option value="">Todos os clubes do bolão</option>
          {clubes.map((c) => (
            <option key={c.teamKey} value={c.teamKey}>
              {c.nome}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setSoCopas((v) => !v)}
          aria-pressed={soCopas}
          className={`w-full rounded-[12px] border px-3 py-2 text-xs font-medium transition-colors ${
            soCopas
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border bg-card text-muted-foreground'
          }`}
        >
          {soCopas ? 'Mostrando só as três copas' : 'Mostrar só as três copas'}
        </button>
      </div>

      {/* ── Lista ──────────────────────────────────────────────────────── */}
      {grupos.length === 0 ? (
        <div className="rounded-[12px] border border-border bg-card px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhum jogo com esses filtros.</p>
          <p className="mt-1 text-xs text-[hsl(var(--faint))]">
            O histórico começa em 31/07/2026 e cresce a cada dia.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map(({ dia, itens }) => (
            <section key={dia}>
              {/* Marca onde o passado termina e a agenda começa. Sem isto, sair
                  de "Ontem" direto para "Amanhã" parece erro de ordenação. */}
              {dia === primeiroFuturo && (
                <div className="mb-3 mt-1 flex items-center gap-2">
                  <span className="h-px flex-1 bg-hairline" />
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--faint))]">
                    Próximos jogos
                  </span>
                  <span className="h-px flex-1 bg-hairline" />
                </div>
              )}
              <h2 className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--faint))]">
                {diaLegivel(itens[0].kickoff_at, dias[0], dias[1], dias[2])}
              </h2>
              <div className="overflow-hidden rounded-[12px] border border-border bg-card">
                {itens.map((f) => (
                  <LinhaJogo key={f.id} f={f} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {ultimaSincronizacao && (
        <p className="mt-6 flex items-center justify-center gap-1.5 font-mono text-[10px] text-[hsl(var(--faint))]">
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Atualizado em {new Date(ultimaSincronizacao).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}
    </div>
  );
}
