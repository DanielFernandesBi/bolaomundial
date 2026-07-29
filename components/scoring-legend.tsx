import { Award, Trophy, Timer, Crosshair } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { tierBadge, tierLabel, bonusBadge, type ScoreTier } from '@/lib/scoring-ui';

interface Rule {
  pts: string;
  tier: ScoreTier;
  title: string;
  desc: string;
}

// 'groups' = só tempo normal · 'clubs' = mata-mata de clubes (pênaltis por vencedor, sem
// prorrogação, pódio por competição) · 'legacy' = Mundial (prorrogação + pênaltis por placar)
export type ScoringVariant = 'groups' | 'clubs' | 'legacy';

function RuleRow({ rule, bonus = false }: { rule: Rule; bonus?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
      <div
        className={`w-14 h-14 ${bonus ? bonusBadge : tierBadge[rule.tier]} rounded flex items-center justify-center flex-shrink-0`}
      >
        <span className="text-lg">{rule.pts}</span>
      </div>
      <div className="flex-1">
        <div className="text-foreground font-semibold">{rule.title}</div>
        <div className="text-muted-foreground text-sm">{rule.desc}</div>
      </div>
    </div>
  );
}

const REGULAR_RULES: Rule[] = [
  { pts: '30', tier: 'exact', title: 'A. Placar Exato (Cravada)', desc: 'Acertou exatamente o placar do tempo normal' },
  { pts: '17', tier: 'partial', title: 'B. Vencedor + Gols do Vencedor', desc: 'Acertou quem venceu e o nº exato de gols desse time' },
  { pts: '15', tier: 'partial', title: 'C. Vencedor + Saldo de Gols', desc: 'Acertou quem venceu e a diferença exata de gols' },
  { pts: '15', tier: 'partial', title: 'E. Empate Seco', desc: 'Acertou que terminaria empatado, mas errou o placar exato' },
  { pts: '12', tier: 'partial', title: 'D. Vencedor + Gols do Perdedor', desc: 'Acertou quem venceu e o nº exato de gols do time derrotado' },
  { pts: '10', tier: 'partial', title: 'F. Vencedor Seco', desc: 'Acertou apenas quem venceu a partida' },
  { pts: '3', tier: 'partial', title: 'G. Consolação (Gols Avulsos)', desc: 'Errou o resultado, mas acertou os gols de um dos times' },
  { pts: '0', tier: 'none', title: 'Sem pontos', desc: 'O palpite não se encaixou em nenhuma das categorias acima' },
];

// As três faixas em que as categorias acima se agrupam visualmente.
const TIER_ORDER: ScoreTier[] = ['exact', 'partial', 'none'];

// Mundial legado: prorrogação + pênaltis por placar
const KNOCKOUT_LEGACY: Rule[] = [
  { pts: '+5', tier: 'partial', title: 'Prorrogação', desc: 'Acertou o resultado da prorrogação (vence A, empate ou vence B). Só conta se o jogo for à prorrogação.' },
  { pts: '+5', tier: 'partial', title: 'Pênaltis — vencedor', desc: 'Acertou quem venceu nos pênaltis. Só conta se houver pênaltis.' },
  { pts: '+10', tier: 'partial', title: 'Pênaltis — placar exato', desc: 'Acertou o placar exato dos pênaltis (substitui o ponto de vencedor).' },
];

// Clubes: sem prorrogação; pênaltis só o vencedor
const KNOCKOUT_CLUBS: Rule[] = [
  { pts: '+7', tier: 'partial', title: 'Pênaltis — vencedor', desc: 'Acertou quem vence os pênaltis. Só conta quando o confronto vai aos pênaltis (agregado empatado). Não há prorrogação nem placar de pênaltis.' },
];

// Pódio do Mundial (campeão/vice/3º)
const PODIUM_LEGACY: Rule[] = [
  { pts: '40', tier: 'exact', title: 'Campeão', desc: 'Acertou a seleção campeã' },
  { pts: '20', tier: 'none', title: 'Vice-campeão', desc: 'Acertou a seleção vice-campeã' },
  { pts: '25', tier: 'none', title: '3º lugar', desc: 'Acertou a seleção em terceiro' },
  { pts: '+10', tier: 'partial', title: 'Consolação de pódio', desc: 'Um time que você escalou chegou ao pódio, mas em posição diferente (uma vez por time)' },
];

