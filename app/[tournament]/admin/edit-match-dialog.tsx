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
  venue?: string | null;
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
    venue: match.venue ?? '',
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
      venue: match.venue ?? '',
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
        formData.hasExtraTime,
        formData.venue || null
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
          className="text-primary hover:text-primary hover:bg-primary/10"
        >
          <Edit className="w-4 h-4 mr-2" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Editar Jogo</DialogTitle>
          <DialogDescription>
            Altere os dados do jogo. Todos os campos são obrigatórios.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Time da Casa */}
          <div className="space-y-2">
            <Label htmlFor="teamHome" className="text-card-foreground">
              Time da Casa
            </Label>
            <Input
              id="teamHome"
              name="teamHome"
              type="text"
              value={formData.teamHome}
              onChange={handleChange}
              required
              className="bg-background border-border text-foreground"
              placeholder="Ex: Brasil"
            />
          </div>

          {/* ISO Casa */}
          <div className="space-y-2">
            <Label htmlFor="homeIso" className="text-card-foreground">
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
              className="bg-background border-border text-foreground"
              placeholder="Ex: br ou https://upload.wikimedia.org/..."
            />
          </div>

          {/* Time Visitante */}
          <div className="space-y-2">
            <Label htmlFor="teamAway" className="text-card-foreground">
              Time Visitante
            </Label>
            <Input
              id="teamAway"
              name="teamAway"
              type="text"
              value={formData.teamAway}
              onChange={handleChange}
              required
              className="bg-background border-border text-foreground"
              placeholder="Ex: Argentina"
            />
          </div>

          {/* ISO Visitante */}
          <div className="space-y-2">
            <Label htmlFor="awayIso" className="text-card-foreground">
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
              className="bg-background border-border text-foreground"
              placeholder="Ex: ar ou https://upload.wikimedia.org/..."
            />
          </div>

          {/* Competição */}
          <div className="space-y-2">
            <Label htmlFor="competition" className="text-card-foreground">
              Competição
            </Label>
            <select
              id="competition"
              name="competition"
              value={formData.competition}
              onChange={handleChange}
              className="w-full bg-background border border-border text-foreground rounded-md px-3 py-2 text-sm"
            >
              <option value="">— nenhuma —</option>
              {COMPETITIONS.map((c) => (
                <option key={c.key} value={c.key}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Perna (ida/volta) */}
          <div className="space-y-2">
            <Label htmlFor="leg" className="text-card-foreground">
              Perna do confronto
            </Label>
            <select
              id="leg"
              name="leg"
              value={formData.leg}
              onChange={handleChange}
              className="w-full bg-background border border-border text-foreground rounded-md px-3 py-2 text-sm"
            >
              <option value="">— jogo único —</option>
              <option value="ida">Ida</option>
              <option value="volta">Volta</option>
            </select>
          </div>

          {/* Fase */}
          <div className="space-y-2">
            <Label htmlFor="phase" className="text-card-foreground">
              Fase do jogo
            </Label>
            <Input
              id="phase"
              name="phase"
              type="text"
              value={formData.phase}
              onChange={handleChange}
              className="bg-background border-border text-foreground"
              placeholder="Ex: Oitavas de final – ida"
            />
          </div>

          {/* Estádio */}
          <div className="space-y-2">
            <Label htmlFor="venue" className="text-card-foreground">Estádio</Label>
            <Input
              id="venue"
              name="venue"
              type="text"
              value={formData.venue}
              onChange={handleChange}
              className="bg-background border-border text-foreground"
              placeholder="Ex: Maracanã"
            />
          </div>

          {/* Data e Hora (opcional: em branco = "a definir") */}
          <div className="space-y-2">
            <Label htmlFor="matchDate" className="text-card-foreground">
              Data e Hora (horário de Brasília) — opcional
            </Label>
            <Input
              id="matchDate"
              name="matchDate"
              type="datetime-local"
              value={formData.matchDate}
              onChange={handleChange}
              className="bg-background border-border text-foreground"
            />
            <p className="text-xs text-[hsl(var(--faint))]">Em branco = “data a definir”.</p>
          </div>

          {/* Mata-mata */}
          <div className="flex items-center gap-2">
            <input
              id="isKnockout"
              name="isKnockout"
              type="checkbox"
              checked={formData.isKnockout}
              onChange={handleChange}
              className="w-4 h-4 accent-primary"
            />
            <Label htmlFor="isKnockout" className="text-card-foreground">
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
              className="w-4 h-4 accent-primary"
            />
            <Label htmlFor="hasExtraTime" className="text-card-foreground">
              Tem prorrogação (desmarque nos clubes)
            </Label>
          </div>

          {/* Mensagem de Erro */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
              {error}
            </div>
          )}

          {/* Mensagem de Sucesso */}
          {success && (
            <div className="text-sm text-state-open bg-state-open/10 border border-state-open/20 rounded-md p-3">
              Jogo atualizado com sucesso!
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              className="text-card-foreground hover:text-foreground"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]"
            >
              {isPending ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

