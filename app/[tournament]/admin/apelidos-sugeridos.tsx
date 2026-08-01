'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Link2, ShieldAlert, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Toast } from '@/components/toast';
import { aplicarApelido, ignorarApelido, type ApelidoSugerido } from './actions';

// ============================================================================
// Rodada de apelidos.
//
// A lista é ordenada pelo PREJUÍZO, não pela semelhança: o que importa é
// quantos jogos elegíveis o nome desconhecido já descartou. Um nome de liga
// sem peso pode ter 90% de semelhança e não custar nada — fica embaixo.
//
// Candidato marcado como conflitante não é mapeável por aqui. O ID dele na
// API já é conhecido e é outro, então é um clube diferente com nome parecido:
// Fortaleza do Brasil x Fortaleza da Colômbia, Santa Fe da Colômbia x Colón de
// Santa Fe. Nome não é chave.
// ============================================================================

function Similaridade({ v }: { v: number }) {
  return (
    <span className="font-mono text-[10px] tabular-nums text-[hsl(var(--faint))]">
      {v.toFixed(2)}
    </span>
  );
}

export function ApelidosSugeridos({
  apelidos,
  tournamentSlug,
}: {
  apelidos: ApelidoSugerido[];
  tournamentSlug: string;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  function avisar(message: string, tone: 'success' | 'error', ms = 5000) {
    setToast({ message, tone });
    setTimeout(() => setToast(null), ms);
  }

  async function mapear(nome: string, teamKey: string, nomeClube: string) {
    setOcupado(nome);
    const r = await aplicarApelido(nome, teamKey, tournamentSlug);
    setOcupado(null);
    if ((r as any)?.error) return avisar((r as any).error, 'error', 6000);
    const n = (r as any).reprocessadas ?? 0;
    avisar(
      `"${nome}" agora é ${nomeClube}.` + (n > 0 ? ` ${n} partida(s) reprocessada(s).` : ''),
      'success'
    );
    router.refresh();
  }

  async function ignorar(nome: string) {
    setOcupado(nome);
    const r = await ignorarApelido(nome, 'sem correspondência no mapa', tournamentSlug);
    setOcupado(null);
    if ((r as any)?.error) return avisar((r as any).error, 'error', 6000);
    avisar(`"${nome}" não será mais sugerido.`, 'success');
    router.refresh();
  }

  const comPrejuizo = apelidos.filter((a) => a.jogos_perdidos > 0);

  return (
    <>
      {toast && <Toast message={toast.message} tone={toast.tone} />}

      <Card className="border-border bg-card">
        <CardContent className="p-4">
          <div className="mb-1 flex items-center gap-2">
            <Tags className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-bold text-foreground">Apelidos de clubes</h2>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            Nomes que a API-Football usa e o nosso mapa não conhece. Enquanto um deles não for
            reconhecido, <strong>toda partida em que ele aparece é descartada</strong> — o modelo
            exige os dois clubes mapeados. A lista vem ordenada pelo prejuízo real.
            {comPrejuizo.length > 0 && (
              <>
                {' '}
                <strong className="text-state-closing">
                  {comPrejuizo.length} {comPrejuizo.length === 1 ? 'nome está' : 'nomes estão'}{' '}
                  custando jogos agora.
                </strong>
              </>
            )}
          </p>

          {apelidos.length === 0 ? (
            <p className="rounded-md border border-hairline bg-surface-sunken px-3 py-4 text-sm text-muted-foreground">
              Nenhum nome pendente. Tudo que apareceu ao lado de um clube do bolão está mapeado.
            </p>
          ) : (
            <div className="space-y-2">
              {apelidos.map((a) => (
                <div
                  key={a.nome_api}
                  className={`rounded-md border p-3 ${
                    a.jogos_perdidos > 0
                      ? 'border-state-closing/40 bg-state-closing/5'
                      : 'border-border bg-background'
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{a.nome_api}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {a.ligas ?? 'liga desconhecida'}
                        {a.provider_id ? ` · id ${a.provider_id}` : ''}
                      </p>
                    </div>
                    <span
                      className={`font-mono text-[10px] uppercase tracking-wider ${
                        a.jogos_perdidos > 0 ? 'text-state-closing' : 'text-[hsl(var(--faint))]'
                      }`}
                    >
                      {a.jogos_perdidos > 0
                        ? `${a.jogos_perdidos} jogo(s) descartado(s)`
                        : `${a.ocorrencias} aparição(ões), 0 descarte`}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {a.candidatos.map((c) => (
                      <Button
                        key={c.team_key}
                        size="sm"
                        variant={c.id_conflitante ? 'outline' : 'default'}
                        disabled={c.id_conflitante || ocupado !== null}
                        title={
                          c.id_conflitante
                            ? 'O ID deste clube na API já é conhecido e é outro. É um clube diferente com nome parecido.'
                            : undefined
                        }
                        onClick={() => mapear(a.nome_api, c.team_key, c.nome)}
                        className={
                          c.id_conflitante
                            ? 'border-destructive/40 text-destructive opacity-70'
                            : 'bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]'
                        }
                      >
                        {c.id_conflitante ? (
                          <ShieldAlert className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                        ) : (
                          <Link2 className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                        )}
                        <span className="truncate">{c.nome}</span>
                        <span className="ml-1.5">
                          <Similaridade v={c.similaridade} />
                        </span>
                      </Button>
                    ))}

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={ocupado !== null}
                      onClick={() => ignorar(a.nome_api)}
                      className="text-muted-foreground"
                    >
                      <Ban className="mr-1.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                      Nenhum destes
                    </Button>
                  </div>

                  {a.candidatos.some((c) => c.id_conflitante) && (
                    <p className="mt-2 text-[11px] leading-relaxed text-destructive">
                      Um dos candidatos está bloqueado: o ID dele na API-Football já é conhecido e é
                      outro. Clube diferente com nome parecido.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-[hsl(var(--faint))]">
            &quot;Nenhum destes&quot; tira o nome da lista para sempre. Use quando não houver
            correspondência de verdade — time B (&quot;Sport Huancayo 2&quot;) ou clube que não está
            entre os 384 com rating Opta.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
