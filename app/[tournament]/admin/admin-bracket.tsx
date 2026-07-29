'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { Trophy, ArrowLeftRight, Check, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { getFlagUrl } from '@/lib/utils/flags';
import { resolveTieParticipant, applyRoundDraw, swapTieHomeAway } from './actions';

interface Side { team: string | null; iso: string | null; label: string | null }
interface TieView {
  id: number; round: string; slot: number; series_type: string; winner_team: string | null;
  sideA: Side; sideB: Side; hasMatches: boolean; canSwap: boolean;
  matches: { id: number; leg: string; status: string; match_date: string | null; venue: string | null }[];
}
interface CompView { key: string; name: string; rounds: { round: string; label: string; ties: TieView[] }[] }

interface Props {
  tournamentSlug: string;
  tournamentId: number;
  competitions: CompView[];
}

function Logo({ iso, alt }: { iso: string | null; alt: string }) {
  if (!iso) return null;
  const t = iso.trim();
  return t.toLowerCase().startsWith('http') ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={t} alt={alt} className="w-6 h-6 rounded object-contain bg-muted" loading="lazy" />
  ) : (
    <Image src={getFlagUrl(iso)} alt={alt} width={24} height={24} className="w-6 h-auto rounded" />
  );
}

function SideLabel({ side }: { side: Side }) {
  if (side.team) {
    return (
      <span className="flex items-center gap-1.5 text-foreground text-sm">
        <Logo iso={side.iso} alt={side.team} /> {side.team}
      </span>
    );
  }
  return <span className="text-primary/80 text-xs italic">{side.label ?? 'A definir'}</span>;
}

