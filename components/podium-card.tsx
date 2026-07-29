'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Trophy, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getFlagUrl } from '@/lib/utils/flags';
import { savePodiumPrediction } from '@/app/[tournament]/matches/actions';
import { Toast } from '@/components/toast';

interface Team {
  name: string;
  iso: string | null;
}

type SlotKey = 'champion' | 'vice' | 'third';

interface PodiumCardProps {
  tournamentSlug: string;
  competitionKey: string; // chave da competição, ou '__legacy__' no modo legado
  competitionName: string;
  mode: 'competition' | 'legacy';
  teams: Team[];
  locked: boolean;
  pending?: boolean;
  userPick: {
    championTeam: string | null;
    championIso: string | null;
    viceTeam: string | null;
    viceIso: string | null;
    thirdTeam: string | null;
    thirdIso: string | null;
  } | null;
}

function TeamFlag({ iso, alt, size = 32 }: { iso: string | null; alt: string; size?: number }) {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (trimmed.toLowerCase().startsWith('http')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={trimmed} alt={alt} style={{ width: size, height: size }} className="rounded object-contain bg-muted" loading="lazy" />;
  }
  return <Image src={getFlagUrl(iso)} alt={alt} width={size} height={size} className="rounded" style={{ height: 'auto' }} />;
}

