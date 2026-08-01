// ============================================================================
// Invariantes do Monte Carlo do ranking do bolão.
//
//   npx tsc -p scripts/club-model/tsconfig.json
//   node scripts/club-model/dist/scripts/club-model/testa-bolao.js
// ============================================================================

import { runPoolSimulation, scoreLine, scorePodium } from '../../lib/club-model/index';
import type {
  ClubStrength,
  CompetitionBaseline,
  PoolInput,
  PoolPlayer,
  PoolTie,
} from '../../lib/club-model/index';

let falhas = 0;
function checa(nome: string, ok: boolean, detalhe = ''): void {
  if (!ok) falhas++;
  console.log(`  ${ok ? 'ok  ' : 'FALHA'}  ${nome}${detalhe ? '  — ' + detalhe : ''}`);
}
const perto = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

const forca = (k: string, atk = 1, def = 1, ev = 1e9): ClubStrength => ({
  teamKey: k, attack: atk, defense: def, attackPrior: atk, defensePrior: def,
  evidence: ev, matches: 0,
});

const BASE: CompetitionBaseline = { muHome: 1.468, muAway: 0.819, weight: 1 };
const ROUNDS = ['oitavas', 'quartas', 'semi', 'final'];

/** Chave de 8 clubes: 4 oitavas -> 2 semis -> 1 final. */
function chaveDe8(comp: string, ligada: boolean): PoolTie[] {
  const times = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const ties: PoolTie[] = [];
  for (let i = 0; i < 4; i++) {
    ties.push({
      tieId: 100 + i, competition: comp, round: 'oitavas', slot: i,
      teamA: times[i * 2], teamB: times[i * 2 + 1],
      keyA: times[i * 2].toLowerCase(), keyB: times[i * 2 + 1].toLowerCase(),
      seriesType: 'two_leg', hasExtraTime: false,
      // `ligada` decide se a chave diz quem enfrenta quem na fase seguinte.
      nextTieId: ligada ? 200 + Math.floor(i / 2) : null,
      nextSlotSide: ligada ? (i % 2 === 0 ? 'a' : 'b') : null,
      idaMatchId: 1000 + i * 2, voltaMatchId: 1000 + i * 2 + 1,
      idaPlayed: null, voltaPlayed: null, winnerTeam: null,
    });
  }
  for (let j = 0; j < 2; j++) {
    ties.push({
      tieId: 200 + j, competition: comp, round: 'semi', slot: j,
      teamA: null, teamB: null, keyA: null, keyB: null,
      seriesType: 'two_leg', hasExtraTime: false,
      nextTieId: 300, nextSlotSide: j === 0 ? 'a' : 'b',
      idaMatchId: null, voltaMatchId: null,
      idaPlayed: null, voltaPlayed: null, winnerTeam: null,
    });
  }
  ties.push({
    tieId: 300, competition: comp, round: 'final', slot: 0,
    teamA: null, teamB: null, keyA: null, keyB: null,
    seriesType: 'single', hasExtraTime: true,
    nextTieId: null, nextSlotSide: null,
    idaMatchId: null, voltaMatchId: null,
    idaPlayed: null, voltaPlayed: null, winnerTeam: null,
  });
  return ties;
}

const jogadores: PoolPlayer[] = [
  { userId: 'u1', username: 'Ana', avatarUrl: null, basePoints: 0 },
  { userId: 'u2', username: 'Bruno', avatarUrl: null, basePoints: 0 },
  { userId: 'u3', username: 'Caio', avatarUrl: null, basePoints: 0 },
];

const forcas = new Map<string, ClubStrength>();
for (const t of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) forcas.set(t, forca(t));

function base(over: Partial<PoolInput> = {}): PoolInput {
  return {
    players: jogadores,
    ties: chaveDe8('copa', true),
    predictions: [],
    podiumPicks: [],
    strengths: forcas,
    baselines: new Map([['copa', BASE]]),
    roundOrder: ROUNDS,
    scenarios: 3000,
    seed: 7,
    ...over,
  };
}

console.log('\n1. PONTUAÇÃO (espelho do SQL)\n');
checa('placar exato vale 30', scoreLine(2, 1, 2, 1) === 30);
checa('empate seco vale 15', scoreLine(1, 1, 2, 2) === 15);
checa('vencedor + gols do vencedor vale 17', scoreLine(3, 1, 3, 0) === 17);
checa('vencedor + saldo vale 15', scoreLine(2, 1, 3, 2) === 15);
checa('vencedor + gols do perdedor vale 12', scoreLine(3, 1, 2, 1) === 12);
checa('vencedor seco vale 10', scoreLine(4, 1, 2, 0) === 10);
// 2x0 contra 2x1 acerta o vencedor E os gols dele: são 17, não 3. Consolação
// é errar o vencedor e ainda assim cravar um dos placares.
checa('vencedor + gols do vencedor vale 17 (2x0 para 2x1)', scoreLine(2, 0, 2, 1) === 17);
checa('consolação vale 3', scoreLine(2, 1, 2, 3) === 3);
checa('errar tudo vale 0', scoreLine(0, 3, 2, 0) === 0);
checa('campeão certo vale 40', scorePodium('X', 'Y', 'X', 'Z') === 40);
checa('campeão e vice certos valem 65', scorePodium('X', 'Y', 'X', 'Y') === 65);
checa('campeão que foi vice vale 10', scorePodium('X', 'W', 'Z', 'X') === 10);

