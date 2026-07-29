'use client';

// ============================================================================
// Moldura comum dos cards de compartilhamento (§16 do handoff)
// ============================================================================
// Os quatro cards viram imagem via html-to-image, e uma imagem exportada NÃO
// pode depender do tema de quem gerou: se usássemos os tokens (`hsl(var(--…))`),
// o mesmo card sairia claro para uns e escuro para outros, e o WhatsApp de um
// grupo mostraria duas artes diferentes do mesmo ranking.
//
// Por isso a paleta abaixo é fixa, em hexadecimal. Os valores são exatamente os
// do tema escuro em app/globals.css — se um token mudar lá, este arquivo tem de
// ser atualizado na mão, de propósito.
// ============================================================================

export const SHARE = {
  bg: '#0a0e15', // fundo do card (§16)
  surface: '#0f172a', // bloco/linha sobre o fundo
  sunken: '#0b1322', // linha alternada
  hairline: '#1c2838', // divisória
  fg: '#f8fafc', // texto principal
  muted: '#94a3b8', // texto secundário
  faint: '#64748b', // metadado
  amber: '#f59e0b', // marca e ação
  amberSoft: '#fbbf24', // pontuação parcial
  money: '#4ade80', // dinheiro ganho
  danger: '#f87171', // lanterna
  silver: '#cbd5e1', // 2º lugar
  bronze: '#d19a6a', // 3º lugar
} as const;

/** Barra âmbar do topo — é o que identifica a arte de longe, na miniatura. */
export function ShareTopBar({ height = 5 }: { height?: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: `${height}px`,
        background: SHARE.amber,
      }}
    />
  );
}

/** Assinatura da marca, em versalete monoespaçado. */
export function ShareWordmark({ size = 12 }: { size?: number }) {
  return (
    <div
      className="font-mono font-bold uppercase"
      style={{
        color: SHARE.amber,
        fontSize: `${size}px`,
        letterSpacing: '0.22em',
      }}
    >
      Arena de Bolões
    </div>
  );
}

/** Cor da posição no pódio. Substitui as medalhas de emoji (§16). */
export function positionColor(position: number, isLanterna = false): string {
  if (isLanterna) return SHARE.danger;
  if (position === 1) return SHARE.amber;
  if (position === 2) return SHARE.silver;
  if (position === 3) return SHARE.bronze;
  return SHARE.muted;
}