export function AdminBracket({ tournamentSlug, tournamentId, competitions }: Props) {
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  // resolver classificado: { tieId, side }
  const [resolving, setResolving] = useState<{ tieId: number; side: 'a' | 'b' } | null>(null);
  const [rTeam, setRTeam] = useState('');
  const [rLogo, setRLogo] = useState('');
  const [drawComp, setDrawComp] = useState<string | null>(null);

  function flash(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function doResolve() {
    if (!resolving || !rTeam.trim()) return;
    startTransition(async () => {
      const res = await resolveTieParticipant(tournamentSlug, resolving.tieId, resolving.side, rTeam.trim(), rLogo.trim());
      if (res.error) flash(res.error, false);
      else { flash('Classificado definido!', true); setResolving(null); setRTeam(''); setRLogo(''); }
    });
  }

  function doSwap(tieId: number) {
    if (!window.confirm('Inverter os mandos deste confronto (ida e volta)? Só é permitido se não houver palpites e nenhum jogo tiver começado.')) return;
    startTransition(async () => {
      const res = await swapTieHomeAway(tournamentSlug, tieId);
      if (res.error) flash(res.error, false);
      else flash('Mandos invertidos!', true);
    });
  }

  return (
    <Card className="bg-card border-border mb-6">
      <CardContent className="p-4 space-y-6">
        <div className="flex items-center gap-2">
          <Shuffle className="w-5 h-5 text-primary" />
          <h3 className="text-foreground font-bold">Chaveamento</h3>
        </div>
        {toast && (
          <div className={`text-sm rounded-md p-2 ${toast.ok ? 'bg-state-open/15 text-state-open' : 'bg-destructive/15 text-destructive'}`}>{toast.msg}</div>
        )}

        {competitions.length === 0 && <p className="text-muted-foreground text-sm">Nenhum confronto cadastrado ainda.</p>}

        {competitions.map((comp) => {
          const oitavas = comp.rounds.find((r) => r.round === 'oitavas');
          const allOitavasDecided = !!oitavas && oitavas.ties.length === 8 && oitavas.ties.every((t) => t.winner_team);
          const quartasEmpty = comp.rounds.find((r) => r.round === 'quartas')?.ties.every((t) => !t.sideA.team && !t.sideB.team);
          const canDrawQuartas = comp.key === 'copa_do_brasil' && allOitavasDecided && quartasEmpty;
          return (
            <div key={comp.key} className="space-y-4">
              <h4 className="text-foreground font-semibold border-b border-border pb-1">{comp.name}</h4>

              {canDrawQuartas && (
                <div>
                  <Button size="sm" onClick={() => setDrawComp(drawComp === comp.key ? null : comp.key)} className="bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]">
                    <Shuffle className="w-4 h-4 mr-1" /> Montar quartas (sorteio)
                  </Button>
                  {drawComp === comp.key && oitavas && (
                    <QuartasDraw
                      tournamentSlug={tournamentSlug}
                      tournamentId={tournamentId}
                      competition={comp.key}
                      oitavas={oitavas.ties}
                      onDone={(msg, ok) => { flash(msg, ok); if (ok) setDrawComp(null); }}
                    />
                  )}
                </div>
              )}

              {comp.rounds.map((r) => (
                <div key={r.round} className="space-y-2">
                  <p className="text-muted-foreground text-xs font-semibold uppercase">{r.label}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {r.ties.map((t) => (
                      <div key={t.id} className="rounded-md border border-border bg-surface-sunken p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <SideLabel side={t.sideA} />
                          <span className="text-[hsl(var(--faint))] text-xs">{t.series_type === 'single' ? '(jogo único)' : 'x'}</span>
                          <SideLabel side={t.sideB} />
                        </div>
                        {t.winner_team && <div className="text-state-open text-xs">Classificado: {t.winner_team}</div>}

                        <div className="flex flex-wrap gap-2">
                          {!t.sideA.team && (
                            <Button size="sm" variant="outline" className="h-7 text-xs text-primary border-primary/40"
                              onClick={() => { setResolving({ tieId: t.id, side: 'a' }); setRTeam(''); setRLogo(''); }}>
                              Definir lado A
                            </Button>
                          )}
                          {!t.sideB.team && (
                            <Button size="sm" variant="outline" className="h-7 text-xs text-primary border-primary/40"
                              onClick={() => { setResolving({ tieId: t.id, side: 'b' }); setRTeam(''); setRLogo(''); }}>
                              Definir lado B
                            </Button>
                          )}
                          {t.canSwap && (
                            <Button size="sm" variant="outline" className="h-7 text-xs text-card-foreground"
                              onClick={() => doSwap(t.id)} disabled={isPending}>
                              <ArrowLeftRight className="w-3 h-3 mr-1" /> Inverter mandos
                            </Button>
                          )}
                        </div>

                        {resolving?.tieId === t.id && (
                          <div className="rounded border border-border p-2 space-y-2 bg-background">
                            <p className="text-card-foreground text-xs">Definir classificado (lado {resolving.side.toUpperCase()})</p>
                            <Input value={rTeam} onChange={(e) => setRTeam(e.target.value)} placeholder="Nome do clube"
                              className="h-8 text-sm bg-background border-border text-foreground" />
                            <Input value={rLogo} onChange={(e) => setRLogo(e.target.value)} placeholder="URL do escudo"
                              className="h-8 text-sm bg-background border-border text-foreground" />
                            <div className="flex gap-2">
                              <Button size="sm" className="h-7 bg-success text-success-foreground hover:bg-success/90" onClick={doResolve} disabled={isPending || !rTeam.trim()}>
                                <Check className="w-3 h-3 mr-1" /> Salvar
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => setResolving(null)}>Cancelar</Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        <p className="text-[hsl(var(--faint))] text-xs flex items-center gap-1">
          <Trophy className="w-3.5 h-3.5" /> Datas e estádios dos jogos são editados na tabela de jogos abaixo.
        </p>
      </CardContent>
    </Card>
  );
}

// Painel de sorteio das quartas: 4 confrontos, cada um com mandante (ida) e visitante.
function QuartasDraw({
  tournamentSlug, tournamentId, competition, oitavas, onDone,
}: {
  tournamentSlug: string; tournamentId: number; competition: string;
  oitavas: TieView[]; onDone: (msg: string, ok: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  // para cada QF (0..3): { home: oitavaSlot, away: oitavaSlot }
  const [rows, setRows] = useState<{ home: number | ''; away: number | '' }[]>([
    { home: '', away: '' }, { home: '', away: '' }, { home: '', away: '' }, { home: '', away: '' },
  ]);

  const winners = oitavas.filter((t) => t.winner_team).map((t) => ({ slot: t.slot, name: t.winner_team as string }));

  function submit() {
    const mappings: { source_slot: number; target_slot: number; target_side: 'a' | 'b' }[] = [];
    const used = new Set<number>();
    for (let qf = 0; qf < 4; qf++) {
      const { home, away } = rows[qf];
      if (home === '' || away === '') return onDone('Preencha mandante e visitante de todas as quartas.', false);
      if (home === away) return onDone('Mandante e visitante não podem ser o mesmo classificado.', false);
      if (used.has(home) || used.has(away)) return onDone('Cada classificado só pode ser usado uma vez.', false);
      used.add(home); used.add(away);
      mappings.push({ source_slot: home as number, target_slot: qf, target_side: 'a' });
      mappings.push({ source_slot: away as number, target_slot: qf, target_side: 'b' });
    }
    if (!window.confirm('Confirmar o sorteio das quartas? Isso liga os confrontos e cria os jogos.')) return;
    startTransition(async () => {
      const res = await applyRoundDraw(tournamentSlug, tournamentId, competition, 'oitavas', 'quartas', mappings);
      onDone(res.error ? res.error : 'Quartas montadas!', !res.error);
    });
  }

  return (
    <div className="mt-2 rounded border border-border p-3 space-y-2 bg-background">
      <p className="text-card-foreground text-xs">Escolha o mandante (joga a ida em casa) e o visitante de cada confronto das quartas.</p>
      {rows.map((row, qf) => (
        <div key={qf} className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs w-16">Quartas {qf + 1}</span>
          <select value={row.home} onChange={(e) => setRows((p) => p.map((r, i) => i === qf ? { ...r, home: e.target.value === '' ? '' : Number(e.target.value) } : r))}
            className="bg-background border border-border text-foreground rounded px-2 py-1 text-xs flex-1">
            <option value="">Mandante…</option>
            {winners.map((w) => <option key={w.slot} value={w.slot}>{w.name}</option>)}
          </select>
          <span className="text-[hsl(var(--faint))] text-xs">x</span>
          <select value={row.away} onChange={(e) => setRows((p) => p.map((r, i) => i === qf ? { ...r, away: e.target.value === '' ? '' : Number(e.target.value) } : r))}
            className="bg-background border border-border text-foreground rounded px-2 py-1 text-xs flex-1">
            <option value="">Visitante…</option>
            {winners.map((w) => <option key={w.slot} value={w.slot}>{w.name}</option>)}
          </select>
        </div>
      ))}
      <Button size="sm" onClick={submit} disabled={isPending} className="bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]">
        {isPending ? 'Aplicando…' : 'Aplicar sorteio'}
      </Button>
    </div>
  );
}
