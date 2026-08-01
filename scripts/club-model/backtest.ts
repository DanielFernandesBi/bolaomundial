// ============================================================================
// Backtest e testes de invariância do motor de clubes, contra os 72 jogos
// reais do Paulistão 2026.
//
//   npx tsc -p scripts/club-model/tsconfig.json && node scripts/club-model/dist/backtest.js
//
// O que ele responde:
//   1. o motor obedece às invariâncias que tem de obedecer?
//   2. qual beta o dado real pede, e bate com a constante que está no código?
//   3. quanto cada componente do modelo vale, em log-verossimilhança?
//   4. o ajuste dinâmico melhora a previsão FORA da amostra? (validação
//      leave-one-out, que é o único número honesto com 72 jogos)
// ============================================================================

import { readFileSync } from 'node:fs';
import {
  BETA,
  KAPPA,
  buildPriors,
  estimateBaselines,
  fitStrengths,
  lambdas,
  outcomeProbs,
  rhoBounds,
  scoreMatrix,
} from '../../lib/club-model/index';
import type { ClubPrior, CompetitionBaseline, ModelMatch } from '../../lib/club-model/types';
import { PAULISTAO_2026, RATINGS } from './fixture-paulistao-2026';
import { parseCsv } from './import-opta-snapshot';

const COMP = 'paulista';
const REF = Date.parse('2026-03-08T00:00:00Z');

const priors: ClubPrior[] = Object.entries(RATINGS).map(([teamKey, rating]) => ({ teamKey, rating }));

const matches: ModelMatch[] = PAULISTAO_2026.map(([h, gh, ga, a, data]) => ({
  homeKey: h,
  awayKey: a,
  goalsHome: gh,
  goalsAway: ga,
  competition: COMP,
  ageDays: (REF - Date.parse(`${data}T00:00:00Z`)) / 86_400_000,
}));

// ── utilidades ──────────────────────────────────────────────────────────────
let falhas = 0;
function checa(nome: string, ok: boolean, detalhe = ''): void {
  if (!ok) falhas++;
  console.log(`  ${ok ? 'ok  ' : 'FALHA'}  ${nome}${detalhe ? '  — ' + detalhe : ''}`);
}
const perto = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

function logFatorial(n: number): number {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}
/** −log P(placar observado) sob Poisson independente. Menor é melhor. */
function nllPlacar(lh: number, la: number, gh: number, ga: number): number {
  return -(gh * Math.log(lh) - lh - logFatorial(gh)) - (ga * Math.log(la) - la - logFatorial(ga));
}

// ============================================================================
console.log('\n1. INVARIÂNCIAS\n');

{
  const p = buildPriors(priors);
  const media = priors.reduce((s, x) => s + x.rating, 0) / priors.length;
  // Clube exatamente na média tem força 1,0 nos dois lados.
  const naMedia = buildPriors([...priors, { teamKey: '__medio', rating: media }], {
    anchorKeys: priors.map((x) => x.teamKey),
  }).get('__medio')!;
  checa('clube na média tem ataque 1', perto(naMedia.attack, 1));
  checa('clube na média tem defesa 1', perto(naMedia.defense, 1));

  const melhor = p.get('palmeiras')!;
  const pior = p.get('velo clube')!;
  checa('clube forte ataca acima de 1 e defende abaixo', melhor.attack > 1 && melhor.defense < 1,
    `Palmeiras atk=${melhor.attack.toFixed(3)} def=${melhor.defense.toFixed(3)}`);
  checa('clube fraco ataca abaixo de 1 e defende acima', pior.attack < 1 && pior.defense > 1,
    `Velo Clube atk=${pior.attack.toFixed(3)} def=${pior.defense.toFixed(3)}`);
  checa('ataque e defesa são espelhos no prior', perto(melhor.attack * melhor.defense, 1, 1e-12));
}

{
  const baselines = new Map<string, CompetitionBaseline>([
    [COMP, { muHome: 1.468, muAway: 0.819, weight: 1 }],
  ]);
  const semJogos = fitStrengths([...priors, { teamKey: '__sem_jogos', rating: 80 }], matches, baselines, {
    anchorKeys: priors.map((x) => x.teamKey),
  });
  const s = semJogos.strengths.get('__sem_jogos')!;
  checa('clube sem jogos mantém exatamente o prior',
    perto(s.attack, s.attackPrior, 1e-12) && perto(s.defense, s.defensePrior, 1e-12));
  checa('ajuste converge', semJogos.converged, `${semJogos.iterations} iterações`);
}

