'use client';

import { useState } from 'react';
import { ArrowDown, Info, Medal, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { COMPETITIONS, competitionName } from '@/lib/competitions';
import type { PoolPlayerResult } from '@/lib/club-model';
import type { ProjecaoData, TieProjecao, TituloClube } from './actions';

// ============================================================================
// Projeção do bolão de clubes.
//
// O formato segue o simulador do Mundial — quem leva a taça, os destaques e o
// ranking projetado com seletor de métrica —, porque era o que os jogadores já
// sabiam ler. O que muda é o conteúdo: aqui são três competições em vez de
// uma, o pódio é por competição e a chance de título de um clube sai do
// chaveamento inteiro, não de um confronto isolado.
//
// Não há métrica "Zona (Z4)": neste bolão premiam-se três lugares e jogam sete
// pessoas — uma zona de quatro não descreveria nada.
//
// A decisão de produto que se mantém: NÃO exibir um número sozinho. Os 40
// clubes têm desvio-padrão de 3,35 pontos no Opta — são muito parecidos — e o
// modelo começou a acumular evidência há pouco. "53%" sozinho passaria uma
// confiança que o dado não sustenta, então cada número vem com a faixa dele.
// ============================================================================

type Metrica = 'campeao' | 'podio' | 'lanterna';

const METRICAS: {
  key: Metrica;
  label: string;
  icon: typeof Trophy;
  campo: keyof PoolPlayerResult;
  cor: string;
}[] = [
  { key: 'campeao', label: 'Campeão', icon: Trophy, campo: 'titleChance', cor: 'text-primary' },
  { key: 'podio', label: 'Pódio', icon: Medal, campo: 'top3Chance', cor: 'text-state-open' },
  { key: 'lanterna', label: 'Lanterna', icon: ArrowDown, campo: 'lastChance', cor: 'text-destructive' },
];

function pct(v: number): string {
  if (v <= 0) return '0%';
  if (v < 0.01) return '<1%';
  return `${Math.round(v * 100)}%`;
}

function iniciais(nome: string): string {
  return nome
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** Barra de proporção. `valor` é 0–1. */
function Barra({ valor, cor = 'bg-primary' }: { valor: number; cor?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
      <div className={`h-full ${cor}`} style={{ width: `${Math.max(valor * 100, valor > 0 ? 2 : 0)}%` }} />
    </div>
  );
}

function Escudo({ src, nome, tamanho = 20 }: { src: string | null; nome: string; tamanho?: number }) {
  if (!src) {
    return (
      <span
        className="flex flex-shrink-0 items-center justify-center rounded-full bg-surface-sunken font-mono text-[9px] text-[hsl(var(--faint))]"
        style={{ width: tamanho, height: tamanho }}
        aria-hidden="true"
      >
        {iniciais(nome)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="flex-shrink-0 object-contain"
      style={{ width: tamanho, height: tamanho }}
    />
  );
}

/** Cabeçalho de seção, no mesmo peso das outras telas do bolão. */
function Secao({ icon: Icon, children }: { icon: typeof Trophy; children: React.ReactNode }) {
  return (
    <h2 className="mb-2 flex items-center gap-2 text-[15px] font-bold text-foreground">
      <Icon className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
      {children}
    </h2>
  );
}

// ── Quem leva a taça ────────────────────────────────────────────────────────
const VISIVEIS = 8;

function Titulos({ itens }: { itens: TituloClube[] }) {
  const [abertas, setAbertas] = useState<string[]>([]);

  const grupos = COMPETITIONS.map((c) => ({
    key: c.key as string,
    nome: c.name,
    clubes: itens.filter((t) => t.competition === c.key),
  })).filter((g) => g.clubes.length > 0);

  const outros = itens.filter((t) => !COMPETITIONS.some((c) => c.key === t.competition));
  if (outros.length) grupos.push({ key: 'outros', nome: 'Outros', clubes: outros });

  if (grupos.length === 0) return null;

  return (
    <section className="mb-6">
      <Secao icon={Trophy}>Quem leva a taça?</Secao>
      <div className="space-y-3">
        {grupos.map((g) => {
          const aberta = abertas.includes(g.key);
          const mostrar = aberta ? g.clubes : g.clubes.slice(0, VISIVEIS);
          return (
            <div key={g.key} className="rounded-[12px] border border-border bg-card px-3 py-3">
              <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--faint))]">
                {g.nome}
              </p>
              <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {mostrar.map((t) => (
                  <div key={t.team}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <Escudo src={t.crest} nome={t.team} />
                        <span className="truncate text-[13px] text-card-foreground">{t.team}</span>
                      </span>
                      <span className="flex-shrink-0 font-mono text-[13px] font-bold tabular-nums text-primary">
                        {pct(t.chance)}
                      </span>
                    </div>
                    <Barra valor={t.chance} />
                  </div>
                ))}
              </div>
              {g.clubes.length > VISIVEIS && (
                <button
                  type="button"
                  onClick={() => setAbertas((a) => (aberta ? a.filter((k) => k !== g.key) : [...a, g.key]))}
                  className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-primary"
                >
                  {aberta ? 'mostrar menos' : `mostrar os ${g.clubes.length}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Destaques ───────────────────────────────────────────────────────────────
function Destaque({
  icon: Icon,
  titulo,
  jogador,
  valor,
  cor,
}: {
  icon: typeof Trophy;
  titulo: string;
  jogador: PoolPlayerResult | undefined;
  valor: string;
  cor: string;
}) {
  return (
    <div className="rounded-[12px] border border-border bg-card px-3 py-3">
      <div className="mb-2.5 flex items-center gap-2">
        <Icon className={`h-4 w-4 flex-shrink-0 ${cor}`} aria-hidden="true" />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--faint))]">
          {titulo}
        </span>
      </div>
      {jogador ? (
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7 flex-shrink-0 border border-border">
            <AvatarImage src={jogador.avatarUrl || undefined} />
            <AvatarFallback className="bg-surface-sunken text-[10px] text-foreground">
              {iniciais(jogador.username)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-card-foreground">
            {jogador.username}
          </span>
          <span className={`flex-shrink-0 font-mono text-sm font-bold tabular-nums ${cor}`}>{valor}</span>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">—</span>
      )}
    </div>
  );
}

// ── Ranking projetado ───────────────────────────────────────────────────────
function RankingProjetado({
  r,
  palpitesEmAberto,
  palpitesDePodio,
}: {
  r: NonNullable<ProjecaoData['ranking']>;
  palpitesEmAberto: number;
  palpitesDePodio: number;
}) {
  const [metrica, setMetrica] = useState<Metrica>('campeao');
  const ativa = METRICAS.find((m) => m.key === metrica)!;

  const ordenados = [...r.players].sort((a, b) => {
    const va = a[ativa.campo] as number;
    const vb = b[ativa.campo] as number;
    return vb - va || b.meanPoints - a.meanPoints;
  });

  const favTitulo = [...r.players].sort((a, b) => b.titleChance - a.titleChance)[0];
  const favLanterna = [...r.players].sort((a, b) => b.lastChance - a.lastChance)[0];
  const maisPontos = [...r.players].sort((a, b) => b.meanPoints - a.meanPoints)[0];

  return (
    <section className="mb-6">
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Destaque
          icon={Trophy}
          titulo="Favorito ao título"
          jogador={favTitulo}
          valor={favTitulo ? pct(favTitulo.titleChance) : '—'}
          cor="text-primary"
        />
        <Destaque
          icon={Sparkles}
          titulo="Maior pontuação projetada"
          jogador={maisPontos}
          valor={maisPontos ? `${Math.round(maisPontos.meanPoints)} pts` : '—'}
          cor="text-state-open"
        />
        <Destaque
          icon={ArrowDown}
          titulo="Risco de lanterna"
          jogador={favLanterna}
          valor={favLanterna ? pct(favLanterna.lastChance) : '—'}
          cor="text-destructive"
        />
      </div>

      <Secao icon={TrendingUp}>Ranking projetado dos jogadores</Secao>

      {/* Seletor de métrica em grid: no celular ele não rola de lado. */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        {METRICAS.map((m) => {
          const Icon = m.icon;
          const ativo = m.key === metrica;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetrica(m.key)}
              className={`flex items-center justify-center gap-1.5 rounded-[9px] border px-2 py-2 text-xs font-semibold transition-colors ${
                ativo
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-muted-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {ordenados.map((p, i) => {
          const valor = p[ativa.campo] as number;
          const delta = Math.round(p.meanPoints - p.basePoints);
          return (
            <div key={p.userId} className="rounded-[12px] border border-border bg-card px-3 py-3">
              <div className="flex items-center gap-2.5">
                <span className="w-5 flex-shrink-0 text-center font-mono text-xs font-bold tabular-nums text-[hsl(var(--faint))]">
                  {i + 1}º
                </span>
                <Avatar className="h-9 w-9 flex-shrink-0 border border-border">
                  <AvatarImage src={p.avatarUrl || undefined} />
                  <AvatarFallback className="bg-surface-sunken text-[11px] text-foreground">
                    {iniciais(p.username)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-card-foreground">
                      {p.username}
                    </span>
                    <span className={`flex-shrink-0 font-mono text-sm font-bold tabular-nums ${ativa.cor}`}>
                      {pct(valor)}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Barra valor={valor} />
                  </div>
                </div>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                Projeção: <strong className="text-card-foreground">{Math.round(p.meanPoints)} pts</strong>{' '}
                <span className="text-[hsl(var(--faint))]">
                  (hoje {p.basePoints} · {delta >= 0 ? `+${delta}` : delta} · faixa {Math.round(p.p5)}–
                  {Math.round(p.p95)})
                </span>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px]">
                {METRICAS.map((m) => (
                  <span key={m.key} className={m.cor}>
                    {m.label} {pct(p[m.campo] as number)}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[hsl(var(--faint))]">
        {r.scenarios.toLocaleString('pt-BR')} cenários · {palpitesEmAberto} palpites em aberto ·{' '}
        {palpitesDePodio} palpites de pódio
      </p>
    </section>
  );
}

// ── Chance de classificação ─────────────────────────────────────────────────
function Confronto({ t }: { t: TieProjecao }) {
  const favorito = t.advance >= 0.5;
  const nomeFav = favorito ? t.homeName : t.awayName;
  const pFav = favorito ? t.advance : 1 - t.advance;
  const loFav = favorito ? t.low : 1 - t.high;
  const hiFav = favorito ? t.high : 1 - t.low;

  return (
    <div className="border-t border-hairline px-3 py-3 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-card-foreground">
          <Escudo src={t.homeCrest} nome={t.homeName} tamanho={16} />
          <span className={`truncate ${favorito ? 'font-semibold' : ''}`}>{t.homeName}</span>
          <span className="flex-shrink-0 text-[hsl(var(--faint))]">×</span>
          <Escudo src={t.awayCrest} nome={t.awayName} tamanho={16} />
          <span className={`truncate ${!favorito ? 'font-semibold' : ''}`}>{t.awayName}</span>
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

export function ProjecaoContent({
  ties,
  titulosClube,
  ranking,
  matchesUsed,
  clubsFitted,
  modelVersion,
  jogosEncerrados,
  jogosEmAberto,
  palpitesEmAberto,
  palpitesDePodio,
}: ProjecaoData) {
  const porCompeticao = COMPETITIONS.map((c) => ({
    key: c.key as string,
    nome: c.name,
    itens: ties.filter((t) => t.competition === c.key),
  })).filter((g) => g.itens.length > 0);

  const outros = ties.filter((t) => !COMPETITIONS.some((c) => c.key === t.competition));
  if (outros.length) porCompeticao.push({ key: 'outros', nome: 'Outros', itens: outros });

  return (
    <div>
      {/* O aviso vem ANTES dos números, não em rodapé. Quem lê "53%" precisa
          saber, na mesma tela, de quanta evidência esse 53% saiu. */}
      <div className="mb-5 flex gap-2.5 rounded-[12px] border border-border bg-card px-3 py-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[hsl(var(--faint))]" aria-hidden="true" />
        <div className="min-w-0 text-xs leading-relaxed text-muted-foreground">
          Simulação das três chaves inteiras (ida e volta → prorrogação → pênaltis) até cada final, com a
          força dos clubes vinda do <strong className="text-card-foreground">Opta</strong> mais os jogos
          oficiais posteriores. Os palpites de todos são pontuados contra o mesmo cenário sorteado, e o pódio
          entra por competição. Os 40 clubes são muito parecidos entre si — por isso quase todo confronto fica
          perto de 50%.
          <span className="mt-1.5 block font-mono text-[10px] text-[hsl(var(--faint))]">
            {matchesUsed} {matchesUsed === 1 ? 'jogo oficial' : 'jogos oficiais'} desde 31/07 ·{' '}
            {clubsFitted} clubes · {jogosEncerrados} de {jogosEncerrados + jogosEmAberto} jogos do bolão
            encerrados · {modelVersion}
          </span>
        </div>
      </div>

      {ranking && (
        <RankingProjetado
          r={ranking}
          palpitesEmAberto={palpitesEmAberto}
          palpitesDePodio={palpitesDePodio}
        />
      )}

      <Titulos itens={titulosClube} />

      <Secao icon={Medal}>Chance de classificação</Secao>
      <div className="space-y-4">
        {porCompeticao.map((g) => (
          <section key={g.key}>
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--faint))]">
              {competitionName(g.key) || g.nome}
            </p>
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
