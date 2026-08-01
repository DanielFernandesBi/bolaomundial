// ============================================================================
// Importa o snapshot global do Opta para opta_snapshots + opta_club_ratings.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/club-model/dist/scripts/club-model/import-opta-snapshot.js \
//       --file ~/opta_snapshot_global_20260731.csv --scope conmebol
//
// Precisa da service role key porque opta_club_ratings tem RLS ligada e
// nenhuma policy de leitura: é dataset licenciado que nada na interface
// consome. O motor lê server-side e publica só o derivado.
//
// Idempotente: rodar duas vezes com o mesmo arquivo não duplica nada.
// ============================================================================

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ── CSV ─────────────────────────────────────────────────────────────────────
// Parser mínimo mas correto. O arquivo do Opta TEM campos entre aspas com
// vírgula dentro ("Hong Kong, China"); um split(',') corromperia essas linhas
// silenciosamente, deslocando todas as colunas seguintes.
export function parseCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else dentroDeAspas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { dentroDeAspas = true; continue; }
    if (c === ',') { linha.push(campo); campo = ''; continue; }
    if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; continue; }
    if (c === '\r') continue;
    campo += c;
  }
  if (campo !== '' || linha.length > 0) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

function arg(nome: string, padrao?: string): string {
  const i = process.argv.indexOf(`--${nome}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  if (padrao !== undefined) return padrao;
  throw new Error(`falta --${nome}`);
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente');
  }

  const caminho = arg('file');
  const escopo = arg('scope', 'conmebol') as 'conmebol' | 'global';
  const topGlobal = Number(arg('top-global', '400'));

  const bruto = readFileSync(caminho, 'utf8').replace(/^﻿/, '');
  const linhas = parseCsv(bruto).filter((l) => l.length > 1);
  const cab = linhas[0];
  const col = (n: string) => {
    const i = cab.indexOf(n);
    if (i < 0) throw new Error(`coluna ausente no CSV: ${n}`);
    return i;
  };

  const iId = col('contestantId');
  const iNum = col('optaId');
  const iNome = col('contestantName');
  const iClube = col('contestantClubName');
  const iPais = col('country');
  const iConf = col('confederation');
  const iLigaId = col('domesticLeagueId');
  const iLiga = col('domesticLeagueName');
  const iRating = col('currentRating');
  const iRank = col('currentGlobalRank');
  const iRankConf = col('currentConfederationRank');
  const iSemana = col('lastWeekRating');
  const iData = col('snapshot_date');

  const todos = linhas.slice(1).filter((l) => l[iId] && l[iRating]);
  const dataSnapshot = todos[0][iData];

  let selecionados = todos;
  let descricaoEscopo = `Snapshot global completo (${todos.length} clubes).`;
  if (escopo === 'conmebol') {
    const sul = todos.filter((l) => l[iConf] === 'South America');
    const resto = todos
      .filter((l) => l[iConf] !== 'South America')
      .sort((a, b) => Number(b[iRating]) - Number(a[iRating]))
      .slice(0, topGlobal);
    const vistos = new Set<string>();
    selecionados = [...sul, ...resto].filter((l) => !vistos.has(l[iId]) && vistos.add(l[iId]));
    descricaoEscopo =
      `CONMEBOL completo (${sul.length}) + ${resto.length} melhores ratings do resto do mundo. ` +
      `Cobre todo adversario possivel dos clubes do bolao em competicoes sul-americanas e ` +
      `domesticas, mais eventual confronto intercontinental.`;
  }

  console.log(`arquivo: ${caminho}`);
  console.log(`snapshot: ${dataSnapshot}  |  no arquivo: ${todos.length}  |  a importar: ${selecionados.length}`);

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Um snapshot por data de arquivo. Reaproveita se já existir, para o script
  // ser idempotente de verdade e não criar um snapshot novo a cada execução.
  const { data: existente, error: erroBusca } = await sb
    .from('opta_snapshots')
    .select('id')
    .eq('snapshot_at', dataSnapshot)
    .maybeSingle();
  if (erroBusca) throw erroBusca;

  let snapshotId: string;
  if (existente) {
    snapshotId = (existente as { id: string }).id;
    console.log(`snapshot existente reaproveitado: ${snapshotId}`);
  } else {
    const { data, error } = await sb
      .from('opta_snapshots')
      .insert({
        snapshot_at: dataSnapshot,
        source_file: caminho.split('/').pop(),
        total_clubs: todos.length,
        imported_clubs: 0,
        import_scope: descricaoEscopo,
        is_active: false,
      })
      .select('id')
      .single();
    if (error) throw error;
    snapshotId = (data as { id: string }).id;
    console.log(`snapshot criado: ${snapshotId}`);
  }

  const registros = selecionados.map((l) => ({
    snapshot_id: snapshotId,
    opta_contestant_id: l[iId],
    opta_numeric_id: l[iNum] || null,
    team_name: l[iNome],
    club_name: l[iClube] && l[iClube] !== l[iNome] ? l[iClube] : null,
    country: l[iPais] || null,
    // A coluna vem corrompida em ~68 linhas do arquivo (hash em vez do nome).
    // Todas são de fora da América do Sul, mas guardar lixo não ajuda ninguém.
    confederation: ['Europe', 'Asia', 'South America', 'N/C America', 'Africa', 'Oceania'].includes(l[iConf])
      ? l[iConf]
      : null,
    domestic_league_id: l[iLigaId] || null,
    domestic_league_name: l[iLiga] || null,
    rating: Number(l[iRating]),
    global_rank: l[iRank] ? Number(l[iRank]) : null,
    confederation_rank: l[iRankConf] ? Number(l[iRankConf]) : null,
    last_week_rating: l[iSemana] ? Number(l[iSemana]) : null,
  }));

  const LOTE = 500;
  for (let i = 0; i < registros.length; i += LOTE) {
    const fatia = registros.slice(i, i + LOTE);
    const { error } = await sb
      .from('opta_club_ratings')
      .upsert(fatia, { onConflict: 'snapshot_id,opta_contestant_id' });
    if (error) throw error;
    process.stdout.write(`\r  gravados ${Math.min(i + LOTE, registros.length)}/${registros.length}`);
  }
  console.log('');

  const { count, error: erroConta } = await sb
    .from('opta_club_ratings')
    .select('*', { count: 'exact', head: true })
    .eq('snapshot_id', snapshotId);
  if (erroConta) throw erroConta;

  // Só ativa depois de tudo gravado. Índice parcial garante um ativo por vez,
  // então é preciso desativar o anterior primeiro.
  await sb.from('opta_snapshots').update({ is_active: false }).neq('id', snapshotId).eq('is_active', true);
  const { error: erroAtiva } = await sb
    .from('opta_snapshots')
    .update({ is_active: true, imported_clubs: count ?? 0, import_scope: descricaoEscopo })
    .eq('id', snapshotId);
  if (erroAtiva) throw erroAtiva;

  console.log(`pronto: ${count} clubes no snapshot ${snapshotId}, agora ativo.`);
}

// Só executa quando chamado direto: assim o parser pode ser importado por teste.
if (require.main === module) {
  main().catch((e) => {
    console.error('FALHOU:', e.message ?? e);
    process.exit(1);
  });
}
