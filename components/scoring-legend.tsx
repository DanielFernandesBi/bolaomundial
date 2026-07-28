import { Award, Trophy, Timer, Crosshair } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Rule {
  pts: string;
  bg: string;
  textColor?: string;
  title: string;
  desc: string;
}

function RuleRow({ rule }: { rule: Rule }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
      <div className={`w-14 h-14 ${rule.bg} rounded flex items-center justify-center flex-shrink-0`}>
        <span className={`font-bold text-lg ${rule.textColor ?? 'text-white'}`}>{rule.pts}</span>
      </div>
      <div className="flex-1">
        <div className="text-white font-semibold">{rule.title}</div>
        <div className="text-slate-400 text-sm">{rule.desc}</div>
      </div>
    </div>
  );
}

const REGULAR_RULES: Rule[] = [
  { pts: '30', bg: 'bg-amber-500', textColor: 'text-black', title: 'A. Placar Exato (Cravada)', desc: 'Acertou exatamente o placar do tempo normal' },
  { pts: '17', bg: 'bg-purple-500', title: 'B. Vencedor + Gols do Vencedor', desc: 'Acertou quem venceu e o nº exato de gols desse time' },
  { pts: '15', bg: 'bg-blue-500', title: 'C. Vencedor + Saldo de Gols', desc: 'Acertou quem venceu e a diferença exata de gols' },
  { pts: '15', bg: 'bg-teal-500', title: 'E. Empate Seco', desc: 'Acertou que terminaria empatado, mas errou o placar exato' },
  { pts: '12', bg: 'bg-green-500', title: 'D. Vencedor + Gols do Perdedor', desc: 'Acertou quem venceu e o nº exato de gols do time derrotado' },
  { pts: '10', bg: 'bg-cyan-500', title: 'F. Vencedor Seco', desc: 'Acertou apenas quem venceu a partida' },
  { pts: '3', bg: 'bg-orange-500', title: 'G. Consolação (Gols Avulsos)', desc: 'Errou o resultado, mas acertou os gols de um dos times' },
];

const KNOCKOUT_RULES: Rule[] = [
  { pts: '+5', bg: 'bg-indigo-500', title: 'Prorrogação', desc: 'Acertou o resultado da prorrogação (vence A, empate ou vence B). Só conta se o jogo for à prorrogação.' },
  { pts: '+5', bg: 'bg-pink-500', title: 'Pênaltis — vencedor', desc: 'Acertou quem venceu nos pênaltis. Só conta se houver pênaltis.' },
  { pts: '+10', bg: 'bg-pink-600', title: 'Pênaltis — placar exato', desc: 'Acertou o placar exato dos pênaltis (substitui o ponto de vencedor).' },
];

const PODIUM_RULES: Rule[] = [
  { pts: '40', bg: 'bg-amber-500', textColor: 'text-black', title: 'Campeão', desc: 'Acertou a seleção campeã' },
  { pts: '25', bg: 'bg-orange-500', title: '3º lugar', desc: 'Acertou a seleção em terceiro' },
  { pts: '20', bg: 'bg-slate-400', textColor: 'text-black', title: 'Vice-campeão', desc: 'Acertou a seleção vice-campeã' },
  { pts: '+10', bg: 'bg-amber-700', title: 'Consolação de pódio', desc: 'Um time que você escalou chegou ao pódio, mas em posição diferente (uma vez por time)' },
];

export function ScoringLegend() {
  return (
    <Card className="bg-slate-900 border-slate-800 mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Award className="w-5 h-5 text-amber-500" />
          Sistema de Pontuação
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Tempo normal */}
          <div className="space-y-3">
            <p className="text-slate-400 text-sm">
              Pontuação hierárquica: você recebe sempre a pontuação da categoria mais alta que seu palpite atingir no
              tempo normal.
            </p>
            {REGULAR_RULES.map((r) => (
              <RuleRow key={r.title} rule={r} />
            ))}
          </div>

          {/* Mata-mata */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pt-2">
              <Timer className="w-4 h-4 text-indigo-400" />
              <h3 className="text-white font-semibold">Mata-mata (prorrogação e pênaltis)</h3>
            </div>
            <p className="text-slate-400 text-sm">
              Em jogos de mata-mata você também palpita a prorrogação e os pênaltis. São pontos extras que{' '}
              <strong className="text-slate-300">somam</strong> ao tempo normal — e só contam se a fase realmente acontecer.
            </p>
            {KNOCKOUT_RULES.map((r) => (
              <RuleRow key={r.title} rule={r} />
            ))}
          </div>

          {/* Pódio */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pt-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <h3 className="text-white font-semibold">Pódio do torneio (campeão, vice e 3º)</h3>
            </div>
            <p className="text-slate-400 text-sm">
              Palpite único por torneio de mata-mata, travado no início do primeiro jogo. Conta no fim do torneio.
            </p>
            {PODIUM_RULES.map((r) => (
              <RuleRow key={r.title} rule={r} />
            ))}
          </div>

          <div className="flex items-start gap-2 text-slate-500 text-xs pt-1">
            <Crosshair className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Torneios de fase de grupos usam apenas a tabela de tempo normal. Prorrogação, pênaltis e pódio aparecem
              somente em torneios de mata-mata.
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
