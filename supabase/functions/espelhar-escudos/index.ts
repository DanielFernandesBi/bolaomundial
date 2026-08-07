import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ============================================================================
// Espelha o escudo de cada clube para o NOSSO Storage.
//
// Existe porque o app dependia, a cada visita, de dois hosts que não são
// nossos (media.api-sports.io e upload.wikimedia.org) responderem a dezenas de
// requisições de imagem vindas do aparelho do jogador. Em 07/08 metade dos
// escudos sumiu da tela — com as URLs devolvendo 200 quando pedidas do
// servidor. Arquivo certo, link certo, imagem não chega.
//
// Aqui o arquivo é baixado UMA vez e passa a ser nosso. A origem vira o que
// sempre deveria ter sido: procedência, não dependência.
//
// Roda como Edge Function, e não no Postgres, por um motivo prático: a imagem
// é binária, e o `http` do Postgres devolve o corpo como texto. Aqui os bytes
// atravessam intactos do fetch para o upload.
// ============================================================================

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "escudos";

/** Quantos clubes por chamada. Ver o comentário do laço. */
const LOTE_PADRAO = 60;
/** Quantos downloads ao mesmo tempo. */
const EM_PARALELO = 6;

const EXTENSAO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
};

const cabecalho = {
  apikey: CHAVE,
  Authorization: `Bearer ${CHAVE}`,
};

/**
 * Nome do arquivo a partir da chave do clube.
 *
 * `team_key` já vem normalizada (minúscula, só letras, números e espaço), então
 * trocar espaço por traço basta e não colide: a chave nunca contém traço, logo
 * a transformação é reversível e dois clubes diferentes não caem no mesmo nome.
 */
function nomeDoArquivo(teamKey: string, ext: string): string {
  return `${teamKey.trim().replace(/\s+/g, "-")}.${ext}`;
}

interface Pendente {
  team_key: string;
  origem: string;
}

async function fila(limite: number): Promise<Pendente[]> {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/escudos_a_espelhar`, {
    method: "POST",
    headers: { ...cabecalho, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) throw new Error(`fila: ${r.status} ${await r.text()}`);
  return ((await r.json()) as Pendente[]).slice(0, limite);
}

async function espelhar(p: Pendente): Promise<{ team_key: string; ok: boolean; detalhe: string }> {
  try {
    const resp = await fetch(p.origem, {
      headers: {
        // Alguns CDNs recusam requisição sem User-Agent. Custa nada mandar.
        "User-Agent": "bolaomundial/1.0 (espelhamento de escudos)",
        Accept: "image/*",
      },
    });
    if (!resp.ok) return { team_key: p.team_key, ok: false, detalhe: `origem devolveu ${resp.status}` };

    const tipo = (resp.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = EXTENSAO[tipo];
    if (!ext) return { team_key: p.team_key, ok: false, detalhe: `tipo inesperado: ${tipo || "(vazio)"}` };

    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.byteLength === 0) return { team_key: p.team_key, ok: false, detalhe: "arquivo vazio" };

    const arquivo = nomeDoArquivo(p.team_key, ext);

    const up = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${encodeURIComponent(arquivo)}`, {
      method: "POST",
      headers: {
        ...cabecalho,
        "Content-Type": tipo,
        // Um ano: escudo de clube praticamente não muda, e quando muda é a
        // coluna crest_origem_url que denuncia — o nome do arquivo é o mesmo,
        // então trocamos o conteúdo e o cache expira sozinho.
        "Cache-Control": "public, max-age=31536000",
        "x-upsert": "true",
      },
      body: bytes,
    });
    if (!up.ok) return { team_key: p.team_key, ok: false, detalhe: `upload: ${up.status} ${await up.text()}` };

    const publica = `${URL_BASE}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(arquivo)}`;

    const patch = await fetch(
      `${URL_BASE}/rest/v1/club_source_ids?team_key=eq.${encodeURIComponent(p.team_key)}`,
      {
        method: "PATCH",
        headers: { ...cabecalho, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          crest_url: publica,
          crest_origem_url: p.origem,
          crest_espelhado_em: new Date().toISOString(),
        }),
      },
    );
    if (!patch.ok) return { team_key: p.team_key, ok: false, detalhe: `patch: ${patch.status} ${await patch.text()}` };

    return { team_key: p.team_key, ok: true, detalhe: `${bytes.byteLength} bytes` };
  } catch (e) {
    return { team_key: p.team_key, ok: false, detalhe: String(e) };
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const limite = Math.min(Number(url.searchParams.get("limite") ?? LOTE_PADRAO) || LOTE_PADRAO, 200);

  try {
    const pendentes = await fila(limite);

    // Lotes pequenos e sequenciais entre si: a Edge Function tem teto de tempo,
    // e é melhor terminar 60 com folga e ser chamada de novo do que estourar no
    // meio de 330 e não saber onde parou. A fila é idempotente — quem já foi
    // espelhado não volta.
    const resultados: { team_key: string; ok: boolean; detalhe: string }[] = [];
    for (let i = 0; i < pendentes.length; i += EM_PARALELO) {
      const bloco = pendentes.slice(i, i + EM_PARALELO);
      resultados.push(...(await Promise.all(bloco.map(espelhar))));
    }

    const ok = resultados.filter((r) => r.ok).length;
    return new Response(
      JSON.stringify({
        pedidos: pendentes.length,
        espelhados: ok,
        falhas: resultados.filter((r) => !r.ok),
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ erro: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
