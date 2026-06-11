'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useGameStore } from '@/lib/store';
import QRCode from 'qrcode';
import { getAvatarConfig } from '@/lib/avatars';
import TeamFlag from '@/components/TeamFlag';
import GameEventOverlay from '@/components/GameEventOverlay';

const ORANGE = '#FF6B00';
const CYAN = '#00C8FF';
const GOLD = '#FFD700';
const SILVER = '#C0C0C0';
const BRONZE = '#CD7F32';

const MEDAL_COLORS = [GOLD, SILVER, BRONZE];
const MEDAL_GLOWS = [
  '0 0 18px rgba(255,215,0,0.45)',
  '0 0 14px rgba(192,192,192,0.3)',
  '0 0 14px rgba(205,127,50,0.3)',
];

// --- SVG Donut for possession ---
function PossessionDonut({ home }: { home: number }) {
  const r = 38;
  const stroke = 14;
  const size = 100;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const homeArc = (home / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)', display: 'block', margin: '0 auto' }}
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
      <circle
        cx={c} cy={c} r={r} fill="none"
        stroke={CYAN} strokeWidth={stroke}
        strokeDasharray={`${circumference - homeArc} ${circumference}`}
        strokeDashoffset={-homeArc}
      />
      <circle
        cx={c} cy={c} r={r} fill="none"
        stroke={ORANGE} strokeWidth={stroke}
        strokeDasharray={`${homeArc} ${circumference}`}
      />
    </svg>
  );
}

// --- Shot bars ---
function ShotBars({ home, away }: { home: number; away: number }) {
  const max = Math.max(home, away, 1);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 11, color: ORANGE, fontWeight: 700, fontFamily: 'var(--font-jetbrains)', width: 20, textAlign: 'right' }}>{home}</span>
        <div className="flex-1 h-3.5 rounded-sm overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-sm transition-all duration-700"
            style={{ width: `${(home / max) * 100}%`, background: `linear-gradient(90deg, ${ORANGE}, rgba(255,150,30,0.7))` }} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 11, color: CYAN, fontWeight: 700, fontFamily: 'var(--font-jetbrains)', width: 20, textAlign: 'right' }}>{away}</span>
        <div className="flex-1 h-3.5 rounded-sm overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-sm transition-all duration-700"
            style={{ width: `${(away / max) * 100}%`, background: `linear-gradient(90deg, ${CYAN}, rgba(0,180,255,0.6))` }} />
        </div>
      </div>
    </div>
  );
}

// --- Card slots (up to 4 small squares) ---
function CardSlots({ count, color }: { count: number; color: string }) {
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="w-[11px] h-4 rounded-[2px]"
          style={{ background: i < count ? color : 'rgba(255,255,255,0.1)' }} />
      ))}
    </div>
  );
}

