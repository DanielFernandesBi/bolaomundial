'use client';

import { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Filter,
  RefreshCw,
  Search,
  Shield,
  Trophy,
  X,
} from 'lucide-react';
import type { ClubeStats, ClubFixture, LigaStats, ResultadosData } from './actions';

// ============================================================================
// Resultados: jogos, times e ligas.
//
// A tela nasceu para uma coisa só — os últimos jogos dos 40 clubes do bolão.
// A coleta cresceu (74 ligas capturadas, centenas de clubes descobertos) e a
// tela precisou crescer junto, em três recortes:
//
//   Jogos — o que aconteceu e o que vem, por dia
//   Times — quem joga bem, ordenável, com retrospecto
//   Ligas — o que estamos guardando, e desde quando
//
// As três compartilham a mesma lista de partidas; o que muda é o recorte.
// Escolher um clube ou uma liga nas outras abas leva de volta para Jogos com o
// recorte aplicado — em vez de abrir uma quarta tela, que teria de repetir
// tudo.
//
// As estatísticas vêm agregadas do banco (estatisticas_clubes,
// estatisticas_ligas) e não do que está carregado aqui: conta feita sobre a
// página é exata só enquanto tudo cabe na página.
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

// ── Peças de estatística ────────────────────────────────────────────────────

const TOM_RESULTADO = {
  V: 'bg-state-open/15 text-state-open',
  E: 'bg-surface-sunken text-muted-foreground',
  D: 'bg-destructive/15 text-destructive',
} as const;