// Pódio dos clubes (campeão/vice por competição, sem 3º)
const PODIUM_CLUBS: Rule[] = [
  { pts: '40', tier: 'exact', title: 'Campeão', desc: 'Acertou o campeão da competição' },
  { pts: '25', tier: 'none', title: 'Vice-campeão', desc: 'Acertou o vice da competição' },
  { pts: '+10', tier: 'partial', title: 'Consolação de pódio', desc: 'Acertou o time no pódio, mas na posição trocada (campeão↔vice)' },
];

export function ScoringLegend({ variant = 'legacy' }: { variant?: ScoringVariant }) {
  const isClubs = variant === 'clubs';
  const showKnockout = variant !== 'groups';
  const knockoutRules = isClubs ? KNOCKOUT_CLUBS : KNOCKOUT_LEGACY;
  const podiumRules = isClubs ? PODIUM_CLUBS : PODIUM_LEGACY;

  return (
    <Card className="bg-card border-border mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Award className="w-5 h-5 text-primary" />
          Sistema de Pontuação
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Tempo normal — agrupado nas 3 faixas */}
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Pontuação hierárquica: você recebe sempre a pontuação da categoria mais alta que seu palpite atingir no
              tempo normal.
            </p>
            {TIER_ORDER.map((tier) => {
              const rules = REGULAR_RULES.filter((r) => r.tier === tier);
              if (rules.length === 0) return null;
              return (
                <div key={tier} className="space-y-3">
                  <p className="text-[hsl(var(--faint))] text-xs font-semibold uppercase tracking-wider pt-1">
                    {tierLabel[tier]}
                  </p>
                  {rules.map((r) => (
                    <RuleRow key={r.title} rule={r} />
                  ))}
                </div>
              );
            })}
          </div>

          {/* Mata-mata */}
          {showKnockout && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pt-2">
                <Timer className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-foreground font-semibold">
                  {isClubs ? 'Mata-mata (pênaltis)' : 'Mata-mata (prorrogação e pênaltis)'}
                </h3>
              </div>
              <p className="text-muted-foreground text-sm">
                {isClubs ? (
                  <>
                    Nos jogos de volta você também palpita <strong className="text-card-foreground">quem vence os pênaltis</strong>.
                    É um ponto extra que <strong className="text-card-foreground">soma</strong> ao tempo normal e só conta se o
                    confronto for decidido nos pênaltis (agregado empatado). <strong className="text-card-foreground">Não há prorrogação.</strong>
                  </>
                ) : (
                  <>
                    Em jogos de mata-mata você também palpita a prorrogação e os pênaltis. São pontos extras que{' '}
                    <strong className="text-card-foreground">somam</strong> ao tempo normal — e só contam se a fase realmente acontecer.
                  </>
                )}
              </p>
              {knockoutRules.map((r) => (
                <RuleRow key={r.title} rule={r} bonus />
              ))}
            </div>
          )}

          {/* Pódio */}
          {showKnockout && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pt-2">
                <Trophy className="w-4 h-4 text-primary" />
                <h3 className="text-foreground font-semibold">
                  {isClubs ? 'Pódio por competição (campeão e vice)' : 'Pódio do torneio (campeão, vice e 3º)'}
                </h3>
              </div>
              <p className="text-muted-foreground text-sm">
                {isClubs
                  ? 'Palpite de campeão e vice de cada competição (Copa do Brasil, Sul-Americana, Libertadores), travado no início de cada uma. Conta no fim de cada competição.'
                  : 'Palpite único por torneio de mata-mata, travado no início do primeiro jogo. Conta no fim do torneio.'}
              </p>
              {podiumRules.map((r) => (
                <RuleRow key={r.title} rule={r} />
              ))}
            </div>
          )}

          <div className="flex items-start gap-2 text-[hsl(var(--faint))] text-xs pt-1">
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
