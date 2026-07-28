'use client';

import { useState, useTransition } from 'react';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { createTournament } from './actions';

export function CreateTournamentDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    name: '',
    slug: '',
    format: 'knockout' as 'groups' | 'knockout' | 'mixed',
    logoUrl: '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await createTournament(form.name, form.slug, form.format, form.logoUrl || null);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setForm({ name: '', slug: '', format: 'knockout', logoUrl: '' });
        setTimeout(() => {
          setOpen(false);
          setSuccess(false);
        }, 1500);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-amber-500 border-amber-500 hover:bg-amber-500/10">
          <Trophy className="w-4 h-4 mr-2" />
          Criar Torneio
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-800">
        <DialogHeader>
          <DialogTitle>Criar Novo Torneio</DialogTitle>
          <DialogDescription>Defina o regime: grupos (palpites só de placar) ou mata-mata (com prorrogação, pênaltis e pódio).</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="t-name" className="text-slate-300">Nome</Label>
            <Input
              id="t-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
              className="bg-slate-950 border-slate-700 text-white"
              placeholder="Ex: Copa do Mundo 2026"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-slug" className="text-slate-300">Slug (URL)</Label>
            <Input
              id="t-slug"
              value={form.slug}
              onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
              required
              className="bg-slate-950 border-slate-700 text-white"
              placeholder="Ex: copa-2026"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-format" className="text-slate-300">Regime</Label>
            <select
              id="t-format"
              value={form.format}
              onChange={(e) => setForm((p) => ({ ...p, format: e.target.value as typeof p.format }))}
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-md px-3 py-2 text-sm"
            >
              <option value="groups">Grupos (só placar)</option>
              <option value="knockout">Mata-mata (prorrogação + pênaltis + pódio)</option>
              <option value="mixed">Misto (marcar mata-mata por jogo)</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-logo" className="text-slate-300">URL do Logo (opcional)</Label>
            <Input
              id="t-logo"
              value={form.logoUrl}
              onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))}
              className="bg-slate-950 border-slate-700 text-white"
              placeholder="https://..."
            />
          </div>

          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md p-3">{error}</div>
          )}
          {success && (
            <div className="text-sm text-green-500 bg-green-500/10 border border-green-500/20 rounded-md p-3">
              Torneio criado com sucesso!
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="text-slate-300 hover:text-white">
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} className="bg-amber-500 text-black hover:bg-amber-400">
              {isPending ? 'Criando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
