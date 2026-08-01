'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Filter, RefreshCw, Shield } from 'lucide-react';
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
  // 28px e não 24: com o escudo pequeno demais o time vira texto com um ponto
  // colorido do lado, e a lista perde o que ela tem de melhor de ler rápido.

  // <img> e não next/image: são URLs de terceiros, cadastradas pelo admin, e
  // podem apontar para qualquer host. next/image exigiria cada host em
  // remotePatterns — hoje só flagcdn, supabase e wikimedia estão lá, e os
  // escudos incluem espncdn. É a mesma escolha de podium-card e
  // competition-filter, pelo mesmo motivo.
  if (!url || falhou) {
    return (
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-sunken">
        <Shield className="h-3.5 w-3.5 text-[hsl(var(--faint))]" aria-hidden="true" />
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
      className="h-7 w-7 flex-shrink-0 object-contain"
    />
  );
}

/** Status que significam bola rolando. */
const AO_VIVO = new Set(['1H', 'HT', '2H', 'ET', 'P']);
/** Status que significam que o jogo não vai acontecer como marcado. */
const PROBLEMA = new Set(['PST', 'CANC', 'ABD', 'SUSP', 'TBD']);

/**
 * Pílula de estado, no mesmo desenho da que o match-card usa em Partidas:
 * ponto + rótulo, arredondada, cor por estado.
 */
function Estado({ status }: { status: string }) {
  const rotulo = STATUS_LABEL[status] ?? status;
  const tom = AO_VIVO.has(status)
    ? 'text-state-urgent bg-state-urgent/15'
    : PROBLEMA.has(status)
      ? 'text-destructive bg-destructive/10'
      : ENCERRADOS.has(status)
        ? 'text-muted-foreground bg-surface-sunken'
        : 'text-state-open bg-state-open/10';
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-[9px] py-[3px] text-[11px] font-semibold ${tom}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full bg-current ${AO_VIVO.has(status) ? 'animate-pulse' : ''}`}
        aria-hidden="true"
      />
      {rotulo}
    </span>
  );
}

/** Um lado do confronto. */
function Lado({
  nome,
  escudo,
  gols,
  ehBolao,
  venceu,
  temPlacar,
}: {
  nome: string;
  escudo: string | null;
  gols: number | null;
  ehBolao: boolean;
  venceu: boolean;
  temPlacar: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Escudo url={escudo} />
      {/* Duas ênfases diferentes, de propósito, porque são duas informações
          diferentes: o NOME em destaque diz "este é clube do bolão" — que é o
          assunto da tela —, e o PLACAR em destaque diz quem venceu. */}
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          ehBolao ? 'font-semibold text-foreground' : 'text-muted-foreground'
        }`}
      >
        {nome}
      </span>
      {temPlacar && (
        <span
          className={`w-5 flex-shrink-0 text-right font-mono text-base tabular-nums ${
            venceu ? 'font-bold text-foreground' : 'font-medium text-muted-foreground'
          }`}
        >
          {gols}
        </span>
      )}
    </div>
  );
}

