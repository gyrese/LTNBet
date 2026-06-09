'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, Market, Outcome } from '@/lib/store';
import { flagFor } from '@/lib/flags';
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
  } = useGameStore();

  const matchFinished = match.status === 'finished';
  const bettingOpen = hasActiveMatch && !matchFinished;

  // Selected bet state
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [betAmount, setBetAmount] = useState<number>(100);
  const [betStatusMsg, setBetStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !currentUser) {
      router.push('/join');
    }
  }, [currentUser, router, mounted]);

  if (!mounted || !currentUser) return null;

  // ── Écran d'attente : aucun match lancé par l'hôte ──
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
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 bg-secondary-container/15 blur-3xl rounded-full pointer-events-none" />
            <div className="relative z-10 flex flex-col items-center gap-5">
              <div className="w-20 h-20 rounded-3xl bg-secondary-container/15 border border-white/10 flex items-center justify-center animate-float">
                <span className="material-symbols-outlined text-[44px] text-primary">stadium</span>
              </div>
              <h1 className="font-display-hero text-[30px] md:text-[38px] tracking-tighter bg-gradient-to-r from-white via-primary to-white bg-clip-text text-transparent leading-none">
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

        {/* ============ MATCH HERO ============ */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="glass-panel gradient-border rounded-3xl overflow-hidden relative"
        >
          {/* Pitch glow + crest backdrop */}
          <div className="absolute inset-0 z-0 bg-gradient-to-b from-secondary-container/20 via-transparent to-transparent" />
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[420px] h-[220px] bg-secondary-container/25 blur-[90px] rounded-full pointer-events-none" />

          <div className="relative z-10 p-6 md:p-8 flex flex-col items-center">
            {/* Top bar: competition + live */}
            <div className="flex items-center justify-between w-full mb-6">
              <span className="font-label-caps text-[10px] text-on-surface-variant/70 tracking-[0.2em] hidden sm:block">
                LES TOILES NOIRES · STADIUM LIVE
              </span>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-error/12 border border-error/30">
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
                <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-surface-container/80 flex items-center justify-center border border-white/10 text-4xl md:text-5xl shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)]">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-secondary-container/20 to-transparent" />
                  <span className="relative">{flagFor(match.homeTeam)}</span>
                </div>
                <span className="font-headline-lg-mobile text-[16px] md:text-[20px] text-white text-center leading-tight">
                  {match.homeTeam}
                </span>
              </div>

              {/* Score */}
              <div className="flex flex-col items-center gap-2 px-2">
                <div className="font-score-display text-[44px] md:text-[64px] text-white leading-none flex items-center gap-2 md:gap-3">
                  <span className="text-glow-blue text-primary">{match.homeScore}</span>
                  <span className="text-on-surface-variant/40 text-[28px] md:text-[40px]">:</span>
                  <span className="text-white">{match.awayScore}</span>
                </div>
              </div>

              {/* Away */}
              <div className="flex flex-col items-center gap-3 flex-1">
                <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-surface-container/80 flex items-center justify-center border border-white/10 text-4xl md:text-5xl shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)]">
                  <span className="relative">{flagFor(match.awayTeam)}</span>
                </div>
                <span className="font-headline-lg-mobile text-[16px] md:text-[20px] text-on-surface-variant text-center leading-tight">
                  {match.awayTeam}
                </span>
              </div>
            </div>

            {/* Match progress */}
            {(match.status === 'live' || match.status === 'half_time') && (
              <div className="w-full max-w-md mx-auto mt-7">
                <div className="h-1.5 w-full bg-white/8 rounded-full overflow-hidden relative">
                  <motion.div
                    className="h-full bg-gradient-to-r from-secondary-container to-primary rounded-full relative"
                    initial={{ width: 0 }}
                    animate={{ width: `${matchProgress}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  >
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
                  </motion.div>
                </div>
                <div className="flex justify-between mt-2 font-data-mono text-[10px] text-on-surface-variant/60">
                  <span>{"0'"}</span>
                  <span className="text-primary">{`${match.elapsedTime}'`}</span>
                  <span>{"90'"}</span>
                </div>
              </div>
            )}
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
                className="relative overflow-hidden rounded-2xl border border-error/40 bg-gradient-to-r from-error/15 via-error/8 to-error/15 p-4 flex items-center justify-center gap-3 text-center"
              >
                <span className="material-symbols-outlined text-error text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  sports_score
                </span>
                <span className="font-headline-lg-mobile text-[15px] md:text-[16px] text-white tracking-tight">
                  MATCH TERMINÉ · LES PARIS SONT FERMÉS — Consultez les résultats ci-dessous
                </span>
              </motion.div>
            )}

            {doubleGainsActive && !matchFinished && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="shimmer relative overflow-hidden rounded-2xl border border-tertiary/40 bg-gradient-to-r from-tertiary/15 via-tertiary/8 to-tertiary/15 p-4 text-center"
              >
                <span className="relative z-10 font-headline-lg-mobile text-[16px] text-tertiary tracking-tight">
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
                    <span className="w-1 h-5 rounded-full bg-gradient-to-b from-primary to-secondary-container" />
                    <h2 className="font-label-caps text-label-caps text-on-surface tracking-widest">
                      {market.title}
                    </h2>
                    {market.isFlash && (
                      <span className="font-label-caps text-[9px] text-tertiary bg-tertiary/12 border border-tertiary/30 px-2 py-0.5 rounded-full">
                        FLASH
                      </span>
                    )}
                  </div>
                  {market.isClosed && (
                    <span className="bg-surface-container-high text-on-surface-variant font-label-caps text-[9px] px-2.5 py-1 rounded-full border border-white/8">
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
                          isSelected
                            ? 'bg-secondary-container/15 border border-primary/50 glow-accent'
                            : 'bg-white/[0.03] border border-white/8 hover:bg-white/[0.06] hover:border-white/15 hover:-translate-y-0.5'
                        } ${(market.isClosed || !bettingOpen || outcome.currentOdds === 0) ? 'opacity-30 cursor-not-allowed hover:translate-y-0' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-body-md text-[14px] leading-tight ${isSelected ? 'text-white font-semibold' : 'text-on-surface'} ${outcome.currentOdds === 0 ? 'line-through text-on-surface-variant/40' : ''}`}>
                            {outcome.name}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          {outcome.currentOdds === 0 ? (
                            <span className="font-label-caps text-[10px] text-error/80 font-bold tracking-wider">
                              Suspendu
                            </span>
                          ) : (
                            <span className={`font-data-mono text-[16px] font-bold tabular ${isSelected ? 'text-primary' : 'text-tertiary'}`}>
                              {displayOdds.toFixed(2)}
                            </span>
                          )}
                          <span className="font-data-mono text-[9px] text-on-surface-variant/45 tabular">
                            {share}%
                          </span>
                        </div>
                        {/* pool share bar */}
                        <div className="h-1 w-full bg-white/6 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${isSelected ? 'bg-primary' : 'bg-secondary-container/60'}`}
                            style={{ width: `${share}%` }}
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

            {/* Bet slip — desktop only (mobile uses the bottom sheet) */}
            <section className="glass-strong rounded-2xl p-5 md:p-6 hidden lg:flex flex-col relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
                <h2 className="font-label-caps text-label-caps text-on-surface flex items-center gap-2 tracking-widest">
                  <span className="material-symbols-outlined text-[18px] text-primary">receipt_long</span>
                  MON PARI
                </h2>
                {selectedOutcome && (
                  <span className="bg-secondary-container text-white font-label-caps text-[9px] px-2.5 py-1 rounded-full">
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
                    className="text-center py-10 text-on-surface-variant/45 font-body-md flex flex-col items-center justify-center gap-3"
                  >
                    <span className="material-symbols-outlined text-[44px] opacity-40">touch_app</span>
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
              <h2 className="font-label-caps text-label-caps text-on-surface-variant mb-5 flex items-center gap-2 tracking-widest">
                <span className="material-symbols-outlined text-[18px] text-primary">monitoring</span>
                STATS DU MATCH
              </h2>

              <div className="space-y-5">
                <StatBar label="POSSESSION" left={`${match.possessionHome}%`} right={`${100 - match.possessionHome}%`} pct={match.possessionHome} />
                <StatBar
                  label="TIRS CADRÉS"
                  left={`${match.shotsOnTargetHome}`}
                  right="2"
                  pct={(match.shotsOnTargetHome / (match.shotsOnTargetHome + 2)) * 100}
                />
                <StatBar
                  label="CORNERS"
                  left={`${match.cornersHome}`}
                  right="3"
                  pct={(match.cornersHome / (match.cornersHome + 3)) * 100}
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
            {/* Backdrop */}
            <motion.div
              key="sheet-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={clearSelection}
              className="lg:hidden fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            />

            {/* Sheet */}
            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 36 }}
              className="lg:hidden fixed inset-x-0 bottom-0 z-[61] glass-strong rounded-t-3xl border-t border-white/10 shadow-[0_-20px_40px_-20px_rgba(0,0,0,0.9)] px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] max-h-[88vh] overflow-y-auto"
            >
              {/* Drag handle */}
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/20" />

              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                <h2 className="font-label-caps text-label-caps text-on-surface flex items-center gap-2 tracking-widest">
                  <span className="material-symbols-outlined text-[18px] text-primary">receipt_long</span>
                  MON PARI
                </h2>
                <button
                  onClick={clearSelection}
                  aria-label="Fermer"
                  className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-on-surface-variant hover:bg-white/10 transition-colors cursor-pointer"
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
      {/* Pari sélectionné + cote */}
      <div className="flex justify-between items-start gap-3 bg-white/[0.03] rounded-xl p-3 border border-white/8">
        <div>
          <span className="block font-body-md text-white font-semibold text-[15px] leading-tight">
            {selectedOutcome.name}
          </span>
          <span className="block font-label-caps text-[9px] text-on-surface-variant mt-1 tracking-wider">
            {selectedMarket.title}
          </span>
        </div>
        <span className="font-data-mono text-tertiary font-bold bg-tertiary/10 px-2.5 py-1 rounded-lg border border-tertiary/25 tabular shrink-0">
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
          max={Math.max(10, Math.min(maxCoins, 500))}
          step={10}
          value={betAmount}
          onChange={(e) => setBetAmount(Number(e.target.value))}
          className="w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer focus:outline-none"
        />
        <div className="flex justify-between gap-1.5">
          {[10, 50, 100, 250].map((amt) => (
            <button
              key={amt}
              onClick={() => setBetAmount(Math.min(maxCoins, amt))}
              disabled={maxCoins < amt}
              className={`flex-1 py-1.5 rounded-lg font-data-mono text-[11px] text-center border transition-all cursor-pointer tabular ${
                betAmount === amt
                  ? 'bg-secondary-container/20 border-primary/50 text-primary'
                  : 'bg-white/[0.03] border-white/10 text-on-surface-variant/70 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed'
              }`}
            >
              {amt}
            </button>
          ))}
        </div>
      </div>

      {/* Gain potentiel */}
      <div className="flex justify-between items-center bg-gradient-to-r from-tertiary/12 to-transparent p-4 rounded-xl border border-tertiary/20">
        <span className="font-label-caps text-[10px] text-on-surface tracking-wider">GAIN POTENTIEL</span>
        <span className="font-score-display text-[22px] text-tertiary text-glow tabular">
          {potentialPayout.toLocaleString()}
          <span className="text-[12px] ml-1 text-tertiary/70">TC</span>
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

function StatBar({ label, left, right, pct }: { label: string; left: string; right: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between items-center font-data-mono text-[13px] text-on-surface mb-1.5">
        <span className="text-primary font-bold tabular">{left}</span>
        <span className="font-label-caps text-[9px] text-on-surface-variant tracking-widest">{label}</span>
        <span className="text-on-surface-variant tabular">{right}</span>
      </div>
      <div className="h-2 w-full bg-white/8 rounded-full overflow-hidden flex">
        <div
          className="h-full bg-gradient-to-r from-secondary-container to-primary rounded-full transition-all duration-500"
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}
