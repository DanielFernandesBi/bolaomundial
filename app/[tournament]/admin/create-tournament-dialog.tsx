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
        <Button variant="outline" className="text-primary border-primary hover:bg-primary/10">
          <Trophy className="w-4 h-4 mr-2" />
          Criar Torneio
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Criar Novo Torneio</DialogTitle>
          <DialogDescription>Defina o regime: grupos (palpites só de placar) ou mata-mata (com prorrogação, pênaltis e pódio).</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="t-name" className="text-card-foreground">Nome</Label>
            <Input
              id="t-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
              className="bg-background border-border text-foreground"
              placeholder="Ex: Copa do Mundo 2026"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-slug" className="text-card-foreground">Slug (URL)</Label>
            <Input
              id="t-slug"
              value={form.slug}
              onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
              required
              className="bg-background border-border text-foreground"
              placeholder="Ex: copa-2026"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-format" className="text-card-foreground">Regime</Label>
            <select
              id="t-format"
              value={form.format}
              onChange={(e) => setForm((p) => ({ ...p, format: e.target.value as typeof p.format }))}
              className="w-full bg-background border border-border text-foreground rounded-md px-3 py-2 text-sm"
            >
              <option value="groups">Grupos (só placar)</option>
              <option value="knockout">Mata-mata (prorrogação + pênaltis + pódio)</option>
              <option value="mixed">Misto (marcar mata-mata por jogo)</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-logo" className="text-card-foreground">URL do Logo (opcional)</Label>
            <Input
              id="t-logo"
              value={form.logoUrl}
              onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))}
              className="bg-background border-border text-foreground"
              placeholder="https://..."
            />
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">{error}</div>
          )}
          {success && (
            <div className="text-sm text-state-open bg-state-open/10 border border-state-open/20 rounded-md p-3">
              Torneio criado com sucesso!
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="text-card-foreground hover:text-foreground">
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} className="bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]">
              {isPending ? 'Criando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