console.log('\n2. INVARIANTES DA SIMULAÇÃO\n');
{
  const r = runPoolSimulation(base());
  const somaTitulo = r.players.reduce((s, p) => s + p.titleChance, 0);
  checa('chances de título somam 1', perto(somaTitulo, 1, 1e-9), somaTitulo.toFixed(6));
  const somaLanterna = r.players.reduce((s, p) => s + p.lastChance, 0);
  checa('chances de lanterna somam 1', perto(somaLanterna, 1, 1e-9), somaLanterna.toFixed(6));

  const somaClubes = r.clubTitleChance
    .filter((c) => c.competition === 'copa')
    .reduce((s, c) => s + c.chance, 0);
  checa('títulos dos clubes somam 1', perto(somaClubes, 1, 1e-9), somaClubes.toFixed(6));
  checa('só clubes reais aparecem como campeão',
    r.clubTitleChance.every((c) => ['A','B','C','D','E','F','G','H'].includes(c.team)),
    r.clubTitleChance.map((c) => c.team).join(','));

  // Com 3 jogadores sem palpite nenhum, todos empatam em 0 e o crédito se
  // divide igualmente: 1/3 cada. Se algum ficasse com 100%, o desempate
  // estaria vindo da ordem do array.
  checa('empate geral divide o título igualmente',
    r.players.every((p) => perto(p.titleChance, 1 / 3, 1e-9)),
    r.players.map((p) => p.titleChance.toFixed(3)).join(' '));
}

{
  const a = runPoolSimulation(base());
  const b = runPoolSimulation(base());
  checa('mesma semente devolve o mesmo resultado',
    JSON.stringify(a.players) === JSON.stringify(b.players));
  const c = runPoolSimulation(base({ seed: 999 }));
  checa('semente diferente muda o sorteio dos clubes',
    JSON.stringify(a.clubTitleChance) !== JSON.stringify(c.clubTitleChance));
}

{
  // Confronto já resolvido pelo admin nunca pode ser ressimulado.
  const ties = chaveDe8('copa', true);
  ties[0].winnerTeam = 'B';
  const r = runPoolSimulation(base({ ties }));
  const chanceA = r.clubTitleChance.find((c) => c.team === 'A')?.chance ?? 0;
  checa('clube eliminado por decisão do admin não é campeão', chanceA === 0);
}

{
  // Clube muito mais forte tem de ganhar bem mais vezes.
  const f = new Map(forcas);
  f.set('a', forca('a', 2.2, 0.45));
  const r = runPoolSimulation(base({ strengths: f }));
  const chanceA = r.clubTitleChance.find((c) => c.team === 'A')?.chance ?? 0;
  checa('clube muito mais forte lidera as chances de título', chanceA > 0.4,
    `A = ${(chanceA * 100).toFixed(1)}%`);
}

console.log('\n3. SORTEIO DA CHAVE (Copa do Brasil)\n');
{
  // Sem next_tie_id, o emparelhamento da fase seguinte é sorteado. O teste é
  // que, ao longo dos cenários, o campeão possa sair de qualquer lado — e que
  // a distribuição não fique presa a uma chave fixa.
  const ligada = runPoolSimulation(base({ ties: chaveDe8('copa', true) }));
  const sorteada = runPoolSimulation(base({ ties: chaveDe8('copa', false) }));

  checa('com chave sorteada todos os 8 clubes podem ser campeões',
    sorteada.clubTitleChance.length === 8,
    `${sorteada.clubTitleChance.length} clubes`);
  checa('com chave fixa também há 8 campeões possíveis',
    ligada.clubTitleChance.length === 8);

  // ACHADO: com times IDÊNTICOS a chave fixa NÃO distribui igual, e está certo.
  // Posição na chave é vantagem real: quem joga a volta em casa leva o mando no
  // jogo decisivo, e quem cai do lado "a" da final é o mandante dela. O sorteio
  // embaralha essas posições a cada cenário e por isso achata as chances.
  // O teste, então, não é "tudo igual a 1/8" — é que o sorteio seja MAIS
  // uniforme que a chave fixa.
  const desvio = (r: typeof ligada) =>
    Math.max(...r.clubTitleChance.map((c) => Math.abs(c.chance - 1 / 8)));
  checa('chave fixa premia a posição (assimetria real, não bug)', desvio(ligada) > 0.02,
    `maior desvio ${desvio(ligada).toFixed(4)}`);
  checa('sorteio achata a vantagem de posição', desvio(sorteada) < desvio(ligada),
    `sorteada ${desvio(sorteada).toFixed(4)} < fixa ${desvio(ligada).toFixed(4)}`);
  checa('sorteio fica perto de 1/8', desvio(sorteada) < 0.03,
    desvio(sorteada).toFixed(4));
}

