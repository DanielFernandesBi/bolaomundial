'use client';

import { useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { updateMatchScore, deleteMatch } from './actions';
import { EditMatchDialog } from './edit-match-dialog';
import { Toast } from '@/components/toast';

interface Match {
  id: number;
  team_home: string;
  team_away: string;
  home_iso: string | null;
  away_iso: string | null;
  match_date: string | null;
  score_home: number | null;
  score_away: number | null;
  status: string;
  phase?: string | null;
  is_knockout?: boolean;
  has_extra_time?: boolean;
  penalty_prediction_mode?: 'score' | 'winner';
  competition?: string | null;
  leg?: string | null;
  extra_time_result?: 'home' | 'draw' | 'away' | null;
  pen_home?: number | null;
  pen_away?: number | null;
  pen_winner?: 'home' | 'away' | null;
}

interface AdminMatchesTableProps {
  initialMatches: Match[];
  tournamentSlug: string;
}

export function AdminMatchesTable({ initialMatches, tournamentSlug }: AdminMatchesTableProps) {
  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [saving, setSaving] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  async function handleSave(matchId: number) {
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;

    setSaving(matchId);
    setToast(null);

    const scoreHome = match.score_home !== null ? parseInt(match.score_home.toString()) : null;
    const scoreAway = match.score_away !== null ? parseInt(match.score_away.toString()) : null;

    const knockout = match.is_knockout
      ? {
          extraTimeResult: (match.extra_time_result || null) as 'home' | 'draw' | 'away' | null,
          penHome: match.pen_home ?? null,
          penAway: match.pen_away ?? null,
          penWinner: (match.pen_winner || null) as 'home' | 'away' | null,
        }
      : undefined;

    const result = await updateMatchScore(matchId, scoreHome, scoreAway, match.status, tournamentSlug, knockout);

    if (result.error) {
      setToast({ message: result.error, type: 'error' });
      setSaving(null);
      setTimeout(() => setToast(null), 4000);
      return;
    }

    // Mensagens da auto-progressão do chaveamento
    if (result.bracketWarning) {
      setToast({ message: result.bracketWarning, type: 'error' });
      setSaving(null);
      setTimeout(() => setToast(null), 6000);
      return;
    }

    const msg = result.bracketInfo
      ? `Jogo atualizado! ${result.bracketInfo}`
      : 'Jogo atualizado com sucesso!';
    setToast({ message: msg, type: 'success' });

    setSaving(null);
    setTimeout(() => setToast(null), result.bracketInfo ? 5000 : 3000);
  }

  function updateMatchField(matchId: number, field: string, value: any) {
    setMatches((prev) =>
      prev.map((match) =>
        match.id === matchId ? { ...match, [field]: value } : match
      )
    );
  }

  async function handleDelete(matchId: number) {
    setDeleting(matchId);
    setToast(null);

    const result = await deleteMatch(matchId, tournamentSlug);

    if (result.error) {
      setToast({ message: result.error, type: 'error' });
      setDeleting(null);
      setTimeout(() => setToast(null), 5000); // Mostrar erro por mais tempo
    } else {
      setToast({ message: 'Jogo deletado com sucesso!', type: 'success' });
      // Remover o jogo da lista local apenas se deletou com sucesso
      setMatches((prev) => prev.filter((match) => match.id !== matchId));
      setDeleting(null);
      // Recarregar a página após um pequeno delay para garantir sincronização
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return '⚠ Data a definir';
    const date = new Date(dateString);
    const days = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
    const months = [
      'jan.',
      'fev.',
      'mar.',
      'abr.',
      'mai.',
      'jun.',
      'jul.',
      'ago.',
      'set.',
      'out.',
      'nov.',
      'dez.',
    ];

    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${dayName}, ${day} de ${month} às ${hours}:${minutes}`;
  }

  function renderKnockout(match: Match) {
    const showExtraTime = match.has_extra_time !== false;
    const penMode = match.penalty_prediction_mode ?? (showExtraTime ? 'score' : 'winner');
    const penWinnerMode = penMode === 'winner';
    return (
      <div className="mt-2 rounded-md border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-2">
        <p className="text-indigo-300 text-xs font-semibold">Mata-mata (deixe vazio se não houve)</p>
        {showExtraTime && (
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground text-xs w-20">Prorrogação</label>
            <select
              value={match.extra_time_result ?? ''}
              onChange={(e) => updateMatchField(match.id, 'extra_time_result', e.target.value || null)}
              className="bg-background border border-border text-foreground rounded-md px-2 py-1 text-xs flex-1"
            >
              <option value="">— não houve —</option>
              <option value="home">{match.team_home} venceu</option>
              <option value="draw">Empate (foi aos pênaltis)</option>
              <option value="away">{match.team_away} venceu</option>
            </select>
          </div>
        )}
        {!penWinnerMode ? (
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground text-xs w-20">Pênaltis</label>
            <Input
              type="number"
              min="0"
              placeholder={match.team_home}
              value={match.pen_home ?? ''}
              onChange={(e) =>
                updateMatchField(match.id, 'pen_home', e.target.value === '' ? null : parseInt(e.target.value))
              }
              className="w-16 text-center bg-background border-border text-foreground h-9"
            />
            <span className="text-foreground">x</span>
            <Input
              type="number"
              min="0"
              placeholder={match.team_away}
              value={match.pen_away ?? ''}
              onChange={(e) =>
                updateMatchField(match.id, 'pen_away', e.target.value === '' ? null : parseInt(e.target.value))
              }
              className="w-16 text-center bg-background border-border text-foreground h-9"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground text-xs w-20">Pênaltis (vencedor)</label>
            <select
              value={match.pen_winner ?? ''}
              onChange={(e) => updateMatchField(match.id, 'pen_winner', e.target.value || null)}
              className="bg-background border border-border text-foreground rounded-md px-2 py-1 text-xs flex-1"
            >
              <option value="">— não houve —</option>
              <option value="home">{match.team_home} venceu</option>
              <option value="away">{match.team_away} venceu</option>
            </select>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <Toast message={toast.message} tone={toast.type === 'success' ? 'success' : 'error'} />
      )}

      {/* Cards Mobile (md:hidden) */}
      <div className="md:hidden space-y-4">
        {matches.map((match) => {
          const isFinished = match.status === 'FINISHED';
          return (
            <Card
              key={match.id}
              className={`bg-card border-border ${
                isFinished ? 'border-state-open/50 bg-state-open/5' : ''
              }`}
            >
              <CardContent className="p-4 space-y-4">
                {/* Data e Status */}
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-sm">{formatDate(match.match_date)}</p>
                  <select
                    value={match.status}
                    onChange={(e) => updateMatchField(match.id, 'status', e.target.value)}
                    className="bg-background border border-border text-foreground rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="SCHEDULED">SCHEDULED</option>
                    <option value="FINISHED">FINISHED</option>
                  </select>
                </div>

                {/* Jogo */}
                <div>
                  <p className="text-foreground font-semibold text-lg mb-4">
                    {match.team_home} vs {match.team_away}
                  </p>
                </div>

                {/* Placar - Inputs grandes */}
                <div className="space-y-3">
                  <div>
                    <label className="text-muted-foreground text-sm mb-2 block">
                      Placar {match.team_home}
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={match.score_home ?? ''}
                      onChange={(e) =>
                        updateMatchField(
                          match.id,
                          'score_home',
                          e.target.value === '' ? null : parseInt(e.target.value)
                        )
                      }
                      className="w-full h-12 text-center text-lg bg-background border-border text-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-muted-foreground text-sm mb-2 block">
                      Placar {match.team_away}
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={match.score_away ?? ''}
                      onChange={(e) =>
                        updateMatchField(
                          match.id,
                          'score_away',
                          e.target.value === '' ? null : parseInt(e.target.value)
                        )
                      }
                      className="w-full h-12 text-center text-lg bg-background border-border text-foreground"
                    />
                  </div>
                </div>

                {/* Mata-mata: prorrogação / pênaltis */}
                {match.is_knockout && renderKnockout(match)}

                {/* Ações */}
                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    onClick={() => handleSave(match.id)}
                    disabled={saving === match.id || deleting === match.id}
                    className="w-full h-12 bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))] text-base font-semibold"
                  >
                    {saving === match.id ? (
                      'Salvando...'
                    ) : (
                      <>
                        <Save className="w-5 h-5 mr-2" />
                        Salvar Placar
                      </>
                    )}
                  </Button>
                  <div className="flex items-center gap-2">
                    <EditMatchDialog match={match} tournamentSlug={tournamentSlug} />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deleting === match.id || saving === match.id}
                          className="flex-1 bg-red-600 hover:bg-red-700 h-10"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Deletar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-card border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-foreground">
                            Confirmar Exclusão
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-card-foreground">
                            Tem certeza que deseja deletar o jogo{' '}
                            <strong className="text-foreground">
                              {match.team_home} vs {match.team_away}
                            </strong>
                            ?
                            <br />
                            <br />
                            Esta ação não pode ser desfeita. Se o jogo possuir palpites,
                            a exclusão será bloqueada.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="text-card-foreground hover:text-foreground">
                            Cancelar
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(match.id)}
                            disabled={deleting === match.id}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            {deleting === match.id ? 'Deletando...' : 'Deletar'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabela Desktop (hidden md:block) */}
      <Card className="bg-card border-border hidden md:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-card-foreground">Data</TableHead>
                  <TableHead className="text-card-foreground">Jogo</TableHead>
                  <TableHead className="text-card-foreground text-center">Placar A</TableHead>
                  <TableHead className="text-card-foreground text-center">Placar B</TableHead>
                  <TableHead className="text-card-foreground">Status</TableHead>
                  <TableHead className="text-card-foreground">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map((match) => {
                  const isFinished = match.status === 'FINISHED';
                  return (
                    <TableRow
                      key={match.id}
                      className={`border-border ${
                        isFinished
                          ? 'bg-state-open/10 hover:bg-state-open/20'
                          : 'hover:bg-accent/50'
                      }`}
                    >
                      <TableCell className="text-card-foreground text-sm">
                        {formatDate(match.match_date)}
                      </TableCell>
                      <TableCell className="text-foreground font-medium">
                        <div>{match.team_home} vs {match.team_away}</div>
                        {match.is_knockout && renderKnockout(match)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          min="0"
                          value={match.score_home ?? ''}
                          onChange={(e) =>
                            updateMatchField(
                              match.id,
                              'score_home',
                              e.target.value === '' ? null : parseInt(e.target.value)
                            )
                          }
                          className="w-20 text-center bg-background border-border text-foreground"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          min="0"
                          value={match.score_away ?? ''}
                          onChange={(e) =>
                            updateMatchField(
                              match.id,
                              'score_away',
                              e.target.value === '' ? null : parseInt(e.target.value)
                            )
                          }
                          className="w-20 text-center bg-background border-border text-foreground"
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          value={match.status}
                          onChange={(e) =>
                            updateMatchField(match.id, 'status', e.target.value)
                          }
                          className="bg-background border border-border text-foreground rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="SCHEDULED">SCHEDULED</option>
                          <option value="FINISHED">FINISHED</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <EditMatchDialog match={match} tournamentSlug={tournamentSlug} />
                          <Button
                            onClick={() => handleSave(match.id)}
                            disabled={saving === match.id || deleting === match.id}
                            size="sm"
                            className="bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]"
                          >
                            {saving === match.id ? (
                              'Salvando...'
                            ) : (
                              <>
                                <Save className="w-4 h-4 mr-2" />
                                Salvar Placar
                              </>
                            )}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={deleting === match.id || saving === match.id}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-card border-border">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-foreground">
                                  Confirmar Exclusão
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-card-foreground">
                                  Tem certeza que deseja deletar o jogo{' '}
                                  <strong className="text-foreground">
                                    {match.team_home} vs {match.team_away}
                                  </strong>
                                  ?
                                  <br />
                                  <br />
                                  Esta ação não pode ser desfeita. Se o jogo possuir palpites,
                                  a exclusão será bloqueada.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="text-card-foreground hover:text-foreground">
                                  Cancelar
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(match.id)}
                                  disabled={deleting === match.id}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  {deleting === match.id ? 'Deletando...' : 'Deletar'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Legenda */}
      <div className="mt-4 text-muted-foreground text-sm">
        <p>
          💡 <strong>Dica:</strong> Jogos finalizados aparecem destacados em verde. 
          Ao alterar o status para 'FINISHED', os pontos serão calculados automaticamente.
        </p>
      </div>
    </>
  );
}

