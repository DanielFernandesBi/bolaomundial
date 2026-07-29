import { Award, Trophy, Timer, Crosshair } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Rule {
  pts: string;
  bg: string;
  textColor?: string;
  title: string;
  desc: string;
}

// 'groups' = só tempo normal · 'clubs' = mata-mata de clubes (pênaltis por vencedor, sem
// prorrogação, pódio por competição) · 'legacy' = Mundial (prorrogação + pênaltis por placar)
export type ScoringVariant = 'groups' | 'clubs' | 'legacy';

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

// Mundial legado: prorrogação + pênaltis por placar
const KNOCKOUT_LEGACY: Rule[] = [
  { pts: '+5', bg: 'bg-indigo-500', title: 'Prorrogação', desc: 'Acertou o resultado da prorrogação (vence A, empate ou vence B). Só conta se o jogo for à prorrogação.' },
  { pts: '+5', bg: 'bg-pink-500', title: 'Pênaltis — vencedor', desc: 'Acertou quem venceu nos pênaltis. Só conta se houver pênaltis.' },
  { pts: '+10', bg: 'bg-pink-600', title: 'Pênaltis — placar exato', desc: 'Acertou o placar exato dos pênaltis (substitui o ponto de vencedor).' },
];

// Clubes: sem prorrogação; pênaltis só o vencedor
const KNOCKOUT_CLUBS: Rule[] = [
  { pts: '+7', bg: 'bg-pink-500', title: 'Pênaltis — vencedor', desc: 'Acertou quem vence os pênaltis. Só conta quando o confronto vai aos pênaltis (agregado empatado). Não há prorrogação nem placar de pênaltis.' },
];

// Pódio do Mundial (campeão/vice/3º)
const PODIUM_LEGACY: Rule[] = [
  { pts: '40', bg: 'bg-amber-500', textColor: 'text-black', title: 'Campeão', desc: 'Acertou a seleção campeã' },
  { pts: '20', bg: 'bg-slate-400', textColor: 'text-black', title: 'Vice-campeão', desc: 'Acertou a seleção vice-campeã' },
  { pts: '25', bg: 'bg-orange-500', title: '3º lugar', desc: 'Acertou a seleção em terceiro' },
  { pts: '+10', bg: 'bg-amber-700', title: 'Consolação de pódio', desc: 'Um time que você escalou chegou ao pódio, mas em posição diferente (uma vez por time)' },
];

// Pódio dos clubes (campeão/vice por competição, sem 3º)
const PODIUM_CLUBS: Rule[] = [
  { pts: '40', bg: 'bg-amber-500', textColor: 'text-black', title: 'Campeão', desc: 'Acertou o campeão da competição' },
  { pts: '25', bg: 'bg-slate-400', textColor: 'text-black', title: 'Vice-campeão', desc: 'Acertou o vice da competição' },
  { pts: '+10', bg: 'bg-amber-700', title: 'Consolação de pódio', desc: 'Acertou o time no pódio, mas na posição trocada (campeão↔vice)' },
];

export function ScoringLegend({ variant = 'legacy' }: { variant?: ScoringVariant }) {
  const isClubs = variant === 'clubs';
  const showKnockout = variant !== 'groups';
  const knockoutRules = isClubs ? KNOCKOUT_CLUBS : KNOCKOUT_LEGACY;
  const podiumRules = isClubs ? PODIUM_CLUBS : PODIUM_LEGACY;

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
          {showKnockout && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pt-2">
                <Timer className="w-4 h-4 text-indigo-400" />
                <h3 className="text-white font-semibold">
                  {isClubs ? 'Mata-mata (pênaltis)' : 'Mata-mata (prorrogação e pênaltis)'}
                </h3>
              </div>
              <p className="text-slate-400 text-sm">
                {isClubs ? (
                  <>
                    Nos jogos de volta você também palpita <strong className="text-slate-300">quem vence os pênaltis</strong>.
                    É um ponto extra que <strong className="text-slate-300">soma</strong> ao tempo normal e só conta se o
                    confronto for decidido nos pênaltis (agregado empatado). <strong className="text-slate-300">Não há prorrogação.</strong>
                  </>
                ) : (
                  <>
                    Em jogos de mata-mata você também palpita a prorrogação e os pênaltis. São pontos extras que{' '}
                    <strong className="text-slate-300">somam</strong> ao tempo normal — e só contam se a fase realmente acontecer.
                  </>
                )}
              </p>
              {knockoutRules.map((r) => (
                <RuleRow key={r.title} rule={r} />
              ))}
            </div>
          )}

          {/* Pódio */}
          {showKnockout && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pt-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h3 className="text-white font-semibold">
                  {isClubs ? 'Pódio por competição (campeão e vice)' : 'Pódio do torneio (campeão, vice e 3º)'}
                </h3>
              </div>
              <p className="text-slate-400 text-sm">
                {isClubs
                  ? 'Palpite de campeão e vice de cada competição (Copa do Brasil, Sul-Americana, Libertadores), travado no início de cada uma. Conta no fim de cada competição.'
                  : 'Palpite único por torneio de mata-mata, travado no início do primeiro jogo. Conta no fim do torneio.'}
              </p>
              {podiumRules.map((r) => (
                <RuleRow key={r.title} rule={r} />
              ))}
            </div>
          )}

          <div className="flex items-start gap-2 text-slate-500 text-xs pt-1">
            <Crosshair className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              {variant === 'groups'
                ? 'Este torneio usa apenas a tabela de tempo normal.'
                : isClubs
                ? 'Nestes torneios não há prorrogação: o pênalti só decide quando o agregado das duas pernas empata.'
                : 'Torneios de fase de grupos usam apenas a tabela de tempo normal. Prorrogação, pênaltis e pódio aparecem somente em torneios de mata-mata.'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