console.log('\n4. PALPITES PONTUAM\n');
{
  // Ana palpita 5x0 em todos os jogos de ida; Bruno e Caio não palpitam nada.
  // Ana tem de terminar com média maior e chance de título perto de 1.
  const ties = chaveDe8('copa', true);
  const preds = ties
    .filter((t) => t.idaMatchId !== null)
    .flatMap((t) => [
      { userId: 'u1', matchId: t.idaMatchId!, predHome: 5, predAway: 0, predPenWinner: null },
    ]);
  const r = runPoolSimulation(base({ ties, predictions: preds }));
  const ana = r.players.find((p) => p.username === 'Ana')!;
  const bruno = r.players.find((p) => p.username === 'Bruno')!;
  checa('quem palpita pontua mais que quem não palpita', ana.meanPoints > bruno.meanPoints,
    `Ana ${ana.meanPoints.toFixed(1)} x Bruno ${bruno.meanPoints.toFixed(1)}`);
  checa('quem palpita fica com quase toda a chance de título', ana.titleChance > 0.9,
    `${(ana.titleChance * 100).toFixed(1)}%`);
  checa('partidas abertas com palpite são contadas', r.openPredictedMatches === 4,
    String(r.openPredictedMatches));
}

{
  // Palpite de pódio: quem crava campeão E vice ganha 65 e dispara.
  const r = runPoolSimulation(base({
    podiumPicks: [
      { userId: 'u1', competition: 'copa', champion: 'A', runnerUp: 'B' },
      { userId: 'u2', competition: 'copa', champion: 'C', runnerUp: 'D' },
    ],
  }));
  const ana = r.players.find((p) => p.username === 'Ana')!;
  const caio = r.players.find((p) => p.username === 'Caio')!;
  checa('palpite de pódio soma pontos', ana.meanPoints > 0,
    `Ana ${ana.meanPoints.toFixed(2)}`);
  checa('quem não palpitou pódio fica em zero', caio.meanPoints === 0);
}

{
  // ── Os 7 pontos são do PÊNALTI, não da classificação ─────────────────────
  // Regressão de um erro real: uma versão pagava por acertar quem passa de
  // fase, o que acontece em TODO confronto. O certo é pagar só quando há
  // disputa — cerca de 1 em cada 5 confrontos entre iguais.
  //
  // Com dois clubes idênticos, quem chuta um lado acerta metade das vezes. Se
  // o pagamento fosse pela classificação, o esperado seria 7 × 0,5 = 3,5 por
  // confronto. Pagando só no pênalti, cai para 7 × P(pênaltis) × 0,5.
  console.log('\n5. PÊNALTIS SÓ PAGAM SE HOUVER PÊNALTIS\n');
  // Duas rodadas idênticas, só mudando o palpite de pênalti. A semente é a
  // mesma e o palpite não influencia o sorteio dos jogos, então a DIFERENÇA
  // isola exatamente o que os pênaltis pagaram — sem depender de o palpite de
  // placar valer zero (nenhum vale: até 9-9 casa com "empate seco", 15 pts).
  const ties = chaveDe8('copa', true).filter((t) => t.round === 'oitavas');
  const placar = ties.map((t) => ({
    userId: 'u1', matchId: t.voltaMatchId!, predHome: 9, predAway: 4,
  }));
  const com = runPoolSimulation(base({
    ties, predictions: placar.map((p) => ({ ...p, predPenWinner: 'home' as const })),
  }));
  const sem = runPoolSimulation(base({
    ties, predictions: placar.map((p) => ({ ...p, predPenWinner: null })),
  }));
  const dos = (r: ReturnType<typeof runPoolSimulation>) =>
    r.players.find((p) => p.username === 'Ana')!.meanPoints;
  const porConfronto = (dos(com) - dos(sem)) / ties.length;
  checa('palpite de pênalti paga bem menos que 3,5 por confronto', porConfronto < 2.5,
    `${porConfronto.toFixed(2)} pts/confronto`);
  checa('mas paga alguma coisa — pênaltis acontecem', porConfronto > 0.2,
    `${porConfronto.toFixed(2)} pts/confronto`);
  const frequencia = porConfronto / (7 * 0.5);
  checa('frequência implícita de pênaltis é plausível (10%–40%)',
    frequencia > 0.1 && frequencia < 0.4, `${(frequencia * 100).toFixed(0)}%`);
}

console.log(`\n${falhas === 0 ? 'TODAS AS VERIFICAÇÕES PASSARAM' : `${falhas} VERIFICAÇÃO(ÕES) FALHARAM`}\n`);
process.exit(falhas === 0 ? 0 : 1);
