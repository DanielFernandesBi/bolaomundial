'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase';

// ============================================================================
// Coleta de uso.
//
// Grava direto no nosso Supabase, com a sessão do próprio usuário — a RLS só
// deixa cada um escrever a própria linha. Não há serviço externo, não há
// script de terceiro, e o dado não sai de casa.
//
// O que é gravado: a rota (com o slug do torneio trocado por ':torneio'), o
// tipo de aparelho, se está instalado como app, e o instante. Nada de conteúdo
// de palpite, nada de IP, nada de identificador de propaganda.
//
// TEMPO ATIVO, não tempo de calendário. A conta óbvia — último sinal menos o
// primeiro — transforma "abri de manhã, larguei a aba aberta, voltei à noite"
// em oito horas de uso. Aqui o relógio só corre enquanto a aba está VISÍVEL:
// somamos os trechos visíveis e gravamos o total em `segundos_ativos`.
//
// Nada depende de `beforeunload`, que o navegador do celular engole justamente
// quando a aba fecha. O que existe é: um pulso a cada 20 segundos enquanto a
// tela está à vista, e uma gravação no instante em que ela some (trocar de app
// dispara `visibilitychange`, fechar a aba também). O pior caso é perder os
// últimos 20 segundos de uma visita — para menos, nunca para mais.
// ============================================================================

const CHAVE_SESSAO = 'bolao.telemetria.sessao';
const BATIDA_MS = 20_000;

/** Áreas do app, na ordem de especificidade. A primeira que casar vence. */
const AREAS: [RegExp, string][] = [
  [/^\/[^/]+\/admin/, 'Admin'],
  [/^\/[^/]+\/matches\/[^/]+/, 'Detalhe da partida'],
  [/^\/[^/]+\/matches/, 'Partidas'],
  [/^\/[^/]+\/ranking/, 'Ranking'],
  [/^\/[^/]+\/desempenho/, 'Desempenho'],
  [/^\/[^/]+\/resultados/, 'Resultados'],
  [/^\/[^/]+\/projecao/, 'Projeção'],
  [/^\/[^/]+\/simulador/, 'Simulador'],
  [/^\/ranking-geral/, 'Ranking geral'],
  [/^\/hall-of-fame/, 'Hall da Fama'],
  [/^\/profile/, 'Perfil'],
  [/^\/login/, 'Login'],
  [/^\/$/, 'Início'],
];

/** Rotas de torneio começam com o slug; trocá-lo permite somar por área. */
const SEM_TORNEIO = new Set([
  'ranking-geral', 'hall-of-fame', 'profile', 'login', 'auth', 'ir', 'api',
]);

function analisar(pathname: string): { rota: string; area: string; torneio: string | null } {
  const partes = pathname.split('/').filter(Boolean);
  const torneio = partes.length > 0 && !SEM_TORNEIO.has(partes[0]) ? partes[0] : null;
  const rota = torneio ? '/' + [':torneio', ...partes.slice(1)].join('/') : pathname || '/';
  const area = AREAS.find(([re]) => re.test(pathname))?.[1] ?? 'Outra';
  return { rota, area, torneio };
}

function tipoDeAparelho(largura: number): string {
  if (largura < 640) return 'mobile';
  if (largura < 1024) return 'tablet';
  return 'desktop';
}

