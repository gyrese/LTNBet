'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useGameStore } from '@/lib/store';
import QRCode from 'qrcode';
import { getAvatarConfig } from '@/lib/avatars';
import { logoForTeam } from '@/lib/flags';
import TeamFlag from '@/components/TeamFlag';
import GameEventOverlay from '@/components/GameEventOverlay';
import { motion, AnimatePresence } from 'framer-motion';

const ORANGE = '#FF5000';
const CYAN = '#00C8FF';
const GOLD = '#FFB800';
const SILVER = '#C0C0C0';
const BRONZE = '#CD7F32';

const MEDAL_COLORS = [GOLD, SILVER, BRONZE];
const MEDAL_GLOWS = [
  '0 0 20px rgba(255,184,0,0.55)',
  '0 0 15px rgba(192,192,192,0.4)',
  '0 0 15px rgba(205,127,50,0.4)',
];

// --- SVG Donut for Possession ---
function PossessionDonut({ home }: { home: number }) {
  const r = 38;
  const stroke = 8;
  const size = 110;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const homeArc = (home / 100) * circumference;

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)', display: 'block', margin: '0 auto' }}
      className="drop-shadow-[0_0_12px_rgba(255,80,0,0.2)]"
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={stroke} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={CYAN}
        strokeWidth={stroke}
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={homeArc}
        strokeLinecap="round"
        className="transition-all duration-700 ease-out"
      />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={ORANGE}
        strokeWidth={stroke}
        strokeDasharray={`${homeArc} ${circumference}`}
        strokeLinecap="round"
        className="transition-all duration-700 ease-out"
      />
    </svg>
  );
}

// --- Bidirectional Comparative Stats Bar ---
function StatCompareBar({ label, homeVal, awayVal }: { label: string; homeVal: number; awayVal: number }) {
  const total = (homeVal + awayVal) || 1;
  const homePct = (homeVal / total) * 100;
  const awayPct = 100 - homePct;

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex justify-between items-center text-xs px-1">
        <span className="font-jetbrains font-bold text-home select-none">{homeVal}</span>
        <span className="font-hanken font-bold text-on-surface-variant/75 text-[10px] tracking-wider uppercase select-none">{label}</span>
        <span className="font-jetbrains font-bold text-away select-none">{awayVal}</span>
      </div>
      <div className="h-2 w-full rounded-full overflow-hidden bg-white/5 flex">
        {/* Home progress (Orange) - aligned right */}
        <div className="h-full flex-1 flex justify-end bg-white/0">
          <div 
            className="h-full rounded-l-full bg-gradient-to-l from-home to-[#FF8000]/60 transition-all duration-700 ease-out" 
            style={{ width: `${homePct}%` }} 
          />
        </div>
        {/* Center line separator */}
        <div className="w-0.5 h-full bg-white/20 shrink-0" />
        {/* Away progress (Blue) - aligned left */}
        <div className="h-full flex-1 flex justify-start bg-white/0">
          <div 
            className="h-full rounded-r-full bg-gradient-to-r from-away to-[#00C8FF]/60 transition-all duration-700 ease-out" 
            style={{ width: `${awayPct}%` }} 
          />
        </div>
      </div>
    </div>
  );
}

