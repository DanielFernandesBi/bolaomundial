'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  Eye,
  Layers,
  MonitorSmartphone,
  Users,
} from 'lucide-react';
import { getUso, type UsoDados } from './actions';

// ============================================================================
// Painel de uso.
//
// Tudo que está aqui sai das funções uso_* — nenhuma conta é refeita no
// cliente, porque uma conta em dois lugares vira dois números diferentes na
// primeira vez que alguém mexer num só.
//
// O que cada número significa, já que nem todos são óbvios:
//
//   sessão      — uma visita. Morre quando a aba fecha (sessionStorage), então
//                 abrir o app de manhã e de novo à noite são duas.
//   duração     — soma dos trechos em que a aba esteve à VISTA. Aba minimizada
//                 ou celular no bolso não contam; a média ignora sessões de
//                 menos de 5 segundos, que são recarregamento ou toque errado.
//   tempo/tela  — diferença até a tela seguinte, com teto de 30 minutos.
//   ativos 7d   — usuários distintos com ao menos uma sessão na janela. Não
//                 depende do filtro de período: é sempre 1/7/30 dias.
//
// O filtro de período refaz a busca no servidor. Poderia trazer 365 dias de
// uma vez e filtrar aqui, mas aí a tela pesaria o ano inteiro para mostrar a
// semana — e quase todo acesso ao painel quer a semana.
// ============================================================================

