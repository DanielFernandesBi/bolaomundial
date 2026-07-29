'use client';

import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { setTournamentPodium } from './actions';

interface Team {
  name: string;
  iso: string | null;
}

interface PodiumEntryProps {
  tournamentSlug: string;
  teams: Team[];
  current: {
    champion_team: string | null;
    champion_iso: string | null;
    runner_up_team: string | null;
    runner_up_iso: string | null;
    third_place_team: string | null;
    third_place_iso: string | null;
  };
}

export function PodiumEntry({ tournamentSlug, teams, current }: PodiumEntryProps) {
  const [champion, setChampion] = useState(current.champion_team ?? '');
  const [runnerUp, setRunnerUp] = useState(current.runner_up_team ?? '');
  const [third, setThird] = useState(current.third_place_team ?? '');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function isoOf(name: string): string | null {
    return teams.find((t) => t.name === name)?.iso ?? null;
  }

  async function handleSave() {
    setSaving(true);
    setToast(null);
    const result = await setTournamentPodium(tournamentSlug, {
      championTeam: champion || null,
      championIso: isoOf(champion),
      runnerUpTeam: runnerUp || null,
      runnerUpIso: isoOf(runnerUp),
      thirdPlaceTeam: third || null,
      thirdPlaceIso: isoOf(third),
    });
    if (result.error) setToast({ message: result.error, type: 'error' });
    else setToast({ message: 'Pódio lançado! Pontos recalculados.', type: 'success' });
    setSaving(false);
    setTimeout(() => setToast(null), 4000);
  }

  const selectClass = 'w-full bg-background border border-border text-foreground rounded-md px-3 py-2 text-sm';

  return (
    <Card className="bg-card border-border mb-8">
      <CardContent className="p-6">
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-md shadow-lg ${
              toast.type === 'success' ? 'bg-green-500 text-foreground' : 'bg-red-500 text-foreground'
            }`}
          >
            {toast.message}
          </div>
        )}
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Lançar Pódio do Torneio</h2>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          Defina o resultado final. Ao salvar, os pontos de pódio de todos os participantes são recalculados
          (campeão 40, vice 20, terceiro 25, consolação +10).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-primary text-sm font-semibold">Campeão (40)</label>
            <select value={champion} onChange={(e) => setChampion(e.target.value)} className={selectClass}>
              <option value="">—</option>
              {teams.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-card-foreground text-sm font-semibold">Vice (20)</label>
            <select value={runnerUp} onChange={(e) => setRunnerUp(e.target.value)} className={selectClass}>
              <option value="">—</option>
              {teams.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-state-missing text-sm font-semibold">3º lugar (25)</label>
            <select value={third} onChange={(e) => setThird(e.target.value)} className={selectClass}>
              <option value="">—</option>
              {teams.map((t) => (
                <option key={t.name} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="mt-4 bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]">
          {saving ? 'Salvando...' : 'Lançar Pódio'}
        </Button>
      </CardContent>
    </Card>
  );
}
