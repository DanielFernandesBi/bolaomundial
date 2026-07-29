'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { loginAction, signupAction } from './actions';

// ============================================================================
// Login / Criar conta
// ============================================================================
// O rearranjo do bloco 6c: o alternador saiu do rodapé (onde era um link de
// texto e ninguém via) e virou um segmentado no topo do cartão, que é o padrão
// de app. Os ícones dentro dos campos foram removidos: eles empurravam o texto
// para a direita e, no celular, competiam com o cursor sem informar nada que o
// rótulo já não dissesse.
//
// Nada da lógica mudou: as mesmas duas actions, os mesmos `name` dos campos e
// o mesmo tratamento de erro/sucesso.
// ============================================================================

const campo =
  'h-12 w-full rounded-[12px] border border-border bg-surface-sunken px-3 text-foreground placeholder:text-[hsl(var(--faint))] focus:border-primary focus:outline-none';

const rotulo = 'mb-1.5 block text-xs font-semibold text-card-foreground';

export default function LoginPage() {
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Controlado de propósito: no React 19 o <form action> RESETA o formulário
  // depois que a action roda. Com o campo não-controlado, o e-mail era apagado
  // a cada tentativa falha e o usuário tinha de redigitar no celular.
  const [email, setEmail] = useState('');

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    setError(null);

    try {
      const result = isSignup
        ? await signupAction(formData)
        : await loginAction(formData);

      if (result?.error) {
        setError(result.error);
        setSuccess(null);
      } else if (result?.success) {
        setSuccess(result.message);
        setError(null);
      }
    } catch (err) {
      setError('Ocorreu um erro. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }

  function trocarAba(paraCadastro: boolean) {
    if (paraCadastro === isSignup) return;
    setIsSignup(paraCadastro);
    setError(null);
    setSuccess(null);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Marca */}
        <div className="mb-8 flex flex-col items-center">
          <Image
            src="/icon-512.png"
            alt="Arena de Bolões"
            width={96}
            height={96}
            className="rounded-[22px]"
            priority
          />
          <h1 className="mt-4 text-2xl font-bold text-foreground">Arena de Bolões</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSignup ? 'Crie sua conta para participar' : 'Entre para palpitar'}
          </p>
        </div>

        <div className="rounded-[16px] border border-border bg-card p-5">
          {/* Segmentado: Entrar · Criar conta */}
          <div
            role="tablist"
            aria-label="Entrar ou criar conta"
            className="mb-5 grid grid-cols-2 gap-1 rounded-[12px] border border-hairline bg-surface-sunken p-1"
          >
            {([
              ['Entrar', false],
              ['Criar conta', true],
            ] as const).map(([texto, paraCadastro]) => {
              const ativo = isSignup === paraCadastro;
              return (
                <button
                  key={texto}
                  type="button"
                  role="tab"
                  aria-selected={ativo}
                  onClick={() => trocarAba(paraCadastro)}
                  className={`h-[38px] rounded-[9px] text-sm font-semibold transition-colors ${
                    ativo
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {texto}
                </button>
              );
            })}
          </div>

          <form action={handleSubmit}>
            {/* Campo Username (apenas no cadastro) */}
            {isSignup && (
              <div className="mb-4">
                <label htmlFor="username" className={rotulo}>
                  Nome de usuário
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  placeholder="seuusername"
                  required
                  className={campo}
                />
              </div>
            )}

            {/* Campo Email */}
            <div className="mb-4">
              <label htmlFor="email" className={rotulo}>
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={campo}
              />
            </div>

            {/* Campo Senha */}
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="password" className={rotulo}>
                  Senha
                </label>
                {!isSignup && (
                  <Link
                    href="/login/esqueci"
                    className="mb-1.5 text-xs font-semibold text-primary transition-opacity hover:opacity-80"
                  >
                    Esqueci minha senha
                  </Link>
                )}
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                placeholder="••••••••"
                required
                className={campo}
              />
            </div>

            {/* Mensagem de Erro */}
            {error && (
              <p role="alert" className="mt-3 flex items-start gap-2 text-xs text-destructive">
                <span
                  className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current"
                  aria-hidden="true"
                />
                {error}
              </p>
            )}

            {/* Mensagem de Sucesso */}
            {success && (
              <p
                role="status"
                className="mt-3 rounded-[12px] border border-state-open/40 bg-state-open/10 px-3 py-2 text-xs text-state-open"
              >
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-5 h-[52px] w-full rounded-[12px] bg-primary text-sm font-bold text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))] disabled:opacity-60"
            >
              {isLoading ? 'Carregando…' : isSignup ? 'Criar conta' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
