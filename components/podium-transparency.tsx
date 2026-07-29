import Image from 'next/image';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function Slot({ label, team, iso, color }: { label: string; team: string | null; iso: string | null; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
      <span className={`text-[10px] font-semibold ${color}`}>{label}</span>
      <div className="h-8 flex items-center justify-center">
        {iso ? (
          iso.trim().toLowerCase().startsWith('http') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={iso.trim()} alt={team || ''} className="w-7 h-7 rounded object-contain bg-muted" loading="lazy" />
          ) : (
            <Image src={getFlagUrl(iso)} alt={team || ''} width={28} height={28} className="rounded" style={{ height: 'auto' }} />
          )
        ) : (
          <span className="text-[hsl(var(--faint))] text-xs">—</span>
        )}
      </div>
      <span className="text-[10px] text-card-foreground truncate w-full text-center">{team ?? '—'}</span>
    </div>
  );
}

export function PodiumTransparency({ tournamentSlug, competitions }: Props) {
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
            <h4 className="text-foreground font-bold text-lg border-b border-border pb-2">{comp.name}</h4>
            {comp.predictions.length === 0 ? (
              <div className="text-[hsl(var(--faint))] text-sm py-4">Nenhum palpite de pódio nesta competição.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {comp.predictions.map((p) => (
                  <Card key={`${comp.key}-${p.user_id}`} className="bg-card border-border">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Avatar className="w-9 h-9 border-2 border-border">
                          <AvatarImage src={p.avatar_url || undefined} />
                          <AvatarFallback className="bg-muted text-foreground text-xs">{getInitials(p.username)}</AvatarFallback>
                        </Avatar>
                        <Link
                          href={`/${tournamentSlug}/desempenho/${p.user_id}`}
                          className="text-foreground font-medium hover:text-primary transition-colors truncate"
                        >
                          {p.username}
                        </Link>
                      </div>
                      <div className="flex items-start gap-2">
                        <Slot label="Campeão" team={p.championTeam} iso={p.championIso} color="text-primary" />
                        <Slot label="Vice" team={p.viceTeam} iso={p.viceIso} color="text-card-foreground" />
                        {comp.hasThird && (
                          <Slot label="3º lugar" team={p.thirdTeam} iso={p.thirdIso} color="text-state-missing" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
