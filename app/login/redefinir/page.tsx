'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { updatePasswordAction } from '../actions';

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Controlados: o <form action> do React 19 limpa os campos após a submissão.
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');

  async function handleSubmit(formData: FormData) {
    setSalvando(true);
    setErro(null);
    setOk(null);
    const r = await updatePasswordAction(formData);
    if (r?.error) {
      setErro(r.error);
      setSalvando(false);
      return;
    }
    setOk(r?.message ?? 'Senha alterada.');
    setSalvando(false);
    setTimeout(() => router.push('/'), 1200);
  }

  const campo =
    'h-12 w-full rounded-[12px] border border-border bg-surface-sunken px-3 text-foreground placeholder:text-[hsl(var(--faint))] focus:border-primary focus:outline-none';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="relative mx-auto mb-4 h-[88px] w-[88px]">
            <Image src="/icon-512.png" alt="Arena de Bolões" fill className="rounded-[22px] object-contain" sizes="88px" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Nova senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">Escolha uma senha de pelo menos 6 caracteres.</p>
        </div>

        <form action={handleSubmit} className="rounded-[16px] border border-border bg-card p-5">
          <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-card-foreground">
            Nova senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className={campo}
          />

          <label htmlFor="confirm" className="mb-1.5 mt-4 block text-xs font-semibold text-card-foreground">
            Confirmar senha
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirma}
            onChange={(e) => setConfirma(e.target.value)}
            className={campo}
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
            disabled={salvando}
            className="mt-4 h-[52px] w-full rounded-[12px] bg-primary text-sm font-bold text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))] disabled:opacity-60"
          >
            {salvando ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
