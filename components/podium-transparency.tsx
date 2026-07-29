import Image from 'next/image';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getFlagUrl } from '@/lib/utils/flags';

interface PodiumPrediction {
  user_id: string;
  username: string;
  avatar_url: string | null;
  championTeam: string | null;
  championIso: string | null;
  viceTeam: string | null;
  viceIso: string | null;
  thirdTeam: string | null;
  thirdIso: string | null;
}

interface CompetitionBlock {
  key: string;
  name: string;
  started: boolean;
  hasThird: boolean;
  predictions: PodiumPrediction[];
}

interface Props {
  tournamentSlug: string;
  competitions: CompetitionBlock[];
  /** Opcional: destaca a linha do próprio jogador. Sem ele nada muda. */
  currentUserId?: string | null;
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function TeamChip({
  team,
  iso,
  variant,
}: {
  team: string | null;
  iso: string | null;
  variant: 'champion' | 'other';
}) {
  const tone =
    variant === 'champion'
      ? 'bg-primary/15 text-primary border-primary/30'
      : 'bg-surface-sunken text-card-foreground border-border';
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${tone}`}
    >
      {iso ? (
        iso.trim().toLowerCase().startsWith('http') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iso.trim()} alt="" className="h-3 w-[18px] flex-shrink-0 rounded-[2px] object-contain" loading="lazy" />
        ) : (
          <Image
            src={getFlagUrl(iso)}
            alt=""
            width={18}
            height={12}
            className="flex-shrink-0 rounded-[2px]"
            style={{ height: 'auto' }}
          />
        )
      ) : null}
      <span className="truncate">{team ?? '—'}</span>
    </span>
  );
}

export function PodiumTransparency({ tournamentSlug, competitions, currentUserId }: Props) {
  const startedComps = competitions.filter((c) => c.started);

  return (
    <div className="space-y-8">
      <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Trophy className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-primary font-semibold mb-1">Transparência — Palpites de Pódio</h3>
            <p className="text-card-foreground text-sm">
              Campeão e vice de cada participante, por competição, registrados antes do início. Ficam visíveis do
              primeiro jogo até o fim — garantindo que ninguém alterou o pódio depois que a bola rolou.
            </p>
          </div>
        </div>
      </div>

      {startedComps.length === 0 ? (
        <div className="text-muted-foreground text-center py-12">Nenhuma competição começou ainda.</div>
      ) : (
        startedComps.map((comp) => (
          <div key={comp.key} className="space-y-3">
            <h4 className="border-b border-hairline pb-2 font-mono text-[10.5px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]">
              {comp.name}
            </h4>
            {comp.predictions.length === 0 ? (
              <div className="text-[hsl(var(--faint))] text-sm py-4">Nenhum palpite de pódio nesta competição.</div>
            ) : (
              <div className="space-y-2">
                {comp.predictions.map((p) => {
                  const isVoce = !!currentUserId && p.user_id === currentUserId;
                  return (
                  <div
                    key={`${comp.key}-${p.user_id}`}
                    className={`flex items-center gap-3 rounded-[14px] border px-3 py-2.5 ${
                      isVoce ? 'border-primary/45 bg-primary/10' : 'border-hairline bg-card'
                    }`}
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0 border border-border">
                      <AvatarImage src={p.avatar_url || undefined} />
                      <AvatarFallback className="bg-muted text-[10px] text-foreground">
                        {getInitials(p.username)}
                      </AvatarFallback>
                    </Avatar>
                    <Link
                      href={`/${tournamentSlug}/desempenho/${p.user_id}`}
                      className="min-w-0 flex-shrink truncate text-sm font-semibold text-foreground transition-colors hover:text-primary"
                    >
                      {p.username}
                    </Link>
                    {isVoce && (
                      <span className="flex-shrink-0 rounded-full bg-primary px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.13em] text-primary-foreground">
                        Você
                      </span>
                    )}
                    <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                      <TeamChip team={p.championTeam} iso={p.championIso} variant="champion" />
                      <TeamChip team={p.viceTeam} iso={p.viceIso} variant="other" />
                      {comp.hasThird && <TeamChip team={p.thirdTeam} iso={p.thirdIso} variant="other" />}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