// --- Leaderboard avatar cell ---
function Avatar({ player, size = 32 }: { player: { avatar: string; username: string }; size?: number }) {
  const cfg = getAvatarConfig(player.avatar);
  return (
    <div
      className="rounded-full overflow-hidden shrink-0 border"
      style={{ width: size, height: size, borderColor: 'rgba(255,255,255,0.15)' }}
    >
      {cfg.imagePath ? (
        <img src={cfg.imagePath} alt={cfg.name} className="w-full h-full object-cover" />
      ) : (
        <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${cfg.color}`}
          style={{ fontSize: size * 0.45 }}>{cfg.emoji}</div>
      )}
    </div>
  );
}

export default function BroadcastScreen() {
  const { match, leaderboard } = useGameStore();
  const [qrUrl, setQrUrl] = useState('');
  const [tickerEvents, setTickerEvents] = useState<{ id: string; type: string; title: string; subtitle: string }[]>([]);
  const [secs, setSecs] = useState(0);

  // Sync poll
  useEffect(() => {
    if (match.status !== 'live' && match.status !== 'half_time') return;
    const id = setInterval(() => fetch('/api/admin/sync').catch(() => {}), 15000);
    return () => clearInterval(id);
  }, [match.status]);

  // Ticker events
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/db?op=ticker').then(r => r.json());
        if (res.events) setTickerEvents(res.events);
      } catch { /* */ }
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  // QR code
  useEffect(() => {
    if (typeof window === 'undefined') return;
    QRCode.toDataURL(`${window.location.origin}/join`, {
      margin: 1, width: 200, color: { dark: '#040810', light: '#ffffff' },
    }).then(setQrUrl).catch(() => {});
  }, []);

  // Client-side seconds ticker — restarts (and resets to 0) whenever elapsedTime or status changes
  useEffect(() => {
    if (match.status !== 'live') return;
    let count = -1;
    const id = setInterval(() => {
      count = (count + 1) % 60;
      setSecs(count);
    }, 1000);
    return () => clearInterval(id);
  }, [match.status, match.elapsedTime]);

  const top10 = useMemo(
    () => [...leaderboard]
      .sort((a, b) => (b.toilesCoins + b.totalWinnings) - (a.toilesCoins + a.totalWinnings))
      .slice(0, 10),
    [leaderboard],
  );

  const possHome = match.possessionHome ?? 50;
  const possAway = 100 - possHome;

  const timerDisplay = match.status === 'live'
    ? `${String(match.elapsedTime).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : match.status === 'half_time' ? 'HT'
    : match.status === 'finished' ? 'FT'
    : '--:--';

  const statusBadge = match.status === 'live'
    ? { label: 'LIVE', bg: 'rgba(255,30,30,0.18)', border: 'rgba(255,30,30,0.5)', color: '#FF3B3B' }
    : match.status === 'half_time'
    ? { label: 'HALF TIME', bg: 'rgba(255,215,0,0.1)', border: 'rgba(255,215,0,0.35)', color: GOLD }
    : match.status === 'finished'
    ? { label: 'FULL TIME', bg: 'rgba(125,164,255,0.1)', border: 'rgba(125,164,255,0.35)', color: '#7da4ff' }
    : { label: 'UPCOMING', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' };

  return (
    <div
      className="h-dvh w-screen overflow-hidden flex flex-col select-none"
      style={{ background: '#050912', color: '#e8eef9', fontFamily: 'var(--font-hanken)' }}
    >
      {/* Layered stadium-inspired gradient backdrop */}
      <div className="absolute inset-0 z-0 pointer-events-none" style={{
        background: `
          radial-gradient(ellipse 100% 55% at 50% -5%, rgba(0,90,30,0.20) 0%, transparent 55%),
          radial-gradient(ellipse 55% 50% at 0% 65%, rgba(255,107,0,0.09) 0%, transparent 55%),
          radial-gradient(ellipse 55% 50% at 100% 65%, rgba(0,200,255,0.09) 0%, transparent 55%),
          radial-gradient(ellipse 80% 60% at 50% 110%, rgba(43,91,255,0.07) 0%, transparent 55%),
          linear-gradient(180deg, #060d18 0%, #020508 100%)
        `
      }} />
      {/* Subtle scanline HUD overlay */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.025]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,1) 2px, rgba(255,255,255,1) 3px)',
        backgroundSize: '100% 3px',
      }} />

      {/* ══════════════════════════════════════════
          HEADER BAR
      ══════════════════════════════════════════ */}
      <header
        className="relative z-10 flex items-center px-6 shrink-0"
        style={{ height: 60, background: 'rgba(5,9,18,0.92)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Left: status badge */}
        <div className="flex items-center gap-3 w-1/4">
          <div
            className="flex items-center gap-2 px-4 py-1.5 rounded-full"
            style={{ background: statusBadge.bg, border: `1px solid ${statusBadge.border}` }}
          >
            {match.status === 'live' && (
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#FF3B3B', boxShadow: '0 0 8px #FF3B3B' }} />
            )}
            <span style={{ fontFamily: 'var(--font-anybody)', fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', color: statusBadge.color }}>
              {statusBadge.label}
            </span>
          </div>
          {match.status === 'live' && (
            <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
              {match.elapsedTime}&apos;
            </span>
          )}
        </div>

        {/* Center: LTNBet logo */}
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center leading-none">
          <div style={{ fontFamily: 'var(--font-anybody)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1 }}>
            <span style={{ fontSize: 30, color: 'white', textShadow: '0 0 30px rgba(255,255,255,0.2)' }}>LTN</span>
            <span style={{ fontSize: 30, color: ORANGE, textShadow: `0 0 30px rgba(255,107,0,0.6)` }}>Bet</span>
          </div>
          <span style={{ fontFamily: 'var(--font-hanken)', fontSize: 8.5, fontWeight: 700, letterSpacing: '0.28em', color: 'rgba(255,255,255,0.38)', marginTop: 1 }}>
            LIVE STADIUM BROADCAST
          </span>
        </div>

        {/* Right: venue */}
        <div className="flex items-center justify-end gap-2 w-1/4">
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }}>stadium</span>
          <span style={{ fontFamily: 'var(--font-hanken)', fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Les Toiles Noires
          </span>
        </div>
      </header>

      {/* ══════════════════════════════════════════
          MAIN GRID — 3 columns
      ══════════════════════════════════════════ */}
      <div className="relative z-10 flex-1 grid grid-cols-[280px_1fr_300px] gap-0 overflow-hidden min-h-0">

        {/* ── LEFT PANEL: Live Match Stats ── */}
        <div
          className="flex flex-col gap-0 overflow-hidden p-5"
          style={{ borderRight: '1px solid rgba(255,255,255,0.06)', background: 'rgba(6,10,20,0.7)' }}
        >
          <h2 style={{
            fontFamily: 'var(--font-anybody)', fontSize: 12, fontWeight: 800, letterSpacing: '0.22em',
            color: 'rgba(255,255,255,0.5)', marginBottom: 16, textTransform: 'uppercase',
          }}>
            Live Match Stats
          </h2>

          {/* Possession donut */}
          <div className="flex flex-col items-center gap-3 mb-5">
            <div className="relative">
              <PossessionDonut home={possHome} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span style={{ fontFamily: 'var(--font-anywhere)', fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>POSS</span>
              </div>
            </div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-hanken)', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.55)' }}>
              POSSESSION
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-[2px]" style={{ background: ORANGE }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: ORANGE }}>Home {possHome}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-[2px]" style={{ background: CYAN }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: CYAN }}>Away {possAway}%</span>
              </div>
            </div>
          </div>

          {/* Shots on target */}
          <div className="mb-5">
            <div className="flex justify-between mb-2" style={{ fontSize: 10, letterSpacing: '0.14em', fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>
              <span style={{ color: ORANGE }}>Home {match.shotsOnTargetHome}</span>
              <span>SHOTS ON TARGET</span>
              <span style={{ color: CYAN }}>Away {match.shotsOnTargetAway}</span>
            </div>
            <ShotBars home={match.shotsOnTargetHome} away={match.shotsOnTargetAway} />
          </div>

          {/* Cards */}
          <div className="mb-5">
            <div style={{ fontSize: 10, letterSpacing: '0.14em', fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase' }}>
              Cards:&nbsp;
              <span style={{ color: ORANGE }}>Home Y-{match.cardsHome} R-0</span>
              &nbsp;|&nbsp;
              <span style={{ color: CYAN }}>Away Y-{match.cardsAway} R-0</span>
            </div>
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', width: 12 }}>Y</span>
                  <CardSlots count={Math.min(match.cardsHome, 4)} color="#FFD700" />
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', width: 12 }}>R</span>
                  <CardSlots count={0} color="#FF3B3B" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 items-end">
                <div className="flex items-center gap-2 flex-row-reverse">
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', width: 12, textAlign: 'right' }}>Y</span>
                  <CardSlots count={Math.min(match.cardsAway, 4)} color="#FFD700" />
                </div>
                <div className="flex items-center gap-2 flex-row-reverse">
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', width: 12, textAlign: 'right' }}>R</span>
                  <CardSlots count={0} color="#FF3B3B" />
                </div>
              </div>
            </div>
          </div>

          {/* Pass Accuracy + Corner Kicks */}
          <div className="grid grid-cols-2 gap-2.5 mt-auto">
            <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 8.5, letterSpacing: '0.14em', fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 5, textTransform: 'uppercase' }}>
                Pass Accuracy
              </div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                <span style={{ color: ORANGE }}>{match.passesAccuracyHome}%</span>
                <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 3px' }}>|</span>
                <span style={{ color: CYAN }}>{match.passesAccuracyAway}%</span>
              </div>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 8.5, letterSpacing: '0.14em', fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 5, textTransform: 'uppercase' }}>
                Corner Kicks
              </div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                <span style={{ color: ORANGE }}>{match.cornersHome}</span>
                <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 3px' }}>|</span>
                <span style={{ color: CYAN }}>{match.cornersAway}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── CENTER PANEL: Score + Timer ── */}
        <div className="flex flex-col items-center justify-center gap-4 px-8 relative overflow-hidden">
          {/* Background orange/cyan glow orbs */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-48 h-48 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, rgba(255,107,0,0.12) 0%, transparent 70%)`, filter: 'blur(20px)' }} />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-48 h-48 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, rgba(0,200,255,0.12) 0%, transparent 70%)`, filter: 'blur(20px)' }} />

          {/* Timer */}
          <div
            style={{
              fontFamily: 'var(--font-anybody)', fontSize: 72, fontWeight: 900, lineHeight: 1,
              color: 'white', letterSpacing: '0.04em',
              textShadow: '0 0 60px rgba(255,255,255,0.15)',
            }}
          >
            {timerDisplay}
          </div>

          {/* Teams + Score row */}
          <div className="flex items-center w-full justify-center gap-6">

            {/* Home team */}
            <div className="flex flex-col items-center gap-3 flex-1 min-w-0">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                style={{
                  background: 'rgba(255,107,0,0.12)',
                  border: `2.5px solid ${ORANGE}`,
                  boxShadow: `0 0 35px rgba(255,107,0,0.35), inset 0 0 20px rgba(255,107,0,0.08)`,
                  fontSize: 52,
                }}
              >
                <TeamFlag team={match.homeTeam} className="w-full h-full object-cover" />
              </div>
              <span style={{
                fontFamily: 'var(--font-anybody)', fontSize: 20, fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '0.05em', textAlign: 'center', lineHeight: 1.1,
                color: 'white', textShadow: `0 0 20px rgba(255,107,0,0.3)`,
                wordBreak: 'break-word',
              }}>
                {match.homeTeam || 'HOME TEAM'}
              </span>
            </div>

            {/* Score */}
            <div className="flex items-center gap-3 shrink-0">
              <span style={{
                fontFamily: 'var(--font-anybody)', fontSize: 96, fontWeight: 900, lineHeight: 1,
                color: ORANGE, textShadow: `0 0 50px rgba(255,107,0,0.6)`,
              }}>
                {match.homeScore}
              </span>
              <span style={{
                fontFamily: 'var(--font-anybody)', fontSize: 52, fontWeight: 300,
                color: 'rgba(255,255,255,0.18)',
              }}>
                -
              </span>
              <span style={{
                fontFamily: 'var(--font-anybody)', fontSize: 96, fontWeight: 900, lineHeight: 1,
                color: 'white', textShadow: `0 0 50px rgba(0,200,255,0.35)`,
              }}>
                {match.awayScore}
              </span>
            </div>

            {/* Away team */}
            <div className="flex flex-col items-center gap-3 flex-1 min-w-0">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                style={{
                  background: 'rgba(0,200,255,0.12)',
                  border: `2.5px solid ${CYAN}`,
                  boxShadow: `0 0 35px rgba(0,200,255,0.35), inset 0 0 20px rgba(0,200,255,0.08)`,
                  fontSize: 52,
                }}
              >
                <TeamFlag team={match.awayTeam} className="w-full h-full object-cover" />
              </div>
              <span style={{
                fontFamily: 'var(--font-anybody)', fontSize: 20, fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '0.05em', textAlign: 'center', lineHeight: 1.1,
                color: CYAN, textShadow: `0 0 20px rgba(0,200,255,0.4)`,
                wordBreak: 'break-word',
              }}>
                {match.awayTeam || 'AWAY TEAM'}
              </span>
            </div>
          </div>

          {/* Match info stripe */}
          <div
            className="px-8 py-2 rounded-full flex items-center gap-3 mt-2"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }}>sports_soccer</span>
            <span style={{ fontFamily: 'var(--font-hanken)', fontSize: 11, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
              LTN BET LIVE
            </span>
            <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
            <span style={{ fontFamily: 'var(--font-hanken)', fontSize: 11, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
              LES TOILES NOIRES
            </span>
          </div>
        </div>

        {/* ── RIGHT PANEL: Leaderboard ── */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', background: 'rgba(6,10,20,0.7)' }}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <h2 style={{ fontFamily: 'var(--font-anybody)', fontSize: 16, fontWeight: 800, color: 'white', letterSpacing: '0.08em', lineHeight: 1 }}>
              LIVE LEADERBOARD
            </h2>
            <p style={{ fontSize: 10, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.38)', marginTop: 3, fontWeight: 700 }}>
              TOP 10 PLAYERS
            </p>
          </div>

          {/* Podium — Top 3 */}
          <div className="px-4 py-3 flex flex-col gap-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {top10.slice(0, 3).map((player, i) => (
              <div
                key={player.id}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2"
                style={{
                  background: i === 0 ? 'rgba(255,215,0,0.07)' : 'rgba(255,255,255,0.025)',
                  border: `1px solid ${i === 0 ? 'rgba(255,215,0,0.22)' : i === 1 ? 'rgba(192,192,192,0.15)' : 'rgba(205,127,50,0.15)'}`,
                  boxShadow: i === 0 ? MEDAL_GLOWS[0] : 'none',
                }}
              >
                {/* Medal circle */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-black"
                  style={{
                    background: MEDAL_COLORS[i],
                    color: '#000',
                    fontSize: 13,
                    boxShadow: MEDAL_GLOWS[i],
                    fontFamily: 'var(--font-anybody)',
                  }}
                >
                  {i + 1}
                </div>
                <Avatar player={player} size={28} />
                <span className="flex-1 font-bold truncate" style={{ fontSize: 13 }}>{player.username}</span>
                <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12, fontWeight: 700, color: MEDAL_COLORS[i], flexShrink: 0 }}>
                  {(player.toilesCoins + player.totalWinnings).toLocaleString()} pts
                </span>
              </div>
            ))}
          </div>

          {/* Ranked list — 4 to 10 */}
          <div className="flex-1 overflow-hidden px-3 py-3 flex flex-col gap-1.5">
            {top10.slice(3).map((player, i) => (
              <div key={player.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 11, color: 'rgba(255,255,255,0.35)', width: 18, textAlign: 'right', flexShrink: 0 }}>
                  {i + 4}.
                </span>
                <Avatar player={player} size={24} />
                <span className="flex-1 truncate" style={{ fontSize: 13, fontWeight: 600 }}>{player.username}</span>
                <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12, fontWeight: 700, color: '#7da4ff', flexShrink: 0 }}>
                  {(player.toilesCoins + player.totalWinnings).toLocaleString()} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          BOTTOM: TICKER + QR CODE
      ══════════════════════════════════════════ */}
      <div
        className="relative z-10 flex shrink-0 overflow-hidden"
        style={{ height: 68, background: 'rgba(4,8,16,0.97)', borderTop: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Breaking News label */}
        <div
          className="flex items-center px-5 shrink-0"
          style={{ background: 'rgba(255,107,0,0.14)', borderRight: `2px solid ${ORANGE}` }}
        >
          <span style={{
            fontFamily: 'var(--font-anybody)', fontSize: 11, fontWeight: 900,
            letterSpacing: '0.18em', color: ORANGE, textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>
            BREAKING NEWS
          </span>
        </div>

        {/* Scrolling ticker text */}
        <div className="flex-1 overflow-hidden relative flex items-center">
          <div className="absolute whitespace-nowrap animate-ticker flex items-center">
            {[0, 1].map(rep => (
              <span key={rep} className="flex items-center gap-16 px-8">
                {tickerEvents.length > 0 ? (
                  tickerEvents.map(evt => (
                    <span key={`${evt.id}-${rep}`} className="flex items-center gap-3">
                      <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 14, color: ORANGE, fontWeight: 700 }}>
                        {evt.title}
                      </span>
                      <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>
                        {evt.subtitle}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 20 }}>·</span>
                    </span>
                  ))
                ) : (
                  <>
                    <span className="flex items-center gap-3">
                      <span style={{ fontFamily: 'var(--font-anybody)', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: ORANGE }}>NEXT MATCH:</span>
                      <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>
                        {match.homeTeam && match.awayTeam
                          ? `${match.homeTeam.toUpperCase()} vs. ${match.awayTeam.toUpperCase()} — PARIEZ MAINTENANT!`
                          : 'REJOIGNEZ LA PARTIE EN SCANNANT LE QR CODE!'}
                      </span>
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 20px' }}>·</span>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>
                      RECEVEZ 1 000 TOILESCOINS GRATUITS EN REJOIGNANT LA PARTIE!
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 20px' }}>·</span>
                  </>
                )}
              </span>
            ))}
          </div>
          {/* Fade edges */}
          <div className="absolute left-0 top-0 w-8 h-full pointer-events-none" style={{ background: 'linear-gradient(to right, rgba(4,8,16,0.97), transparent)' }} />
          <div className="absolute right-0 top-0 w-16 h-full pointer-events-none" style={{ background: 'linear-gradient(to left, rgba(4,8,16,0.97), transparent)' }} />
        </div>

        {/* QR Code section */}
        <div
          className="flex items-center gap-3 px-4 shrink-0"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div style={{ background: 'white', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {qrUrl ? (
              <img src={qrUrl} alt="QR Code" style={{ width: 44, height: 44, display: 'block' }} />
            ) : (
              <div className="animate-pulse" style={{ width: 44, height: 44, background: '#e0e0e0', borderRadius: 4 }} />
            )}
          </div>
          <div style={{ fontSize: 8.5, letterSpacing: '0.11em', color: 'rgba(255,255,255,0.4)', fontWeight: 700, lineHeight: 1.5, textTransform: 'uppercase' }}>
            SCAN FOR<br />LIVE INTERACTION<br />&amp; BETTING
          </div>
        </div>
      </div>

      <GameEventOverlay />
    </div>
  );
}
