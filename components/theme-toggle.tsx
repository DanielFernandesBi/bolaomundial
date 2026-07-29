'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

// ============================================================================
// Alternador de tema claro/escuro
// ============================================================================
// Alterna a classe `light` no <html> e grava a escolha em localStorage['tema'].
// O escuro é o padrão; o claro é opt-in (ou segue a preferência do sistema
// quando o usuário ainda não escolheu).
//
// O script anti-flash em app/layout.tsx aplica a classe ANTES da primeira
// pintura — este componente só sincroniza o ícone e trata o clique.
//
// NUNCA limpa outras chaves de localStorage.
// ============================================================================

interface ThemeToggleProps {
  /** Estilo do botão. 'icon' no cabeçalho, 'row' na tela de perfil. */
  variant?: 'icon' | 'row';
  className?: string;
}

export function ThemeToggle({ variant = 'icon', className = '' }: ThemeToggleProps) {
  // Começa indefinido para não renderizar o ícone errado antes da hidratação.
  const [isLight, setIsLight] = useState<boolean | null>(null);

  useEffect(() => {
    setIsLight(document.documentElement.classList.contains('light'));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains('light');
    document.documentElement.classList.toggle('light', next);
    try {
      localStorage.setItem('tema', next ? 'claro' : 'escuro');
    } catch {
      // localStorage indisponível (modo privado): o tema vale só nesta sessão.
    }
    setIsLight(next);
  }

  const label = isLight === null ? 'Alternar tema' : isLight ? 'Ativar tema escuro' : 'Ativar tema claro';
  const Icon = isLight ? Moon : Sun;

  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className={`flex w-full items-center justify-between gap-3 rounded-[12px] border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      >
        <span className="flex items-center gap-3">
          <Icon className="w-5 h-5 text-primary flex-shrink-0" aria-hidden="true" />
          <span className="text-foreground text-sm font-semibold">Tema</span>
        </span>
        <span className="text-muted-foreground text-xs">
          {isLight === null ? '—' : isLight ? 'Claro' : 'Escuro'}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      className={`flex items-center justify-center w-11 h-11 rounded-lg text-muted-foreground transition-colors hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      <Icon className="w-5 h-5" aria-hidden="true" />
    </button>
  );
}
