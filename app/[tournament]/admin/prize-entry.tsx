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

  const inputClass = 'bg-slate-950 border-slate-700 text-white';

  return (
    <Card className="bg-slate-900 border-slate-800 mb-8">
      <CardContent className="p-6">
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-md shadow-lg ${
              toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
            }`}
          >
            {toast.message}
          </div>
        )}

        <div className="flex items-center gap-2 mb-1">
          <Gift className="w-5 h-5 text-amber-500" />
          <h2 className="text-xl font-bold text-white">Premiação</h2>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          Defina os prêmios. O total aparece como <strong>“prêmio em disputa”</strong> no topo do torneio.
          Ao encerrar, clique em <strong>Distribuir</strong> para creditar aos 3 primeiros do ranking.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-amber-400 text-sm font-semibold">🏆 1º lugar (R$)</Label>
            <Input type="number" min="0" step="0.01" value={first} onChange={(e) => setFirst(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1">
            <Label className="text-slate-300 text-sm font-semibold">🥈 2º lugar (R$)</Label>
            <Input type="number" min="0" step="0.01" value={second} onChange={(e) => setSecond(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1">
            <Label className="text-orange-400 text-sm font-semibold">🥉 3º lugar (R$)</Label>
            <Input type="number" min="0" step="0.01" value={third} onChange={(e) => setThird(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 text-slate-300">
          <DollarSign className="w-4 h-4 text-amber-500" />
          Total em disputa: <strong className="text-amber-500">{formatMoney(total)}</strong>
        </div>

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <Button onClick={handleSave} disabled={saving} className="bg-amber-500 text-black hover:bg-amber-400">
            {saving ? 'Salvando...' : 'Salvar Premiação'}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={distributing} variant="outline" className="text-green-400 border-green-500 hover:bg-green-500/10">
                {distributing ? 'Distribuindo...' : 'Distribuir aos vencedores'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-slate-900 border-slate-800">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-white">Distribuir prêmios?</AlertDialogTitle>
                <AlertDialogDescription className="text-slate-300">
                  Isto credita os prêmios atuais aos <strong>3 primeiros</strong> do ranking deste torneio e atualiza o
                  dinheiro total (Ranking Geral e Hall da Fama). Faça isso com o torneio já encerrado. Pode rodar de
                  novo se reajustar os valores.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-slate-300 hover:text-white">Cancelar</AlertDialogCancel>
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