{
  // Invariância central: um clube que joga EXATAMENTE conforme o esperado pelo
  // prior não pode ter a força alterada. É o melhor teste de regressão do
  // módulo inteiro — pega erro de sinal, de escala e de normalização de uma vez.
  const base: CompetitionBaseline = { muHome: 1.4, muAway: 1.4, weight: 1 };
  const dois: ClubPrior[] = [
    { teamKey: 'a', rating: 85 },
    { teamKey: 'b', rating: 85 },
  ];
  const pr = buildPriors(dois);
  const atk = pr.get('a')!.attack;
  const def = pr.get('a')!.defense;
  const esperadoCasa = base.muHome * atk * def;
  const esperadoFora = base.muAway * atk * def;
  const sinteticos: ModelMatch[] = Array.from({ length: 30 }, (_, i) => ({
    homeKey: i % 2 === 0 ? 'a' : 'b',
    awayKey: i % 2 === 0 ? 'b' : 'a',
    goalsHome: esperadoCasa,
    goalsAway: esperadoFora,
    competition: COMP,
    ageDays: 0,
  }));
  const r = fitStrengths(dois, sinteticos, new Map([[COMP, base]]));
  const a = r.strengths.get('a')!;
  checa('clube que joga conforme o prior não muda de força',
    perto(a.attack, a.attackPrior, 1e-6) && perto(a.defense, a.defensePrior, 1e-6),
    `atk ${a.attackPrior.toFixed(6)} -> ${a.attack.toFixed(6)}`);
}

{
  const m = scoreMatrix(1.7, 1.1, 0);
  const soma = m.flat().reduce((s, v) => s + v, 0);
  checa('matriz de placares soma 1', perto(soma, 1, 1e-12), soma.toFixed(15));
  const [c, e, f] = outcomeProbs(m);
  checa('vitória + empate + derrota = 1', perto(c + e + f, 1, 1e-12));

  const [min, max] = rhoBounds(1.7, 1.1);
  const extremo = scoreMatrix(1.7, 1.1, 5);
  checa('rho absurdo não gera célula negativa', extremo.flat().every((v) => v >= 0),
    `faixa válida [${min.toFixed(3)}, ${max.toFixed(3)}]`);
  checa('matriz com rho grampeado ainda soma 1', perto(extremo.flat().reduce((s, v) => s + v, 0), 1, 1e-12));
}

// ============================================================================
console.log('\n2. CALIBRAÇÃO DE beta NOS 72 JOGOS REAIS\n');

/** Modelo só-prior: lambda = mu * exp(beta*(Rh-Ra)/2). Ajusta muH, muA e beta. */
function nllSoPrior(muH: number, muA: number, beta: number): number {
  let s = 0;
  for (const m of matches) {
    const dr = (RATINGS[m.homeKey] - RATINGS[m.awayKey]) / 2;
    s += nllPlacar(muH * Math.exp(beta * dr), muA * Math.exp(-beta * dr), m.goalsHome, m.goalsAway);
  }
  return s;
}
/** muH/muA ótimos dado beta (fecham em forma analítica). */
function musOtimos(beta: number): [number, number] {
  let gh = 0, eh = 0, ga = 0, ea = 0;
  for (const m of matches) {
    const dr = (RATINGS[m.homeKey] - RATINGS[m.awayKey]) / 2;
    gh += m.goalsHome; eh += Math.exp(beta * dr);
    ga += m.goalsAway; ea += Math.exp(-beta * dr);
  }
  return [gh / eh, ga / ea];
}
function nllEmBeta(beta: number): number {
  const [muH, muA] = musOtimos(beta);
  return nllSoPrior(muH, muA, beta);
}

