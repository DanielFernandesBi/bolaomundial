'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Lock, ChevronRight, ChevronLeft, Check, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getFlagUrl } from '@/lib/utils/flags';
import { savePrediction } from '@/app/[tournament]/matches/actions';

// Função simples de formatação de data em português
function formatDate(date: Date): string {
  const days = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
  const months = [
    'jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.',
    'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.',
  ];
  const dayName = days[date.getDay()];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${dayName}, ${day} de ${month} às ${hours}:${minutes}`;
}

type ExtraResult = 'home' | 'draw' | 'away' | '';

interface MatchCardProps {
  match: {
    id: number;
    team_home: string;
    team_away: string;
    home_iso: string | null;
    away_iso: string | null;
    match_date: string | null;
    score_home: number | null;
    score_away: number | null;
    status: string;
    is_knockout?: boolean;
    has_extra_time?: boolean;
    extra_time_result?: 'home' | 'draw' | 'away' | null;
    pen_home?: number | null;
    pen_away?: number | null;
    user_prediction: {
      id: number;
      pred_home: number;
      pred_away: number;
      pred_extra_result?: 'home' | 'draw' | 'away' | null;
      pred_pen_home?: number | null;
      pred_pen_away?: number | null;
      points_earned: number;
      points_regular?: number;
      points_extra?: number;
      points_pen?: number;
    } | null;
  };
  group?: string;
  tournamentStartDate?: string;
}

function TeamLogo({ iso, alt }: { iso: string | null; alt: string }) {
  if (!iso) return null;
  const trimmed = iso.trim();
  if (trimmed.toLowerCase().startsWith('http')) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={trimmed}
        alt={alt}
        className="w-10 h-10 rounded object-contain bg-slate-800"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  return <Image src={getFlagUrl(iso)} alt={alt} width={40} height={40} className="w-10 h-auto rounded" />;
}

export function MatchCard({ match, group = 'Fase de Grupos' }: MatchCardProps) {
  const pathname = usePathname();
  const tournamentSlug = pathname?.split('/')[1] || '';

  const isKnockout = !!match.is_knockout;
  const hasExtraTime = match.has_extra_time !== false; // default true (Mundial); clubes = false
  const isFinished = match.status === 'FINISHED';

  const initialHome = match.user_prediction?.pred_home?.toString() ?? '';
  const initialAway = match.user_prediction?.pred_away?.toString() ?? '';
  const initialExtra = (match.user_prediction?.pred_extra_result ?? '') as ExtraResult;
  const initialPenHome = match.user_prediction?.pred_pen_home?.toString() ?? '';
  const initialPenAway = match.user_prediction?.pred_pen_away?.toString() ?? '';

  const [step, setStep] = useState(1);
  const [homeScore, setHomeScore] = useState(initialHome);
  const [awayScore, setAwayScore] = useState(initialAway);
  const [extraResult, setExtraResult] = useState<ExtraResult>(initialExtra);
  const [penHome, setPenHome] = useState(initialPenHome);
  const [penAway, setPenAway] = useState(initialPenAway);

  const [saved, setSaved] = useState({
    home: initialHome,
    away: initialAway,
    extra: initialExtra as ExtraResult,
    penHome: initialPenHome,
    penAway: initialPenAway,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const newHome = match.user_prediction?.pred_home?.toString() ?? '';
    const newAway = match.user_prediction?.pred_away?.toString() ?? '';
    const newExtra = (match.user_prediction?.pred_extra_result ?? '') as ExtraResult;
    const newPenHome = match.user_prediction?.pred_pen_home?.toString() ?? '';
    const newPenAway = match.user_prediction?.pred_pen_away?.toString() ?? '';

    setSaved((prev) => {
      const hadLocalChanges =
        homeScore !== prev.home ||
        awayScore !== prev.away ||
        extraResult !== prev.extra ||
        penHome !== prev.penHome ||
        penAway !== prev.penAway;
      if (!hadLocalChanges) {
        setHomeScore(newHome);
        setAwayScore(newAway);
        setExtraResult(newExtra);
        setPenHome(newPenHome);
        setPenAway(newPenAway);
      }
      return { home: newHome, away: newAway, extra: newExtra, penHome: newPenHome, penAway: newPenAway };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    match.user_prediction?.pred_home,
    match.user_prediction?.pred_away,
    match.user_prediction?.pred_extra_result,
    match.user_prediction?.pred_pen_home,
    match.user_prediction?.pred_pen_away,
  ]);

  // match_date pode ser NULL ("data a definir") → sem prazo, palpite aberto.
  const matchDate = match.match_date ? new Date(match.match_date) : null;
  const dateTbd = !match.match_date;
  const isLocked = (matchDate ? new Date() > matchDate : false) || isFinished;

  const hasUnsavedChanges =
    homeScore !== saved.home ||
    awayScore !== saved.away ||
    extraResult !== saved.extra ||
    penHome !== saved.penHome ||
    penAway !== saved.penAway;

  // Mostra o wizard interativo só quando dá pra editar um jogo de mata-mata
  const showStepper = isKnockout && !isLocked;

  // Passos do wizard: sem prorrogação quando has_extra_time = false (clubes)
  type StepKey = 'normal' | 'extra' | 'pen';
  const stepDefs: { key: StepKey; label: string }[] = hasExtraTime
    ? [
        { key: 'normal', label: 'Tempo normal' },
        { key: 'extra', label: 'Prorrogação' },
        { key: 'pen', label: 'Pênaltis' },
      ]
    : [
        { key: 'normal', label: 'Tempo normal' },
        { key: 'pen', label: 'Pênaltis' },
      ];
  const totalSteps = stepDefs.length;

  const isStepDone = (key: StepKey) => {
    if (key === 'normal') return homeScore !== '' && awayScore !== '';
    if (key === 'extra') return extraResult !== '';
    return penHome !== '' && penAway !== '';
  };

  const handleSave = async () => {
    if (isLocked) return;
    const home = parseInt(homeScore) || 0;
    const away = parseInt(awayScore) || 0;
    if (home < 0 || away < 0) {
      setToastMessage('Os placares devem ser números positivos');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    setIsSaving(true);
    const extra = isKnockout
      ? {
          predExtraResult: (hasExtraTime ? extraResult || null : null) as 'home' | 'draw' | 'away' | null,
          predPenHome: penHome === '' ? null : parseInt(penHome),
          predPenAway: penAway === '' ? null : parseInt(penAway),
        }
      : undefined;

    const result = await savePrediction(match.id, home, away, tournamentSlug, extra);
    if (result.error) {
      setToastMessage(result.error);
    } else {
      setToastMessage('Palpite salvo com sucesso!');
      setSaved({ home: home.toString(), away: away.toString(), extra: extraResult, penHome, penAway });
    }
    setTimeout(() => setToastMessage(null), 3000);
    setIsSaving(false);
  };

  // ── Badges de pontuação ───────────────────────────────────────────────
  function regularBadge() {
    const pts = match.user_prediction?.points_regular ?? 0;
    if (!isFinished || pts === 0) return null;
    let bg = 'bg-slate-600';
    let text = `+${pts} pts`;
    if (pts === 30) { bg = 'bg-amber-500'; text = `+${pts} Cravada!`; }
    else if (pts === 17) { bg = 'bg-purple-500'; text = `+${pts} Vencedor + Gols`; }
    else if (pts === 15) { bg = 'bg-blue-500'; text = `+${pts} pts`; }
    else if (pts === 12) { bg = 'bg-green-500'; text = `+${pts} pts`; }
    else if (pts === 10 || pts === 9) { bg = 'bg-cyan-500'; text = `+${pts} Vencedor`; }
    else if (pts === 3) { bg = 'bg-orange-500'; text = `+${pts} Consolação`; }
    return <span className={`${bg} text-white px-3 py-1 rounded-full text-xs font-semibold`}>{text}</span>;
  }
  function extraBadge() {
    const pts = match.user_prediction?.points_extra ?? 0;
    if (!isFinished || pts === 0) return null;
    return <span className="bg-indigo-500 text-white px-3 py-1 rounded-full text-xs font-semibold">+{pts} Prorrogação</span>;
  }
  function penBadge() {
    const pts = match.user_prediction?.points_pen ?? 0;
    if (!isFinished || pts === 0) return null;
    return <span className="bg-pink-500 text-white px-3 py-1 rounded-full text-xs font-semibold">+{pts} Pênaltis</span>;
  }
  function extraResultLabel(r: 'home' | 'draw' | 'away' | null | undefined) {
    if (r === 'home') return `${match.team_home} vence`;
    if (r === 'away') return `${match.team_away} vence`;
    if (r === 'draw') return 'Empate';
    return '—';
  }

  // Cabeçalho de status do palpite (baseado no que está salvo no banco)
  function statusHeader() {
    if (isFinished) return null;

    const hasRegular = saved.home !== '' && saved.away !== '';
    let tone: 'none' | 'partial' | 'complete';
    let text: string;

    if (!hasRegular) {
      tone = 'none';
      text = isLocked ? 'Você não palpitou neste jogo' : 'Você ainda não palpitou neste jogo';
    } else if (isKnockout) {
      const missing: string[] = [];
      if (hasExtraTime && saved.extra === '') missing.push('prorrogação');
      if (saved.penHome === '' || saved.penAway === '') missing.push('pênaltis');
      if (missing.length > 0) {
        tone = 'partial';
        text = `Palpite incompleto — falta: ${missing.join(' e ')}`;
      } else {
        tone = 'complete';
        text = 'Palpite completo — tudo certo!';
      }
    } else {
      tone = 'complete';
      text = 'Palpite registrado — tudo certo!';
    }

    const styles = {
      none: 'bg-red-500/15 border-red-500/40 text-red-300',
      partial: 'bg-amber-500/15 border-amber-500/40 text-amber-200',
      complete: 'bg-green-500/15 border-green-500/40 text-green-300',
    }[tone];

    const Icon = tone === 'none' ? AlertCircle : tone === 'partial' ? AlertTriangle : CheckCircle2;

    return (
      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 mb-3 ${styles}`}>
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm font-semibold">{text}</span>
      </div>
    );
  }

  const currentStepKey = stepDefs[step - 1]?.key ?? 'normal';
  const allStepsFilled = stepDefs.every((s) => isStepDone(s.key));

  return (
    <Card className={`bg-slate-900 border-slate-800 relative ${isLocked && !isFinished ? 'opacity-70' : ''}`}>
      <CardContent className="p-4">
        {toastMessage && (
          <div className="absolute top-4 right-4 bg-slate-800 text-white px-4 py-2 rounded-md shadow-lg z-10">
            {toastMessage}
          </div>
        )}

        {/* Cabeçalho de status do palpite */}
        {statusHeader()}

        {/* Topo */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-slate-400 text-sm">{group}</span>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {regularBadge()}
            {extraBadge()}
            {penBadge()}
            {isLocked && !isFinished && (
              <div className="flex items-center gap-1 text-slate-400 text-sm">
                <Lock className="w-4 h-4" />
                <span>Bloqueado</span>
              </div>
            )}
          </div>
        </div>

        {/* Centro: times + (placar quando finalizado ou jogo de grupos) */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col items-center gap-2 flex-1">
            <div className="text-sm font-bold text-white text-center">{match.team_home}</div>
            <TeamLogo iso={match.home_iso} alt={match.team_home} />
          </div>

          <div className="flex items-center gap-2 mx-4">
            {isFinished ? (
              <div className="flex items-center gap-2">
                <div className="bg-slate-800 text-white text-2xl font-bold px-4 py-2 rounded">{match.score_home ?? '-'}</div>
                <span className="text-white text-xl">x</span>
                <div className="bg-slate-800 text-white text-2xl font-bold px-4 py-2 rounded">{match.score_away ?? '-'}</div>
              </div>
            ) : isKnockout ? (
              // No mata-mata o placar é editado dentro do passo 1 (abaixo)
              <span className="text-slate-500 text-2xl font-bold">vs</span>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  disabled={isLocked || isSaving}
                  className={`w-16 text-center text-white text-xl font-bold h-12 ${
                    isLocked ? 'bg-slate-800 border-slate-600 opacity-50' : 'bg-slate-950 border-slate-700'
                  }`}
                />
                <span className="text-white text-xl">x</span>
                <Input
                  type="number"
                  min="0"
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  disabled={isLocked || isSaving}
                  className={`w-16 text-center text-white text-xl font-bold h-12 ${
                    isLocked ? 'bg-slate-800 border-slate-600 opacity-50' : 'bg-slate-950 border-slate-700'
                  }`}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-2 flex-1">
            <div className="text-sm font-bold text-white text-center">{match.team_away}</div>
            <TeamLogo iso={match.away_iso} alt={match.team_away} />
          </div>
        </div>

        {/* ── WIZARD DE MATA-MATA ───────────────────────────────────────── */}
        {showStepper && (
          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-950/60 overflow-hidden">
            {/* Indicador de passos (clicável) */}
            <div
              className="grid border-b border-slate-800"
              style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}
            >
              {stepDefs.map((s, i) => {
                const n = i + 1;
                const active = step === n;
                const done = isStepDone(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStep(n)}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-1 text-xs font-semibold transition-colors ${
                      active ? 'bg-amber-500 text-black' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span
                      className={`flex items-center justify-center w-5 h-5 rounded-full text-[11px] ${
                        active
                          ? 'bg-black/20 text-black'
                          : done
                          ? 'bg-green-500 text-white'
                          : 'bg-slate-700 text-slate-200'
                      }`}
                    >
                      {done && !active ? <Check className="w-3 h-3" /> : n}
                    </span>
                    <span className="truncate">{s.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Conteúdo do passo */}
            <div className="p-4">
              {currentStepKey === 'normal' && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-300 text-center font-medium">Placar no tempo normal (90 min)</p>
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[11px] text-slate-400 truncate max-w-[80px]">{match.team_home}</span>
                      <Input
                        type="number"
                        min="0"
                        value={homeScore}
                        onChange={(e) => setHomeScore(e.target.value)}
                        className="w-16 text-center text-white text-2xl font-bold h-14 bg-slate-950 border-slate-700"
                      />
                    </div>
                    <span className="text-white text-xl mt-5">x</span>
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[11px] text-slate-400 truncate max-w-[80px]">{match.team_away}</span>
                      <Input
                        type="number"
                        min="0"
                        value={awayScore}
                        onChange={(e) => setAwayScore(e.target.value)}
                        className="w-16 text-center text-white text-2xl font-bold h-14 bg-slate-950 border-slate-700"
                      />
                    </div>
                  </div>
                </div>
              )}

              {currentStepKey === 'extra' && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-300 text-center font-medium">E se for à prorrogação, quem avança?</p>
                  <div className="grid grid-cols-1 gap-2">
                    {([
                      ['home', `${match.team_home} vence`],
                      ['draw', 'Continua empatado → pênaltis'],
                      ['away', `${match.team_away} vence`],
                    ] as [ExtraResult, string][]).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setExtraResult(val)}
                        className={`px-3 py-3 rounded-lg text-sm font-medium border-2 transition-colors ${
                          extraResult === val
                            ? 'bg-amber-500 text-black border-amber-500'
                            : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {currentStepKey === 'pen' && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-300 text-center font-medium">
                    {hasExtraTime ? 'E se for aos pênaltis, qual o placar?' : 'E se o agregado empatar e for aos pênaltis, qual o placar?'}
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[11px] text-slate-400 truncate max-w-[80px]">{match.team_home}</span>
                      <Input
                        type="number"
                        min="0"
                        value={penHome}
                        onChange={(e) => setPenHome(e.target.value)}
                        className="w-16 text-center text-white text-2xl font-bold h-14 bg-slate-950 border-slate-700"
                      />
                    </div>
                    <span className="text-white text-xl mt-5">x</span>
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[11px] text-slate-400 truncate max-w-[80px]">{match.team_away}</span>
                      <Input
                        type="number"
                        min="0"
                        value={penAway}
                        onChange={(e) => setPenAway(e.target.value)}
                        className="w-16 text-center text-white text-2xl font-bold h-14 bg-slate-950 border-slate-700"
                      />
                    </div>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-500 text-center mt-3">
                {hasExtraTime
                  ? 'Prorrogação e pênaltis são palpites eventuais: só pontuam se acontecerem.'
                  : 'Os pênaltis são palpite eventual: só pontuam se o confronto for decidido neles.'}
              </p>

              {/* Navegação centralizada */}
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(1, s - 1))}
                  disabled={step === 1}
                  className="flex items-center justify-center gap-1 px-4 py-2.5 rounded-lg text-sm font-semibold bg-slate-700 text-slate-100 disabled:opacity-30 hover:bg-slate-600"
                >
                  <ChevronLeft className="w-4 h-4" /> Voltar
                </button>
                {step < totalSteps ? (
                  <button
                    type="button"
                    onClick={() => setStep((s) => Math.min(totalSteps, s + 1))}
                    className="flex items-center justify-center gap-1 px-10 py-2.5 rounded-lg text-sm font-bold bg-amber-500 text-black hover:bg-amber-400"
                  >
                    <span className="mx-auto">Próximo</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  (() => {
                    const allFilled = allStepsFilled;
                    const canSave = hasUnsavedChanges && !isSaving;
                    return (
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={!canSave}
                        className={`px-10 py-2.5 rounded-lg text-base font-bold transition-colors ${
                          !canSave
                            ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                            : allFilled
                            ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/40'
                            : 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                        }`}
                      >
                        {isSaving ? 'Salvando...' : !hasUnsavedChanges ? 'Tudo salvo' : 'Salvar Palpite'}
                      </button>
                    );
                  })()
                )}
              </div>
            </div>
          </div>
        )}

        {/* Palpite de mata-mata bloqueado (jogo começou, ainda não finalizado): resumo read-only */}
        {isKnockout && isLocked && !isFinished && match.user_prediction && (
          <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300 space-y-1">
            <div className="text-center">Tempo normal: <strong>{match.user_prediction.pred_home} x {match.user_prediction.pred_away}</strong></div>
            {match.user_prediction.pred_extra_result && (
              <div className="text-center text-xs">Prorrogação: {extraResultLabel(match.user_prediction.pred_extra_result)}</div>
            )}
            {match.user_prediction.pred_pen_home != null && (
              <div className="text-center text-xs">Pênaltis: {match.user_prediction.pred_pen_home} x {match.user_prediction.pred_pen_away}</div>
            )}
          </div>
        )}

        {/* Rodapé: data + salvar (jogos de grupos) */}
        <div className="flex flex-col items-center gap-2">
          {dateTbd ? (
            <div className="flex items-center gap-1.5 text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1 text-xs font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" /> Data e horário a definir
            </div>
          ) : (
            <div className="text-slate-400 text-sm text-center">{matchDate ? formatDate(matchDate) : ''}</div>
          )}

          {!showStepper && !isLocked && hasUnsavedChanges && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`w-full px-4 py-3 rounded-lg font-bold text-sm transition-colors ${
                isSaving ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isSaving ? 'Salvando...' : 'Salvar Palpite'}
            </button>
          )}
        </div>

        {/* Resultado real de prorrogação/pênaltis (encerrado) */}
        {isFinished && isKnockout && (match.extra_time_result || match.pen_home != null) && (
          <div className="text-slate-400 text-xs text-center mt-2 space-y-0.5">
            {match.extra_time_result && <div>Prorrogação: {extraResultLabel(match.extra_time_result)}</div>}
            {match.pen_home != null && match.pen_away != null && (
              <div>Pênaltis: {match.pen_home} x {match.pen_away}</div>
            )}
          </div>
        )}

        {/* Palpite do usuário (encerrado) */}
        {isFinished && match.user_prediction && (
          <div className="text-slate-400 text-sm text-center mt-2 space-y-0.5">
            <div>Seu palpite: {match.user_prediction.pred_home} x {match.user_prediction.pred_away}</div>
            {isKnockout && match.user_prediction.pred_extra_result && (
              <div className="text-xs">Prorrogação: {extraResultLabel(match.user_prediction.pred_extra_result)}</div>
            )}
            {isKnockout && match.user_prediction.pred_pen_home != null && (
              <div className="text-xs">
                Pênaltis: {match.user_prediction.pred_pen_home} x {match.user_prediction.pred_pen_away}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
