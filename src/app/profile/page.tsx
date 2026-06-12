'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
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
      color: { dark: '#0a0a1e', light: '#ffffff' },
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

      <main className="grow w-full max-w-container-max mx-auto px-4 md:px-16 py-6 space-y-6">

        {/* ── Hero card ── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="glass-strong gradient-border rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-6 relative overflow-hidden"
        >
          {/* Ambient violet glow */}
          <div
            className="absolute -right-24 -top-24 w-72 h-72 rounded-full blur-3xl pointer-events-none"
            style={{ background: 'rgba(123,97,255,0.14)' }}
          />
          {/* Orange left glow */}
          <div
            className="absolute -left-20 top-0 w-56 h-56 rounded-full blur-3xl pointer-events-none"
            style={{ background: 'rgba(255,80,0,0.09)' }}
          />

          {/* Avatar */}
          <div className="relative shrink-0">
            {/* Animated ring */}
            <div
              className="w-32 h-32 rounded-[28px] flex items-center justify-center relative z-10 overflow-hidden shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)]"
              style={{
                border: '2px solid rgba(123,97,255,0.40)',
                background: 'rgba(20,20,60,0.80)',
                boxShadow: '0 0 30px rgba(123,97,255,0.25), 0 12px 40px -8px rgba(0,0,0,0.8)',
              }}
            >
              {avatar.imagePath ? (
                <img src={avatar.imagePath} alt={avatar.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-5xl">{avatar.emoji}</span>
              )}
            </div>
            {/* Rank badge */}
            <div
              className="absolute -bottom-2 -right-2 px-2.5 h-9 min-w-9 rounded-full flex items-center justify-center border-2 z-20"
              style={{
                background: 'linear-gradient(180deg, #FFD05A, #E89B10)',
                borderColor: '#0a0a1e',
                boxShadow: '0 4px 16px rgba(255,184,0,0.45)',
              }}
            >
              <span className="font-headline-lg-mobile text-[15px] font-bold tabular" style={{ color: '#1a1000' }}>
                #{currentUser.rank}
              </span>
            </div>
          </div>

          {/* Name + tier */}
          <div className="text-center md:text-left flex-1 space-y-2 relative z-10">
            <h1
              className="font-display-hero text-[40px] md:text-[56px] bg-clip-text text-transparent leading-none"
              style={{ backgroundImage: 'linear-gradient(135deg, #FFFFFF 0%, #9278FF 50%, #FFFFFF 100%)' }}
            >
              {currentUser.username}
            </h1>
            <p className="font-label-caps text-[11px] text-home flex items-center justify-center md:justify-start gap-2 tracking-widest">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                military_tech
              </span>
              PRÉDICTEUR · TIER ELITE
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="relative z-10 md:self-start font-label-caps text-[11px] px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
            style={{
              background: 'rgba(255,59,71,0.08)',
              border: '1px solid rgba(255,59,71,0.28)',
              color: '#FF3B47',
            }}
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            Déconnexion
          </button>
        </motion.section>

        {/* ── Stats bento ── */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <StatCard
            icon="emoji_events"
            label="CUMUL CDM"
            value={`${(currentUser.tournamentTotal + currentUser.toilesCoins).toLocaleString()}`}
            unit="TC"
            valueColor="#FFB800"
            borderStyle="neon-border-top-orange"
            glowColor="rgba(255,80,0,0.15)"
            delay={0.05}
          />
          <StatCard
            icon="trending_up"
            label="TAUX DE RÉUSSITE"
            value={`${successRate}`}
            unit="%"
            valueColor="#9278FF"
            borderStyle="neon-border-top-violet"
            glowColor="rgba(123,97,255,0.15)"
            delay={0.1}
          />
          <StatCard
            icon="workspace_premium"
            label="MEILLEUR GAIN"
            value={`${bestPayout.toLocaleString()}`}
            unit="TC"
            valueColor="#FFFFFF"
            borderStyle="neon-border-top-blue"
            glowColor="rgba(26,143,255,0.12)"
            delay={0.15}
          />
        </section>

        {/* ── Badges ── */}
        <section className="space-y-4">
          <h2 className="font-headline-lg-mobile text-[26px] text-white flex items-center gap-2">
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
                    isUnlocked ? '' : 'opacity-40 grayscale'
                  }`}
                  style={
                    isUnlocked
                      ? {
                          background: 'rgba(255,184,0,0.07)',
                          border: '1px solid rgba(255,184,0,0.35)',
                          boxShadow: '0 0 18px rgba(255,184,0,0.10)',
                        }
                      : {
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.06)',
                        }
                  }
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={
                      isUnlocked
                        ? { background: 'linear-gradient(135deg, #FFB800, #E89B10)', color: '#1a1000' }
                        : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }
                    }
                  >
                    <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                      {badge.icon}
                    </span>
                  </div>
                  <div className="text-left">
                    <p className="font-body-md text-[13px] font-bold text-white leading-tight">{badge.title}</p>
                    <p className="font-body-md text-[10px] text-on-surface-variant/65 leading-tight">{badge.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── QR invite ── */}
        <div className="max-w-xl mx-auto w-full">
          <section className="w-full">
            <div className="glass-strong gradient-border rounded-3xl p-8 flex flex-col items-center text-center justify-center relative overflow-hidden">
              <div
                className="absolute -top-20 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-3xl pointer-events-none"
                style={{ background: 'rgba(123,97,255,0.18)' }}
              />
              <h2 className="font-headline-lg-mobile text-[26px] text-white mb-2 leading-tight relative z-10">
                Inviter un Ami
              </h2>
              <p className="font-body-md text-[13px] text-on-surface-variant mb-6 relative z-10">
                Faites scanner ce QR Code pour rejoindre les pronostics du bar en direct !
              </p>

              <div
                className="p-3 rounded-2xl mb-6 flex items-center justify-center shrink-0 relative z-10"
                style={{
                  background: '#FFFFFF',
                  boxShadow: '0 0 30px rgba(123,97,255,0.25)',
                }}
              >
                {qrUrl ? (
                  <img src={qrUrl} alt="QR Code d'invitation" className="w-40 h-40 object-contain" />
                ) : (
                  <div className="w-40 h-40 rounded-xl animate-pulse" style={{ background: 'rgba(123,97,255,0.12)' }} />
                )}
              </div>

              <span
                className="font-data-mono text-[11px] px-4 py-2 rounded-full select-all relative z-10"
                style={{
                  color: 'rgba(146,120,255,0.85)',
                  background: 'rgba(123,97,255,0.08)',
                  border: '1px solid rgba(123,97,255,0.18)',
                }}
              >
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
  icon, label, value, unit, valueColor, borderStyle, glowColor, delay,
}: {
  icon: string;
  label: string;
  value: string;
  unit: string;
  valueColor: string;
  borderStyle: string;
  glowColor: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`glass-panel rounded-2xl p-6 ${borderStyle} relative overflow-hidden`}
    >
      {/* Background glow */}
      <div
        className="absolute right-0 bottom-0 w-32 h-32 rounded-full blur-3xl pointer-events-none"
        style={{ background: glowColor }}
      />
      {/* Ghost icon */}
      <div className="absolute right-2 bottom-0 opacity-[0.04] translate-x-2 translate-y-3">
        <span className="material-symbols-outlined text-[130px]">{icon}</span>
      </div>
      <h3 className="font-label-caps text-[10px] text-on-surface-variant mb-3 tracking-widest">{label}</h3>
      <p className="font-score-display text-[44px] md:text-[52px] tabular leading-none" style={{ color: valueColor }}>
        {value}
        <span className="text-[18px] ml-1" style={{ color: valueColor, opacity: 0.65 }}>{unit}</span>
      </p>
    </motion.div>
  );
}