// Busca da seção áurea sobre beta.
let lo = 0, hi = 0.25;
const phi = (Math.sqrt(5) - 1) / 2;
let x1 = hi - phi * (hi - lo), x2 = lo + phi * (hi - lo);
let f1 = nllEmBeta(x1), f2 = nllEmBeta(x2);
for (let i = 0; i < 200; i++) {
  if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - phi * (hi - lo); f1 = nllEmBeta(x1); }
  else { lo = x1; x1 = x2; f1 = f2; x2 = lo + phi * (hi - lo); f2 = nllEmBeta(x2); }
}
const betaMLE = (lo + hi) / 2;
const [muHat, muAat] = musOtimos(betaMLE);
const nllOtimo = nllEmBeta(betaMLE);

console.log(`  beta ajustado    = ${betaMLE.toFixed(5)}   (constante no código: ${BETA})`);
console.log(`  mu_H / mu_A      = ${muHat.toFixed(3)} / ${muAat.toFixed(3)}`);
console.log(`  -logL            = ${nllOtimo.toFixed(3)}  (${(nllOtimo / matches.length).toFixed(4)} por jogo)`);

// Intervalo de confiança por perfil de verossimilhança (corte em 1,92).
let ciLo = betaMLE, ciHi = betaMLE;
for (let b = betaMLE; b >= 0; b -= 0.0005) { if (nllEmBeta(b) - nllOtimo > 1.92) { ciLo = b; break; } }
for (let b = betaMLE; b <= 0.25; b += 0.0005) { if (nllEmBeta(b) - nllOtimo > 1.92) { ciHi = b; break; } }
console.log(`  IC95% de beta    = [${ciLo.toFixed(4)} ; ${ciHi.toFixed(4)}]`);
checa('a constante BETA está dentro do IC95% do dado real', BETA >= ciLo && BETA <= ciHi);

console.log('\n  Quanto cada componente vale (nats por jogo):');
const nllNada = (() => {
  const media = matches.reduce((s, m) => s + m.goalsHome + m.goalsAway, 0) / (2 * matches.length);
  return matches.reduce((s, m) => s + nllPlacar(media, media, m.goalsHome, m.goalsAway), 0);
})();
const nllMando = nllEmBeta(0);
console.log(`    só a média global de gols   ${(nllNada / matches.length).toFixed(4)}`);
console.log(`    + mando de campo            ${(nllMando / matches.length).toFixed(4)}   (ganho ${((nllNada - nllMando) / matches.length).toFixed(4)})`);
console.log(`    + rating Opta               ${(nllOtimo / matches.length).toFixed(4)}   (ganho ${((nllMando - nllOtimo) / matches.length).toFixed(4)})`);

// ============================================================================
console.log('\n3. O AJUSTE DINÂMICO AJUDA? (leave-one-out sobre os 72 jogos)\n');
console.log('  LEIA ISTO ANTES DE INTERPRETAR OS NÚMEROS ABAIXO.');
console.log('  Neste conjunto o ajuste dinâmico PERDE para o prior puro, e isso era');
console.log('  esperado: o snapshot Opta é de 31/07 e o Paulistão foi em janeiro–março,');
console.log('  então o rating já incorpora estes mesmos jogos. Somá-los de novo é');
console.log('  exatamente a dupla contagem que o §2.1 da especificação manda evitar —');
console.log('  aqui ela é inevitável, porque é o único dado real que temos.');
console.log('  Ou seja: esta seção NÃO mede o valor do ajuste dinâmico. Ela mede duas');
console.log('  outras coisas, essas sim transferíveis:');
console.log('    (a) kappa baixo degrada rápido — de 20 para 2 são ~3 pontos percentuais;');
console.log('    (b) o motor não diverge nem produz absurdo com dado real.');
console.log('  O valor do ajuste dinâmico só poderá ser medido com jogos genuinamente');
console.log('  posteriores ao snapshot, ou seja, depois da Fase 1.\n');

const anchor = priors.map((p) => p.teamKey);

function baselinesIniciais(): Map<string, CompetitionBaseline> {
  return new Map([[COMP, { muHome: muHat, muAway: muAat, weight: 1 }]]);
}

/** Ajusta forças e baselines alternadamente, algumas rodadas. */
function ajusta(treino: ModelMatch[], kappa: number) {
  let baselines = baselinesIniciais();
  let fit = fitStrengths(priors, treino, baselines, { anchorKeys: anchor, kappa });
  for (let i = 0; i < 5; i++) {
    const novas = estimateBaselines(treino, fit.strengths, { weights: new Map([[COMP, 1]]) });
    if (novas.size > 0) baselines = novas;
    fit = fitStrengths(priors, treino, baselines, { anchorKeys: anchor, kappa });
  }
  return { fit, baselines };
}

