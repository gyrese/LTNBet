'use client';

import React, { useState, useEffect } from 'react';
import { useGameStore } from '@/lib/store';
import QRCode from 'qrcode';
import { motion as motionClient, AnimatePresence } from 'framer-motion';
import GameEventOverlay from '@/components/GameEventOverlay';

const AVATARS: Record<string, { emoji: string; color: string }> = {
  avatar_1: { emoji: '🐓', color: 'bg-gradient-to-br from-[#2b5bff] to-[#0a1b3d]' },
  avatar_2: { emoji: '🦁', color: 'bg-gradient-to-br from-[#f6c648] to-[#5a4400]' },
  avatar_3: { emoji: '⚡', color: 'bg-gradient-to-br from-[#9db4ff] to-[#2b5bff]' },
  avatar_4: { emoji: '🏆', color: 'bg-gradient-to-br from-[#ffd97a] to-[#c79b1e]' },
  avatar_5: { emoji: '⚽', color: 'bg-gradient-to-br from-[#7da4ff] to-[#16284f]' },
  avatar_6: { emoji: '🔥', color: 'bg-gradient-to-br from-[#ff8a87] to-[#8c0009]' },
};

const SLIDE_COUNT = 5;

export default function ScreenPage() {
  const { match, leaderboard, runSimulationStep } = useGameStore();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    const slideInterval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDE_COUNT);
    }, 15000);
    return () => clearInterval(slideInterval);
  }, []);

  useEffect(() => {
    if (match.status !== 'live') return;
    const simInterval = setInterval(() => runSimulationStep(), 8000);
    return () => clearInterval(simInterval);
  }, [match.status, runSimulationStep]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const inviteUrl = `${window.location.origin}/join`;
      QRCode.toDataURL(inviteUrl, {
        margin: 1,
        width: 320,
        color: { dark: '#070b16', light: '#ffffff' },
      })
        .then((url) => setQrUrl(url))
        .catch((err) => console.error('QR Code error', err));
    }
  }, []);

  const allPlayers = [...leaderboard];
  allPlayers.sort((a, b) => (b.toilesCoins + b.totalWinnings) - (a.toilesCoins + a.totalWinnings));
  const top10 = allPlayers.slice(0, 10);

  const getAvatarConfig = (avatarKey: string) => AVATARS[avatarKey] || { emoji: '👤', color: 'bg-white/10' };

  const slideTransition = {
    initial: { opacity: 0, x: 50 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -50 },
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
  };

  return (
    <div className="h-dvh w-screen text-on-surface overflow-hidden relative font-body-lg select-none">
      {/* Cinematic backdrop layers */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-5%,rgba(43,91,255,0.25),transparent_60%),radial-gradient(ellipse_50%_40%_at_90%_100%,rgba(255,59,71,0.12),transparent_60%),linear-gradient(180deg,#0a1124,#070b16)] pointer-events-none" />

      <div className="relative w-full h-full flex flex-col max-w-[1920px] mx-auto p-8 pb-[100px] z-10">

        {/* Header */}
        <header className="glass-strong border border-white/10 flex justify-between items-center w-full px-10 py-4 rounded-2xl mb-7">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-secondary-container to-primary-container border border-white/15 shadow-[0_0_24px_rgba(43,91,255,0.4)]">
              <span className="material-symbols-outlined text-white text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                sports_soccer
              </span>
            </div>
            <span className="font-headline-lg text-[26px] italic uppercase tracking-tighter bg-gradient-to-r from-white via-primary to-white bg-clip-text text-transparent">
              Les Toiles Noires Predictor
            </span>
          </div>

          <div className="flex items-center gap-6">
            <div className="bg-error/12 border border-error/30 px-6 py-2.5 rounded-full flex items-center gap-3">
              {match.status === 'live' && <span className="live-dot" />}
              <span className="font-label-caps text-[13px] text-on-surface tracking-widest uppercase tabular">
                {match.status === 'live' ? `DIRECT · ${match.elapsedTime}'` : match.status === 'half_time' ? 'MI-TEMPS' : match.status === 'finished' ? 'TERMINÉ' : 'AVANT-MATCH'}
              </span>
            </div>
            {/* Slide dots */}
            <div className="flex items-center gap-2">
              {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2 rounded-full transition-all duration-500 ${
                    i === currentSlide ? 'w-7 bg-primary shadow-[0_0_10px_rgba(125,164,255,0.8)]' : 'w-2 bg-white/20'
                  }`}
                />
              ))}
            </div>
          </div>
        </header>

        {/* Carousel */}
        <div className="flex-grow flex items-center justify-center relative w-full overflow-hidden">
          <AnimatePresence mode="wait">

            {/* SLIDE 1: Match */}
            {currentSlide === 0 && (
              <motionClient.div key="slide-match" {...slideTransition} className="w-full grid grid-cols-12 gap-8 items-center h-full">
                <div className="col-span-6 glass-panel gradient-border rounded-3xl p-10 h-full flex flex-col justify-center">
                  <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
                    <span className="font-label-caps text-[14px] text-on-surface-variant tracking-[0.2em]">SCORE EN DIRECT</span>
                    <span className="font-data-mono text-[20px] text-primary tabular">{match.elapsedTime}&apos;</span>
                  </div>

                  <div className="flex items-center justify-between px-4">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-24 h-24 rounded-3xl bg-surface-container/80 flex items-center justify-center text-5xl shadow-lg border border-white/10">🇫🇷</div>
                      <span className="font-display-hero text-[30px] text-white">FRA</span>
                    </div>

                    <div className="font-score-display text-[72px] flex items-center gap-3">
                      <span className="text-primary text-glow-blue">{match.homeScore}</span>
                      <span className="text-on-surface-variant/40 text-[44px]">:</span>
                      <span className="text-white">{match.awayScore}</span>
                    </div>

                    <div className="flex flex-col items-center gap-4">
                      <div className="w-24 h-24 rounded-3xl bg-surface-container/80 flex items-center justify-center text-5xl shadow-lg border border-white/10">🏴󠁧󠁢󠁥󠁮󠁧󠁿</div>
                      <span className="font-display-hero text-[30px] text-on-surface-variant">ENG</span>
                    </div>
                  </div>
                </div>

                <div className="col-span-6 glass-panel rounded-3xl p-10 h-full flex flex-col justify-center">
                  <h3 className="font-label-caps text-[16px] text-primary tracking-widest mb-8 border-b border-white/10 pb-4">STATISTIQUES DE JEU</h3>
                  <div className="space-y-7">
                    <TvStat label="POSSESSION" left={`${match.possessionHome}%`} right={`${100 - match.possessionHome}%`} pct={match.possessionHome} />
                    <TvStat label="TIRS CADRÉS" left={`${match.shotsOnTargetHome}`} right="2" pct={(match.shotsOnTargetHome / (match.shotsOnTargetHome + 2)) * 100} />

                    <div className="grid grid-cols-2 gap-6 pt-2">
                      <div className="bg-white/[0.03] p-5 rounded-2xl border border-white/8 text-center">
                        <span className="block font-label-caps text-[11px] text-on-surface-variant mb-2 tracking-wider">CORNERS FRANCE</span>
                        <span className="font-score-display text-[34px] text-primary tabular">{match.cornersHome}</span>
                      </div>
                      <div className="bg-white/[0.03] p-5 rounded-2xl border border-white/8 text-center">
                        <span className="block font-label-caps text-[11px] text-on-surface-variant mb-2 tracking-wider">CARTONS FRANCE</span>
                        <span className="font-score-display text-[34px] text-error tabular">{match.cardsHome}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motionClient.div>
            )}

            {/* SLIDE 2: Leaderboard */}
            {currentSlide === 1 && (
              <motionClient.div key="slide-leaderboard" {...slideTransition} className="w-full max-w-4xl h-full flex flex-col justify-center">
                <div className="glass-panel gradient-border rounded-3xl p-8 flex flex-col h-full justify-center">
                  <h3 className="font-headline-lg text-[28px] text-primary uppercase italic tracking-tight mb-6 flex items-center gap-3 border-b border-white/10 pb-4">
                    <span className="material-symbols-outlined text-[32px] text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>leaderboard</span>
                    Classement Global · Top 10
                  </h3>

                  <div className="grid grid-cols-2 gap-3.5">
                    {top10.map((player, idx) => {
                      const avatar = getAvatarConfig(player.avatar);
                      const isPodium = idx < 3;
                      return (
                        <div
                          key={player.id}
                          className={`flex items-center gap-4 p-3.5 rounded-2xl border ${
                            isPodium ? 'border-tertiary/25 bg-tertiary/6' : 'border-white/6 bg-white/[0.03]'
                          }`}
                        >
                          <span className={`font-score-display text-[24px] w-9 text-center tabular ${isPodium ? 'text-tertiary' : 'text-on-surface-variant/50'}`}>
                            {idx + 1}
                          </span>
                          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0 border border-white/10 ${avatar.color}`}>
                            {avatar.emoji}
                          </div>
                          <span className="font-body-md font-bold truncate flex-grow text-white">{player.username}</span>
                          <span className={`font-data-mono text-[16px] font-bold tabular ${isPodium ? 'text-tertiary' : 'text-primary'}`}>
                            {(player.toilesCoins + player.totalWinnings).toLocaleString()} TC
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motionClient.div>
            )}

            {/* SLIDE 3: Winners */}
            {currentSlide === 2 && (
              <motionClient.div key="slide-wins" {...slideTransition} className="w-full max-w-3xl h-full flex flex-col justify-center text-center">
                <div className="glass-panel gradient-border rounded-3xl p-10">
                  <span className="material-symbols-outlined text-[72px] text-tertiary mb-6 animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>
                    workspace_premium
                  </span>
                  <h2 className="font-headline-lg text-[32px] text-white italic uppercase tracking-tighter mb-8">Dernières Mises Gagnantes 🎉</h2>

                  <div className="space-y-4 text-left max-w-xl mx-auto">
                    {[
                      { e: '🦁', n: 'AlexPro99', m: 'Buteur Kylian Mbappé', v: '+320 TC' },
                      { e: '🐓', n: 'ToileMaster', m: 'Score Exact 1-0', v: '+450 TC' },
                      { e: '⚡', n: 'ShadowBet', m: 'France Résultat Final', v: '+140 TC' },
                    ].map((w) => (
                      <div key={w.n} className="glass-panel p-4 rounded-2xl border-l-[3px] border-l-emerald-500 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{w.e}</span>
                          <div>
                            <p className="font-body-md font-bold text-white leading-tight">{w.n}</p>
                            <p className="font-label-caps text-[10px] text-on-surface-variant tracking-wider">{w.m}</p>
                          </div>
                        </div>
                        <span className="font-data-mono text-emerald-400 font-bold text-[20px] tabular">{w.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motionClient.div>
            )}

            {/* SLIDE 4: QR */}
            {currentSlide === 3 && (
              <motionClient.div key="slide-qr" {...slideTransition} className="w-full max-w-4xl h-full flex items-center justify-center">
                <div className="glass-strong gradient-border rounded-3xl p-10 flex items-center gap-12 w-full max-w-3xl">
                  <div className="bg-white p-4 rounded-2xl shadow-[0_0_40px_rgba(125,164,255,0.25)] shrink-0 flex items-center justify-center">
                    {qrUrl ? (
                      <img src={qrUrl} alt="QR Code" className="w-56 h-56 object-contain" />
                    ) : (
                      <div className="w-56 h-56 bg-surface-container animate-pulse rounded-xl" />
                    )}
                  </div>

                  <div className="text-left space-y-4">
                    <h2 className="font-headline-lg text-[42px] italic uppercase tracking-tighter leading-none bg-gradient-to-r from-white to-primary bg-clip-text text-transparent">
                      Rejoignez la partie en direct !
                    </h2>
                    <p className="font-body-lg text-[18px] text-on-surface-variant">
                      Scannez ce QR Code, choisissez votre pseudo et pariez avec vos 1 000 ToilesCoins offerts !
                    </p>
                    <div className="flex items-center gap-2 text-primary">
                      <span className="material-symbols-outlined text-[24px]">phone_iphone</span>
                      <span className="font-label-caps text-[13px] tracking-widest font-bold">100% LUDIQUE &amp; GRATUIT</span>
                    </div>
                  </div>
                </div>
              </motionClient.div>
            )}

            {/* SLIDE 5: Badges */}
            {currentSlide === 4 && (
              <motionClient.div key="slide-badges" {...slideTransition} className="w-full max-w-3xl h-full flex flex-col justify-center text-center">
                <div className="glass-panel gradient-border rounded-3xl p-10">
                  <span className="material-symbols-outlined text-[72px] text-secondary mb-6" style={{ fontVariationSettings: "'FILL' 1" }}>military_tech</span>
                  <h2 className="font-headline-lg text-[32px] text-white italic uppercase tracking-tighter mb-8">Derniers Badges Débloqués 🏅</h2>

                  <div className="grid grid-cols-3 gap-6 max-w-2xl mx-auto">
                    {[
                      { ic: 'emoji_events', n: 'ToileMaster', b: 'Nostradamus', c: 'border-t-tertiary', bg: 'from-tertiary to-[#e08a1e]' },
                      { ic: 'hub', n: 'AlexPro99', b: 'Légende', c: 'border-t-secondary', bg: 'from-secondary to-secondary-container' },
                      { ic: 'visibility', n: 'ShadowBet', b: 'Oracle Bleu', c: 'border-t-primary', bg: 'from-primary to-secondary-container' },
                    ].map((bd) => (
                      <div key={bd.n} className={`glass-panel rounded-2xl p-6 border-t-2 ${bd.c} flex flex-col items-center`}>
                        <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${bd.bg} flex items-center justify-center text-white mb-3`}>
                          <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>{bd.ic}</span>
                        </div>
                        <span className="font-body-md font-bold text-white text-[15px] truncate w-full">{bd.n}</span>
                        <span className="font-label-caps text-[9px] text-on-surface-variant mt-1 tracking-wider">{bd.b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motionClient.div>
            )}

          </AnimatePresence>
        </div>

        <GameEventOverlay />

        {/* Ticker */}
        <div className="absolute bottom-0 left-0 w-full h-[76px] glass-strong border-t border-white/10 flex items-center overflow-hidden z-50">
          <div className="h-full bg-gradient-to-r from-secondary-container to-[#1e46e0] px-8 flex items-center justify-center z-10 border-r border-white/20 shrink-0">
            <span className="font-headline-lg text-[18px] text-white uppercase italic tracking-wider font-bold whitespace-nowrap">
              EN DIRECT DU BAR
            </span>
          </div>

          <div className="flex-grow h-full overflow-hidden relative flex items-center">
            <div className="absolute whitespace-nowrap animate-ticker flex items-center">
              {[0, 1].map((rep) => (
                <span key={rep} className="flex items-center gap-20 px-10">
                  <span className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-tertiary text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>monetization_on</span>
                    <span className="font-data-mono text-[18px] text-on-surface">
                      <span className="font-bold text-tertiary">ESTEBAN</span> VIENT DE GAGNER <span className="text-white bg-white/10 px-2 py-0.5 rounded">250 TC</span> SUR RÉSULTAT FINAL
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-error text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
                    <span className="font-data-mono text-[18px] text-on-surface">
                      <span className="font-bold text-error">MARIE</span> A DÉBLOQUÉ LE BADGE <span className="text-white bg-white/10 px-2 py-0.5 rounded">ORACLE BLEU</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary text-[24px]">check_circle</span>
                    <span className="font-data-mono text-[18px] text-on-surface">
                      <span className="font-bold text-secondary">LUCAS</span> PRÉDICTION PARFAITE SUR SCORE EXACT 1-0 (+450 TC)
                    </span>
                  </span>
                </span>
              ))}
            </div>
            <div className="absolute right-0 top-0 w-32 h-full bg-gradient-to-l from-[#070b16] to-transparent z-10 pointer-events-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TvStat({ label, left, right, pct }: { label: string; left: string; right: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between font-data-mono text-[16px] text-white mb-2">
        <span className="text-primary font-bold tabular">{left}</span>
        <span className="font-label-caps text-[11px] text-on-surface-variant tracking-wider">{label}</span>
        <span className="tabular text-on-surface-variant">{right}</span>
      </div>
      <div className="h-3 w-full bg-white/8 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-secondary-container to-primary rounded-full transition-all duration-500" style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}