const PERIODOS = [
  { dias: 7, label: '7 dias' },
  { dias: 30, label: '30 dias' },
  { dias: 90, label: '90 dias' },
  { dias: 365, label: '1 ano' },
];

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Segundos em algo legível. Sem casas decimais: ninguém decide nada com elas. */
function duracao(seg: number | null | undefined): string {
  const s = Math.max(0, Math.round(seg ?? 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  if (h < 24) return resto ? `${h}h ${resto}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** 'YYYY-MM-DD' → '01/08'. Sem `new Date()`: o fuso comeria um dia. */
function diaCurto(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function quandoFoi(iso: string | null): string {
  if (!iso) return '—';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[hsl(var(--faint))]">
      {children}
    </span>
  );
}

function Numero({
  valor,
  rotulo,
  hint,
  Icone,
}: {
  valor: string;
  rotulo: string;
  hint?: string;
  Icone?: typeof Users;
}) {
  return (
    <div className="rounded-[12px] border border-border bg-card px-3.5 py-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        {Icone && <Icone className="h-3 w-3 flex-shrink-0 text-primary" aria-hidden="true" />}
        <Rotulo>{rotulo}</Rotulo>
      </div>
      <p className="font-mono text-2xl font-bold leading-none tabular-nums text-foreground">
        {valor}
      </p>
      {hint && <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Secao({
  titulo,
  Icone,
  extra,
  children,
}: {
  titulo: string;
  Icone: typeof Users;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 overflow-hidden rounded-[12px] border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icone className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
          <h3 className="truncate text-sm font-bold text-foreground">{titulo}</h3>
        </div>
        {extra}
      </div>
      {children}
    </div>
  );
}

export function PainelUso({ inicial }: { inicial: UsoDados }) {
  const [dados, setDados] = useState<UsoDados>(inicial);
  const [carregando, iniciar] = useTransition();
  const [metrica, setMetrica] = useState<'sessoes' | 'visualizacoes' | 'tempo_total_seg'>('sessoes');

  function trocarPeriodo(dias: number) {
    if (dias === dados.dias) return;
    iniciar(async () => {
      const novo = await getUso(dias);
      setDados(novo);
    });
  }

  const r = dados.resumo;
  const serie = dados.porDia;
  const maiorDia = Math.max(1, ...serie.map((d) => Number(d[metrica]) || 0));
  const maiorArea = Math.max(1, ...dados.porArea.map((a) => a.visualizacoes));

  // Mapa hora × dia da semana. Montado uma vez: são 168 células e re-percorrer
  // a lista dentro do JSX seria 168 varreduras.
  const { grade, pico } = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let p = 0;
    for (const h of dados.porHora) {
      g[h.dia_semana][h.hora] = h.visualizacoes;
      if (h.visualizacoes > p) p = h.visualizacoes;
    }
    return { grade: g, pico: p };
  }, [dados.porHora]);

  const totalSessoesAparelho = Math.max(
    1,
    dados.dispositivos.reduce((s, d) => s + d.sessoes, 0)
  );
  const instaladas = dados.dispositivos.filter((d) => d.instalado).reduce((s, d) => s + d.sessoes, 0);

  const semDado = !r || r.visualizacoes === 0;

  if (dados.error) {
    return (
      <div className="rounded-[12px] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {dados.error}
      </div>
    );
  }

  return (
    <div className={carregando ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      {/* Período */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[12px] border border-border bg-card px-3 py-2.5">
        <Rotulo>Período</Rotulo>
        <div className="flex flex-wrap gap-1.5">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              onClick={() => trocarPeriodo(p.dias)}
              aria-pressed={dados.dias === p.dias}
              className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                dados.dias === p.dias
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-hairline bg-surface-sunken text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {semDado && (
        <div className="mb-4 rounded-[12px] border border-dashed border-primary/40 bg-primary/5 px-3.5 py-3 text-[13px] leading-relaxed text-muted-foreground">
          <strong className="text-foreground">A coleta começa a valer agora.</strong> Nada foi
          registrado antes de a medição existir — não há histórico para recuperar. Os números
          aparecem sozinhos conforme as pessoas usarem o app.
        </div>
      )}

      {/* Cabeçalho de números */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <Numero
          valor={String(r?.sessoes ?? 0)}
          rotulo="Visitas"
          hint={`${r?.usuarios ?? 0} pessoa(s) diferente(s)`}
          Icone={Activity}
        />
        <Numero
          valor={String(r?.visualizacoes ?? 0)}
          rotulo="Telas abertas"
          hint={`${r?.telas_por_sessao ?? 0} por visita`}
          Icone={Eye}
        />
        <Numero
          valor={duracao(r?.duracao_media_seg)}
          rotulo="Visita média"
          hint={`${duracao(r?.tempo_total_seg)} no total`}
          Icone={Clock}
        />
        <Numero
          valor={String(r?.ativos_7d ?? 0)}
          rotulo="Ativos na semana"
          hint={`${r?.ativos_hoje ?? 0} hoje · ${r?.ativos_30d ?? 0} no mês`}
          Icone={Users}
        />
      </div>

      {/* Série diária */}
      <Secao
        titulo="Movimento por dia"
        Icone={BarChart3}
        extra={
          <div className="flex flex-shrink-0 gap-1">
            {(
              [
                ['sessoes', 'visitas'],
                ['visualizacoes', 'telas'],
                ['tempo_total_seg', 'tempo'],
              ] as const
            ).map(([k, rot]) => (
              <button
                key={k}
                type="button"
                onClick={() => setMetrica(k)}
                aria-pressed={metrica === k}
                className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors ${
                  metrica === k
                    ? 'bg-primary/15 text-primary'
                    : 'text-[hsl(var(--faint))] hover:text-foreground'
                }`}
              >
                {rot}
              </button>
            ))}
          </div>
        }
      >
        {/* Barras em CSS puro. Uma biblioteca de gráfico entraria no bundle de
            TODO usuário por causa de uma tela que só o admin abre. */}
        <div className="overflow-x-auto px-3.5 py-3.5">
          <div className="flex min-w-full items-end gap-[3px]" style={{ height: 120 }}>
            {serie.map((d) => {
              const v = Number(d[metrica]) || 0;
              const titulo =
                metrica === 'tempo_total_seg'
                  ? `${diaCurto(d.dia)}: ${duracao(v)}`
                  : `${diaCurto(d.dia)}: ${v} ${metrica === 'sessoes' ? 'visita(s)' : 'tela(s)'}`;
              return (
                <div
                  key={d.dia}
                  title={titulo}
                  className="flex min-w-[6px] flex-1 flex-col justify-end"
                  style={{ height: '100%' }}
                >
                  <div
                    className={`w-full rounded-t-[3px] ${v > 0 ? 'bg-primary/70' : 'bg-surface-sunken'}`}
                    style={{ height: `${v > 0 ? Math.max(4, (v / maiorDia) * 100) : 2}%` }}
                  />
                </div>
              );
            })}
          </div>
          {serie.length > 0 && (
            <div className="mt-2 flex justify-between">
              <Rotulo>{diaCurto(serie[0].dia)}</Rotulo>
              <Rotulo>
                pico{' '}
                {metrica === 'tempo_total_seg' ? duracao(maiorDia) : maiorDia}
              </Rotulo>
              <Rotulo>{diaCurto(serie[serie.length - 1].dia)}</Rotulo>
            </div>
          )}
        </div>
      </Secao>

      {/* Áreas */}
      <Secao titulo="Onde o tempo é gasto" Icone={Layers}>
        {dados.porArea.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">
            Nenhuma tela registrada no período.
          </p>
        ) : (
          dados.porArea.map((a) => (
            <div key={a.area} className="border-t border-hairline px-3.5 py-2.5 first:border-t-0">
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                  {a.area}
                </span>
                <span className="flex-shrink-0 font-mono text-sm font-bold tabular-nums text-foreground">
                  {a.visualizacoes}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${(a.visualizacoes / maiorArea) * 100}%` }}
                />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                <Rotulo>{a.usuarios} pessoa(s)</Rotulo>
                <Rotulo>{duracao(a.tempo_total_seg)} no total</Rotulo>
                <Rotulo>{duracao(a.tempo_medio_seg)} por visita à tela</Rotulo>
              </div>
            </div>
          ))
        )}
      </Secao>

      {/* Horários */}
      <Secao titulo="Horários de uso" Icone={Clock}>
        {pico === 0 ? (
          <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">
            Ainda não há acessos para desenhar o mapa.
          </p>
        ) : (
          <div className="overflow-x-auto px-3.5 py-3.5">
            <div className="min-w-[420px]">
              <div className="mb-1 flex gap-[2px] pl-8">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="flex-1 text-center">
                    {h % 6 === 0 && <Rotulo>{h}h</Rotulo>}
                  </div>
                ))}
              </div>
              {grade.map((linha, dow) => (
                <div key={dow} className="mb-[2px] flex items-center gap-[2px]">
                  <div className="w-8 flex-shrink-0">
                    <Rotulo>{DIAS_SEMANA[dow]}</Rotulo>
                  </div>
                  {linha.map((v, h) => (
                    <div
                      key={h}
                      title={`${DIAS_SEMANA[dow]}, ${h}h — ${v} tela(s)`}
                      className="h-4 flex-1 rounded-[2px]"
                      style={{
                        // Opacidade proporcional ao pico; o piso de 0.12 existe
                        // para que 1 acesso não fique invisível.
                        backgroundColor:
                          v === 0
                            ? 'hsl(var(--surface-sunken))'
                            : `hsl(var(--primary) / ${Math.max(0.12, v / pico)})`,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </Secao>

      {/* Aparelhos */}
      <Secao
        titulo="Aparelhos"
        Icone={MonitorSmartphone}
        extra={
          <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--faint))]">
            {Math.round((instaladas / totalSessoesAparelho) * 100)}% instalado
          </span>
        }
      >
        {dados.dispositivos.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">
            Nenhuma visita no período.
          </p>
        ) : (
          dados.dispositivos.map((d) => (
            <div
              key={`${d.dispositivo}-${d.instalado}`}
              className="flex items-center justify-between gap-3 border-t border-hairline px-3.5 py-2.5 first:border-t-0"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[13px] font-semibold capitalize text-foreground">
                  {d.dispositivo}
                </span>
                <span
                  className={`flex-shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                    d.instalado
                      ? 'bg-state-open/15 text-state-open'
                      : 'bg-surface-sunken text-[hsl(var(--faint))]'
                  }`}
                >
                  {d.instalado ? 'app instalado' : 'navegador'}
                </span>
              </div>
              <div className="flex flex-shrink-0 items-baseline gap-2">
                <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                  {d.sessoes}
                </span>
                <Rotulo>{d.usuarios} pessoa(s)</Rotulo>
              </div>
            </div>
          ))
        )}
      </Secao>

      {/* Pessoas */}
      <Secao
        titulo="Por pessoa"
        Icone={Users}
        extra={
          <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--faint))]">
            {dados.porUsuario.filter((u) => u.sessoes === 0).length} sem acesso
          </span>
        }
      >
        {dados.porUsuario.map((u) => (
          <div
            key={u.user_id}
            className={`flex items-center gap-2.5 border-t border-hairline px-3.5 py-2.5 first:border-t-0 ${
              u.sessoes === 0 ? 'opacity-55' : ''
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-foreground">
                {u.username || 'sem nome'}
              </p>
              <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
                {u.sessoes === 0 ? (
                  <Rotulo>não entrou no período</Rotulo>
                ) : (
                  <>
                    <Rotulo>{u.dias_ativos} dia(s)</Rotulo>
                    <Rotulo>{u.visualizacoes} telas</Rotulo>
                    {u.area_favorita && <Rotulo>+ {u.area_favorita}</Rotulo>}
                    <Rotulo>{quandoFoi(u.ultima_visita)}</Rotulo>
                  </>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 text-right">
              <p className="font-mono text-sm font-bold tabular-nums text-foreground">
                {duracao(u.tempo_total_seg)}
              </p>
              <Rotulo>{u.sessoes} visita(s)</Rotulo>
            </div>
          </div>
        ))}
      </Secao>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        Medição própria, gravada no nosso banco: nenhum serviço externo recebe nada. Não são
        guardados IP, localização nem conteúdo de palpite — só qual tela foi aberta, quando, e por
        quanto tempo a aba ficou à vista. Tempo escondido não conta, e o tempo por tela tem teto de
        30 minutos: uma aba esquecida aberta não vira madrugada de leitura.
      </p>
    </div>
  );
}
