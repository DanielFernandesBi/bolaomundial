'use client';

import { useState, useTransition, useRef } from 'react';
import { Settings, Upload } from 'lucide-react';
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
import { createBrowserClient } from '@/lib/supabase';
import { updateTournament } from './actions';

interface EditTournamentDialogProps {
  tournamentSlug: string;
  current: {
    name: string;
    logo_url: string | null;
    format: 'groups' | 'knockout' | 'mixed';
    active: boolean;
  };
}

export function EditTournamentDialog({ tournamentSlug, current }: EditTournamentDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: current.name,
    logoUrl: current.logo_url ?? '',
    format: current.format,
    active: current.active,
  });

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem');
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessão expirada. Faça login novamente.');

      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      // Prefixo com o userId para respeitar policies do bucket que exigem isso
      const filename = `${user.id}-tournament-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filename, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(filename);

      setForm((p) => ({ ...p, logoUrl: publicUrl }));
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar a imagem');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateTournament(tournamentSlug, {
        name: form.name,
        logoUrl: form.logoUrl,
        format: form.format,
        active: form.active,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(() => {
          setOpen(false);
          setSuccess(false);
        }, 1200);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-slate-300 border-slate-600 hover:bg-slate-800">
          <Settings className="w-4 h-4 mr-2" />
          Editar Torneio
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-800">
        <DialogHeader>
          <DialogTitle>Editar Torneio</DialogTitle>
          <DialogDescription>Altere o nome, a foto (logo), o regime e a visibilidade do torneio.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="et-name" className="text-slate-300">Nome</Label>
            <Input
              id="et-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
              className="bg-slate-950 border-slate-700 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Foto / Logo</Label>

            {/* Enviar do dispositivo */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              id="et-logo-file"
            />
            <div className="flex items-center gap-3">
              {form.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.logoUrl}
                  alt="Prévia do logo"
                  className="w-16 h-16 rounded-full object-cover border border-slate-700 flex-shrink-0"
                  onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                />
              ) : (
                <div className="w-16 h-16 rounded-full border border-dashed border-slate-700 flex items-center justify-center text-slate-600 flex-shrink-0 text-xs">
                  sem foto
                </div>
              )}
              <label
                htmlFor="et-logo-file"
                className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  isUploading ? 'bg-slate-700 text-slate-400' : 'bg-amber-500 text-black hover:bg-amber-400'
                }`}
              >
                <Upload className="w-4 h-4" />
                {isUploading ? 'Enviando...' : 'Enviar imagem'}
              </label>
            </div>

            {/* Ou colar URL */}
            <Input
              id="et-logo"
              value={form.logoUrl}
              onChange={(e) => setForm((p) => ({ ...p, logoUrl: e.target.value }))}
              className="bg-slate-950 border-slate-700 text-white"
              placeholder="ou cole uma URL: https://..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="et-format" className="text-slate-300">Regime</Label>
            <select
              id="et-format"
              value={form.format}
              onChange={(e) => setForm((p) => ({ ...p, format: e.target.value as typeof p.format }))}
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-md px-3 py-2 text-sm"
            >
              <option value="groups">Grupos (só placar)</option>
              <option value="knockout">Mata-mata (prorrogação + pênaltis + pódio)</option>
              <option value="mixed">Misto (marcar mata-mata por jogo)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="et-active"
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
              className="w-4 h-4 accent-amber-500"
            />
            <Label htmlFor="et-active" className="text-slate-300">Torneio ativo (visível e liberado)</Label>
          </div>

          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md p-3">{error}</div>
          )}
          {success && (
            <div className="text-sm text-green-500 bg-green-500/10 border border-green-500/20 rounded-md p-3">
              Torneio atualizado!
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="text-slate-300 hover:text-white">
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || isUploading} className="bg-amber-500 text-black hover:bg-amber-400">
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