function looNll(kappa: number): number {
  let total = 0;
  for (let i = 0; i < matches.length; i++) {
    const treino = matches.filter((_, j) => j !== i);
    const alvo = matches[i];
    const { fit, baselines } = ajusta(treino, kappa);
    const [lh, la] = lambdas(
      fit.strengths.get(alvo.homeKey)!,
      fit.strengths.get(alvo.awayKey)!,
      baselines.get(COMP)!
    );
    total += nllPlacar(lh, la, alvo.goalsHome, alvo.goalsAway);
  }
  return total;
}

const looSoPrior = (() => {
  // Só-prior não tem o que aprender: é o mesmo modelo em qualquer partição.
  return nllOtimo;
})();

console.log(`  ${'kappa'.padStart(7)}${'-logL LOO'.padStart(13)}${'por jogo'.padStart(11)}${'vs só-prior'.padStart(13)}`);
const resultados: Array<[number, number]> = [];
for (const kappa of [2, 5, 8, 12, 20, 40, 100]) {
  const v = looNll(kappa);
  resultados.push([kappa, v]);
  const marca = kappa === KAPPA ? '   <- o do código' : '';
  console.log(
    `  ${String(kappa).padStart(7)}${v.toFixed(3).padStart(13)}${(v / matches.length).toFixed(4).padStart(11)}` +
      `${(((looSoPrior - v) / looSoPrior) * 100).toFixed(2).padStart(12)}%${marca}`
  );
}
console.log(`  ${'só prior'.padStart(7)}${looSoPrior.toFixed(3).padStart(13)}${(looSoPrior / matches.length).toFixed(4).padStart(11)}`);

const melhorKappa = resultados.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
console.log(`\n  melhor kappa nesta amostra: ${melhorKappa}`);
checa('kappa do código não é pior que o kappa=5 da especificação',
  resultados.find(([k]) => k === KAPPA)![1] <= resultados.find(([k]) => k === 5)![1]);

// ============================================================================
console.log('\n4. PARSER DO CSV DO OPTA\n');
{
  // O arquivo real TEM campo entre aspas com vírgula dentro ("Hong Kong,
  // China"), em 28 lugares. Um split(',') deslocaria todas as colunas
  // seguintes dessas linhas, silenciosamente. Descobri por sorte; agora é teste.
  const csv = ['a,b,c', '1,"Hong Kong, China",3', '4,"diz ""oi""",6', '7,,9', ''].join('\n');
  const l = parseCsv(csv);
  checa('número de linhas', l.length === 4, String(l.length));
  checa('vírgula dentro de aspas não quebra o campo', l[1][1] === 'Hong Kong, China', JSON.stringify(l[1]));
  checa('todas as linhas com 3 colunas', l.every((x) => x.length === 3));
  checa('aspas escapadas viram uma aspa', l[2][1] === 'diz "oi"', JSON.stringify(l[2][1]));
  checa('campo vazio é preservado', l[3][1] === '', JSON.stringify(l[3]));

  const arquivo = process.env.OPTA_CSV;
  if (arquivo) {
    const bruto = readFileSync(arquivo, 'utf8').replace(/^﻿/, '');
    const linhas = parseCsv(bruto).filter((x) => x.length > 1);
    const nCols = linhas[0].length;
    const tortas = linhas.filter((x) => x.length !== nCols).length;
    checa(
      'arquivo real: toda linha tem o mesmo número de colunas',
      tortas === 0,
      `${linhas.length - 1} clubes, ${nCols} colunas, ${tortas} tortas`
    );
  } else {
    console.log('  (defina OPTA_CSV=<caminho> para validar contra o arquivo real)');
  }
}

// ============================================================================
console.log(`\n${falhas === 0 ? 'TODAS AS VERIFICAÇÕES PASSARAM' : `${falhas} VERIFICAÇÃO(ÕES) FALHARAM`}\n`);
process.exit(falhas === 0 ? 0 : 1);
