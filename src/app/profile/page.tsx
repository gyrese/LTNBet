'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import Navigation from '@/components/Navigation';
import QRCode from 'qrcode';

function useIsClient() {
  return useSyncExternalStore(() => () => {}, () => true, () => false);
}

import { getAvatarConfig } from '@/lib/avatars';

export default function ProfilePage() {
  const router = useRouter();
  const { currentUser, myBets, badges, myBadges, logoutUser } = useGameStore();
  const [qrUrl, setQrUrl] = useState('');
  const isClient = useIsClient();

  useEffect(() => {
    if (!isClient) return;
    if (!currentUser) {
      router.push('/join');
      return;
    }

    const inviteUrl = `${window.location.origin}/join`;
    QRCode.toDataURL(inviteUrl, {
      margin: 2,
      width: 220,
      color: { dark: '#070b16', light: '#ffffff' },
    })
      .then((url) => setQrUrl(url))
      .catch((err) => console.error('Erreur QR Code', err));
  }, [isClient, currentUser, router]);

  if (!isClient || !currentUser) return null;

  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/join` : '';
  const avatar = getAvatarConfig(currentUser.avatar);

  const totalBetsCount = myBets.length;
  const wonBetsCount = myBets.filter((b) => b.status === 'won').length;
  const successRate = totalBetsCount > 0 ? Math.round((wonBetsCount / totalBetsCount) * 100) : 0;
  const bestPayout = myBets.reduce((max, b) => (b.payout > max ? b.payout : max), 0);

  const handleLogout = () => {
    logoutUser();
    router.push('/join');
  };

  return (
    <div className="min-h-dvh flex flex-col text-on-surface pb-28 md:pb-12 pt-24">
      <Navigation />

      <main className="flex-grow w-full max-w-container-max mx-auto px-4 md:px-16 py-6 space-y-6">

        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="glass-strong gradient-border rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden"
        >
          <div className="absolute -right-24 -top-24 w-72 h-72 bg-secondary-container/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative shrink-0">
            <div className={`w-28 h-28 rounded-3xl flex items-center justify-center text-5xl border border-white/15 relative z-10 bg-gradient-to-br ${avatar.color} shadow-[0_12px_30px_-8px_rgba(0,0,0,0.7)]`}>
              {avatar.emoji}
            </div>
            <div className="absolute -bottom-2 -right-2 px-2.5 h-9 min-w-9 rounded-full bg-gradient-to-b from-tertiary to-tertiary-container flex items-center justify-center border-2 border-background z-20 shadow-[0_4px_14px_rgba(246,198,72,0.45)]">
              <span className="font-headline-lg-mobile text-[15px] text-on-tertiary font-bold tabular">#{currentUser.rank}</span>
            </div>
          </div>

          <div className="text-center md:text-left flex-1 space-y-2 relative z-10">
            <h1 className="font-display-hero text-[34px] md:text-[48px] tracking-tighter bg-gradient-to-r from-white via-primary to-white bg-clip-text text-transparent leading-none">
              {currentUser.username}
            </h1>
            <p className="font-label-caps text-[11px] text-tertiary flex items-center justify-center md:justify-start gap-2 tracking-widest">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                military_tech
              </span>
              PRÉDICTEUR · TIER ELITE
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="relative z-10 md:self-start bg-error/10 hover:bg-error/20 border border-error/30 text-error font-label-caps text-[11px] px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            Déconnexion
          </button>
        </motion.section>

        {/* Stats bento */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <StatCard icon="paid" label="GAINS CUMULÉS" value={`${currentUser.totalWinnings.toLocaleString()}`} unit="TC" accent="text-tertiary" border="neon-border-top-blue" delay={0.05} />
          <StatCard icon="trending_up" label="TAUX DE RÉUSSITE" value={`${successRate}`} unit="%" accent="text-primary" border="neon-border-top-blue" delay={0.1} />
          <StatCard icon="workspace_premium" label="MEILLEUR GAIN" value={`${bestPayout.toLocaleString()}`} unit="TC" accent="text-white" border="neon-border-top-red" delay={0.15} />
        </section>

        {/* Badges */}
        <section className="space-y-4">
          <h2 className="font-headline-lg-mobile text-[22px] text-white italic flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary text-[24px]">military_tech</span>
            Badges
          </h2>
          <div className="flex flex-wrap gap-3">
            {badges.map((badge) => {
              const isUnlocked = myBadges.includes(badge.code);
              return (
                <div
                  key={badge.id}
                  className={`rounded-2xl px-4 py-2.5 flex items-center gap-3 border transition-all ${
                    isUnlocked
                      ? 'border-tertiary/40 bg-tertiary/8 shadow-[0_0_18px_rgba(246,198,72,0.12)]'
                      : 'border-white/6 bg-white/[0.02] opacity-45 grayscale'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    isUnlocked ? 'bg-gradient-to-br from-tertiary to-[#e08a1e] text-on-tertiary' : 'bg-white/10'
                  }`}>
                    <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {badge.icon}
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="font-body-md text-[13px] font-bold text-white leading-tight">{badge.title}</p>
                    <p className="font-body-md text-[10px] text-on-surface-variant/70 leading-tight">{badge.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* History + QR */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 space-y-4">
            <h2 className="font-headline-lg-mobile text-[22px] text-white italic flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[24px]">history</span>
              Historique des Paris
            </h2>

            <div className="space-y-3">
              {myBets.length > 0 ? (
                myBets.map((bet, idx) => (
                  <motion.div
                    key={bet.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                    className={`glass-panel rounded-2xl p-4 flex items-center justify-between hover:bg-white/[0.05] transition-colors border-l-[3px] ${
                      bet.status === 'won'
                        ? 'border-l-emerald-500'
                        : bet.status === 'lost'
                        ? 'border-l-error'
                        : 'border-l-primary'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border border-white/10 ${
                        bet.status === 'won' ? 'bg-emerald-500/10 text-emerald-400' : bet.status === 'lost' ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'
                      }`}>
                        <span className="material-symbols-outlined text-[20px]">
                          {bet.status === 'won' ? 'check_circle' : bet.status === 'lost' ? 'cancel' : 'hourglass_top'}
                        </span>
                      </div>
                      <div>
                        <p className="font-body-md font-bold text-white text-sm md:text-base leading-tight">{bet.outcomeName}</p>
                        <p className="font-label-caps text-[9px] text-on-surface-variant tracking-wider mt-0.5">
                          {bet.marketTitle} · COTE {bet.oddsAtBet.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      {bet.status === 'won' ? (
                        <>
                          <p className="font-data-mono text-emerald-400 font-bold text-sm md:text-base tabular">+{bet.payout} TC</p>
                          <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-label-caps text-[9px] mt-1 font-bold">GAGNÉ</span>
                        </>
                      ) : bet.status === 'lost' ? (
                        <>
                          <p className="font-data-mono text-error font-bold text-sm md:text-base tabular">-{bet.amount} TC</p>
                          <span className="inline-block px-2 py-0.5 rounded-full bg-error/15 text-error font-label-caps text-[9px] mt-1 font-bold">PERDU</span>
                        </>
                      ) : (
                        <>
                          <p className="font-data-mono text-primary font-bold text-sm md:text-base tabular">{bet.amount} TC</p>
                          <span className="inline-block px-2 py-0.5 rounded-full bg-primary/15 text-primary font-label-caps text-[9px] mt-1 font-bold">EN ATTENTE</span>
                        </>
                      )}
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-14 text-on-surface-variant/45 font-body-md glass-panel rounded-2xl flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-[40px] opacity-40">sports_soccer</span>
                  Aucun pari enregistré. Allez miser sur le match en cours !
                </div>
              )}
            </div>
          </section>

          {/* QR invite */}
          <section className="lg:col-span-1">
            <div className="glass-strong gradient-border rounded-3xl p-6 flex flex-col items-center text-center h-full justify-center relative overflow-hidden">
              <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-48 h-48 bg-secondary-container/20 blur-3xl rounded-full pointer-events-none" />
              <h2 className="font-headline-lg-mobile text-[22px] text-white mb-2 leading-tight relative z-10">Inviter un Ami</h2>
              <p className="font-body-md text-[13px] text-on-surface-variant mb-6 relative z-10">
                Faites scanner ce QR Code pour rejoindre les pronostics du bar en direct !
              </p>

              <div className="bg-white p-3 rounded-2xl shadow-[0_0_30px_rgba(125,164,255,0.2)] mb-6 flex items-center justify-center shrink-0 relative z-10">
                {qrUrl ? (
                  <img src={qrUrl} alt="QR Code d'invitation" className="w-40 h-40 object-contain" />
                ) : (
                  <div className="w-40 h-40 bg-surface-container animate-pulse rounded-xl" />
                )}
              </div>

              <span className="font-data-mono text-[11px] text-primary/80 bg-primary/8 border border-primary/15 px-4 py-2 rounded-full select-all relative z-10">
                {inviteUrl}
              </span>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  icon, label, value, unit, accent, border, delay,
}: {
  icon: string; label: string; value: string; unit: string; accent: string; border: string; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`glass-panel rounded-2xl p-6 ${border} relative overflow-hidden`}
    >
      <div className="absolute right-2 bottom-0 opacity-[0.04] translate-x-2 translate-y-3">
        <span className="material-symbols-outlined text-[130px]">{icon}</span>
      </div>
      <h3 className="font-label-caps text-[10px] text-on-surface-variant mb-3 tracking-widest">{label}</h3>
      <p className={`font-score-display text-[40px] md:text-[46px] ${accent} tabular leading-none`}>
        {value}
        <span className="text-[18px] ml-1 opacity-70">{unit}</span>
      </p>
    </motion.div>
  );
}
