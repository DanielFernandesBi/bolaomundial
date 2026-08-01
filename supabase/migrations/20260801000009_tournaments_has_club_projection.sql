-- ============================================================================
-- Aba "Projeção" do ranking para o bolão de clubes.
--
-- has_simulator liga a aba que renderiza o simulador de SELEÇÕES (prior FIFA,
-- chave fixa de 32, fase de grupos, disputa de 3º). O bolão de clubes tem
-- outro motor — três competições, ida e volta, prior Opta — e por isso precisa
-- da própria chave. Duas colunas, e não uma, porque os dois conteúdos não são
-- intercambiáveis: ligar a errada mostraria números de um torneio que não
-- existe.
-- ============================================================================

alter table public.tournaments
  add column if not exists has_club_projection boolean not null default false;

comment on column public.tournaments.has_club_projection is
  'Liga a aba Projeção do ranking com o motor de clubes (lib/club-model). Exclusivo em relação a has_simulator, que usa o motor de seleções.';

update public.tournaments
   set has_club_projection = true
 where slug = 'mata-mata-clubes-2026';