function LinhaJogo({ f }: { f: ClubFixture }) {
  const temPlacar = f.goals_home_90 !== null && f.goals_away_90 !== null;

  // Prorrogação e pênaltis vivem SEPARADOS do tempo regulamentar no banco. O
  // placar grande é sempre o de 90 minutos; o desempate vira etiqueta, senão
  // um 1x1 decidido nos pênaltis viraria "2x1" e mentiria sobre o jogo.
  const teveProrrogacao = f.goals_home_extra !== null || f.goals_away_extra !== null;
  const tevePenaltis = f.penalties_home !== null && f.penalties_away !== null;

  // Quem venceu, contando o desempate: um 1–1 decidido nos pênaltis tem
  // vencedor, e marcar só o placar de 90 minutos esconderia isso.
  const somaCasa = (f.goals_home_90 ?? 0) + (f.goals_home_extra ?? 0);
  const somaFora = (f.goals_away_90 ?? 0) + (f.goals_away_extra ?? 0);
  const venceuCasa =
    temPlacar &&
    (somaCasa !== somaFora
      ? somaCasa > somaFora
      : tevePenaltis && (f.penalties_home ?? 0) > (f.penalties_away ?? 0));
  const venceuFora =
    temPlacar &&
    (somaCasa !== somaFora
      ? somaFora > somaCasa
      : tevePenaltis && (f.penalties_away ?? 0) > (f.penalties_home ?? 0));

  return (
    <div className="border-t border-hairline px-3.5 py-3 first:border-t-0">
      {/* Linha de contexto, no mesmo desenho do topo do card de Partidas:
          metadado à esquerda em mono, estado à direita. A competição estava
          faltando — sem ela não dá para saber se "Coritiba x Cruzeiro" é
          Brasileirão ou Copa do Brasil. */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">
          {hora(f.kickoff_at)}
          {f.league_name ? ` · ${f.league_name}` : ''}
        </span>
        <Estado status={f.status} />
      </div>

      <div className="space-y-1.5">
        <Lado
          nome={f.home_display}
          escudo={f.home_crest}
          gols={f.goals_home_90}
          ehBolao={f.home_is_bolao}
          venceu={venceuCasa}
          temPlacar={temPlacar}
        />
        <Lado
          nome={f.away_display}
          escudo={f.away_crest}
          gols={f.goals_away_90}
          ehBolao={f.away_is_bolao}
          venceu={venceuFora}
          temPlacar={temPlacar}
        />
      </div>

      {(teveProrrogacao || tevePenaltis) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {teveProrrogacao && (
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--faint))]">
              Prorrogação {f.goals_home_extra ?? 0}–{f.goals_away_extra ?? 0}
            </span>
          )}
          {tevePenaltis && (
            <span className="rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--faint))]">
              Pênaltis {f.penalties_home}–{f.penalties_away}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Retrospecto de um clube ─────────────────────────────────────────────────
//
// Tudo aqui sai de club_fixtures, que é o que a sincronização já traz. Nenhuma
// chamada nova à API.
//
// Convenção de vitória: vale o placar do tempo normal mais a prorrogação. Jogo
// decidido nos PÊNALTIS conta como EMPATE — é a convenção da FIFA e da CBF, e
// o contrário inflaria a vitória de quem só ganhou na loteria. Quem quiser
// saber quem passou de fase tem a etiqueta na linha do jogo.
interface Retrospecto {
  jogos: number;
  v: number;
  e: number;
  d: number;
  golsPro: number;
  golsContra: number;
  semSofrer: number;
  casa: { v: number; e: number; d: number };
  fora: { v: number; e: number; d: number };
  /** Do mais recente para o mais antigo, no máximo 5. */
  ultimos: { r: 'V' | 'E' | 'D'; rotulo: string }[];
}

function calcularRetrospecto(fixtures: ClubFixture[], teamKey: string): Retrospecto | null {
  const jogos = fixtures
    .filter(
      (f) =>
        ENCERRADOS.has(f.status) &&
        f.goals_home_90 !== null &&
        f.goals_away_90 !== null &&
        (f.home_team_key === teamKey || f.away_team_key === teamKey)
    )
    .sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at));

  if (jogos.length === 0) return null;

  const r: Retrospecto = {
    jogos: jogos.length,
    v: 0,
    e: 0,
    d: 0,
    golsPro: 0,
    golsContra: 0,
    semSofrer: 0,
    casa: { v: 0, e: 0, d: 0 },
    fora: { v: 0, e: 0, d: 0 },
    ultimos: [],
  };

  for (const f of jogos) {
    const emCasa = f.home_team_key === teamKey;
    const meus = (emCasa ? f.goals_home_90 : f.goals_away_90) ?? 0;
    const deles = (emCasa ? f.goals_away_90 : f.goals_home_90) ?? 0;
    const meusExtra = (emCasa ? f.goals_home_extra : f.goals_away_extra) ?? 0;
    const delesExtra = (emCasa ? f.goals_away_extra : f.goals_home_extra) ?? 0;

    const total = meus + meusExtra;
    const totalDeles = deles + delesExtra;
    const res: 'V' | 'E' | 'D' = total > totalDeles ? 'V' : total < totalDeles ? 'D' : 'E';

    r[res === 'V' ? 'v' : res === 'E' ? 'e' : 'd']++;
    (emCasa ? r.casa : r.fora)[res === 'V' ? 'v' : res === 'E' ? 'e' : 'd']++;
    r.golsPro += total;
    r.golsContra += totalDeles;
    if (totalDeles === 0) r.semSofrer++;

    if (r.ultimos.length < 5) {
      const adv = emCasa ? f.away_display : f.home_display;
      r.ultimos.push({ r: res, rotulo: `${emCasa ? '' : 'fora · '}${adv} ${total}–${totalDeles}` });
    }
  }
  return r;
}

const TOM_RESULTADO = {
  V: 'bg-state-open/15 text-state-open',
  E: 'bg-surface-sunken text-muted-foreground',
  D: 'bg-destructive/15 text-destructive',
} as const;

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div>
      <p className="font-mono text-lg font-bold tabular-nums text-foreground">{valor}</p>
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[hsl(var(--faint))]">
        {rotulo}
      </p>
    </div>
  );
}

