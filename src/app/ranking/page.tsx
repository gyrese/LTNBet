'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useGameStore, Player } from '@/lib/store';
import Navigation from '@/components/Navigation';

import { getAvatarConfig } from '@/lib/avatars';

const PODIUM_META = {
  1: {
    ring: 'border-tertiary',
    glow: 'neon-glow-tertiary',
    bar: 'from-tertiary/18',
    accent: 'text-tertiary',
    medal: '#FFB800',
    medRgb: '255,184,0',
    h: 'h-28 md:h-32',
    w: 'w-[36%] md:w-52',
    av: 'w-[4.5rem] h-[4.5rem] md:w-24 md:h-24',
    z: 'z-10',
    shift: '',
  },
  2: {
    ring: 'border-[#cdd6e6]',
    glow: '',
    bar: 'from-[#cdd6e6]/10',
    accent: 'text-[#cdd6e6]',
    medal: '#cdd6e6',
    medRgb: '205,214,230',
    h: 'h-20 md:h-24',
    w: 'w-[30%] md:w-44',
    av: 'w-14 h-14 md:w-20 md:h-20',
    z: '',
    shift: 'translate-y-3',
  },
  3: {
    ring: 'border-[#d99a5b]',
    glow: '',
    bar: 'from-[#d99a5b]/10',
    accent: 'text-[#d99a5b]',
    medal: '#d99a5b',
    medRgb: '217,154,91',
    h: 'h-16 md:h-20',
    w: 'w-[30%] md:w-44',
    av: 'w-14 h-14 md:w-20 md:h-20',
    z: '',
    shift: 'translate-y-6',
  },
} as const;

function PodiumCard({ player, place }: { player: Player; place: 1 | 2 | 3 }) {
  const cfg = getAvatarConfig(player.avatar);
  const meta = PODIUM_META[place];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: place === 1 ? 0.1 : place === 2 ? 0.2 : 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`flex flex-col items-center ${meta.w} ${meta.z} ${meta.shift}`}
    >
      <div className="relative mb-3 shrink-0">
        {place === 1 && (
          <span
            className="material-symbols-outlined absolute -top-7 left-1/2 -translate-x-1/2 text-tertiary text-[34px] md:text-[42px]"
            style={{ fontVariationSettings: "'FILL' 1", filter: 'drop-shadow(0 0 12px rgba(255,184,0,0.8))' }}
          >
            workspace_premium
          </span>
        )}
        <div
          className={`${meta.av} rounded-full flex items-center justify-center text-3xl md:text-4xl border-[3px] ${meta.ring} ${meta.glow} overflow-hidden`}
          style={{ background: `linear-gradient(135deg, ${cfg.color.includes('from-') ? 'rgba(123,97,255,0.3)' : 'rgba(14,14,40,0.8)'} 0%, rgba(10,10,30,0.9) 100%)` }}
        >
          {cfg.imagePath ? (
            <img src={cfg.imagePath} alt={cfg.name} className="w-full h-full object-cover" />
          ) : (
            cfg.emoji
          )}
        </div>
        <span
          className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center font-data-mono text-[12px] font-bold border-2 border-background"
          style={{ background: meta.medal, color: '#0a0a1e' }}
        >
          {place}
        </span>
      </div>

      {/* Podium column */}
      <div
        className={`w-full rounded-t-2xl pt-3.5 pb-3 px-2 flex flex-col items-center ${meta.h} border-b-0 relative overflow-hidden`}
        style={{
          background: `linear-gradient(180deg, rgba(${meta.medRgb},0.10) 0%, rgba(10,10,30,0.85) 100%)`,
          border: `1px solid rgba(${meta.medRgb},0.20)`,
          borderBottom: 'none',
        }}
      >
        {/* Glow top line */}
        <div
          className="absolute top-0 left-0 w-full h-[2px] rounded-t-2xl"
          style={{
            background: meta.medal,
            boxShadow: place === 1 ? `0 0 16px ${meta.medal}` : 'none',
          }}
        />
        <span className={`font-headline-lg-mobile text-[14px] md:text-[16px] ${meta.accent} truncate w-full text-center`}>
          {player.username}
        </span>
        <span
          className="font-data-mono text-[11px] md:text-[13px] text-on-surface px-2.5 py-0.5 rounded-full mt-1.5 tabular"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          {(player.toilesCoins + player.totalWinnings).toLocaleString()} TC
        </span>
      </div>
    </motion.div>
  );
}

