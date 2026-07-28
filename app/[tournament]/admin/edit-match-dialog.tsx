'use client';

import { useState, useTransition, useEffect } from 'react';
import { Edit } from 'lucide-react';
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
import { updateMatch } from './actions';
import { isoToBrasiliaLocalInput } from '@/lib/utils/datetime';
import { COMPETITIONS } from '@/lib/competitions';

interface Match {
  id: number;
  team_home: string;
  team_away: string;
  home_iso: string | null;
  away_iso: string | null;
  match_date: string | null;
  status: string;
  phase?: string | null;
  is_knockout?: boolean;
  has_extra_time?: boolean;
  competition?: string | null;
  leg?: string | null;
}

interface EditMatchDialogProps {
  match: Match;
  tournamentSlug: string;
}

export function EditMatchDialog({ match, tournamentSlug }: EditMatchDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Exibe a data em horário de Brasília (UTC-3) no input datetime-local
  function formatDateForInput(dateString: string | null): string {
    return dateString ? isoToBrasiliaLocalInput(dateString) : '';
  }

  const [formData, setFormData] = useState({
    teamHome: match.team_home,
    teamAway: match.team_away,
    homeIso: match.home_iso || '',
    awayIso: match.away_iso || '',
    matchDate: formatDateForInput(match.match_date),
    phase: match.phase ?? '',
    isKnockout: !!match.is_knockout,
    competition: match.competition ?? '',
    leg: match.leg ?? '',
    hasExtraTime: match.has_extra_time !== false,
  });

  // Atualizar formData quando o match mudar
  useEffect(() => {
    setFormData({
      teamHome: match.team_home,
      teamAway: match.team_away,
      homeIso: match.home_iso || '',
      awayIso: match.away_iso || '',
      matchDate: formatDateForInput(match.match_date),
      phase: match.phase ?? '',
      isKnockout: !!match.is_knockout,
      competition: match.competition ?? '',
      leg: match.leg ?? '',
      hasExtraTime: match.has_extra_time !== false,
    });
    setError(null);
    setSuccess(false);
  }, [match]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const target = e.target as HTMLInputElement;
    const { name, value, type, checked } = target;
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await updateMatch(
        match.id,
        formData.teamHome,
        formData.teamAway,
        formData.homeIso,
        formData.awayIso,
        formData.matchDate,
        tournamentSlug,
        formData.phase || null,
        formData.isKnockout,
        formData.competition || null,
        formData.leg || null,
        formData.hasExtraTime
      );

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        // Close dialog after a short delay
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
        <Button
          variant="ghost"
          size="sm"
          className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
        >
          <Edit className="w-4 h-4 mr-2" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-800">
        <DialogHeader>
          <DialogTitle>Editar Jogo</DialogTitle>
          <DialogDescription>
            Altere os dados do jogo. Todos os campos são obrigatórios.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Time da Casa */}
          <div className="space-y-2">
            <Label htmlFor="teamHome" className="text-slate-300">
              Time da Casa
            </Label>
            <Input
              id="teamHome"
              name="teamHome"
              type="text"
              value={formData.teamHome}
              onChange={handleChange}
              required
              className="bg-slate-950 border-slate-700 text-white"
              placeholder="Ex: Brasil"
            />
          </div>

          {/* ISO Casa */}
          <div className="space-y-2">
            <Label htmlFor="homeIso" className="text-slate-300">
              Código ISO ou URL do Logo (Casa)
            </Label>
            <Input
              id="homeIso"
              name="homeIso"
              type="text"
              value={formData.homeIso}
              onChange={handleChange}
              required
              maxLength={500}
              className="bg-slate-950 border-slate-700 text-white"
              placeholder="Ex: br ou https://upload.wikimedia.org/..."
            />
          </div>

          {/* Time Visitante */}
          <div className="space-y-2">
            <Label htmlFor="teamAway" className="text-slate-300">
              Time Visitante
            </Label>
            <Input
              id="teamAway"
              name="teamAway"
              type="text"
              value={formData.teamAway}
              onChange={handleChange}
              required
              className="bg-slate-950 border-slate-700 text-white"
              placeholder="Ex: Argentina"
            />
          </div>

          {/* ISO Visitante */}
          <div className="space-y-2">
            <Label htmlFor="awayIso" className="text-slate-300">
              Código ISO ou URL do Logo (Visitante)
            </Label>
            <Input
              id="awayIso"
              name="awayIso"
              type="text"
              value={formData.awayIso}
              onChange={handleChange}
              required
              maxLength={500}
              className="bg-slate-950 border-slate-700 text-white"
              placeholder="Ex: ar ou https://upload.wikimedia.org/..."
            />
          </div>

          {/* Competição */}
          <div className="space-y-2">
            <Label htmlFor="competition" className="text-slate-300">
              Competição
            </Label>
            <select
              id="competition"
              name="competition"
              value={formData.competition}
              onChange={handleChange}
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-md px-3 py-2 text-sm"
            >
              <option value="">— nenhuma —</option>
              {COMPETITIONS.map((c) => (
                <option key={c.key} value={c.key}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Perna (ida/volta) */}
          <div className="space-y-2">
            <Label htmlFor="leg" className="text-slate-300">
              Perna do confronto
            </Label>
            <select
              id="leg"
              name="leg"
              value={formData.leg}
              onChange={handleChange}
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-md px-3 py-2 text-sm"
            >
              <option value="">— jogo único —</option>
              <option value="ida">Ida</option>
              <option value="volta">Volta</option>
            </select>
          </div>

          {/* Fase */}
          <div className="space-y-2">
            <Label htmlFor="phase" className="text-slate-300">
              Fase do jogo
            </Label>
            <Input
              id="phase"
              name="phase"
              type="text"
              value={formData.phase}
              onChange={handleChange}
              className="bg-slate-950 border-slate-700 text-white"
              placeholder="Ex: Oitavas de final – ida"
            />
          </div>

          {/* Data e Hora (opcional: em branco = "a definir") */}
          <div className="space-y-2">
            <Label htmlFor="matchDate" className="text-slate-300">
              Data e Hora (horário de Brasília) — opcional
            </Label>
            <Input
              id="matchDate"
              name="matchDate"
              type="datetime-local"
              value={formData.matchDate}
              onChange={handleChange}
              className="bg-slate-950 border-slate-700 text-white"
            />
            <p className="text-xs text-slate-500">Em branco = “data a definir”.</p>
          </div>

          {/* Mata-mata */}
          <div className="flex items-center gap-2">
            <input
              id="isKnockout"
              name="isKnockout"
              type="checkbox"
              checked={formData.isKnockout}
              onChange={handleChange}
              className="w-4 h-4 accent-amber-500"
            />
            <Label htmlFor="isKnockout" className="text-slate-300">
              Jogo de mata-mata (habilita pênaltis) — use na volta
            </Label>
          </div>

          {/* Prorrogação */}
          <div className="flex items-center gap-2">
            <input
              id="hasExtraTime"
              name="hasExtraTime"
              type="checkbox"
              checked={formData.hasExtraTime}
              onChange={handleChange}
              className="w-4 h-4 accent-amber-500"
            />
            <Label htmlFor="hasExtraTime" className="text-slate-300">
              Tem prorrogação (desmarque nos clubes)
            </Label>
          </div>

          {/* Mensagem de Erro */}
          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md p-3">
              {error}
            </div>
          )}

          {/* Mensagem de Sucesso */}
          {success && (
            <div className="text-sm text-green-500 bg-green-500/10 border border-green-500/20 rounded-md p-3">
              Jogo atualizado com sucesso!
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="text-slate-300 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-amber-500 text-black hover:bg-amber-400"
            >
              {isPending ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

