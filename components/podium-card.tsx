'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Trophy, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getFlagUrl } from '@/lib/utils/flags';
import { savePodiumPrediction } from '@/app/[tournament]/matches/actions';

interface Team {
  name: string;
  iso: string | null;
}

type SlotKey = 'champion' | 'vice';

interface PodiumCardProps {
  tournamentSlug: string;
  competitionKey: string;
  competitionName: string;
  teams: Team[];
  locked: boolean;
  userPick: {
    championTeam: string | null;
    championIso: string | null;
    viceTeam: string | null;
    viceIso: string | null;
  } | null;
}

function TeamFlag({ iso, alt, size = 32 }: { iso: string | null; alt: string; size?: number }) {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (trimmed.toLowerCase().startsWith('http')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={trimmed} alt={alt} style={{ width: size, height: size }} className="rounded object-contain bg-slate-800" loading="lazy" />;
  }
  return <Image src={getFlagUrl(iso)} alt={alt} width={size} height={size} className="rounded" style={{ height: 'auto' }} />;
}

const SLOTS: { key: SlotKey; label: string; pts: number; color: string }[] = [
  { key: 'champion', label: 'Campeão', pts: 40, color: 'text-amber-400' },
  { key: 'vice', label: 'Vice', pts: 25, color: 'text-slate-300' },
];

export function PodiumCard({ tournamentSlug, competitionKey, competitionName, teams, locked, userPick }: PodiumCardProps) {
  const [picks, setPicks] = useState<Record<SlotKey, Team | null>>({
    champion: userPick?.championTeam ? { name: userPick.championTeam, iso: userPick.championIso } : null,
    vice: userPick?.viceTeam ? { name: userPick.viceTeam, iso: userPick.viceIso } : null,
  });
  const [activeSlot, setActiveSlot] = useState<SlotKey>('champion');
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const pickedNames = new Set(Object.values(picks).filter(Boolean).map((t) => (t as Team).name));

  function selectTeam(team: Team) {
    if (locked) return;
    setPicks((prev) => {
      const next = { ...prev };
      // Remove o time de qualquer outro slot (mantém distintos)
      (Object.keys(next) as SlotKey[]).forEach((k) => {
        if (next[k]?.name === team.name) next[k] = null;
      });
      next[activeSlot] = team;
      return next;
    });
    // Avança para o outro slot se estiver vazio
    const other: SlotKey = activeSlot === 'champion' ? 'vice' : 'champion';
    if (!picks[other]) setActiveSlot(other);
  }

  async function handleSave() {
    setIsSaving(true);
    setToast(null);
    const result = await savePodiumPrediction(tournamentSlug, competitionKey, {
      championTeam: picks.champion?.name ?? null,
      championIso: picks.champion?.iso ?? null,
      viceTeam: picks.vice?.name ?? null,
      viceIso: picks.vice?.iso ?? null,
    });
    if (result.error) setToast(result.error);
    else setToast('Pódio salvo com sucesso!');
    setTimeout(() => setToast(null), 3000);
    setIsSaving(false);
  }

  const hasAnyPick = picks.champion || picks.vice;

  return (
    <Card className="bg-slate-900 border-slate-800 relative">
      <CardContent className="p-4">
        {toast && (
          <div className="absolute top-4 right-4 bg-slate-800 text-white px-4 py-2 rounded-md shadow-lg z-10">{toast}</div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <h3 className="text-white font-bold text-sm">Pódio — {competitionName}</h3>
          {locked && (
            <span className="flex items-center gap-1 text-slate-400 text-xs ml-auto">
              <Lock className="w-3 h-3" /> Encerrado
            </span>
          )}
        </div>

        {/* Slots: campeão / vice */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {SLOTS.map((slot) => {
            const team = picks[slot.key];
            const isActive = !locked && activeSlot === slot.key;
            return (
              <button
                key={slot.key}
                type="button"
                onClick={() => !locked && setActiveSlot(slot.key)}
                className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                  isActive ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-950/40'
                } ${locked ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <span className={`text-xs font-semibold ${slot.color}`}>{slot.label}</span>
                <span className="text-[10px] text-slate-500">{slot.pts} pts</span>
                <div className="h-9 flex items-center justify-center">
                  {team ? <TeamFlag iso={team.iso} alt={team.name} size={32} /> : <span className="text-slate-600 text-xs">—</span>}
                </div>
                <span className="text-[11px] text-slate-300 text-center truncate w-full">{team?.name ?? 'Escolher'}</span>
              </button>
            );
          })}
        </div>

        {/* Grade de times */}
        {!locked && (
          <>
            <p className="text-xs text-slate-400 mb-2">
              Escolhendo: <span className="text-amber-400 font-semibold">{SLOTS.find((s) => s.key === activeSlot)?.label}</span>
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-56 overflow-y-auto mb-4">
              {teams.map((team) => {
                const isPicked = pickedNames.has(team.name);
                return (
                  <button
                    key={team.name}
                    type="button"
                    onClick={() => selectTeam(team)}
                    title={team.name}
                    className={`flex flex-col items-center gap-1 rounded-md border p-2 transition-colors ${
                      isPicked ? 'border-amber-500 bg-amber-500/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-600'
                    }`}
                  >
                    <TeamFlag iso={team.iso} alt={team.name} size={28} />
                    <span className="text-[10px] text-slate-300 truncate w-full text-center">{team.name}</span>
                  </button>
                );
              })}
            </div>

            {hasAnyPick && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className={`w-full px-4 py-2 rounded-md font-semibold text-sm transition-colors ${
                  isSaving ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {isSaving ? 'Salvando...' : 'Salvar Pódio'}
              </button>
            )}
          </>
        )}

        {locked && !hasAnyPick && (
          <p className="text-slate-500 text-sm text-center">Você não palpitou o pódio desta competição.</p>
        )}
      </CardContent>
    </Card>
  );
}