// --- Cards Visualizer ---
function CardsVisualizer({ yellow, red, align }: { yellow: number; red: number; align: 'left' | 'right' }) {
  return (
    <div className={`flex gap-2.5 ${align === 'right' ? 'flex-row-reverse' : ''} items-center`}>
      {/* Yellow Cards */}
      <div className="flex gap-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={`yellow-${i}`}
            className={`w-[12px] h-[18px] rounded-[3px] border transition-all duration-500 ${
              i < yellow
                ? 'bg-yellow-400 border-yellow-300 shadow-[0_0_8px_rgba(250,204,21,0.5)]'
                : 'bg-white/5 border-white/10'
            }`}
          />
        ))}
      </div>
      {/* Red Cards (currently mocked at 0 but supported in layout) */}
      <div className="flex gap-1">
        {Array.from({ length: 1 }).map((_, i) => (
          <div
            key={`red-${i}`}
            className={`w-[12px] h-[18px] rounded-[3px] border transition-all duration-500 ${
              i < red
                ? 'bg-red-500 border-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse'
                : 'bg-white/5 border-white/10'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// --- Leaderboard Avatar Cell ---
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
  const { match, leaderboard, teamLogos } = useGameStore();
  const [qrUrl, setQrUrl] = useState('');
  const [tickerEvents, setTickerEvents] = useState<{ id: string; type: string; title: string; subtitle: string; timestamp?: number }[]>([]);
  const [secs, setSecs] = useState(0);
  const [localTime, setLocalTime] = useState('');

  // Tab rotation between soirée (ce match) and compétition (cumul CdM)
  const [boardMode, setBoardMode] = useState<'soiree' | 'competition'>('soiree');
  const ROTATION_TIME = 20; // rotation delay in seconds
  const [timeLeft, setTimeLeft] = useState(ROTATION_TIME);

  // Rotation trigger & progress
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setBoardMode((curr) => (curr === 'soiree' ? 'competition' : 'soiree'));
          return ROTATION_TIME;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync poll — pilote tout le déroulé automatique (coup d'envoi → mi-temps → 2e période → fin).
  // Tourne dès qu'un match est actif et non terminé (y compris « avant-match »).
  useEffect(() => {
    if (!match.id || match.status === 'finished') return;
    const id = setInterval(() => fetch('/api/admin/sync').catch(() => {}), 15000);
    return () => clearInterval(id);
  }, [match.id, match.status]);

  // Load ticker events
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

  // Current Local Time Clock
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setLocalTime(
        d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const id = setInterval(updateTime, 1000);
    return () => clearInterval(id);
  }, []);

  // QR Code generation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    QRCode.toDataURL(`${window.location.origin}/join`, {
      margin: 1, 
      width: 200, 
      color: { dark: '#0A0A1E', light: '#ffffff' },
    }).then(setQrUrl).catch(() => {});
  }, []);

  // Client-side seconds ticker
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
      .sort((a, b) =>
        boardMode === 'competition'
          ? (b.tournamentTotal + b.toilesCoins) - (a.tournamentTotal + a.toilesCoins)
          : b.toilesCoins - a.toilesCoins,
      )
      .slice(0, 10),
    [leaderboard, boardMode],
  );

  const isGeneral = boardMode === 'competition';
  const boardScore = (p: { toilesCoins: number; tournamentTotal: number }) =>
    isGeneral ? p.tournamentTotal + p.toilesCoins : p.toilesCoins;

  const possHome = match.possessionHome ?? 50;

  const timerDisplay = match.status === 'live'
    ? `${String(match.elapsedTime).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : match.status === 'half_time' ? 'MI-TEMPS'
    : match.status === 'finished' ? 'TERMINÉ'
    : '--:--';

  const statusBadge = match.status === 'live'
    ? { label: 'DIRECT', bg: 'rgba(255,80,0,0.14)', border: 'rgba(255,80,0,0.4)', color: '#FF5000' }
    : match.status === 'half_time'
    ? { label: 'PAUSE', bg: 'rgba(255,184,0,0.12)', border: 'rgba(255,184,0,0.4)', color: GOLD }
    : match.status === 'finished'
    ? { label: 'MATCH TERMINÉ', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }
    : { label: 'AVANT-MATCH', bg: 'rgba(123,97,255,0.06)', border: 'rgba(123,97,255,0.15)', color: 'rgba(123,97,255,0.6)' };

  return (
    <div
      className="h-dvh w-screen overflow-hidden flex flex-col select-none relative"
      style={{ background: '#07071a', color: '#F0F0FF', fontFamily: 'var(--font-hanken)' }}
    >
      {/* Stadium splitting glowing gradients */}
      <div className="absolute inset-0 z-0 pointer-events-none" style={{
        background: `
          radial-gradient(ellipse 75% 55% at 50% -10%, rgba(123,97,255,0.16) 0%, transparent 60%),
          radial-gradient(ellipse 45% 45% at 0% 50%, rgba(255,80,0,0.15) 0%, transparent 55%),
          radial-gradient(ellipse 45% 45% at 100% 50%, rgba(26,143,255,0.15) 0%, transparent 55%),
          radial-gradient(ellipse 70% 50% at 50% 115%, rgba(123,97,255,0.12) 0%, transparent 60%),
          linear-gradient(180deg, #0a0a22 0%, #07071a 100%)
        `
      }} />

      {/* Cyber HUD scanlines overlay */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.02] scanline-effect" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #ffffff 2px, #ffffff 3px)',
        backgroundSize: '100% 3px',
      }} />

      {/* ══════════════════════════════════════════
          HEADER BAR
      ══════════════════════════════════════════ */}
      <header
        className="relative z-10 flex items-center justify-between px-6 shrink-0"
        style={{ height: 60, background: 'rgba(7,7,26,0.85)', borderBottom: '1px solid rgba(123,97,255,0.15)', backdropFilter: 'blur(10px)' }}
      >
        {/* Left: status badge & elapsed time */}
        <div className="flex items-center gap-4 w-1/4">
          <div
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border"
            style={{ background: statusBadge.bg, borderColor: statusBadge.border }}
          >
            {match.status === 'live' && (
              <div className="w-2.5 h-2.5 rounded-full bg-home animate-pulse shadow-[0_0_8px_#FF5000]" />
            )}
            <span className="font-anybody text-xs font-bold tracking-[0.15em] select-none" style={{ color: statusBadge.color }}>
              {statusBadge.label}
            </span>
          </div>
          {match.status === 'live' && (
            <span className="font-jetbrains text-xs text-on-surface-variant/70 tracking-widest tabular select-none">
              ⏱️ {match.elapsedTime}&apos;
            </span>
          )}
        </div>

        {/* Center: LTNBet logo */}
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center leading-none">
          <div className="font-anybody font-black select-none tracking-tight leading-none">
            <span className="text-2xl text-white text-glow-violet">LTN</span>
            <span className="text-2xl text-home text-glow-home">Bet</span>
          </div>
          <span className="font-hanken text-[8px] font-bold tracking-[0.35em] text-white/30 uppercase mt-0.5 select-none">
            LIVE STADIUM BROADCAST
          </span>
        </div>

        {/* Right: local clock & venue */}
        <div className="flex items-center justify-end gap-5 w-1/4 select-none">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[15px] text-white/30">schedule</span>
            <span className="font-jetbrains text-xs text-white/60 tracking-wider tabular">{localTime}</span>
          </div>
          <div className="flex items-center gap-1.5 border-l border-white/10 pl-4">
            <span className="material-symbols-outlined text-[15px] text-white/30">stadium</span>
            <span className="font-hanken text-[10px] text-white/40 tracking-wider uppercase font-bold">
              LES TOILES NOIRES
            </span>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════
          MAIN GRID — 3 columns
      ══════════════════════════════════════════ */}
      <main className="relative z-10 flex-1 grid grid-cols-[330px_1fr_340px] gap-6 p-6 min-h-0">

        {/* ── LEFT PANEL: Live Match Stats ── */}
        <section
          className="flex flex-col gap-4 overflow-hidden p-5 rounded-2xl glass-panel relative"
        >
          <div className="absolute -top-12 -left-12 w-36 h-36 rounded-full pointer-events-none blur-3xl"
            style={{ background: 'rgba(255,80,0,0.08)' }} />

          <h2 className="font-label-caps text-xs text-white/60 tracking-widest flex items-center gap-2 border-b border-white/5 pb-2 select-none">
            <span className="material-symbols-outlined text-[16px] text-home">analytics</span>
            STATISTIQUES LIVE
          </h2>

          {/* Possession ring */}
          <div className="flex flex-col items-center gap-4 py-2 border-b border-white/5 relative">
            <div className="relative flex items-center justify-center w-full">
              <div className="flex items-center justify-between w-full px-4">
                <div className="flex flex-col items-start select-none">
                  <span className="font-anybody text-3xl font-black text-home">{possHome}%</span>
                  <span className="font-hanken text-[9px] text-white/40 font-bold uppercase tracking-wider">DOMICILE</span>
                </div>
                <div className="relative shrink-0 select-none">
                  <PossessionDonut home={possHome} />
                  <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <span className="material-symbols-outlined text-[20px] text-white/20">sports_soccer</span>
                  </div>
                </div>
                <div className="flex flex-col items-end select-none">
                  <span className="font-anybody text-3xl font-black text-away">{100 - possHome}%</span>
                  <span className="font-hanken text-[9px] text-white/40 font-bold uppercase tracking-wider">EXTÉRIEUR</span>
                </div>
              </div>
            </div>
            <div className="font-hanken text-[10px] tracking-widest text-white/40 uppercase font-bold select-none">
              POSSESSION DE BALLE
            </div>
          </div>

          {/* Core Stats Lists */}
          <div className="flex-1 flex flex-col gap-4 justify-around py-1">
            <StatCompareBar label="TIRS CADRÉS" homeVal={match.shotsOnTargetHome} awayVal={match.shotsOnTargetAway} />
            <StatCompareBar label="TIRS TOTAL" homeVal={match.shotsHome} awayVal={match.shotsAway} />
            <StatCompareBar label="CORNER KICKS" homeVal={match.cornersHome} awayVal={match.cornersAway} />
            <StatCompareBar label="FAUTES COMMISES" homeVal={match.foulsHome} awayVal={match.foulsAway} />

            {/* Pass Accuracy */}
            <div className="flex flex-col gap-1 w-full">
              <div className="flex justify-between items-center text-xs px-1 select-none">
                <span className="font-jetbrains font-bold text-home">{match.passesAccuracyHome}%</span>
                <span className="font-hanken font-bold text-on-surface-variant/75 text-[10px] tracking-wider uppercase">PRÉCISION PASSES</span>
                <span className="font-jetbrains font-bold text-away">{match.passesAccuracyAway}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/5 flex overflow-hidden">
                <div className="h-full bg-gradient-to-r from-home/40 to-home transition-all duration-700 ease-out rounded-l-full" style={{ width: `${match.passesAccuracyHome / 2}%` }} />
                <div className="w-0.5 h-full bg-white/10 shrink-0" />
                <div className="h-full bg-gradient-to-l from-away/40 to-away transition-all duration-700 ease-out rounded-r-full ml-auto" style={{ width: `${match.passesAccuracyAway / 2}%` }} />
              </div>
            </div>
          </div>

          {/* Cards Visualizer row */}
          <div className="flex justify-between items-center py-2 border-t border-white/5 mt-auto select-none">
            <div className="flex flex-col gap-1.5 items-start">
              <span className="font-hanken text-[9px] text-white/40 font-bold uppercase tracking-wider">Cartons Dom.</span>
              <CardsVisualizer yellow={match.cardsHome} red={0} align="left" />
            </div>
            <span className="material-symbols-outlined text-[18px] text-white/20">style</span>
            <div className="flex flex-col gap-1.5 items-end">
              <span className="font-hanken text-[9px] text-white/40 font-bold uppercase tracking-wider">Cartons Ext.</span>
              <CardsVisualizer yellow={match.cardsAway} red={0} align="right" />
            </div>
          </div>
        </section>

        {/* ── CENTER PANEL: Scoreboard + Events Feed + QR ── */}
        <section className="flex flex-col gap-6 overflow-hidden min-h-0">
          
          {/* Main Scoreboard Widget */}
          <div className="glass-panel p-6 rounded-2xl flex flex-col items-center relative overflow-hidden shrink-0">
            {/* Glowing background highlights */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-40 h-40 rounded-full pointer-events-none blur-3xl"
              style={{ background: `radial-gradient(circle, rgba(255,80,0,0.07) 0%, transparent 70%)` }} />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-40 h-40 rounded-full pointer-events-none blur-3xl"
              style={{ background: `radial-gradient(circle, rgba(26,143,255,0.07) 0%, transparent 70%)` }} />

            <div className="font-anybody text-6xl font-black text-white tracking-[0.05em] select-none text-shadow-violet leading-none mb-4">
              {timerDisplay}
            </div>

            {/* Flag - Score - Flag Row */}
            <div className="flex items-center w-full justify-center gap-6 relative select-none">
              
              {/* Home Team */}
              <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                <div
                  className="w-22 h-22 rounded-full flex items-center justify-center shrink-0 overflow-hidden border-2 bg-gradient-to-br from-home/15 to-transparent shadow-[0_0_25px_rgba(255,80,0,0.25)]"
                  style={{ borderColor: ORANGE }}
                >
                  <TeamFlag team={match.homeTeam} logoUrl={logoForTeam(match.homeTeam, teamLogos)} className="w-full h-full object-cover" />
                </div>
                <span className="font-anybody text-lg font-black text-white text-center tracking-wider truncate w-full">
                  {match.homeTeam || 'DOMICILE'}
                </span>
              </div>

              {/* Huge Live Score digits */}
              <div className="flex items-center gap-4 shrink-0 px-2">
                <span className="font-anybody text-7xl font-black leading-none text-glow-home text-home">
                  {match.homeScore}
                </span>
                <span className="font-anybody text-3xl font-light text-white/20 select-none">-</span>
                <span className="font-anybody text-7xl font-black leading-none text-glow-blue text-away">
                  {match.awayScore}
                </span>
              </div>

              {/* Away Team */}
              <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                <div
                  className="w-22 h-22 rounded-full flex items-center justify-center shrink-0 overflow-hidden border-2 bg-gradient-to-br from-away/15 to-transparent shadow-[0_0_25px_rgba(26,143,255,0.25)]"
                  style={{ borderColor: CYAN }}
                >
                  <TeamFlag team={match.awayTeam} logoUrl={logoForTeam(match.awayTeam, teamLogos)} className="w-full h-full object-cover" />
                </div>
                <span className="font-anybody text-lg font-black text-away text-center tracking-wider truncate w-full">
                  {match.awayTeam || 'EXTÉRIEUR'}
                </span>
              </div>

            </div>

            {/* Live scorer lists — liste exacte tenue à jour depuis l'API (nom + minute) */}
            {match.scorers.length > 0 && (
              <div className="w-full max-w-lg mt-5 grid grid-cols-2 gap-4 text-xs font-data-mono text-white/50 border-t border-white/5 pt-3 select-none">
                {/* Home scorers */}
                <div className="text-right space-y-1 pr-3 border-r border-white/5">
                  {match.scorers
                    .filter(s => s.team === 'home')
                    .map((s, i) => (
                      <div key={`h-${i}-${s.playerName}-${s.minute}`} className="flex items-center justify-end gap-1.5">
                        <span className="text-[10px] text-white/30 font-jetbrains">⏱️ {s.minute || 0}&apos;</span>
                        <span className="font-bold text-white/80">{s.playerName}</span>
                        <span className="material-symbols-outlined text-[13px] text-home select-none">sports_soccer</span>
                      </div>
                    ))}
                </div>
                {/* Away scorers */}
                <div className="text-left space-y-1 pl-3">
                  {match.scorers
                    .filter(s => s.team === 'away')
                    .map((s, i) => (
                      <div key={`a-${i}-${s.playerName}-${s.minute}`} className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[13px] text-away select-none">sports_soccer</span>
                        <span className="font-bold text-white/80">{s.playerName}</span>
                        <span className="text-[10px] text-white/30 font-jetbrains">⏱️ {s.minute || 0}&apos;</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Live Events Feed Log */}
          <div className="flex-1 w-full bg-[#0a0a24]/30 border border-white/5 rounded-2xl p-4 overflow-hidden flex flex-col gap-3 relative min-h-0">
            <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full pointer-events-none blur-3xl"
              style={{ background: 'rgba(123,97,255,0.05)' }} />

            <div className="font-label-caps text-[10px] text-white/40 tracking-wider flex items-center gap-2 border-b border-white/5 pb-2 shrink-0 select-none">
              <span className="material-symbols-outlined text-[14px] text-primary">feed</span>
              JOURNAL D&apos;ÉVÉNEMENTS EN DIRECT
            </div>
            
            <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1.5 custom-scrollbar">
              <AnimatePresence initial={false}>
                {tickerEvents.slice(0, 5).map((evt) => {
                  let icon = 'info';
                  let iconColor = 'text-white/60';
                  let bgColor = 'bg-white/5';
                  let borderGlow = 'border-white/10';

                  if (evt.type === 'goal') {
                    icon = 'sports_soccer';
                    iconColor = 'text-home';
                    bgColor = 'bg-home/10';
                    borderGlow = 'border-home/20 shadow-[0_0_10px_rgba(255,80,0,0.15)]';
                  } else if (evt.type === 'leader_change') {
                    icon = 'military_tech';
                    iconColor = 'text-tertiary';
                    bgColor = 'bg-tertiary/10';
                    borderGlow = 'border-tertiary/20 shadow-[0_0_10px_rgba(255,184,0,0.15)]';
                  } else if (evt.type === 'jackpot') {
                    icon = 'workspace_premium';
                    iconColor = 'text-tertiary';
                    bgColor = 'bg-tertiary/15 animate-pulse';
                    borderGlow = 'border-tertiary/30 shadow-[0_0_15px_rgba(255,184,0,0.25)]';
                  } else if (evt.type === 'flash_market') {
                    icon = 'bolt';
                    iconColor = 'text-primary';
                    bgColor = 'bg-primary/10';
                    borderGlow = 'border-primary/20 shadow-[0_0_10px_rgba(123,97,255,0.15)]';
                  } else if (evt.type === 'finished') {
                    icon = 'sports_score';
                    iconColor = 'text-white';
                    bgColor = 'bg-white/10';
                    borderGlow = 'border-white/25';
                  }

                  return (
                    <motion.div
                      key={evt.id}
                      initial={{ opacity: 0, x: -15, y: -5 }}
                      animate={{ opacity: 1, x: 0, y: 0 }}
                      exit={{ opacity: 0, x: 15 }}
                      transition={{ duration: 0.35, ease: 'easeOut' }}
                      className={`flex items-center gap-3.5 p-3 rounded-xl border ${bgColor} ${borderGlow}`}
                    >
                      <div className="w-8.5 h-8.5 rounded-lg flex items-center justify-center shrink-0 bg-black/40 border border-white/5 select-none">
                        <span className={`material-symbols-outlined text-[18px] ${iconColor}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                          {icon}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-xs font-bold truncate leading-snug">{evt.title}</div>
                        <div className="text-white/60 text-[11px] truncate leading-normal mt-0.5">{evt.subtitle}</div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {tickerEvents.length === 0 && (
                <div className="flex-grow flex flex-col items-center justify-center text-center text-white/20 py-12 gap-2 select-none">
                  <span className="material-symbols-outlined text-[32px] opacity-30">sensors</span>
                  <span className="text-xs">En attente d&apos;actions de match...</span>
                </div>
              )}
            </div>
          </div>

          {/* Interactive QR Code scan panel */}
          <div className="glass-panel p-4 rounded-2xl flex items-center justify-between gap-5 relative overflow-hidden shrink-0">
            <div className="absolute -top-12 -right-12 w-28 h-28 rounded-full pointer-events-none blur-3xl"
              style={{ background: 'rgba(123,97,255,0.06)' }} />
            
            <div className="flex items-center gap-4 select-none">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>qr_code_scanner</span>
              </div>
              <div>
                <h3 className="text-white text-xs font-black uppercase tracking-wider leading-none">REJOINDRE LA PARTIE</h3>
                <p className="text-white/45 text-[10px] tracking-wide mt-1 leading-snug max-w-[210px]">
                  Scannez le QR Code pour vous connecter, placer vos pronostics en direct et remporter des boissons gratuites !
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="h-6 w-[1px] bg-white/10" />
              <div className="bg-white p-1 rounded-xl shadow-[0_0_15px_rgba(255,255,255,0.15)] flex items-center justify-center shrink-0">
                {qrUrl ? (
                  <img src={qrUrl} alt="QR Code" className="w-13 h-13 block" />
                ) : (
                  <div className="animate-pulse w-13 h-13 bg-white/10 rounded-lg" />
                )}
              </div>
            </div>
          </div>

        </section>

        {/* ── RIGHT PANEL: Tipsters Rankings Podium & List ── */}
        <section
          className="flex flex-col overflow-hidden rounded-2xl glass-panel relative"
        >
          <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full pointer-events-none blur-3xl"
            style={{ background: 'rgba(255,184,0,0.08)' }} />

          {/* Section Header */}
          <div className="px-5 pt-5 pb-3 shrink-0 flex items-center justify-between border-b border-white/5 select-none">
            <div className="flex flex-col">
              <div className="font-anybody text-sm font-black tracking-wider text-white">
                {isGeneral ? 'CLASSEMENT GÉNÉRAL' : 'CLASSEMENT SOIRÉE'}
              </div>
              <span className="font-hanken text-[9px] text-white/40 tracking-wider uppercase font-extrabold mt-0.5">
                {isGeneral ? 'CUMUL COUPE DU MONDE' : 'TOP 10 · CE MATCH'}
              </span>
            </div>
            
            <div className="flex items-center gap-1.5 bg-[#0a0a24]/50 border border-white/5 px-2.5 py-1.5 rounded-full shrink-0">
              <span className="material-symbols-outlined text-[12px] text-tertiary animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>
                workspace_premium
              </span>
              <span className="font-jetbrains text-[10px] text-tertiary font-bold tabular">
                {timeLeft}s
              </span>
            </div>
          </div>

          {/* Podium - Top 3 */}
          <div className="px-4 py-3 flex items-end justify-center gap-1 select-none h-44 pb-1 shrink-0 border-b border-white/5 bg-[#0a0a24]/10">
            {/* 2nd place */}
            {top10[1] && (
              <div className="flex flex-col items-center flex-1 min-w-0">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-[#C0C0C0]/10 blur-md" />
                  <div className="relative w-13 h-13 rounded-full border border-[#C0C0C0]/40 p-0.5 overflow-hidden bg-surface-container shadow-[0_0_12px_rgba(192,192,192,0.15)]">
                    <Avatar player={top10[1]} size={46} />
                  </div>
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-[#C0C0C0] text-[#07071a] font-anybody font-black text-[10px] w-4.5 h-4.5 rounded-full flex items-center justify-center border border-[#07071a]">
                    2
                  </div>
                </div>
                <span className="font-hanken font-bold text-[11px] truncate w-full text-center mt-2 text-white/90">
                  {top10[1].username}
                </span>
                <span className="font-jetbrains font-bold text-[10px] text-[#C0C0C0] mt-0.5">
                  {boardScore(top10[1]).toLocaleString()}
                </span>
                {/* Stand Column */}
                <div className="w-full h-8 mt-1.5 rounded-t-lg bg-gradient-to-b from-white/10 to-transparent border-t border-white/10" />
              </div>
            )}

            {/* 1st place */}
            {top10[0] && (
              <div className="flex flex-col items-center flex-1 min-w-0 z-10">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-tertiary/20 blur-lg animate-pulse" />
                  {/* Miniature Floating Crown */}
                  <span className="absolute -top-4.5 left-1/2 -translate-x-1/2 material-symbols-outlined text-tertiary text-[18px] drop-shadow-[0_0_6px_rgba(255,184,0,0.5)] animate-bounce select-none" style={{ fontVariationSettings: "'FILL' 1" }}>
                    crown
                  </span>
                  <div className="relative w-16 h-16 rounded-full border-2 border-tertiary p-0.5 overflow-hidden bg-surface-container-high shadow-[0_0_18px_rgba(255,184,0,0.25)]">
                    <Avatar player={top10[0]} size={58} />
                  </div>
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-tertiary text-[#07071a] font-anybody font-black text-xs w-5 h-5 rounded-full flex items-center justify-center border border-[#07071a]">
                    1
                  </div>
                </div>
                <span className="font-hanken font-black text-xs truncate w-full text-center mt-2 text-tertiary">
                  {top10[0].username}
                </span>
                <span className="font-jetbrains font-black text-[11px] text-white mt-0.5">
                  {boardScore(top10[0]).toLocaleString()}
                </span>
                {/* Stand Column */}
                <div className="w-full h-13 mt-1.5 rounded-t-lg bg-gradient-to-b from-tertiary/20 to-transparent border-t-2 border-tertiary/30" />
              </div>
            )}

            {/* 3rd place */}
            {top10[2] && (
              <div className="flex flex-col items-center flex-1 min-w-0">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-[#CD7F32]/5 blur-sm" />
                  <div className="relative w-11 h-11 rounded-full border border-[#CD7F32]/40 p-0.5 overflow-hidden bg-surface-container">
                    <Avatar player={top10[2]} size={38} />
                  </div>
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-[#CD7F32] text-[#07071a] font-anybody font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center border border-[#07071a]">
                    3
                  </div>
                </div>
                <span className="font-hanken font-bold text-[11px] truncate w-full text-center mt-2 text-white/80">
                  {top10[2].username}
                </span>
                <span className="font-jetbrains font-bold text-[10px] text-[#CD7F32] mt-0.5">
                  {boardScore(top10[2]).toLocaleString()}
                </span>
                {/* Stand Column */}
                <div className="w-full h-5 mt-1.5 rounded-t-lg bg-gradient-to-b from-white/5 to-transparent border-t border-white/5" />
              </div>
            )}
          </div>

          {/* List 4-10 */}
          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 min-h-0 custom-scrollbar select-none">
            <AnimatePresence mode="wait">
              <motion.div
                key={boardMode}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col gap-2 w-full"
              >
                {top10.slice(3).map((player, idx) => {
                  const rank = idx + 4;
                  return (
                    <div 
                      key={player.id} 
                      className="flex items-center gap-3.5 px-3 py-2 rounded-xl border border-white/[0.03] bg-white/[0.01] hover:bg-white/[0.03] transition-all"
                    >
                      <span className="font-jetbrains text-xs font-bold text-white/30 w-5 text-right shrink-0">
                        {rank}.
                      </span>
                      <Avatar player={player} size={24} />
                      <span className="flex-1 truncate font-hanken text-xs font-bold text-white/85">
                        {player.username}
                      </span>
                      
                      {/* Rank shift indicator */}
                      <div className="flex items-center w-5 justify-center shrink-0">
                        {player.rankChange === 'up' && (
                          <span className="material-symbols-outlined text-[#10B981] text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                            arrow_drop_up
                          </span>
                        )}
                        {player.rankChange === 'down' && (
                          <span className="material-symbols-outlined text-[#EF4444] text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                            arrow_drop_down
                          </span>
                        )}
                        {player.rankChange === 'same' && (
                          <span className="text-white/20 text-xs font-bold leading-none select-none">•</span>
                        )}
                      </div>

                      <span className="font-jetbrains text-xs font-black text-[#7da4ff] w-16 text-right shrink-0">
                        {boardScore(player).toLocaleString()} pts
                      </span>
                    </div>
                  );
                })}

                {top10.length <= 3 && (
                  <div className="text-center text-white/20 text-xs py-8">
                    En attente de participants pour le classement...
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Time rotation loading bar */}
          <div className="h-1 w-full bg-white/5 mt-auto relative shrink-0">
            <div 
              className="h-full bg-gradient-to-r from-primary via-tertiary to-primary transition-all duration-1000 linear"
              style={{ width: `${(timeLeft / ROTATION_TIME) * 100}%` }}
            />
          </div>
        </section>

      </main>

      {/* ══════════════════════════════════════════
          BOTTOM: TICKER
      ══════════════════════════════════════════ */}
      <div
        className="relative z-10 flex shrink-0 overflow-hidden select-none"
        style={{ height: 68, background: 'rgba(7,7,26,0.95)', borderTop: '1px solid rgba(123,97,255,0.15)' }}
      >
        {/* News label */}
        <div
          className="flex items-center px-6 shrink-0 relative overflow-hidden"
          style={{ background: 'rgba(255,80,0,0.12)', borderRight: `2px solid ${ORANGE}` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-home/10 to-transparent pointer-events-none" />
          <span className="font-anybody text-sm font-black tracking-widest text-home relative z-10 leading-none">
            BREAKING NEWS
          </span>
        </div>

        {/* Scrolling text */}
        <div className="flex-1 overflow-hidden relative flex items-center">
          <div className="absolute whitespace-nowrap animate-ticker flex items-center">
            {[0, 1].map(rep => (
              <span key={rep} className="flex items-center gap-16 px-8 select-none">
                {tickerEvents.length > 0 ? (
                  tickerEvents.map(evt => (
                    <span key={`${evt.id}-${rep}`} className="flex items-center gap-3">
                      <span className="font-anybody text-xs text-home font-bold tracking-wider uppercase">
                        {evt.title}
                      </span>
                      <span className="font-hanken text-xs text-white/80">
                        {evt.subtitle}
                      </span>
                      <span className="text-white/15 text-lg font-bold select-none">·</span>
                    </span>
                  ))
                ) : (
                  <>
                    <span className="flex items-center gap-3">
                      <span className="font-anybody text-xs text-home font-bold tracking-wider uppercase">MATCH EN DIRECT :</span>
                      <span className="font-hanken text-xs text-white/80">
                        {match.homeTeam && match.awayTeam
                          ? `${match.homeTeam.toUpperCase()} vs. ${match.awayTeam.toUpperCase()} — FAITES VOS PARIS SUR VOTRE COMPTE !`
                          : 'REJOIGNEZ LA PARTIE EN SCANNANT LE CODE QR !'}
                      </span>
                    </span>
                    <span className="text-white/15 text-lg font-bold select-none">·</span>
                    <span className="font-hanken text-xs text-white/80">
                      Gagnez 1 000 ToilesCoins d&apos;accueil lors de votre inscription !
                    </span>
                    <span className="text-white/15 text-lg font-bold select-none">·</span>
                  </>
                )}
              </span>
            ))}
          </div>
          {/* Edge Faders */}
          <div className="absolute left-0 top-0 w-8 h-full pointer-events-none" style={{ background: 'linear-gradient(to right, rgba(7,7,26,0.95), transparent)' }} />
          <div className="absolute right-0 top-0 w-16 h-full pointer-events-none" style={{ background: 'linear-gradient(to left, rgba(7,7,26,0.95), transparent)' }} />
        </div>
      </div>

      <GameEventOverlay />
    </div>
  );
}
