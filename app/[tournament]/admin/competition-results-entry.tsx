'use client';

import { useState, useTransition } from 'react';
import { Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { setTournamentCompetitionResult } from './actions';

interface Team {
  name: string;
  iso: string | null;
}

interface CompetitionBlock {
  key: string;
  name: string;
  teams: Team[];
  result: {
    champion_team: string | null;
    champion_iso: string | null;
    runner_up_team: string | null;
    runner_up_iso: string | null;
  } | null;
}

interface Props {
  tournamentSlug: string;
  competitions: CompetitionBlock[];
}

function CompetitionForm({ tournamentSlug, comp }: { tournamentSlug: string; comp: CompetitionBlock }) {
  const [champion, setChampion] = useState<string>(comp.result?.champion_team ?? '');
  const [vice, setVice] = useState<string>(comp.result?.runner_up_team ?? '');
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function isoOf(name: string): string | null {
    return comp.teams.find((t) => t.name === name)?.iso ?? null;
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const result = await setTournamentCompetitionResult(tournamentSlug, comp.key, {
        championTeam: champion || null,
        championIso: champion ? isoOf(champion) : null,
        runnerUpTeam: vice || null,
        runnerUpIso: vice ? isoOf(vice) : null,
      });
      if (result.error) setMsg({ text: result.error, ok: false });
      else setMsg({ text: 'Resultado lançado! Pódio recalculado.', ok: true });
      setTimeout(() => setMsg(null), 4000);
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface-sunken p-4 space-y-3">
      <h4 className="text-foreground font-semibold text-sm">{comp.name}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-primary text-xs font-semibold">Campeão (40)</label>
          <select
            value={champion}
            onChange={(e) => setChampion(e.target.value)}
            className="w-full bg-background border border-border text-foreground rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {comp.teams.map((t) => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-card-foreground text-xs font-semibold">Vice (25)</label>
          <select
            value={vice}
            onChange={(e) => setVice(e.target.value)}
            className="w-full bg-background border border-border text-foreground rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {comp.teams.map((t) => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={isPending} size="sm" className="bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]">
          {isPending ? 'Salvando...' : 'Lançar resultado'}
        </Button>
        {msg && <span className={`text-xs ${msg.ok ? 'text-state-open' : 'text-destructive'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

export function CompetitionResultsEntry({ tournamentSlug, competitions }: Props) {
  if (competitions.length === 0) return null;

  return (
    <Card className="bg-card border-border mb-6">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          <h3 className="text-foreground font-bold">Campeão e vice por competição</h3>
        </div>
        <p className="text-muted-foreground text-xs">
          Ao finalizar a volta da final, o sistema já lança o campeão/vice automaticamente. Use aqui para conferir ou corrigir.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {competitions.map((c) => (
            <CompetitionForm key={c.key} tournamentSlug={tournamentSlug} comp={c} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