export default function RankingPage() {
  const router = useRouter();
  const { currentUser, match, leaderboard, updateLeaderboard } = useGameStore();
  const [timeLeft, setTimeLeft] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !currentUser) {
      router.push('/join');
      return;
    }
    if (mounted) updateLeaderboard();
  }, [currentUser, router, updateLeaderboard, mounted]);

  useEffect(() => {
    if (match.status !== 'live' && match.status !== 'half_time') return;
    const syncInterval = setInterval(async () => {
      try {
        await fetch('/api/admin/sync');
      } catch (e) {
        console.error('[Sync Poll] error:', e);
      }
    }, 15000);
    return () => clearInterval(syncInterval);
  }, [match.status]);

  useEffect(() => {
    const updateTimer = () => {
      if (!match.betsClosedAt) { setTimeLeft('00:00:00'); return; }
      const diff = new Date(match.betsClosedAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('00:00:00'); return; }
      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      setTimeLeft(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [match.betsClosedAt]);

  if (!mounted || !currentUser) return null;

  const allPlayers = [...leaderboard];
  const userIdx = allPlayers.findIndex((p) => p.id === currentUser.id);
  if (userIdx !== -1) {
    allPlayers[userIdx] = { ...currentUser };
  } else {
    allPlayers.push({ ...currentUser });
  }
  allPlayers.sort((a, b) => (b.toilesCoins + b.totalWinnings) - (a.toilesCoins + a.totalWinnings));

  const top1 = allPlayers[0];
  const top2 = allPlayers[1];
  const top3 = allPlayers[2];
  const otherPlayers = allPlayers.slice(3);

  const getRankChangeIcon = (change: Player['rankChange']) => {
    if (change === 'up') return <span className="material-symbols-outlined text-[16px] text-emerald-400">trending_up</span>;
    if (change === 'down') return <span className="material-symbols-outlined text-[16px] text-error">trending_down</span>;
    return <span className="material-symbols-outlined text-[16px] text-on-surface-variant/40">remove</span>;
  };

  return (
    <div className="min-h-dvh flex flex-col text-on-surface pb-36 md:pb-20 pt-24">
      <Navigation />

      <main className="grow w-full max-w-container-max mx-auto px-4 md:px-16 py-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mt-2 mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="live-dot" />
              <span className="font-label-caps text-[10px] text-on-surface-variant tracking-widest">
                CLASSEMENT EN DIRECT
              </span>
            </div>
            <h1
              className="font-headline-lg bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(90deg, #FF6B20 0%, #7B61FF 50%, #4DA8FF 100%)' }}
            >
              Classement Général
            </h1>
          </div>

          {/* Stats bar */}
          <div
            className="glass-panel px-4 py-3 rounded-2xl flex items-center gap-4 text-center"
          >
            <div>
              <span className="block font-label-caps text-[9px] text-on-surface-variant mb-1 tracking-wider">TEMPS RESTANT</span>
              <span className="font-data-mono text-primary text-[14px] md:text-[16px] font-bold tabular">{timeLeft || '02:00:00'}</span>
            </div>
            <div className="w-px h-9" style={{ background: 'rgba(123,97,255,0.20)' }} />
            <div>
              <span className="block font-label-caps text-[9px] text-on-surface-variant mb-1 tracking-wider">JOUEURS</span>
              <span className="font-data-mono text-on-surface text-[14px] md:text-[16px] font-bold tabular">{allPlayers.length}</span>
            </div>
            <div className="w-px h-9" style={{ background: 'rgba(123,97,255,0.20)' }} />
            <div>
              <span className="block font-label-caps text-[9px] text-on-surface-variant mb-1 tracking-wider">RÉCOMPENSES</span>
              <span className="font-data-mono text-tertiary text-[14px] md:text-[16px] font-bold">Top 3</span>
            </div>
          </div>
        </div>

        {/* Podium */}
        <div className="flex justify-center items-end gap-2 md:gap-6 mb-10 h-[230px] md:h-[270px] max-w-2xl mx-auto">
          {top2 && <PodiumCard player={top2} place={2} />}
          {top1 && <PodiumCard player={top1} place={1} />}
          {top3 && <PodiumCard player={top3} place={3} />}
        </div>

        {/* Player list */}
        <section className="glass-panel rounded-2xl overflow-hidden flex flex-col max-w-3xl mx-auto">
          <div
            className="grid grid-cols-[48px_1fr_110px_44px] gap-2 items-center px-4 py-3 border-b"
            style={{
              background: 'rgba(123,97,255,0.04)',
              borderColor: 'rgba(123,97,255,0.12)',
            }}
          >
            <span className="font-label-caps text-[10px] text-on-surface-variant text-center tracking-wider">POS</span>
            <span className="font-label-caps text-[10px] text-on-surface-variant pl-2 tracking-wider">JOUEUR</span>
            <span className="font-label-caps text-[10px] text-on-surface-variant text-right tracking-wider">SCORE</span>
            <span className="font-label-caps text-[10px] text-on-surface-variant text-center tracking-wider">VAR</span>
          </div>

          <div className="divide-y" style={{ '--tw-divide-color': 'rgba(123,97,255,0.07)' } as React.CSSProperties}>
            {otherPlayers.map((player, idx) => {
              const isMe = player.id === currentUser.id;
              const avatar = getAvatarConfig(player.avatar);
              return (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                  className={`grid grid-cols-[48px_1fr_110px_44px] gap-2 items-center px-4 py-3 transition-colors group`}
                  style={
                    isMe
                      ? {
                          background: 'rgba(123,97,255,0.08)',
                          borderLeft: '2px solid #7B61FF',
                        }
                      : undefined
                  }
                >
                  <span className="font-data-mono text-on-surface-variant text-center font-bold tabular">{player.rank}</span>
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-lg border shrink-0 overflow-hidden"
                      style={{
                        background: 'rgba(123,97,255,0.12)',
                        borderColor: 'rgba(123,97,255,0.20)',
                      }}
                    >
                      {avatar.imagePath ? (
                        <img src={avatar.imagePath} alt={avatar.name} className="w-full h-full object-cover" />
                      ) : (
                        avatar.emoji
                      )}
                    </div>
                    <span
                      className={`font-body-md truncate ${isMe ? 'font-bold' : 'text-on-surface'}`}
                      style={{ color: isMe ? '#9278FF' : undefined }}
                    >
                      {player.username} {isMe && '(Vous)'} {player.badgeCount ? ` 🏅${player.badgeCount}` : ''}
                    </span>
                  </div>
                  <span className="font-data-mono text-primary text-right font-bold tabular">
                    {(player.toilesCoins + player.totalWinnings).toLocaleString()}
                  </span>
                  <div className="flex justify-center">{getRankChangeIcon(player.rankChange)}</div>
                </motion.div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Sticky current player bar */}
      <div className="fixed bottom-[96px] md:bottom-4 inset-x-0 px-4 md:px-16 z-40 pointer-events-none">
        <div
          className="pointer-events-auto max-w-2xl mx-auto gradient-border rounded-2xl px-4 py-3 flex items-center justify-between"
          style={{
            background: 'linear-gradient(160deg, rgba(20,20,60,0.97) 0%, rgba(10,10,30,0.99) 100%)',
            border: '1px solid rgba(123,97,255,0.22)',
            boxShadow: '0 4px 30px -8px rgba(123,97,255,0.25)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          <div className="flex items-center gap-4">
            <span
              className="font-headline-lg-mobile text-[28px] font-bold tabular"
              style={{ color: '#9278FF', textShadow: '0 0 18px rgba(123,97,255,0.5)' }}
            >
              #{currentUser.rank}
            </span>
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-lg border overflow-hidden"
                style={{
                  borderColor: 'rgba(123,97,255,0.45)',
                  background: 'rgba(123,97,255,0.12)',
                }}
              >
                {getAvatarConfig(currentUser.avatar).imagePath ? (
                  <img
                    src={getAvatarConfig(currentUser.avatar).imagePath!}
                    alt={getAvatarConfig(currentUser.avatar).name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  getAvatarConfig(currentUser.avatar).emoji
                )}
              </div>
              <span className="font-body-md text-on-surface font-bold">
                {currentUser.username}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="text-right">
              <span className="block font-label-caps text-[9px] mb-0.5 tracking-wider" style={{ color: 'rgba(146,120,255,0.70)' }}>
                VOTRE SCORE
              </span>
              <span className="font-data-mono text-primary font-bold text-[16px] tabular">
                {(currentUser.toilesCoins + currentUser.totalWinnings).toLocaleString()} TC
              </span>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(123,97,255,0.08)',
                border: '1px solid rgba(123,97,255,0.18)',
              }}
            >
              {getRankChangeIcon(currentUser.rankChange)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
