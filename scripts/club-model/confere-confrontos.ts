// Confere o motor TypeScript contra os números obtidos independentemente em
// Python: mesmos ratings, mesmo beta, mesmas 24 chaves reais das oitavas.
// Se as duas implementações divergirem, uma das duas está errada.
import { BETA, DEFAULT_MU_HOME, DEFAULT_MU_AWAY, buildPriors, projectTie } from '../../lib/club-model/index';
import type { ClubPrior, ClubStrength } from '../../lib/club-model/types';

const R: Record<string, number> = {
  flamengo: 90.3927811054, palmeiras: 90.2284595467, 'independiente del valle': 87.8938425664,
  cruzeiro: 86.8277057524, fluminense: 86.3906471298, 'independiente rivadavia': 86.2900742954,
  botafogo: 86.2376763725, 'boca juniors': 85.8040329637, bragantino: 85.7977018493,
  'athletico pr': 85.7488110396, corinthians: 85.4287109561, estudiantes: 85.1025888238,
  mirassol: 85.0290559309, 'rosario central': 84.9382802701, 'river plate': 84.8471494292,
  'atletico mg': 84.5297486882, santos: 84.3168351154, 'sao paulo': 83.8409683096,
  internacional: 83.8226638978, 'universidad catolica': 83.790278834, 'coquimbo unido': 83.6220104086,
  'santa fe': 83.489640492, 'deportes tolima': 83.3695860313, tigre: 83.2787491052,
  'cerro porteno': 83.2414275247, bolivar: 83.1833314716, 'vasco da gama': 83.0717127309,
  'ldu quito': 82.9650187242, olimpia: 82.9354393561, vitoria: 82.9104374657,
  macara: 82.7445733124, gremio: 82.6089858758, remo: 81.7554899234,
  'montevideo city torque': 80.9224821442, platense: 80.7670535619, chapecoense: 79.4037037728,
  recoleta: 78.8143278922, cienciano: 77.8136991977, fortaleza: 74.2570680432, juventude: 73.7129965144,
};

// [mandante da ida, visitante] das 24 chaves reais.
const TIES: [string, string, number][] = [
  ['vasco da gama', 'fluminense', 45.0], ['internacional', 'corinthians', 47.6],
  ['mirassol', 'gremio', 53.6], ['athletico pr', 'vitoria', 54.2],
  ['atletico mg', 'juventude', 65.8], ['santos', 'remo', 53.8],
  ['chapecoense', 'cruzeiro', 39.0], ['palmeiras', 'fortaleza', 72.6],
  ['estudiantes', 'universidad catolica', 52.0], ['rosario central', 'corinthians', 49.3],
  ['cruzeiro', 'flamengo', 44.7], ['deportes tolima', 'independiente del valle', 43.3],
  ['mirassol', 'ldu quito', 53.1], ['palmeiras', 'cerro porteno', 60.4],
  ['platense', 'coquimbo unido', 45.7], ['fluminense', 'independiente rivadavia', 50.1],
  ['boca juniors', 'recoleta', 60.4], ['bolivar', 'sao paulo', 49.0],
  ['santa fe', 'river plate', 48.0], ['vasco da gama', 'olimpia', 50.2],
  ['bragantino', 'atletico mg', 51.9], ['santos', 'macara', 52.4],
  ['tigre', 'montevideo city torque', 53.5], ['cienciano', 'botafogo', 37.6],
];

const priors: ClubPrior[] = Object.entries(R).map(([teamKey, rating]) => ({ teamKey, rating }));
const p = buildPriors(priors, { beta: BETA });
// Sem jogos pós-T0: a força é exatamente o prior, que é o cenário do cálculo
// original em Python.
const forca = (k: string): ClubStrength => ({
  teamKey: k, attack: p.get(k)!.attack, defense: p.get(k)!.defense,
  attackPrior: p.get(k)!.attack, defensePrior: p.get(k)!.defense, evidence: 0, matches: 0,
});
// O Python usou mu calibrado no Paulistão e SEM incerteza de parâmetro; para
// comparar maçã com maçã, aqui também: sigma zero via evidência infinita.
const semIncerteza = (s: ClubStrength): ClubStrength => ({ ...s, evidence: 1e12 });

console.log(`${'confronto'.padEnd(46)}${'TS'.padStart(7)}${'Python'.padStart(8)}${'dif'.padStart(7)}`);
console.log('-'.repeat(68));
let maior = 0;
for (const [a, b, esperado] of TIES) {
  const r = projectTie(
    { homeFirstLeg: semIncerteza(forca(a)), awayFirstLeg: semIncerteza(forca(b)),
      baseline: { muHome: DEFAULT_MU_HOME, muAway: DEFAULT_MU_AWAY, weight: 1 } },
    4000, 12345
  );
  const ts = r.advance * 100;
  const dif = Math.abs(ts - esperado);
  maior = Math.max(maior, dif);
  console.log(`${(a + ' x ' + b).padEnd(46)}${ts.toFixed(1).padStart(7)}${esperado.toFixed(1).padStart(8)}${dif.toFixed(1).padStart(7)}`);
}
console.log('-'.repeat(68));
console.log(`maior divergencia: ${maior.toFixed(2)} pontos percentuais`);
process.exit(maior < 2.0 ? 0 : 1);
