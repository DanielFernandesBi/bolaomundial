// ============================================================================
// Paulistão 2026: 72 jogos com placar, extraídos da tabela `matches` deste
// projeto, e o rating Opta de cada clube no snapshot de 31/07/2026.
//
// É a única amostra real que temos de futebol brasileiro com placar completo E
// rating Opta correspondente. Serve para calibrar beta e como teste de
// regressão do motor.
//
// Duas ressalvas honestas, que valem para qualquer conclusão tirada daqui:
//   • o snapshot é de julho e os jogos são de janeiro a março — o rating "vê"
//     o futuro. Isso infla um pouco o poder explicativo do Opta;
//   • estadual tem rotação pesada de elenco, então o ruído é maior que numa
//     competição em que todo mundo joga com força máxima.
// Ordem de grandeza é confiável; o valor exato precisa ser refeito quando
// houver histórico das três copas.
// ============================================================================

export const RATINGS: Readonly<Record<string, number>> = {
  'botafogo sp': 71.5523002858,
  bragantino: 85.7977018493,
  capivariano: 73.4375494867,
  corinthians: 85.4287109561,
  guarani: 66.2593770561,
  mirassol: 85.0290559309,
  noroeste: 55.110920657,
  novorizontino: 75.9393240666,
  palmeiras: 90.2284595467,
  'ponte preta': 66.892727384,
  portuguesa: 58.2780901285,
  primavera: 73.5132214103,
  santos: 84.3168351154,
  'sao bernardo': 71.3877155831,
  'sao paulo': 83.8409683096,
  'velo clube': 54.5961388906,
};

/** [mandante, gols do mandante, gols do visitante, visitante, data]. */
export const PAULISTAO_2026: ReadonlyArray<readonly [string, number, number, string, string]> = [
  ['sao bernardo', 4, 0, 'capivariano', '2026-01-10'],
  ['santos', 2, 1, 'novorizontino', '2026-01-10'],
  ['portuguesa', 0, 1, 'palmeiras', '2026-01-10'],
  ['guarani', 1, 1, 'primavera', '2026-01-10'],
  ['corinthians', 3, 0, 'ponte preta', '2026-01-11'],
  ['velo clube', 0, 0, 'botafogo sp', '2026-01-11'],
  ['noroeste', 0, 1, 'bragantino', '2026-01-11'],
  ['mirassol', 3, 0, 'sao paulo', '2026-01-11'],
  ['novorizontino', 2, 0, 'guarani', '2026-01-13'],
  ['capivariano', 1, 0, 'portuguesa', '2026-01-13'],
  ['primavera', 3, 1, 'mirassol', '2026-01-14'],
  ['palmeiras', 1, 0, 'santos', '2026-01-14'],
  ['ponte preta', 0, 1, 'velo clube', '2026-01-14'],
  ['botafogo sp', 1, 1, 'noroeste', '2026-01-15'],
  ['bragantino', 3, 0, 'corinthians', '2026-01-15'],
  ['sao paulo', 1, 0, 'sao bernardo', '2026-01-15'],
  ['primavera', 3, 4, 'novorizontino', '2026-01-17'],
  ['portuguesa', 2, 0, 'velo clube', '2026-01-17'],
  ['capivariano', 2, 0, 'ponte preta', '2026-01-17'],
  ['palmeiras', 1, 0, 'mirassol', '2026-01-17'],
  ['corinthians', 1, 1, 'sao paulo', '2026-01-18'],
  ['sao bernardo', 1, 1, 'noroeste', '2026-01-18'],
  ['bragantino', 5, 0, 'botafogo sp', '2026-01-18'],
  ['guarani', 1, 1, 'santos', '2026-01-18'],
  ['novorizontino', 4, 0, 'palmeiras', '2026-01-20'],
  ['noroeste', 1, 1, 'capivariano', '2026-01-21'],
  ['sao paulo', 2, 3, 'portuguesa', '2026-01-21'],
  ['mirassol', 0, 0, 'bragantino', '2026-01-21'],
  ['ponte preta', 0, 1, 'sao bernardo', '2026-01-21'],
  ['santos', 1, 1, 'corinthians', '2026-01-22'],
  ['botafogo sp', 1, 0, 'primavera', '2026-01-22'],
  ['velo clube', 0, 1, 'guarani', '2026-01-22'],
  ['sao bernardo', 0, 4, 'mirassol', '2026-01-24'],
  ['ponte preta', 2, 2, 'noroeste', '2026-01-24'],
  ['palmeiras', 3, 1, 'sao paulo', '2026-01-24'],
  ['santos', 0, 0, 'bragantino', '2026-01-25'],
  ['capivariano', 1, 2, 'primavera', '2026-01-25'],
  ['novorizontino', 2, 0, 'botafogo sp', '2026-01-25'],
  ['velo clube', 0, 1, 'corinthians', '2026-01-25'],
  ['portuguesa', 0, 1, 'guarani', '2026-01-26'],
  ['guarani', 1, 0, 'ponte preta', '2026-01-31'],
  ['primavera', 1, 2, 'portuguesa', '2026-01-31'],
  ['bragantino', 1, 1, 'sao bernardo', '2026-02-01'],
  ['mirassol', 1, 1, 'novorizontino', '2026-02-01'],
  ['noroeste', 2, 0, 'velo clube', '2026-02-01'],
  ['botafogo sp', 1, 0, 'palmeiras', '2026-02-01'],
  ['sao paulo', 2, 0, 'santos', '2026-02-01'],
  ['corinthians', 3, 0, 'capivariano', '2026-02-05'],
  ['portuguesa', 2, 0, 'ponte preta', '2026-02-07'],
  ['guarani', 0, 2, 'botafogo sp', '2026-02-07'],
  ['novorizontino', 2, 1, 'sao bernardo', '2026-02-07'],
  ['sao paulo', 2, 1, 'primavera', '2026-02-07'],
  ['noroeste', 1, 2, 'santos', '2026-02-08'],
  ['capivariano', 1, 0, 'mirassol', '2026-02-08'],
  ['velo clube', 1, 1, 'bragantino', '2026-02-08'],
  ['corinthians', 0, 1, 'palmeiras', '2026-02-08'],
  ['botafogo sp', 0, 1, 'capivariano', '2026-02-15'],
  ['primavera', 3, 3, 'noroeste', '2026-02-15'],
  ['mirassol', 1, 2, 'portuguesa', '2026-02-15'],
  ['palmeiras', 1, 1, 'guarani', '2026-02-15'],
  ['ponte preta', 1, 2, 'sao paulo', '2026-02-15'],
  ['bragantino', 3, 0, 'novorizontino', '2026-02-15'],
  ['santos', 7, 0, 'velo clube', '2026-02-15'],
  ['sao bernardo', 0, 1, 'corinthians', '2026-02-15'],
  ['bragantino', 1, 2, 'sao paulo', '2026-02-21'],
  ['palmeiras', 4, 0, 'capivariano', '2026-02-21'],
  ['novorizontino', 2, 1, 'santos', '2026-02-22'],
  ['portuguesa', 1, 1, 'corinthians', '2026-02-22'],
  ['novorizontino', 1, 0, 'corinthians', '2026-02-28'],
  ['palmeiras', 2, 1, 'sao paulo', '2026-03-01'],
  ['palmeiras', 1, 0, 'novorizontino', '2026-03-04'],
  ['novorizontino', 1, 2, 'palmeiras', '2026-03-08'],
];
