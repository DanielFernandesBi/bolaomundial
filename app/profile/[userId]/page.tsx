import { Trophy, ChevronRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import { getPublicProfile } from '../actions';
import { notFound } from 'next/navigation';

// ============================================================================
// Perfil de OUTRO jogador
// ============================================================================
// Tela irmã de app/profile/page.tsx. O redesign do bloco 6c reorganizou só a
// própria, e esta ficou com o layout velho — quem abria o perfil de um colega
// via a versão anterior do app, com o valor em dinheiro estourando o card.
//
// Agora as duas seguem o MESMO desenho. A diferença é só o que não faz sentido
// aqui: sem upload de avatar (é de outra pessoa), sem alternador de tema, e a
// cópia fala em terceira pessoa.
// ============================================================================

// Função para formatar data em português
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const months = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Função para formatar dinheiro
function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

const legenda = 'font-mono text-[10px] uppercase tracking-[0.13em] text-[hsl(var(--faint))]';

function FaixaMetricas({ itens }: { itens: readonly (readonly [string, string | number])[] }) {
  return (
    <div className="mb-4 grid grid-cols-4 divide-x divide-hairline rounded-[16px] border border-border bg-card">
      {itens.map(([label, value]) => (
        <div key={label} className="px-2 py-3 text-center">
          <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
          <p className={`mt-0.5 truncate ${legenda} text-[9px]`}>{label}</p>
        </div>
      ))}
    </div>
  );
}

interface PublicProfilePageProps {
  params: Promise<{
    userId: string;
  }>;
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { userId } = await params;
  const { profile, error } = await getPublicProfile(userId);

  if (error || !profile) {
    notFound();
  }

  const initials = profile.username
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const memberSince = formatDate(profile.created_at);

  const taxaAcerto =
    profile.total_predictions > 0
      ? Math.round((profile.correct_predictions / profile.total_predictions) * 100)
      : 0;

  const distribuicao = [
    ['Cravadas (30 pts)', profile.points_distribution?.exact || 0, 'text-score-exact'],
    ['17 pts', profile.points_distribution?.category17 || 0, 'text-score-partial'],
    ['15 pts', profile.points_distribution?.category15 || 0, 'text-score-partial'],
    ['12 pts', profile.points_distribution?.category12 || 0, 'text-score-partial'],
    ['10 pts', profile.points_distribution?.category9 || 0, 'text-score-partial'],
    ['3 pts', profile.points_distribution?.category3 || 0, 'text-score-partial'],
    ['0 pts', profile.points_distribution?.zero || 0, 'text-score-none'],
  ] as const;

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="container mx-auto max-w-full px-4 py-8 pb-28 md:pb-8">
        {/* Cabeçalho centralizado */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="h-[76px] w-[76px] rounded-full bg-primary p-1">
            <Avatar className="h-full w-full">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="bg-muted text-xl font-bold text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
          <h1 className="mt-3 text-xl font-bold text-foreground">{profile.username}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Membro desde {memberSince}</p>
          {profile.general_ranking_position && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1">
              <Trophy className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span className="text-xs font-semibold text-foreground">
                {profile.general_ranking_position}º no ranking geral
              </span>
            </div>
          )}
        </div>

        {/* Herói: pontos e dinheiro */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-[16px] border border-primary/30 bg-primary/5 p-4">
            <p className={legenda}>Pontos totais</p>
            <p className="mt-1 text-[32px] font-bold leading-none tabular-nums text-primary">
              {profile.total_points}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {profile.total_predictions} {profile.total_predictions === 1 ? 'palpite' : 'palpites'}
            </p>
          </div>
          <div className="rounded-[16px] border border-border bg-card p-4">
            <p className={legenda}>Dinheiro ganho</p>
            {/* O valor era `text-3xl` num card estreito e estourava a borda com
                4 dígitos (R$ 1.510,00). Aqui ele é menor e a caixa deixa quebrar. */}
            <p className="mt-1 break-words text-[26px] font-bold leading-none tabular-nums text-money">
              {formatMoney(profile.total_money)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">somando todos os bolões</p>
          </div>
        </div>

        {/* Faixas de métricas */}
        <FaixaMetricas
          itens={[
            ['Cravadas', profile.exact_matches],
            ['Acertos', profile.correct_predictions],
            ['Aproveit.', `${taxaAcerto}%`],
            ['Média', profile.average_points || 0],
          ]}
        />
        <FaixaMetricas
          itens={[
            ['% Cravadas', `${profile.exact_matches_percentage || 0}%`],
            ['Palpites', profile.total_predictions],
            ['Melhor jogo', `${profile.best_score || 0}`],
            ['Bolões', profile.tournaments?.length ?? 0],
          ]}
        />

        {/* Distribuição de pontos */}
        <div className="mb-6 rounded-[16px] border border-border bg-card p-4">
          <p className={`mb-2 ${legenda}`}>Distribuição de pontos</p>
          <div className="space-y-2">
            {distribuicao.map(([label, valor, tom]) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-card-foreground">{label}</span>
                <span className={`font-semibold tabular-nums ${tom}`}>{valor}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bolões que jogou — uma linha por torneio */}
        <p className={`mb-2 ${legenda}`}>Bolões que jogou</p>
        {profile.tournaments && profile.tournaments.length > 0 ? (
          <div className="mb-6 space-y-2">
            {profile.tournaments.map((tournament) => (
              <Link
                key={tournament.tournament_id}
                href={`/${tournament.tournament_slug}/desempenho/${userId}`}
                className="flex min-h-[64px] items-center gap-3 rounded-[14px] border border-hairline bg-card px-3 py-2.5 transition-colors hover:border-primary/40"
              >
                {tournament.tournament_logo ? (
                  <img
                    src={tournament.tournament_logo}
                    alt=""
                    className="h-9 w-9 flex-shrink-0 object-contain"
                  />
                ) : (
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-surface-sunken">
                    <Trophy className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {tournament.tournament_name}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {tournament.total_points} pts · {tournament.exact_matches} cravadas
                    {tournament.tournament_status === 'active' && ' · em disputa'}
                    {tournament.tournament_status === 'pending' && ' · a começar'}
                  </p>
                </div>

                {tournament.prize_money > 0 && (
                  <span className="flex-shrink-0 text-sm font-bold tabular-nums text-money">
                    {formatMoney(tournament.prize_money)}
                  </span>
                )}
                <ChevronRight
                  className="h-4 w-4 flex-shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        ) : (
          <div className="mb-6 rounded-[16px] border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Este jogador ainda não participou de nenhum bolão.
          </div>
        )}
      </div>
    </div>
  );
}