/** Os últimos resultados, do mais recente para o mais antigo. */
function Forma({ ultimos, tamanho = 'md' }: { ultimos: string; tamanho?: 'sm' | 'md' }) {
  if (!ultimos) return <span className="font-mono text-[10px] text-[hsl(var(--faint))]">—</span>;
  const cls = tamanho === 'sm' ? 'h-4 w-4 text-[9px]' : 'h-5 w-5 text-[10px]';
  return (
    <span className="flex items-center gap-1">
      {[...ultimos].map((r, i) => (
        <span
          key={i}
          className={`flex items-center justify-center rounded-full font-mono font-bold ${cls} ${
            TOM_RESULTADO[r as 'V' | 'E' | 'D']
          }`}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

/**
 * Linha de estatística: rótulo à esquerda, valor à direita.
 *
 * Linha e não célula de grade. A versão anterior era uma grade 4×3 de números
 * centralizados, todos do mesmo tamanho — dava um paredão sem hierarquia, em
 * que "1 vitória" e "0,00 gols contra por jogo" competiam pela mesma atenção.
 * Em lista, o olho percorre rótulos e para no que interessa.
 */

// ── Cor por dominância ──────────────────────────────────────────────────────
//
// A régua é sempre a mesma: colore-se o número que MANDA na linha, e o resto
// fica neutro. Pintar tudo não destaca nada, e pintar por valor fixo (verde
// para vitória, vermelho para derrota, sempre) faria um time de 1 vitória e 9
// derrotas parecer bom por causa do verde.
//
// Empate não tem cor própria: ele não é bom nem ruim. Quando domina, ganha só
// o peso do texto.
const VERDE = 'text-state-open';
const VERMELHO = 'text-destructive';
const NEUTRO = 'text-foreground';
const APAGADO = 'text-muted-foreground';

/** Vitórias-empates-derrotas, com destaque no que predomina. */
function VED({ v, e, d }: { v: number; e: number; d: number }) {
  const max = Math.max(v, e, d);
  // Empate numérico entre duas categorias não elege ninguém: não há o que
  // destacar quando 3 vitórias e 3 derrotas convivem.
  const quantosNoMaximo = [v, e, d].filter((x) => x === max).length;
  const manda = (x: number) => quantosNoMaximo === 1 && x === max && max > 0;
  return (
    <span className="tabular-nums">
      <span className={manda(v) ? `${VERDE} font-bold` : APAGADO}>{v}</span>
      <span className="text-[hsl(var(--faint))]">-</span>
      <span className={manda(e) ? `${NEUTRO} font-bold` : APAGADO}>{e}</span>
      <span className="text-[hsl(var(--faint))]">-</span>
      <span className={manda(d) ? `${VERMELHO} font-bold` : APAGADO}>{d}</span>
    </span>
  );
}

/**
 * Dois números que se opõem (feitos × sofridos, viradas × entregues).
 * `bomEhMaior` diz de que lado está a coisa boa.
 */
function Par({
  a,
  b,
  bomEhMaior = true,
  formatar = (x: number) => String(x),
}: {
  a: number;
  b: number;
  bomEhMaior?: boolean;
  formatar?: (x: number) => string;
}) {
  const aMelhor = bomEhMaior ? a > b : a < b;
  const bMelhor = bomEhMaior ? b > a : b < a;
  return (
    <span className="tabular-nums">
      <span className={aMelhor ? `${VERDE} font-bold` : bMelhor ? VERMELHO : APAGADO}>
        {formatar(a)}
      </span>
      <span className="text-[hsl(var(--faint))]"> · </span>
      <span className={bMelhor ? `${VERDE} font-bold` : aMelhor ? VERMELHO : APAGADO}>
        {formatar(b)}
      </span>
    </span>
  );
}

/** Um número só, que é bom ou ruim conforme o sinal. */
function Sinal({ valor, bomEhPositivo = true }: { valor: number; bomEhPositivo?: boolean }) {
  const bom = bomEhPositivo ? valor > 0 : valor < 0;
  const ruim = bomEhPositivo ? valor < 0 : valor > 0;
  return (
    <span className={`tabular-nums ${bom ? `${VERDE} font-bold` : ruim ? VERMELHO : APAGADO}`}>
      {valor > 0 ? '+' : ''}
      {valor}
    </span>
  );
}

/** Contagem em que zero é neutro e qualquer valor acima tem sinal próprio. */
function Contagem({ valor, bom }: { valor: number; bom: boolean }) {
  return (
    <span
      className={`tabular-nums ${valor === 0 ? APAGADO : bom ? `${VERDE} font-bold` : `${VERMELHO} font-bold`}`}
    >
      {valor}
    </span>
  );
}

function Stat({ rotulo, valor, nota }: { rotulo: string; valor: React.ReactNode; nota?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-hairline px-3.5 py-2.5 first:border-t-0">
      <span className="min-w-0 text-[13px] text-muted-foreground">
        {rotulo}
        {nota && <span className="ml-1.5 text-[11px] text-[hsl(var(--faint))]">{nota}</span>}
      </span>
      <span className="flex-shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
        {valor}
      </span>
    </div>
  );
}

function n2(x: number): string {
  return x.toFixed(2).replace('.', ',');
}

function PainelClube({ s }: { s: ClubeStats }) {
  if (s.jogos === 0) {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-[12px] border border-border bg-card px-3.5 py-3">
        <Escudo url={s.crest_url} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{s.nome}</p>
          <p className="text-xs text-muted-foreground">
            Nenhum jogo encerrado ainda. O histórico começa em 31/07/2026.
          </p>
        </div>
      </div>
    );
  }

  const aproveitamento = Math.round(((s.v * 3 + s.e) / (s.jogos * 3)) * 100);
  const saldo = s.gols_pro - s.gols_contra;

  return (
    <div className="mb-4 overflow-hidden rounded-[12px] border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-3.5 py-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <Escudo url={s.crest_url} />
          <span className="truncate text-sm font-semibold text-foreground">{s.nome}</span>
        </span>
        <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">
          {s.jogos} {s.jogos === 1 ? 'jogo' : 'jogos'}
        </span>
      </div>

      {/* Uma linha de destaque, com o número que resume e a forma. O resto vem
          em lista abaixo — hierarquia, e não doze números do mesmo tamanho. */}
      <div className="flex items-end justify-between gap-4 border-b border-hairline px-3.5 py-3.5">
        <div>
          <p className="font-mono text-3xl font-bold leading-none tabular-nums text-foreground">
            {aproveitamento}%
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[hsl(var(--faint))]">
            aproveitamento
          </p>
        </div>
        <div className="text-right">
          <Forma ultimos={s.ultimos} />
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[hsl(var(--faint))]">
            últimos jogos
          </p>
        </div>
      </div>

      <Stat rotulo="Vitórias · empates · derrotas" valor={<VED v={s.v} e={s.e} d={s.d} />} />
      <Stat rotulo="Em casa" valor={<VED v={s.casa_v} e={s.casa_e} d={s.casa_d} />} />
      <Stat rotulo="Fora" valor={<VED v={s.fora_v} e={s.fora_e} d={s.fora_d} />} />
      <Stat rotulo="Gols pró · contra" valor={<Par a={s.gols_pro} b={s.gols_contra} />} />
      <Stat rotulo="Saldo de gols" valor={<Sinal valor={saldo} />} />
      <Stat
        rotulo="Média por jogo"
        nota="pró · contra"
        valor={<Par a={s.gols_pro / s.jogos} b={s.gols_contra / s.jogos} formatar={n2} />}
      />
      <Stat rotulo="Jogos sem sofrer gol" valor={<Contagem valor={s.sem_sofrer} bom />} />
      <Stat rotulo="Jogos sem marcar" valor={<Contagem valor={s.nao_marcou} bom={false} />} />
      {/* O bloco do 1º tempo aparece quando o dado EXISTE, e não quando ele é
          diferente de zero: 0–0 no intervalo é placar, não ausência. */}
      {s.com_intervalo > 0 && (
        <>
          <Stat
            rotulo="Gols no 1º tempo"
            nota="pró · contra"
            valor={<Par a={s.ht_pro} b={s.ht_contra} />}
          />
          <Stat
            rotulo="Viradas · vantagens entregues"
            nota="a partir do intervalo"
            valor={
              <span className="tabular-nums">
                <Contagem valor={s.virou} bom />
                <span className="text-[hsl(var(--faint))]"> · </span>
                <Contagem valor={s.entregou} bom={false} />
              </span>
            }
          />
        </>
      )}
    </div>
  );
}

// ── Aba Times ───────────────────────────────────────────────────────────────

type Ordem = 'jogos' | 'aproveitamento' | 'gols_pro' | 'gols_contra' | 'nome';

const ORDENS: { key: Ordem; rotulo: string }[] = [
  { key: 'jogos', rotulo: 'Jogos' },
  { key: 'aproveitamento', rotulo: 'Aproveit.' },
  { key: 'gols_pro', rotulo: 'Ataque' },
  { key: 'gols_contra', rotulo: 'Defesa' },
  { key: 'nome', rotulo: 'A–Z' },
];

function aproveitamentoDe(s: ClubeStats): number {
  return s.jogos === 0 ? -1 : (s.v * 3 + s.e) / (s.jogos * 3);
}

function AbaTimes({
  stats,
  aoEscolher,
}: {
  stats: ClubeStats[];
  aoEscolher: (id: string) => void;
}) {
  const [ordem, setOrdem] = useState<Ordem>('jogos');
  const [soBolao, setSoBolao] = useState(true);
  const [busca, setBusca] = useState('');

  const lista = useMemo(() => {
    const alvo = busca.trim().toLowerCase();
    const f = stats.filter(
      (s) => (!soBolao || s.is_bolao) && (!alvo || s.nome.toLowerCase().includes(alvo))
    );
    const ordenado = [...f];
    ordenado.sort((a, b) => {
      switch (ordem) {
        case 'nome':
          return a.nome.localeCompare(b.nome, 'pt-BR');
        case 'aproveitamento':
          return aproveitamentoDe(b) - aproveitamentoDe(a) || b.jogos - a.jogos;
        case 'gols_pro':
          // Por MÉDIA, não por total: com amostras de tamanhos diferentes o
          // total premia quem jogou mais, não quem ataca melhor.
          return (
            (b.jogos ? b.gols_pro / b.jogos : -1) - (a.jogos ? a.gols_pro / a.jogos : -1) ||
            b.jogos - a.jogos
          );
        case 'gols_contra':
          return (
            (a.jogos ? a.gols_contra / a.jogos : 99) - (b.jogos ? b.gols_contra / b.jogos : 99) ||
            b.jogos - a.jogos
          );
        default:
          return b.jogos - a.jogos || a.nome.localeCompare(b.nome, 'pt-BR');
      }
    });
    return ordenado;
  }, [stats, ordem, soBolao, busca]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-[12px] border border-border bg-card px-3 py-2.5">
        <Search className="h-4 w-4 flex-shrink-0 text-[hsl(var(--faint))]" aria-hidden="true" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar clube"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-[hsl(var(--faint))] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setSoBolao((v) => !v)}
          aria-pressed={soBolao}
          title={
            soBolao
              ? 'Mostrando só os 40 clubes do bolão'
              : 'Mostrando todo clube que já entrou em campo nas ligas capturadas'
          }
          className={`flex-shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            soBolao
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground'
          }`}
        >
          {soBolao ? 'só bolão' : 'todos'}
        </button>
      </div>

      <div className="mb-3 grid w-full auto-cols-fr grid-flow-col gap-1 rounded-[12px] border border-border bg-card p-1">
        {ORDENS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setOrdem(o.key)}
            aria-pressed={ordem === o.key}
            className={`flex h-8 min-w-0 items-center justify-center rounded-[9px] px-1 text-[11px] font-semibold transition-colors ${
              ordem === o.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="truncate">{o.rotulo}</span>
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="rounded-[12px] border border-border bg-card px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhum clube com esses filtros.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-border bg-card">
          {lista.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => aoEscolher(s.id)}
              className="flex w-full items-center gap-2.5 border-t border-hairline px-3.5 py-2.5 text-left transition-colors first:border-t-0 hover:bg-accent/40"
            >
              <Escudo url={s.crest_url} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{s.nome}</span>
                <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--faint))]">
                  {s.jogos === 0
                    ? 'sem jogos ainda'
                    : `${s.jogos}j · ${s.v}-${s.e}-${s.d} · ${s.gols_pro}:${s.gols_contra}`}
                  {/* Sem rating Opta, o clube tem ficha mas não entra no
                      modelo. Dizer isso evita a pergunta óbvia. */}
                  {!s.mapeado && ' · fora do modelo'}
                </span>
              </span>
              {s.jogos > 0 && (
                <span className="flex flex-shrink-0 items-center gap-2.5">
                  <Forma ultimos={s.ultimos} tamanho="sm" />
                  <span className="w-9 text-right font-mono text-sm font-bold tabular-nums text-foreground">
                    {Math.round(aproveitamentoDe(s) * 100)}%
                  </span>
                </span>
              )}
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-[hsl(var(--faint))]" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Aba Ligas ───────────────────────────────────────────────────────────────

function AbaLigas({ ligas, aoEscolher }: { ligas: LigaStats[]; aoEscolher: (id: number) => void }) {
  const [comJogos, setComJogos] = useState(true);
  const visiveis = comJogos ? ligas.filter((l) => l.jogos > 0) : ligas;
  const totalJogos = ligas.reduce((s, l) => s + l.jogos, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-border bg-card px-3.5 py-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground">{ligas.length} competições</strong> na lista de
          captura, <strong className="text-foreground">{totalJogos} jogos</strong> guardados. Só
          acumulamos daqui para a frente — o plano da API não permite buscar data passada.
        </p>
        <button
          type="button"
          onClick={() => setComJogos((v) => !v)}
          aria-pressed={comJogos}
          className={`flex-shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            comJogos
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border text-muted-foreground'
          }`}
        >
          {comJogos ? 'com jogos' : 'todas'}
        </button>
      </div>

      <div className="overflow-hidden rounded-[12px] border border-border bg-card">
        {visiveis.map((l) => (
          <button
            key={l.league_id}
            type="button"
            onClick={() => aoEscolher(l.league_id)}
            disabled={l.jogos === 0}
            className="flex w-full items-center gap-2.5 border-t border-hairline px-3.5 py-2.5 text-left transition-colors first:border-t-0 hover:bg-accent/40 disabled:cursor-default disabled:opacity-60"
          >
            <Escudo url={l.logo_url} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">{l.nome}</span>
              <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--faint))]">
                {l.pais ?? '—'}
                {l.jogos > 0 && ` · ${l.jogos}j · ${l.clubes} clubes`}
                {l.media_gols !== null && ` · ${n2(l.media_gols)} gols/jogo`}
              </span>
            </span>
            {/* Peso zero não é desprezo: é a ausência de rating Opta para a
                região. Vale dizer na tela, senão parece liga de segunda. */}
            {l.model_weight === 0 && (
              <span className="flex-shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--faint))]">
                só histórico
              </span>
            )}
            {l.jogos > 0 && (
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-[hsl(var(--faint))]" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Tela ────────────────────────────────────────────────────────────────────

type Aba = 'jogos' | 'times' | 'ligas';

const ABAS: { key: Aba; rotulo: string; icone: typeof CalendarDays }[] = [
  { key: 'jogos', rotulo: 'Jogos', icone: CalendarDays },
  { key: 'times', rotulo: 'Times', icone: Shield },
  { key: 'ligas', rotulo: 'Ligas', icone: Trophy },
];

export function ResultadosContent({
  fixtures,
  clubes,
  stats,
  ligas,
  ultimaSincronizacao,
  ligasDasCopas,
}: ResultadosData) {
  const [aba, setAba] = useState<Aba>('jogos');
  const [clube, setClube] = useState<string>('');
  const [liga, setLiga] = useState<number | null>(null);
  const [soCopas, setSoCopas] = useState(false);

  const copas = useMemo(() => new Set(ligasDasCopas), [ligasDasCopas]);

  const filtrados = useMemo(() => {
    return fixtures.filter((f) => {
      // Com um filtro explícito ligado, ele manda. Sem nenhum, a tela volta ao
      // recorte original: só jogos de quem está no bolão. O banco guarda
      // também as ligas capturadas inteiras, que servem à aba Ligas e ao
      // histórico, mas encheriam esta lista de jogo que ninguém pediu.
      if (liga !== null) return f.league_id === liga;
      if (clube) {
        // Time do mapa casa pela chave; time descoberto pela captura só tem o
        // ID da API, então é por ele que a partida é encontrada.
        const s = stats.find((x) => x.id === clube);
        if (!s) return false;
        return s.team_key
          ? f.home_team_key === s.team_key || f.away_team_key === s.team_key
          : f.home_provider_id === s.provider_id || f.away_provider_id === s.provider_id;
      }
      if (!f.home_is_bolao && !f.away_is_bolao) return false;
      if (soCopas && !(f.league_id !== null && copas.has(f.league_id))) return false;
      return true;
    });
  }, [fixtures, clube, liga, soCopas, copas, stats]);

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
  const statsDoClube = clube ? stats.find((s) => s.id === clube) : undefined;
  const ligaAberta = liga !== null ? ligas.find((l) => l.league_id === liga) : undefined;

  /** Escolher na aba Times/Ligas leva para os jogos daquele recorte. */
  function abrirClube(id: string) {
    setClube(id);
    setLiga(null);
    setAba('jogos');
  }
  function abrirLiga(id: number) {
    setLiga(id);
    setClube('');
    setAba('jogos');
  }
  function limparRecorte() {
    setClube('');
    setLiga(null);
  }

  return (
    <div>
      {/* Abas, no padrão de Partidas e Ranking. */}
      <div className="mb-4 grid w-full auto-cols-fr grid-flow-col gap-1 rounded-[12px] border border-border bg-card p-1">
        {ABAS.map(({ key, rotulo, icone: Icone }) => (
          <button
            key={key}
            type="button"
            onClick={() => setAba(key)}
            aria-pressed={aba === key}
            className={`flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-[9px] px-2 text-xs font-semibold transition-colors ${
              aba === key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icone className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{rotulo}</span>
          </button>
        ))}
      </div>

      {aba === 'times' && <AbaTimes stats={stats} aoEscolher={abrirClube} />}
      {aba === 'ligas' && <AbaLigas ligas={ligas} aoEscolher={abrirLiga} />}

      {aba === 'jogos' && (
        <>
          {/* Recorte ativo, com saída à mão. Sem isto, quem chega pela aba
              Times não entende por que a lista encolheu. */}
          {(clube || liga !== null) && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-[12px] border border-primary/40 bg-primary/10 px-3.5 py-2.5">
              <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                {ligaAberta ? ligaAberta.nome : (statsDoClube?.nome ?? clube)}
              </span>
              <button
                type="button"
                onClick={limparRecorte}
                className="flex flex-shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-primary"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                limpar
              </button>
            </div>
          )}

          {/* Os filtros gerais só fazem sentido sem recorte: com um clube ou
              uma liga escolhida, eles brigariam com a escolha. */}
          {!clube && liga === null && (
            <>
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

              {/* São 40 clubes: chip para cada um não cabe, e o `select` nativo
                  é o controle certo. O que faltava era ele PARECER parte do
                  app — appearance-none mais rótulo e seta desenhados. */}
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
            </>
          )}

          {statsDoClube && <PainelClube s={statsDoClube} />}

          {ligaAberta && (
            <div className="mb-4 overflow-hidden rounded-[12px] border border-border bg-card">
              <div className="flex items-center gap-2.5 border-b border-hairline px-3.5 py-3">
                <Escudo url={ligaAberta.logo_url} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {ligaAberta.nome}
                  </span>
                  <span className="block font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--faint))]">
                    {ligaAberta.pais ?? '—'} · {ligaAberta.clubes} clubes
                  </span>
                </span>
              </div>
              <Stat rotulo="Jogos guardados" nota="encerrados · agendados" valor={`${ligaAberta.encerrados} · ${ligaAberta.agendados}`} />
              {ligaAberta.media_gols !== null && (
                <Stat rotulo="Gols por jogo" valor={n2(ligaAberta.media_gols)} />
              )}
              {ligaAberta.encerrados > 0 && (
                <Stat
                  rotulo="Casa · empate · fora"
                  nota="quem venceu"
                  valor={`${ligaAberta.vitorias_casa} · ${ligaAberta.empates} · ${ligaAberta.vitorias_fora}`}
                />
              )}
            </div>
          )}

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
                  {/* Marca onde o passado termina e a agenda começa. Sem isto,
                      sair de "Ontem" direto para "Amanhã" parece erro. */}
                  {dia === primeiroFuturo && (
                    <div className="mb-3 mt-1 flex items-center gap-2">
                      <span className="h-px flex-1 bg-hairline" />
                      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--faint))]">
                        Próximos jogos
                      </span>
                      <span className="h-px flex-1 bg-hairline" />
                    </div>
                  )}
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
        </>
      )}

      {ultimaSincronizacao && (
        <p className="mt-6 flex items-center justify-center gap-1.5 font-mono text-[10px] text-[hsl(var(--faint))]">
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Atualizado em{' '}
          {new Date(ultimaSincronizacao).toLocaleString('pt-BR', {
            timeZone: FUSO,
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