export function PodiumCard({ tournamentSlug, competitionKey, competitionName, mode, teams, locked, pending, userPick }: PodiumCardProps) {
  const slotDefs: { key: SlotKey; label: string; pts: number; color: string }[] =
    mode === 'legacy'
      ? [
          { key: 'champion', label: 'Campeão', pts: 40, color: 'text-primary' },
          { key: 'vice', label: 'Vice', pts: 20, color: 'text-card-foreground' },
          { key: 'third', label: '3º lugar', pts: 25, color: 'text-state-missing' },
        ]
      : [
          { key: 'champion', label: 'Campeão', pts: 40, color: 'text-primary' },
          { key: 'vice', label: 'Vice', pts: 25, color: 'text-card-foreground' },
        ];

  const [picks, setPicks] = useState<Record<SlotKey, Team | null>>({
    champion: userPick?.championTeam ? { name: userPick.championTeam, iso: userPick.championIso } : null,
    vice: userPick?.viceTeam ? { name: userPick.viceTeam, iso: userPick.viceIso } : null,
    third: userPick?.thirdTeam ? { name: userPick.thirdTeam, iso: userPick.thirdIso } : null,
  });
  const [activeSlot, setActiveSlot] = useState<SlotKey>('champion');
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const slotKeys = slotDefs.map((s) => s.key);
  const pickedNames = new Set(slotKeys.map((k) => picks[k]).filter(Boolean).map((t) => (t as Team).name));

  function selectTeam(team: Team) {
    if (locked) return;
    setPicks((prev) => {
      const next = { ...prev };
      slotKeys.forEach((k) => {
        if (next[k]?.name === team.name) next[k] = null;
      });
      next[activeSlot] = team;
      return next;
    });
    const nextEmpty = slotKeys.find((k) => k !== activeSlot && !picks[k]);
    if (nextEmpty) setActiveSlot(nextEmpty);
  }

  async function handleSave() {
    setIsSaving(true);
    setToast(null);
    const competition = mode === 'legacy' ? null : competitionKey;
    const result = await savePodiumPrediction(tournamentSlug, competition, {
      championTeam: picks.champion?.name ?? null,
      championIso: picks.champion?.iso ?? null,
      viceTeam: picks.vice?.name ?? null,
      viceIso: picks.vice?.iso ?? null,
      thirdTeam: mode === 'legacy' ? picks.third?.name ?? null : null,
      thirdIso: mode === 'legacy' ? picks.third?.iso ?? null : null,
    });
    if (result.error) setToast(result.error);
    else setToast('Pódio salvo com sucesso!');
    setTimeout(() => setToast(null), 3000);
    setIsSaving(false);
  }

  const hasAnyPick = slotKeys.some((k) => picks[k]);

  return (
    <Card className="relative border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <Toast message={toast} />

        <div className="mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 flex-shrink-0 text-primary" />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-foreground">
              {mode === 'legacy' ? 'Pódio' : `Pódio · ${competitionName}`}
            </h3>
            {!locked && !pending && (
              <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">
                fecha no 1º jogo
              </p>
            )}
          </div>
          {locked && !pending && (
            <span className="ml-auto flex flex-shrink-0 items-center gap-1 rounded-full bg-state-locked/10 px-2.5 py-1 text-[11px] font-semibold text-state-locked">
              <Lock className="h-3 w-3" /> Encerrado
            </span>
          )}
        </div>

        {pending && (
          <p className="rounded-[12px] bg-surface-sunken px-3 py-4 text-center text-sm text-muted-foreground">
            Aguardando definição dos playoffs para liberar o palpite de pódio.
          </p>
        )}

        {/* Slots */}
        {!pending && (
        <>
        <div className={`grid ${mode === 'legacy' ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mb-4`}>
          {slotDefs.map((slot) => {
            const team = picks[slot.key];
            const isActive = !locked && activeSlot === slot.key;
            return (
              <button
                key={slot.key}
                type="button"
                onClick={() => !locked && setActiveSlot(slot.key)}
                className={`flex h-[92px] flex-col items-center justify-center gap-1 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive ? 'border-primary bg-primary/15' : 'border-border bg-surface-sunken'
                } ${locked ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <span className={`text-xs font-semibold ${slot.color}`}>{slot.label}</span>
                <span className="text-[10px] text-[hsl(var(--faint))]">{slot.pts} pts</span>
                <div className="h-9 flex items-center justify-center">
                  {team ? <TeamFlag iso={team.iso} alt={team.name} size={32} /> : <span className="text-[hsl(var(--faint))] text-xs">—</span>}
                </div>
                <span className="text-[11px] text-card-foreground text-center truncate w-full">{team?.name ?? 'Escolher'}</span>
              </button>
            );
          })}
        </div>

        {/* Grade de times */}
        {!locked && (
          <>
            <p className="text-xs text-muted-foreground mb-2">
              Escolhendo: <span className="text-primary font-semibold">{slotDefs.find((s) => s.key === activeSlot)?.label}</span>
            </p>
            <div className="mb-4 grid max-h-56 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
              {teams.map((team) => {
                const isPicked = pickedNames.has(team.name);
                const pickedFor = slotDefs.find((sd) => picks[sd.key]?.name === team.name);
                return (
                  <button
                    key={team.name}
                    type="button"
                    onClick={() => selectTeam(team)}
                    title={team.name}
                    className={`flex h-[58px] flex-col items-center justify-center gap-0.5 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isPicked ? 'border-primary bg-primary/15' : 'border-border bg-surface-sunken hover:border-primary/40'
                    }`}
                  >
                    <TeamFlag iso={team.iso} alt={team.name} size={28} />
                    <span className="w-full truncate px-1 text-center text-[9px] text-card-foreground">
                      {pickedFor ? pickedFor.label.toLowerCase() : team.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {hasAnyPick && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`min-h-[48px] w-full rounded-lg px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isSaving
                    ? 'cursor-not-allowed bg-muted text-muted-foreground'
                    : 'bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]'
                }`}
              >
                {isSaving ? 'Salvando...' : 'Salvar Pódio'}
              </button>
            )}
          </>
        )}

        {locked && !hasAnyPick && (
          <p className="rounded-[12px] bg-surface-sunken px-3 py-3 text-center text-sm text-muted-foreground">
            {mode === 'legacy' ? 'Você não palpitou o pódio deste torneio.' : 'Você não palpitou o pódio desta competição.'}
          </p>
        )}
        </>
        )}
      </CardContent>
    </Card>
  );
}
