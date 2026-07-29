'use client';

import { useState } from 'react';
import { DollarSign, Gift } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { setTournamentPrizes, distributePrizes } from './actions';
import { Toast } from '@/components/toast';

interface PrizeEntryProps {
  tournamentSlug: string;
  current: { first: number; second: number; third: number };
}

export function PrizeEntry({ tournamentSlug, current }: PrizeEntryProps) {
  const [first, setFirst] = useState(String(current.first || ''));
  const [second, setSecond] = useState(String(current.second || ''));
  const [third, setThird] = useState(String(current.third || ''));
  const [saving, setSaving] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  function formatMoney(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  }

  const total = (parseFloat(first) || 0) + (parseFloat(second) || 0) + (parseFloat(third) || 0);

  async function handleSave() {
    setSaving(true);
    const result = await setTournamentPrizes(tournamentSlug, {
      first: parseFloat(first) || 0,
      second: parseFloat(second) || 0,
      third: parseFloat(third) || 0,
    });
    if (result.error) showToast(result.error, 'error');
    else showToast('Premiação salva!', 'success');
    setSaving(false);
  }

  async function handleDistribute() {
    setDistributing(true);
    const result = await distributePrizes(tournamentSlug);
    if (result.error) showToast(result.error, 'error');
    else showToast('Prêmios distribuídos aos vencedores! Hall da Fama e Ranking Geral atualizados.', 'success');
    setDistributing(false);
  }

  const inputClass = 'bg-background border-border text-foreground';

  return (
    <Card className="bg-card border-border mb-8">
      <CardContent className="p-6">
        {toast && (
          <Toast message={toast.message} tone={toast.type === 'success' ? 'success' : 'error'} />
        )}

        <div className="flex items-center gap-2 mb-1">
          <Gift className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Premiação</h2>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          Defina os prêmios. O total aparece como <strong>“prêmio em disputa”</strong> no topo do torneio.
          Ao encerrar, clique em <strong>Distribuir</strong> para creditar aos 3 primeiros do ranking.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-primary text-sm font-semibold">🏆 1º lugar (R$)</Label>
            <Input type="number" min="0" step="0.01" value={first} onChange={(e) => setFirst(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1">
            <Label className="text-card-foreground text-sm font-semibold">🥈 2º lugar (R$)</Label>
            <Input type="number" min="0" step="0.01" value={second} onChange={(e) => setSecond(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1">
            <Label className="text-state-missing text-sm font-semibold">🥉 3º lugar (R$)</Label>
            <Input type="number" min="0" step="0.01" value={third} onChange={(e) => setThird(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 text-card-foreground">
          <DollarSign className="w-4 h-4 text-primary" />
          Total em disputa: <strong className="text-primary">{formatMoney(total)}</strong>
        </div>

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]">
            {saving ? 'Salvando...' : 'Salvar Premiação'}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={distributing} variant="outline" className="text-state-open border-green-500 hover:bg-state-open/10">
                {distributing ? 'Distribuindo...' : 'Distribuir aos vencedores'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-card border-border">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-foreground">Distribuir prêmios?</AlertDialogTitle>
                <AlertDialogDescription className="text-card-foreground">
                  Isto credita os prêmios atuais aos <strong>3 primeiros</strong> do ranking deste torneio e atualiza o
                  dinheiro total (Ranking Geral e Hall da Fama). Faça isso com o torneio já encerrado. Pode rodar de
                  novo se reajustar os valores.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-card-foreground hover:text-foreground">Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDistribute} className="bg-green-600 hover:bg-green-700">
                  Distribuir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
