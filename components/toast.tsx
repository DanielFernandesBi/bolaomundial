'use client';

// ============================================================================
// Toast — pílula única no rodapé, acima da barra de navegação
// ============================================================================
// Componente de APRESENTAÇÃO. Substitui os avisos soltos que cada tela
// desenhava por conta própria (`fixed top-4 right-4 bg-green-500`, e um
// `absolute` dentro do card de partida, que recortava junto com o card).
//
// Deliberadamente NÃO é um provider com contexto: cada tela continua dona do
// seu próprio estado de toast, exatamente como estava. Isso mantém intactos os
// useState e os handlers — só muda onde e como a mensagem aparece. Trocar o
// estado por um contexto global exigiria mexer nos handlers de salvamento, que
// é justamente o que não se pode tocar nesta refatoração.
//
// role="status" + aria-live="polite": leitores de tela anunciam sem interromper.
// ============================================================================

interface ToastProps {
  /** Mensagem; `null`/vazio não renderiza nada. */
  message: string | null | undefined;
  tone?: 'success' | 'error';
}

export function Toast({ message, tone = 'success' }: ToastProps) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-6"
    >
      <div
        className={`pointer-events-auto max-w-[92vw] rounded-full border px-4 py-2.5 text-sm font-semibold shadow-lg backdrop-blur ${
          tone === 'error'
            ? 'border-destructive/40 bg-destructive/15 text-destructive'
            : 'border-state-open/40 bg-state-open/15 text-state-open'
        }`}
      >
        {message}
      </div>
    </div>
  );
}