export function Telemetria({ userId }: { userId: string | null }) {
  const pathname = usePathname();
  // Guarda a última rota registrada: o App Router dispara o efeito de novo em
  // re-render, e sem isto a mesma tela contaria várias vezes.
  const ultimaRota = useRef<string | null>(null);
  const sessaoRef = useRef<string | null>(null);
  // Criação da sessão em voo. Sem isto, duas navegações rápidas antes de o
  // INSERT voltar abrem DUAS sessões para a mesma visita — e "visitas por dia"
  // passa a contar navegação, não visita.
  const criando = useRef<Promise<string | null> | null>(null);
  // Tempo ativo acumulado, e o instante em que o trecho visível atual começou.
  const ativoMs = useRef(0);
  const visivelDesde = useRef<number | null>(null);
  const gravado = useRef(0);

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    const supabase = createBrowserClient();
    let cancelado = false;

    async function abrirSessao(): Promise<string | null> {
      // sessionStorage e não localStorage: uma "sessão" morre com a aba, que é
      // a definição que o número precisa ter para significar "uma visita".
      const guardada = window.sessionStorage.getItem(CHAVE_SESSAO);
      if (guardada) {
        sessaoRef.current = guardada;
        return guardada;
      }

      const id = crypto.randomUUID();
      const { error } = await supabase.from('app_sessions').insert({
        id,
        user_id: userId,
        dispositivo: tipoDeAparelho(window.innerWidth),
        instalado:
          window.matchMedia('(display-mode: standalone)').matches ||
          (window.navigator as any).standalone === true,
        viewport_w: window.innerWidth,
        user_agent: window.navigator.userAgent.slice(0, 400),
        // Só a origem do referrer: o caminho completo poderia carregar dado de
        // outro site, e para "de onde vieram" a origem basta.
        referrer: document.referrer ? new URL(document.referrer).origin : null,
      } as any);
      if (error) return null;

      window.sessionStorage.setItem(CHAVE_SESSAO, id);
      sessaoRef.current = id;
      return id;
    }

    function garantirSessao(): Promise<string | null> {
      if (sessaoRef.current) return Promise.resolve(sessaoRef.current);
      if (!criando.current) {
        criando.current = abrirSessao().finally(() => {
          criando.current = null;
        });
      }
      return criando.current;
    }

    (async () => {
      const sessao = await garantirSessao();
      if (!sessao || cancelado || ultimaRota.current === pathname) return;
      ultimaRota.current = pathname;

      const { rota, area, torneio } = analisar(pathname);
      await supabase.from('app_page_views').insert({
        session_id: sessao,
        user_id: userId,
        rota,
        area,
        torneio,
        caminho_cru: pathname,
      } as any);
    })();

    return () => {
      cancelado = true;
    };
  }, [pathname, userId]);

  // Relógio do tempo ativo.
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    const supabase = createBrowserClient();

    if (document.visibilityState === 'visible') visivelDesde.current = Date.now();

    /** Fecha o trecho visível corrente e soma. Idempotente. */
    function fechar() {
      if (visivelDesde.current === null) return;
      ativoMs.current += Date.now() - visivelDesde.current;
      visivelDesde.current = null;
    }

    async function gravar() {
      const sessao = sessaoRef.current;
      const seg = Math.round(ativoMs.current / 1000);
      // Só escreve quando o número mudou: o UPDATE é uma requisição, e repetir
      // o mesmo total a cada 20 segundos seria ruído puro.
      if (!sessao || seg === gravado.current) return;
      gravado.current = seg;
      // `as any` no builder: os tipos gerados do Supabase são anteriores a
      // estas tabelas e resolvem as colunas para `never`.
      await (supabase.from('app_sessions') as any)
        .update({ last_seen_at: new Date().toISOString(), segundos_ativos: seg })
        .eq('id', sessao);
    }

    function pulsar() {
      // Fecha e reabre: o acumulado avança sem esperar a aba sumir.
      if (visivelDesde.current !== null) {
        fechar();
        visivelDesde.current = Date.now();
      }
      void gravar();
    }

    function aoTrocarVisibilidade() {
      if (document.visibilityState === 'visible') {
        // Reinicia a contagem AGORA: o tempo escondido não entra.
        visivelDesde.current = Date.now();
      } else {
        fechar();
        void gravar();
      }
    }

    // `pagehide` cobre o fechamento no desktop, onde visibilitychange pode não
    // chegar a tempo. Não substitui nada — é uma tentativa a mais, e a
    // requisição pode nem sair; o caminho confiável é o visibilitychange.
    function aoSair() {
      fechar();
      void gravar();
    }

    const timer = window.setInterval(pulsar, BATIDA_MS);
    document.addEventListener('visibilitychange', aoTrocarVisibilidade);
    window.addEventListener('pagehide', aoSair);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade);
      window.removeEventListener('pagehide', aoSair);
    };
  }, [userId]);

  return null;
}
