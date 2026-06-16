'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, Market, Outcome } from '@/lib/store';
import { logoForTeam } from '@/lib/flags';
import TeamFlag from '@/components/TeamFlag';
import Navigation from '@/components/Navigation';
import GameEventOverlay from '@/components/GameEventOverlay';

export default function HomePage() {
  const router = useRouter();
  const {
    currentUser,
    match,
    hasActiveMatch,
    markets,
    placeBet,
    doubleGainsActive,
    teamLogos,
  } = useGameStore();

  const matchFinished = match.status === 'finished';
  const bettingOpen = hasActiveMatch && !matchFinished;

  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [betAmount, setBetAmount] = useState<number>(100);
  const [betStatusMsg, setBetStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !currentUser) router.push('/join');
  }, [currentUser, router, mounted]);

  // Polling de sync : tout client connecté (téléphone inclus) fait avancer le match. Le serveur
  // limite le débit (un seul appel API par fenêtre) → robuste même si l'écran TV n'est pas ouvert.
  // Tourne dès qu'un match est actif et non terminé (y compris « avant-match » → coup d'envoi auto).
  useEffect(() => {
    if (!hasActiveMatch || match.status === 'finished') return;
    const id = setInterval(() => { fetch('/api/admin/sync').catch(() => {}); }, 15000);
    return () => clearInterval(id);
  }, [hasActiveMatch, match.status]);

  // Quand on se connecte (currentUser défini) et qu'un match est actif, on affiche le haut de la page
  useEffect(() => {
    if (mounted && currentUser && hasActiveMatch) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [currentUser, hasActiveMatch, mounted]);

  if (!mounted || !currentUser) return null;

  /* ── Écran d'attente ── */
  if (!hasActiveMatch) {
    return (
      <div className="min-h-dvh flex flex-col text-on-surface pb-28 md:pb-12 pt-24">
        <Navigation />
        <GameEventOverlay />
        <main className="grow w-full max-w-container-max mx-auto px-4 md:px-16 py-6 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="glass-strong gradient-border rounded-3xl p-10 md:p-14 text-center max-w-lg w-full relative overflow-hidden"
          >
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full pointer-events-none blur-3xl"
              style={{ background: 'rgba(123,97,255,0.15)' }} />
            <div className="relative z-10 flex flex-col items-center gap-5">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center animate-float border border-white/10"
                style={{ background: 'rgba(123,97,255,0.12)' }}
              >
                <span className="material-symbols-outlined text-[44px] text-primary">stadium</span>
              </div>
              <h1 className="font-headline-lg text-[36px] md:text-[44px] bg-gradient-to-r from-home via-primary to-away bg-clip-text text-transparent leading-none">
                Aucun match en cours
              </h1>
              <p className="font-body-md text-on-surface-variant text-[14px] max-w-sm">
                En attente du lancement d&apos;une session par l&apos;équipe du bar. Les paris ouvriront dès le coup d&apos;envoi !
              </p>
              <span className="flex items-center gap-2 font-label-caps text-[10px] text-on-surface-variant/60 tracking-widest mt-1">
                <span className="live-dot" /> EN ATTENTE
              </span>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  const handleOutcomeClick = (market: Market, outcome: Outcome) => {
    if (!bettingOpen || market.isClosed || !market.isActive) return;
    setSelectedMarket(market);
    setSelectedOutcome(outcome);
    setBetStatusMsg(null);
    setBetAmount(Math.min(currentUser.toilesCoins, 100));
  };

  const clearSelection = () => {
    setSelectedMarket(null);
    setSelectedOutcome(null);
    setBetStatusMsg(null);
  };

  const handlePlaceBet = async () => {
    if (!selectedMarket || !selectedOutcome || submitting) return;
    setSubmitting(true);
    const res = await placeBet(selectedMarket.id, selectedOutcome.id, betAmount);
    setSubmitting(false);
    if (res.success) {
      setBetStatusMsg({ type: 'success', text: 'Pari validé avec succès !' });
      setTimeout(clearSelection, 2000);
    } else {
      setBetStatusMsg({ type: 'error', text: res.error || 'Erreur lors de la validation.' });
    }
  };

  const potentialPayout = selectedOutcome
    ? Math.round(betAmount * selectedOutcome.currentOdds * (doubleGainsActive ? 2 : 1))
    : 0;

  const statusLabel: Record<string, string> = {
    live: `DIRECT · ${match.elapsedTime}'`,
    upcoming: 'AVANT-MATCH',
    half_time: 'MI-TEMPS',
    finished: 'TERMINÉ',
  };
  const matchProgress = Math.min(100, Math.round((match.elapsedTime / 90) * 100));

  return (
    <div className="min-h-dvh flex flex-col text-on-surface scanline-effect pb-28 md:pb-12 pt-24">
      <Navigation />
      <GameEventOverlay />

      <main className="flex-grow w-full max-w-container-max mx-auto px-4 md:px-16 py-6 flex flex-col gap-6">

        {/* ============ MATCH HERO — split orange/blue ============ */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="glass-panel gradient-border rounded-3xl overflow-hidden relative"
        >
          {/* HOME ambient glow — left orange */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 55% 80% at 0% 50%, rgba(255,80,0,0.14), transparent 60%)',
            }}
          />
          {/* AWAY ambient glow — right blue */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 55% 80% at 100% 50%, rgba(26,143,255,0.14), transparent 60%)',
            }}
          />

          <div className="relative z-10 p-6 md:p-8 flex flex-col items-center">
            {/* Status bar */}
            <div className="flex items-center justify-between w-full mb-6">
              <span className="font-label-caps text-[10px] text-on-surface-variant/60 tracking-[0.2em] hidden sm:block">
                LES TOILES NOIRES · STADIUM LIVE
              </span>
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{
                  background: match.status === 'live' ? 'rgba(255,80,0,0.12)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${match.status === 'live' ? 'rgba(255,80,0,0.30)' : 'rgba(255,255,255,0.10)'}`,
                }}
              >
                {match.status === 'live' && <span className="live-dot" />}
                <span className="font-label-caps text-[11px] text-on-surface tracking-widest uppercase tabular">
                  {statusLabel[match.status]}
                </span>
              </div>
            </div>

            {/* Score row */}
            <div className="flex items-center justify-between w-full max-w-xl mx-auto gap-2">
              {/* Home */}
              <div className="flex flex-col items-center gap-3 flex-1">
                <div
                  className="relative w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center text-4xl md:text-5xl border overflow-hidden"
                  style={{
                    background: 'rgba(255,80,0,0.10)',
                    borderColor: 'rgba(255,80,0,0.20)',
                    boxShadow: '0 8px 24px -8px rgba(255,80,0,0.25)',
                  }}
                >
                  <TeamFlag team={match.homeTeam} logoUrl={logoForTeam(match.homeTeam, teamLogos)} className="w-full h-full object-cover" fallbackClassName="relative" />
                </div>
                <span
                  className="font-body-md text-[16px] md:text-[20px] font-bold text-center leading-tight"
                  style={{ color: '#FF6B20' }}
                >
                  {match.homeTeam}
                </span>
              </div>

              {/* Score */}
              <div className="flex flex-col items-center gap-1 px-2">
                <div className="font-score-display text-[48px] md:text-[72px] text-white leading-none flex items-center gap-2 md:gap-3">
                  <span style={{ color: '#FF6B20', textShadow: '0 0 24px rgba(255,80,0,0.55)' }}>
                    {match.homeScore}
                  </span>
                  <span className="text-on-surface-variant/30 text-[28px] md:text-[40px]">—</span>
                  <span style={{ color: '#4DA8FF', textShadow: '0 0 24px rgba(26,143,255,0.55)' }}>
                    {match.awayScore}
                  </span>
                </div>
              </div>

              {/* Away */}
              <div className="flex flex-col items-center gap-3 flex-1">
                <div
                  className="relative w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center text-4xl md:text-5xl border overflow-hidden"
                  style={{
                    background: 'rgba(26,143,255,0.10)',
                    borderColor: 'rgba(26,143,255,0.20)',
                    boxShadow: '0 8px 24px -8px rgba(26,143,255,0.25)',
                  }}
                >
                  <TeamFlag team={match.awayTeam} logoUrl={logoForTeam(match.awayTeam, teamLogos)} className="w-full h-full object-cover" fallbackClassName="relative" />
                </div>
                <span
                  className="font-body-md text-[16px] md:text-[20px] font-bold text-center leading-tight"
                  style={{ color: '#4DA8FF' }}
                >
                  {match.awayTeam}
                </span>
              </div>
            </div>

            {/* Scorers list — liste complète et exacte tenue à jour depuis l'API (nom + minute) */}
            {match.scorers.length > 0 && (
              <div className="w-full max-w-md mx-auto mt-4 grid grid-cols-2 gap-4 text-xs font-data-mono text-on-surface-variant/80 border-t border-white/5 pt-3">
                {/* Home scorers */}
                <div className="text-right space-y-1 pr-2 border-r border-white/5">
                  {match.scorers
                    .filter((s) => s.team === 'home')
                    .map((s, i) => (
                      <div key={`h-${i}-${s.playerName}-${s.minute}`} className="flex items-center justify-end gap-1.5">
                        <span className="material-symbols-outlined text-[13px]" style={{ color: '#FF6B20' }}>sports_soccer</span>
                        <span>{s.playerName}{s.minute ? ` ${s.minute}'` : ''}</span>
                      </div>
                    ))}
                </div>
                {/* Away scorers */}
                <div className="text-left space-y-1 pl-2">
                  {match.scorers
                    .filter((s) => s.team === 'away')
                    .map((s, i) => (
                      <div key={`a-${i}-${s.playerName}-${s.minute}`} className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[13px]" style={{ color: '#4DA8FF' }}>sports_soccer</span>
                        <span>{s.playerName}{s.minute ? ` ${s.minute}'` : ''}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Match progress bar */}
            {(match.status === 'live' || match.status === 'half_time') && (
              <div className="w-full max-w-md mx-auto mt-7">
                <div className="h-1.5 w-full rounded-full overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <motion.div
                    className="h-full rounded-full relative"
                    style={{
                      background: 'linear-gradient(90deg, #FF5000, #7B61FF, #1A8FFF)',
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${matchProgress}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  >
                    <span
                      className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white"
                      style={{ background: '#7B61FF', boxShadow: '0 0 10px rgba(123,97,255,0.9)' }}
                    />
                  </motion.div>
                </div>
                <div className="flex justify-between mt-2 font-data-mono text-[10px] text-on-surface-variant/55">
                  <span>{"0'"}</span>
                  <span style={{ color: '#7B61FF' }}>{`${match.elapsedTime}'`}</span>
                  <span>{"90'"}</span>
                </div>
              </div>
            )}

            {/* Collapsible stats */}
            <div className="w-full max-w-md mx-auto mt-4 text-center">
              <button
                onClick={() => setShowStats(!showStats)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-all text-[11px] font-label-caps text-on-surface-variant/80 cursor-pointer focus:outline-none"
              >
                <span className="material-symbols-outlined text-[16px] transition-transform duration-200" style={{ transform: showStats ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  keyboard_arrow_down
                </span>
                {showStats ? 'Masquer les stats' : 'Statistiques du match'}
              </button>

              <AnimatePresence initial={false}>
                {showStats && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="w-full text-left overflow-hidden mt-4 space-y-4 border-t border-white/5 pt-4"
                  >
                    {/* Possession */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[11px] font-data-mono text-on-surface-variant/80">
                        <span className="font-bold" style={{ color: '#FF6B20' }}>{match.possessionHome}%</span>
                        <span className="font-label-caps text-[9px] tracking-wider">Possession</span>
                        <span className="font-bold" style={{ color: '#4DA8FF' }}>{100 - match.possessionHome}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-white/[0.04]">
                        <div style={{ width: `${match.possessionHome}%`, backgroundColor: '#FF6B20' }} className="h-full rounded-l-full" />
                        <div style={{ width: `${100 - match.possessionHome}%`, backgroundColor: '#4DA8FF' }} className="h-full rounded-r-full" />
                      </div>
                    </div>

                    {/* Tirs / Cadrés */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[11px] font-data-mono text-on-surface-variant/80">
                        <span className="font-bold" style={{ color: '#FF6B20' }}>{match.shotsHome} ({match.shotsOnTargetHome})</span>
                        <span className="font-label-caps text-[9px] tracking-wider">Tirs (Cadrés)</span>
                        <span className="font-bold" style={{ color: '#4DA8FF' }}>{match.shotsAway} ({match.shotsOnTargetAway})</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-white/[0.04]">
                        <div
                          style={{ width: `${(match.shotsHome / ((match.shotsHome + match.shotsAway) || 1)) * 100}%`, backgroundColor: '#FF6B20' }}
                          className="h-full rounded-l-full"
                        />
                        <div
                          style={{ width: `${(match.shotsAway / ((match.shotsHome + match.shotsAway) || 1)) * 100}%`, backgroundColor: '#4DA8FF' }}
                          className="h-full rounded-r-full"
                        />
                      </div>
                    </div>

                    {/* Corners */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[11px] font-data-mono text-on-surface-variant/80">
                        <span className="font-bold" style={{ color: '#FF6B20' }}>{match.cornersHome}</span>
                        <span className="font-label-caps text-[9px] tracking-wider">Corners</span>
                        <span className="font-bold" style={{ color: '#4DA8FF' }}>{match.cornersAway}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-white/[0.04]">
                        <div
                          style={{ width: `${(match.cornersHome / ((match.cornersHome + match.cornersAway) || 1)) * 100}%`, backgroundColor: '#FF6B20' }}
                          className="h-full rounded-l-full"
                        />
                        <div
                          style={{ width: `${(match.cornersAway / ((match.cornersHome + match.cornersAway) || 1)) * 100}%`, backgroundColor: '#4DA8FF' }}
                          className="h-full rounded-r-full"
                        />
                      </div>
                    </div>

                    {/* Fautes */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[11px] font-data-mono text-on-surface-variant/80">
                        <span className="font-bold" style={{ color: '#FF6B20' }}>{match.foulsHome}</span>
                        <span className="font-label-caps text-[9px] tracking-wider">Fautes</span>
                        <span className="font-bold" style={{ color: '#4DA8FF' }}>{match.foulsAway}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-white/[0.04]">
                        <div
                          style={{ width: `${(match.foulsHome / ((match.foulsHome + match.foulsAway) || 1)) * 100}%`, backgroundColor: '#FF6B20' }}
                          className="h-full rounded-l-full"
                        />
                        <div
                          style={{ width: `${(match.foulsAway / ((match.foulsHome + match.foulsAway) || 1)) * 100}%`, backgroundColor: '#4DA8FF' }}
                          className="h-full rounded-r-full"
                        />
                      </div>
                    </div>

                    {/* Cartons */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[11px] font-data-mono text-on-surface-variant/80">
                        <span className="font-bold" style={{ color: '#FF6B20' }}>{match.cardsHome}</span>
                        <span className="font-label-caps text-[9px] tracking-wider">Cartons</span>
                        <span className="font-bold" style={{ color: '#4DA8FF' }}>{match.cardsAway}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-white/[0.04]">
                        <div
                          style={{ width: `${(match.cardsHome / ((match.cardsHome + match.cardsAway) || 1)) * 100}%`, backgroundColor: '#FF6B20' }}
                          className="h-full rounded-l-full"
                        />
                        <div
                          style={{ width: `${(match.cardsAway / ((match.cardsHome + match.cardsAway) || 1)) * 100}%`, backgroundColor: '#4DA8FF' }}
                          className="h-full rounded-r-full"
                        />
                      </div>
                    </div>

                    {/* Précision passes */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[11px] font-data-mono text-on-surface-variant/80">
                        <span className="font-bold" style={{ color: '#FF6B20' }}>{match.passesAccuracyHome}%</span>
                        <span className="font-label-caps text-[9px] tracking-wider">Précision Passes</span>
                        <span className="font-bold" style={{ color: '#4DA8FF' }}>{match.passesAccuracyAway}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-white/[0.04]">
                        <div style={{ width: `${match.passesAccuracyHome}%`, backgroundColor: '#FF6B20' }} className="h-full rounded-l-full" />
                        <div style={{ width: `${match.passesAccuracyAway}%`, backgroundColor: '#4DA8FF' }} className="h-full rounded-r-full" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.section>

        {/* ============ 2-COLUMN ============ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* LEFT: markets */}
          <div className="lg:col-span-8 flex flex-col gap-5">

            {matchFinished && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative overflow-hidden rounded-2xl p-4 flex items-center justify-center gap-3 text-center"
                style={{
                  background: 'linear-gradient(90deg, rgba(255,59,71,0.14), rgba(255,59,71,0.07), rgba(255,59,71,0.14))',
                  border: '1px solid rgba(255,59,71,0.35)',
                }}
              >
                <span className="material-symbols-outlined text-error text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  sports_score
                </span>
                <span className="font-headline-lg-mobile text-[15px] md:text-[16px] text-white">
                  MATCH TERMINÉ · LES PARIS SONT FERMÉS — Consultez les résultats
                </span>
              </motion.div>
            )}

            {doubleGainsActive && !matchFinished && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="shimmer relative overflow-hidden rounded-2xl p-4 text-center"
                style={{
                  background: 'linear-gradient(90deg, rgba(255,184,0,0.14), rgba(255,184,0,0.07), rgba(255,184,0,0.14))',
                  border: '1px solid rgba(255,184,0,0.35)',
                }}
              >
                <span className="relative z-10 font-headline-lg-mobile text-[16px] text-tertiary">
                  🚀 MODE DOUBLE GAINS · TOUTES LES COTES ×2
                </span>
              </motion.div>
            )}

            {markets.map((market, mIdx) => (
              <motion.section
                key={market.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(mIdx * 0.05, 0.25), ease: [0.16, 1, 0.3, 1] }}
                className="glass-panel rounded-2xl p-5 md:p-6"
              >
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-1 h-5 rounded-full"
                      style={{ background: 'linear-gradient(180deg, #FF5000, #7B61FF)' }}
                    />
                    <h2 className="font-label-caps text-on-surface tracking-widest">
                      {market.title}
                    </h2>
                    {market.isFlash && (
                      <span
                        className="font-label-caps text-[9px] text-tertiary px-2 py-0.5 rounded-full"
                        style={{
                          background: 'rgba(255,184,0,0.10)',
                          border: '1px solid rgba(255,184,0,0.28)',
                        }}
                      >
                        FLASH
                      </span>
                    )}
                  </div>
                  {market.isClosed && (
                    <span
                      className="font-label-caps text-[9px] text-on-surface-variant px-2.5 py-1 rounded-full"
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      CLOS
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                  {market.outcomes.map((outcome) => {
                    const isSelected = selectedOutcome?.id === outcome.id;
                    const displayOdds = outcome.currentOdds * (doubleGainsActive ? 2 : 1);
                    const totalPool = market.outcomes.reduce((s, o) => s + o.totalBetAmount, 0) || 1;
                    const share = Math.round((outcome.totalBetAmount / totalPool) * 100);

                    return (
                      <button
                        key={outcome.id}
                        onClick={() => handleOutcomeClick(market, outcome)}
                        disabled={!bettingOpen || market.isClosed || !market.isActive || outcome.currentOdds === 0}
                        className={`group relative overflow-hidden rounded-xl p-3.5 flex flex-col gap-2 text-left transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                          (market.isClosed || !bettingOpen || outcome.currentOdds === 0)
                            ? 'opacity-30 cursor-not-allowed'
                            : ''
                        }`}
                        style={
                          isSelected
                            ? {
                                background: 'linear-gradient(135deg, rgba(123,97,255,0.18) 0%, rgba(123,97,255,0.06) 100%)',
                                border: '1px solid rgba(123,97,255,0.55)',
                                boxShadow: '0 0 20px rgba(123,97,255,0.22), inset 0 1px 0 rgba(255,255,255,0.06)',
                                transform: 'translateY(-1px)',
                              }
                            : {
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.07)',
                              }
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`font-body-md text-[14px] leading-tight ${
                              isSelected ? 'text-white font-semibold' : 'text-on-surface'
                            } ${outcome.currentOdds === 0 ? 'line-through text-on-surface-variant/40' : ''}`}
                          >
                            {outcome.name}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          {outcome.currentOdds === 0 ? (
                            <span className="font-label-caps text-[10px] text-error/80 font-bold tracking-wider">
                              Suspendu
                            </span>
                          ) : (
                            <span
                              className="font-data-mono text-[18px] font-bold tabular"
                              style={{ color: isSelected ? '#9278FF' : '#FFB800' }}
                            >
                              {displayOdds.toFixed(2)}
                            </span>
                          )}
                          <span className="font-data-mono text-[9px] text-on-surface-variant/40 tabular">
                            {share}%
                          </span>
                        </div>
                        {/* Pool share bar */}
                        <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${share}%`,
                              background: isSelected
                                ? 'linear-gradient(90deg, #7B61FF, #9278FF)'
                                : 'rgba(123,97,255,0.45)',
                            }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.section>
            ))}
          </div>

          {/* RIGHT: bet slip + stats */}
          <div className="lg:col-span-4 flex flex-col gap-5 lg:sticky lg:top-24">

            {/* Bet slip — desktop */}
            <section className="glass-strong rounded-2xl p-5 md:p-6 hidden lg:flex flex-col relative overflow-hidden">
              <div
                className="flex items-center justify-between border-b pb-4 mb-4"
                style={{ borderColor: 'rgba(123,97,255,0.15)' }}
              >
                <h2 className="font-label-caps text-on-surface flex items-center gap-2 tracking-widest">
                  <span className="material-symbols-outlined text-[18px] text-primary">receipt_long</span>
                  MON PARI
                </h2>
                {selectedOutcome && (
                  <span
                    className="font-label-caps text-[9px] text-primary px-2.5 py-1 rounded-full"
                    style={{
                      background: 'rgba(123,97,255,0.14)',
                      border: '1px solid rgba(123,97,255,0.30)',
                    }}
                  >
                    1 SÉLECTION
                  </span>
                )}
              </div>

              <AnimatePresence mode="wait">
                {selectedOutcome && selectedMarket ? (
                  <motion.div
                    key="slip"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-5"
                  >
                    <BetSlipBody
                      selectedMarket={selectedMarket}
                      selectedOutcome={selectedOutcome}
                      betAmount={betAmount}
                      setBetAmount={setBetAmount}
                      maxCoins={currentUser.toilesCoins}
                      doubleGainsActive={doubleGainsActive}
                      potentialPayout={potentialPayout}
                      submitting={submitting}
                      onPlaceBet={handlePlaceBet}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center py-10 text-on-surface-variant/40 font-body-md flex flex-col items-center justify-center gap-3"
                  >
                    <span className="material-symbols-outlined text-[44px] opacity-30">touch_app</span>
                    <span className="text-[14px] max-w-[16rem]">Sélectionnez une cote à gauche pour composer votre pari.</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {betStatusMsg && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-4 p-3 rounded-xl text-center font-data-mono text-[12px] border ${
                    betStatusMsg.type === 'success'
                      ? 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25'
                      : 'bg-error/12 text-error border-error/25'
                  }`}
                >
                  {betStatusMsg.text}
                </motion.div>
              )}
            </section>

            {/* Live stats */}
            <section className="glass-panel rounded-2xl p-5 md:p-6">
              <h2 className="font-label-caps text-on-surface-variant mb-5 flex items-center gap-2 tracking-widest">
                <span className="material-symbols-outlined text-[18px] text-primary">monitoring</span>
                STATS DU MATCH
              </h2>
              <div className="space-y-5">
                <StatBar label="POSSESSION" left={`${match.possessionHome}%`} right={`${100 - match.possessionHome}%`} pct={match.possessionHome} />
                <StatBar
                  label="TIRS CADRÉS"
                  left={`${match.shotsOnTargetHome}`}
                  right={`${match.shotsOnTargetAway}`}
                  pct={(match.shotsOnTargetHome / ((match.shotsOnTargetHome + match.shotsOnTargetAway) || 1)) * 100}
                />
                <StatBar
                  label="CORNERS"
                  left={`${match.cornersHome}`}
                  right={`${match.cornersAway}`}
                  pct={(match.cornersHome / ((match.cornersHome + match.cornersAway) || 1)) * 100}
                />
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* ============ MOBILE BET SLIP — BOTTOM SHEET ============ */}
      <AnimatePresence>
        {selectedOutcome && selectedMarket && (
          <>
            <motion.div
              key="sheet-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={clearSelection}
              className="lg:hidden fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
            />

            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 36 }}
              className="lg:hidden fixed inset-x-0 bottom-0 z-[61] rounded-t-3xl border-t px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] max-h-[88vh] overflow-y-auto"
              style={{
                background: 'linear-gradient(160deg, rgba(20,20,60,0.98) 0%, rgba(10,10,30,0.99) 100%)',
                borderColor: 'rgba(123,97,255,0.22)',
                boxShadow: '0 -20px 50px -10px rgba(123,97,255,0.18), 0 -30px 60px -20px rgba(0,0,0,0.9)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
              }}
            >
              {/* Drag handle */}
              <div
                className="mx-auto mb-4 h-1.5 w-12 rounded-full"
                style={{ background: 'rgba(123,97,255,0.35)' }}
              />

              {/* Header */}
              <div
                className="flex items-center justify-between border-b pb-3 mb-4"
                style={{ borderColor: 'rgba(123,97,255,0.15)' }}
              >
                <h2 className="font-label-caps text-on-surface flex items-center gap-2 tracking-widest">
                  <span className="material-symbols-outlined text-[18px] text-primary">receipt_long</span>
                  MON PARI
                </h2>
                <button
                  onClick={clearSelection}
                  aria-label="Fermer"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-white transition-colors cursor-pointer"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.10)',
                  }}
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <BetSlipBody
                selectedMarket={selectedMarket}
                selectedOutcome={selectedOutcome}
                betAmount={betAmount}
                setBetAmount={setBetAmount}
                maxCoins={currentUser.toilesCoins}
                doubleGainsActive={doubleGainsActive}
                potentialPayout={potentialPayout}
                submitting={submitting}
                onPlaceBet={handlePlaceBet}
              />

              {betStatusMsg && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-4 p-3 rounded-xl text-center font-data-mono text-[12px] border ${
                    betStatusMsg.type === 'success'
                      ? 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25'
                      : 'bg-error/12 text-error border-error/25'
                  }`}
                >
                  {betStatusMsg.text}
                </motion.div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============ BET SLIP BODY ============ */
function BetSlipBody({
  selectedMarket,
  selectedOutcome,
  betAmount,
  setBetAmount,
  maxCoins,
  doubleGainsActive,
  potentialPayout,
  submitting,
  onPlaceBet,
}: {
  selectedMarket: Market;
  selectedOutcome: Outcome;
  betAmount: number;
  setBetAmount: (n: number) => void;
  maxCoins: number;
  doubleGainsActive: boolean;
  potentialPayout: number;
  submitting: boolean;
  onPlaceBet: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Selected bet + odds */}
      <div
        className="flex justify-between items-start gap-3 rounded-xl p-3"
        style={{
          background: 'rgba(123,97,255,0.06)',
          border: '1px solid rgba(123,97,255,0.18)',
        }}
      >
        <div>
          <span className="block font-body-md text-white font-semibold text-[15px] leading-tight">
            {selectedOutcome.name}
          </span>
          <span className="block font-label-caps text-[9px] text-on-surface-variant mt-1 tracking-wider">
            {selectedMarket.title}
          </span>
        </div>
        <span
          className="font-data-mono font-bold px-2.5 py-1 rounded-lg tabular shrink-0 text-tertiary"
          style={{
            background: 'rgba(255,184,0,0.10)',
            border: '1px solid rgba(255,184,0,0.25)',
          }}
        >
          {(selectedOutcome.currentOdds * (doubleGainsActive ? 2 : 1)).toFixed(2)}
        </span>
      </div>

      {/* Mise */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <label className="font-label-caps text-[10px] text-on-surface-variant tracking-wider">
            MONTANT DE LA MISE
          </label>
          <span className="font-data-mono text-primary font-bold tabular">{betAmount} TC</span>
        </div>
        <input
          type="range"
          min={10}
          max={Math.max(10, maxCoins)}
          step={10}
          value={betAmount}
          onChange={(e) => setBetAmount(Number(e.target.value))}
          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer focus:outline-none"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        />
        <div className="flex justify-between gap-1.5">
          {[50, 100, 250, 500].map((amt) => (
            <button
              key={amt}
              onClick={() => setBetAmount(Math.min(maxCoins, amt))}
              disabled={maxCoins < amt}
              className="flex-1 py-1.5 rounded-lg font-data-mono text-[11px] text-center transition-all cursor-pointer tabular disabled:opacity-30 disabled:cursor-not-allowed"
              style={
                betAmount === amt
                  ? {
                      background: 'rgba(123,97,255,0.18)',
                      border: '1px solid rgba(123,97,255,0.45)',
                      color: '#9278FF',
                    }
                  : {
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(200,200,255,0.5)',
                    }
              }
            >
              {amt}
            </button>
          ))}
          {/* MAX : mise tout le solde (utile en fin de soirée avec un gros portefeuille). */}
          <button
            onClick={() => setBetAmount(Math.max(10, maxCoins))}
            disabled={maxCoins < 10}
            className="flex-1 py-1.5 rounded-lg font-data-mono text-[11px] text-center transition-all cursor-pointer tabular disabled:opacity-30 disabled:cursor-not-allowed"
            style={
              betAmount === maxCoins
                ? {
                    background: 'rgba(255,184,0,0.18)',
                    border: '1px solid rgba(255,184,0,0.45)',
                    color: '#FFB800',
                  }
                : {
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,200,120,0.6)',
                  }
            }
          >
            MAX
          </button>
        </div>
      </div>

      {/* Gain potentiel — orange energy */}
      <div
        className="flex justify-between items-center p-4 rounded-xl"
        style={{
          background: 'linear-gradient(135deg, rgba(255,80,0,0.10) 0%, rgba(123,97,255,0.06) 100%)',
          border: '1px solid rgba(255,80,0,0.20)',
        }}
      >
        <span className="font-label-caps text-[10px] text-on-surface tracking-wider">GAIN POTENTIEL</span>
        <span
          className="font-score-display text-[28px] tabular"
          style={{ color: '#FFB800', textShadow: '0 0 20px rgba(255,184,0,0.55)' }}
        >
          {potentialPayout.toLocaleString()}
          <span className="text-[13px] ml-1 opacity-70">TC</span>
        </span>
      </div>

      <button
        onClick={onPlaceBet}
        disabled={submitting}
        className="btn-primary w-full font-headline-lg-mobile text-[17px] py-3.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
      >
        <span className="material-symbols-outlined text-[20px]">
          {submitting ? 'progress_activity' : 'bolt'}
        </span>
        {submitting ? 'Validation…' : 'Valider mon pari'}
      </button>
    </div>
  );
}

/* ============ STAT BAR ============ */
function StatBar({ label, left, right, pct }: { label: string; left: string; right: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between items-center font-data-mono text-[13px] text-on-surface mb-1.5">
        <span className="font-bold tabular" style={{ color: '#FF6B20' }}>{left}</span>
        <span className="font-label-caps text-[9px] text-on-surface-variant tracking-widest">{label}</span>
        <span className="text-on-surface-variant tabular" style={{ color: '#4DA8FF' }}>{right}</span>
      </div>
      <div className="h-2 w-full rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.max(2, Math.min(100, pct))}%`,
            background: 'linear-gradient(90deg, #FF5000, #7B61FF)',
          }}
        />
      </div>
    </div>
  );
}