function PainelClube({
  nome,
  escudo,
  r,
}: {
  nome: string;
  escudo: string | null;
  r: Retrospecto | null;
}) {
  if (!r) {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-[12px] border border-border bg-card px-3.5 py-3">
        <Escudo url={escudo} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{nome}</p>
          <p className="text-xs text-muted-foreground">
            Nenhum jogo encerrado ainda. O histórico começa em 31/07/2026.
          </p>
        </div>
      </div>
    );
  }

  const media = (n: number) => (n / r.jogos).toFixed(2).replace('.', ',');
  const saldo = r.golsPro - r.golsContra;
  // Aproveitamento: pontos conquistados sobre pontos disputados. É a métrica
  // que o torcedor brasileiro lê sem precisar de legenda.
  const aproveitamento = Math.round(((r.v * 3 + r.e) / (r.jogos * 3)) * 100);

  return (
    <div className="mb-4 overflow-hidden rounded-[12px] border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-3.5 py-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <Escudo url={escudo} />
          <span className="truncate text-sm font-semibold text-foreground">{nome}</span>
        </span>
        <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">
          {r.jogos} {r.jogos === 1 ? 'jogo' : 'jogos'} desde 31/07
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 px-3.5 py-3">
        <Numero valor={String(r.v)} rotulo="vitórias" />
        <Numero valor={String(r.e)} rotulo="empates" />
        <Numero valor={String(r.d)} rotulo="derrotas" />
        <Numero valor={`${aproveitamento}%`} rotulo="aproveit." />
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-hairline px-3.5 py-3">
        <Numero valor={String(r.golsPro)} rotulo="gols pró" />
        <Numero valor={String(r.golsContra)} rotulo="gols contra" />
        <Numero valor={`${saldo > 0 ? '+' : ''}${saldo}`} rotulo="saldo" />
        <Numero valor={String(r.semSofrer)} rotulo="sem sofrer" />
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-hairline px-3.5 py-3">
        <Numero valor={media(r.golsPro)} rotulo="gols pró / jogo" />
        <Numero valor={media(r.golsContra)} rotulo="gols contra / jogo" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-3.5 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--faint))]">
          casa {r.casa.v}-{r.casa.e}-{r.casa.d} · fora {r.fora.v}-{r.fora.e}-{r.fora.d}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--faint))]">
            últimos
          </span>
          {r.ultimos.map((u, i) => (
            <span
              key={i}
              title={u.rotulo}
              className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-bold ${TOM_RESULTADO[u.r]}`}
            >
              {u.r}
            </span>
          ))}
        </span>
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

  // Retrospecto do clube escolhido. Sai de TODOS os jogos dele, e não de
  // `filtrados` — o filtro "só as copas" muda o que a lista mostra, não o que
  // o clube fez.
  const selecionado = clubes.find((c) => c.teamKey === clube);
  const retrospecto = useMemo(
    () => (clube ? calcularRetrospecto(fixtures, clube) : null),
    [fixtures, clube]
  );

  return (
    <div>
      {/* ── Filtros ────────────────────────────────────────────────────── */}
      {/* Segmentado como o resto do app (Partidas, Ranking, Admin): faixa em
          grid, uma coluna por opção, ativa em `primary`. O botão de largura
          inteira que ficava aqui não existia em nenhuma outra tela. */}
      <div className="mb-3 grid w-full auto-cols-fr grid-flow-col gap-1 rounded-[12px] border border-border bg-card p-1">
        {[
          { valor: false, rotulo: 'Todas as competições' },
          { valor: true, rotulo: 'Só as três copas' },
        ].map((op) => (
          <button
            key={String(op.valor)}
            type="button"
            onClick={() => setSoCopas(op.valor)}
            aria-pressed={soCopas === op.valor}
            className={`flex h-9 min-w-0 items-center justify-center rounded-[9px] px-2 text-xs font-semibold transition-colors ${
              soCopas === op.valor
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="truncate">{op.rotulo}</span>
          </button>
        ))}
      </div>

      {/* São 40 clubes: chip para cada um não cabe, e o `select` nativo é o
          controle certo. O que faltava era ele PARECER parte do app —
          `appearance-none` mais rótulo e seta desenhados por nós. */}
      <label className="mb-4 flex items-center gap-3 rounded-[12px] border border-border bg-card px-3 py-2.5">
        <Filter className="h-4 w-4 flex-shrink-0 text-[hsl(var(--faint))]" aria-hidden="true" />
        <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--faint))]">
          Clube
        </span>
        <span className="relative min-w-0 flex-1">
          <select
            value={clube}
            onChange={(e) => setClube(e.target.value)}
            className="w-full cursor-pointer appearance-none truncate bg-transparent pr-6 text-right text-sm font-semibold text-foreground focus:outline-none"
          >
            <option value="">Todos do bolão</option>
            {clubes.map((c) => (
              <option key={c.teamKey} value={c.teamKey}>
                {c.nome}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--faint))]"
            aria-hidden="true"
          />
        </span>
      </label>

      {/* ── Retrospecto do clube escolhido ─────────────────────────────── */}
      {selecionado && (
        <PainelClube nome={selecionado.nome} escudo={selecionado.crest} r={retrospecto} />
      )}

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
              {/* Dia à esquerda, contagem à direita — o mesmo cabeçalho de
                  seção usado em Partidas ("COPA DO BRASIL · 16 jogos"). */}
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--faint))]">
                  {diaLegivel(itens[0].kickoff_at, dias[0], dias[1], dias[2])}
                </h2>
                <span className="font-mono text-[10px] tabular-nums text-[hsl(var(--faint))]">
                  {itens.length} {itens.length === 1 ? 'jogo' : 'jogos'}
                </span>
              </div>
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
