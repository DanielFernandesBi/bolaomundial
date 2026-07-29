import Image from 'next/image';
import { Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getFlagUrl } from '@/lib/utils/flags';

interface Side {
  team: string | null;
  iso: string | null;
  label: string | null;
}

function SideView({ side }: { side: Side }) {
  if (side.team) {
    return (
      <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
        {side.iso &&
          (side.iso.toLowerCase().startsWith('http') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={side.iso} alt={side.team} className="w-10 h-10 rounded object-contain bg-slate-800" loading="lazy" />
          ) : (
            <Image src={getFlagUrl(side.iso)} alt={side.team} width={40} height={40} className="w-10 h-auto rounded" />
          ))}
        <span className="text-sm font-bold text-white text-center truncate w-full">{side.team}</span>
      </div>
    );
  }
  // pendente: mostra o rótulo de origem, nunca como se fosse um clube
  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      <div className="w-10 h-10 rounded bg-slate-800 border border-dashed border-slate-600 flex items-center justify-center">
        <Clock className="w-4 h-4 text-slate-500" />
      </div>
      <span className="text-xs text-slate-400 italic text-center leading-tight">{side.label ?? 'A definir'}</span>
    </div>
  );
}

export function PendingTieCard({ sideA, sideB }: { sideA: Side; sideB: Side }) {
  return (
    <Card className="bg-slate-900 border-slate-800 border-dashed opacity-90">
      <CardContent className="p-4">
        <div className="flex items-center justify-center gap-1 mb-3 text-amber-300/80 text-xs font-semibold">
          <Clock className="w-3.5 h-3.5" /> Aguardando playoff
        </div>
        <div className="flex items-center justify-between gap-2">
          <SideView side={sideA} />
          <span className="text-slate-500 text-lg font-bold">x</span>
          <SideView side={sideB} />
        </div>
        <p className="text-slate-500 text-[11px] text-center mt-3">O palpite abre quando os dois classificados forem definidos.</p>
      </CardContent>
    </Card>
  );
}
