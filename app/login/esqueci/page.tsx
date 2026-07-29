'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import { requestPasswordResetAction } from '../actions';

export default function EsqueciSenhaPage() {
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Controlado de propósito: no React 19 o <form action> reseta os campos
  // depois da submissão, e o usuário perderia o que digitou a cada erro.
  const [email, setEmail] = useState('');

  async function handleSubmit(formData: FormData) {
    setEnviando(true);
    setErro(null);
    setOk(null);
    const r = await requestPasswordResetAction(formData);
    if (r?.error) setErro(r.error);
    else if (r?.success) setOk(r.message);
    setEnviando(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="relative mx-auto mb-4 h-[88px] w-[88px]">
            <Image src="/icon-512.png" alt="Arena de Bolões" fill className="rounded-[22px] object-contain" sizes="88px" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Recuperar senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enviamos um link para você criar uma senha nova.
          </p>
        </div>

        <form action={handleSubmit} className="rounded-[16px] border border-border bg-card p-5">
          <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-card-foreground">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="h-12 w-full rounded-[12px] border border-border bg-surface-sunken px-3 text-foreground placeholder:text-[hsl(var(--faint))] focus:border-primary focus:outline-none"
          />

          {erro && (
            <p role="alert" className="mt-3 flex items-start gap-2 text-xs text-destructive">
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current" aria-hidden="true" />
              {erro}
            </p>
          )}
          {ok && (
            <p role="status" className="mt-3 rounded-[12px] border border-state-open/40 bg-state-open/10 px-3 py-2 text-xs text-state-open">
              {ok}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="mt-4 h-[52px] w-full rounded-[12px] bg-primary text-sm font-bold text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))] disabled:opacity-60"
          >
            {enviando ? 'Enviando…' : 'Enviar link de recuperação'}
          </button>
        </form>

        <Link
          href="/login"
          className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para o login
        </Link>
      </div>
    </div>
  );
}
