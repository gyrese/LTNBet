'use client';

import React, { useState, useEffect } from 'react';
import { useGameStore } from '@/lib/store';
import QRCode from 'qrcode';
import { motion as motionClient } from 'framer-motion';
import GameEventOverlay from '@/components/GameEventOverlay';

import { getAvatarConfig } from '@/lib/avatars';
import { flagFor, flagUrlFor } from '@/lib/flags';

export default function ScreenPage() {
  const { match, leaderboard } = useGameStore();
  const [qrUrl, setQrUrl] = useState('');
  const [tickerEvents, setTickerEvents] = useState<any[]>([]);

  // Periodically advance the live match simulation / sync
  useEffect(() => {
    if (match.status !== 'live') return;
    const syncInterval = setInterval(async () => {
      try {
        await fetch('/api/admin/sync');
      } catch (e) {
        console.error('[Sync Poll] error:', e);
      }
    }, 15000);
    return () => clearInterval(syncInterval);
  }, [match.status]);

  // Fetch real game events for the news ticker
  useEffect(() => {
    const fetchTicker = async () => {
      try {
        const res = await fetch('/api/db?op=ticker').then(r => r.json());
        if (res.events) {
          setTickerEvents(res.events);
        }
      } catch (err) {
        console.error('Ticker fetch error', err);
      }
    };
    fetchTicker();
    const interval = setInterval(fetchTicker, 15000);
    return () => clearInterval(interval);
  }, []);

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
  const top7 = allPlayers.slice(0, 7);

  const homeFlagUrl = flagUrlFor(match.homeTeam);
  const awayFlagUrl = flagUrlFor(match.awayTeam);

  return (
    <div className="h-dvh w-screen text-on-surface overflow-hidden relative font-body-lg select-none">
      {/* Cinematic backdrop layers */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-5%,rgba(43,91,255,0.22),transparent_60%),radial-gradient(ellipse_50%_40%_at_90%_100%,rgba(255,59,71,0.1),transparent_60%),linear-gradient(180deg,#070b16,#03050a)] pointer-events-none" />

      <div className="relative w-full h-full flex flex-col max-w-[1920px] mx-auto p-6 pb-[96px] z-10">
        
        {/* Header */}
        <header className="glass-strong border border-white/10 flex justify-between items-center w-full px-8 py-3.5 rounded-2xl mb-5 shadow-2xl">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-secondary-container to-primary-container border border-white/15 shadow-[0_0_20px_rgba(43,91,255,0.35)]">
              <span className="material-symbols-outlined text-white text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                sports_soccer
              </span>
            </div>
            <span className="font-headline-lg text-[22px] italic uppercase tracking-tighter bg-gradient-to-r from-white via-primary to-white bg-clip-text text-transparent">
              Les Toiles Noires Predictor
            </span>
          </div>

          <div className="flex items-center gap-6">
            <div className="bg-error/12 border border-error/30 px-5 py-2 rounded-full flex items-center gap-2.5">
              {match.status === 'live' && <span className="live-dot animate-pulse" />}
              <span className="font-label-caps text-[12px] text-white tracking-widest uppercase font-bold">
                {match.status === 'live' ? `DIRECT · ${match.elapsedTime}'` : match.status === 'half_time' ? 'MI-TEMPS' : match.status === 'finished' ? 'TERMINÉ' : 'AVANT-MATCH'}
              </span>
            </div>
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="flex-grow grid grid-cols-12 gap-6 items-stretch overflow-hidden h-[calc(100%-80px)]">
          
          {/* LEFT SECTION (Match & Stats) - 7 cols */}
          <div className="col-span-7 flex flex-col gap-6">
            
            {/* Live Score Widget */}
            <div className="glass-strong border border-white/10 rounded-3xl p-8 flex flex-col justify-center relative overflow-hidden shadow-2xl flex-grow max-h-[45%]">
              <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-primary via-secondary-container to-error shadow-[0_0_15px_rgba(3,86,255,0.4)]" />
              
              <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-3">
                <span className="font-label-caps text-[12px] text-on-surface-variant tracking-[0.2em] font-bold">SCORE DU MATCH</span>
                <span className="font-data-mono text-[16px] text-primary font-bold">{match.elapsedTime}&apos;</span>
              </div>

              <div className="flex items-center justify-between px-6">
                {/* Home Team */}
                <div className="flex flex-col items-center gap-3.5 w-1/3">
                  <div className="w-28 h-20 rounded-2xl bg-surface-container/80 flex items-center justify-center overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.06)] border border-white/15 relative group">
                    {homeFlagUrl ? (
                      <img src={homeFlagUrl} alt={match.homeTeam} className="w-full h-full object-cover transform scale-105" />
                    ) : (
                      <span className="text-5xl">{flagFor(match.homeTeam)}</span>
                    )}
                  </div>
                  <span className="font-headline-lg text-[22px] font-bold text-white tracking-wide uppercase truncate w-full text-center">
                    {match.homeTeam || 'DOMICILE'}
                  </span>
                </div>

                {/* Score */}
                <div className="font-score-display text-[64px] flex items-center gap-4 w-1/3 justify-center select-none font-black">
                  <span className="text-primary drop-shadow-[0_0_20px_rgba(125,164,255,0.5)]">{match.homeScore}</span>
                  <span className="text-on-surface-variant/30 text-[36px] font-normal">:</span>
                  <span className="text-white">{match.awayScore}</span>
                </div>

                {/* Away Team */}
                <div className="flex flex-col items-center gap-3.5 w-1/3">
                  <div className="w-28 h-20 rounded-2xl bg-surface-container/80 flex items-center justify-center overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.06)] border border-white/15 relative group">
                    {awayFlagUrl ? (
                      <img src={awayFlagUrl} alt={match.awayTeam} className="w-full h-full object-cover transform scale-105" />
                    ) : (
                      <span className="text-5xl">{flagFor(match.awayTeam)}</span>
                    )}
                  </div>
                  <span className="font-headline-lg text-[22px] font-bold text-on-surface-variant tracking-wide uppercase truncate w-full text-center">
                    {match.awayTeam || 'EXTÉRIEUR'}
                  </span>
                </div>
              </div>
            </div>

            {/* Match Stats Widget */}
            <div className="glass-panel rounded-3xl p-6 flex flex-col justify-center shadow-2xl flex-grow max-h-[55%]">
              <h3 className="font-label-caps text-[14px] text-primary tracking-widest mb-4 border-b border-white/10 pb-2 font-bold">
                STATISTIQUES DU MATCH
              </h3>
              <div className="space-y-4">
                <ComparisonStat 
                  label="POSSESSION" 
                  leftVal={match.possessionHome} 
                  rightVal={100 - match.possessionHome} 
                  leftLabel={`${match.possessionHome}%`} 
                  rightLabel={`${100 - match.possessionHome}%`} 
                />

                <ComparisonStat 
                  label="TIRS (CADRÉS)" 
                  leftVal={match.shotsHome} 
                  rightVal={match.shotsAway} 
                  leftLabel={`${match.shotsHome} (${match.shotsOnTargetHome})`} 
                  rightLabel={`${match.shotsAway} (${match.shotsOnTargetAway})`} 
                />

                {(() => {
                  const xGHome = (match.homeScore * 0.75 + match.shotsOnTargetHome * 0.12 + (match.shotsHome - match.shotsOnTargetHome) * 0.04);
                  const xGAway = (match.awayScore * 0.75 + match.shotsOnTargetAway * 0.12 + (match.shotsAway - match.shotsOnTargetAway) * 0.04);
                  const xGHomeStr = xGHome === 0 ? "0.00" : xGHome.toFixed(2);
                  const xGAwayStr = xGAway === 0 ? "0.00" : xGAway.toFixed(2);
                  return (
                    <ComparisonStat 
                      label="EXPECTED GOALS (XG) - ESTIMÉ" 
                      leftVal={xGHome} 
                      rightVal={xGAway} 
                      leftLabel={xGHomeStr} 
                      rightLabel={xGAwayStr} 
                    />
                  );
                })()}

                <ComparisonStat 
                  label="PRÉCISION PASSES" 
                  leftVal={match.passesAccuracyHome} 
                  rightVal={match.passesAccuracyAway} 
                  leftLabel={`${match.passesAccuracyHome}%`} 
                  rightLabel={`${match.passesAccuracyAway}%`} 
                />

                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div className="bg-white/[0.02] px-3 py-2 rounded-xl border border-white/8 text-center flex flex-col justify-center">
                    <span className="block font-label-caps text-[9px] text-on-surface-variant mb-1 tracking-wider uppercase font-bold">CORNERS</span>
                    <div className="flex justify-between items-center px-1">
                      <span className="font-score-display text-[20px] text-primary font-bold">{match.cornersHome}</span>
                      <span className="text-on-surface-variant/30 text-[10px]">:</span>
                      <span className="font-score-display text-[20px] text-white font-bold">{match.cornersAway}</span>
                    </div>
                  </div>
                  
                  <div className="bg-white/[0.02] px-3 py-2 rounded-xl border border-white/8 text-center flex flex-col justify-center">
                    <span className="block font-label-caps text-[9px] text-on-surface-variant mb-1 tracking-wider uppercase font-bold">FAUTES</span>
                    <div className="flex justify-between items-center px-1">
                      <span className="font-score-display text-[20px] text-primary font-bold">{match.foulsHome}</span>
                      <span className="text-on-surface-variant/30 text-[10px]">:</span>
                      <span className="font-score-display text-[20px] text-white font-bold">{match.foulsAway}</span>
                    </div>
                  </div>

                  <div className="bg-white/[0.02] px-3 py-2 rounded-xl border border-white/8 text-center flex flex-col justify-center">
                    <span className="block font-label-caps text-[9px] text-on-surface-variant mb-1 tracking-wider uppercase font-bold">CARTONS</span>
                    <div className="flex justify-between items-center px-1">
                      <span className="font-score-display text-[20px] text-error font-bold">{match.cardsHome}</span>
                      <span className="text-on-surface-variant/30 text-[10px]">:</span>
                      <span className="font-score-display text-[20px] text-white font-bold">{match.cardsAway}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT SECTION (Leaderboard & QR Code) - 5 cols */}
          <div className="col-span-5 flex flex-col gap-6">
            
            {/* Leaderboard Card */}
            <div className="glass-panel rounded-3xl p-6 shadow-2xl flex flex-col justify-between flex-grow max-h-[62%]">
              <div>
                <h3 className="font-headline-lg text-[22px] text-primary uppercase italic tracking-tight mb-4 flex items-center gap-2.5 border-b border-white/10 pb-3">
                  <span className="material-symbols-outlined text-[26px] text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>leaderboard</span>
                  Classement Live · Top 7
                </h3>

                <div className="flex flex-col gap-2.5">
                  {top7.map((player, idx) => {
                    const avatar = getAvatarConfig(player.avatar);
                    const isPodium = idx < 3;
                    return (
                      <div
                        key={player.id}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all duration-300 ${
                          isPodium 
                            ? 'border-tertiary/20 bg-tertiary/5 shadow-[0_0_15px_rgba(233,196,0,0.03)]' 
                            : 'border-white/5 bg-white/[0.02]'
                        }`}
                      >
                        <span className={`font-score-display text-[18px] w-7 text-center tabular font-bold ${isPodium ? 'text-tertiary' : 'text-on-surface-variant/40'}`}>
                          {idx + 1}
                        </span>
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 border border-white/10 bg-gradient-to-br ${avatar.color} overflow-hidden`}>
                          {avatar.imagePath ? (
                            <img src={avatar.imagePath} alt={avatar.name} className="w-full h-full object-cover" />
                          ) : (
                            avatar.emoji
                          )}
                        </div>
                        <span className="font-body-md font-bold truncate flex-grow text-white text-[15px]">
                          {player.username} {player.badgeCount ? ` 🏅${player.badgeCount}` : ''}
                        </span>
                        <span className={`font-data-mono text-[14px] font-bold tabular ${isPodium ? 'text-tertiary' : 'text-primary'}`}>
                          {(player.toilesCoins + player.totalWinnings).toLocaleString()} TC
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* QR Code Card */}
            <div className="glass-strong border border-white/10 rounded-3xl p-6 shadow-2xl flex items-center gap-6 flex-grow max-h-[38%] relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-primary-container/20 to-transparent pointer-events-none" />
              
              <div className="bg-white p-3 rounded-2xl shadow-[0_0_30px_rgba(43,91,255,0.25)] shrink-0 flex items-center justify-center border-2 border-primary/20 relative z-10 group-hover:scale-105 transition-transform duration-300">
                {qrUrl ? (
                  <img src={qrUrl} alt="QR Code" className="w-32 h-32 object-contain" />
                ) : (
                  <div className="w-32 h-32 bg-surface-container animate-pulse rounded-xl" />
                )}
              </div>

              <div className="text-left space-y-2 relative z-10 flex-grow">
                <h2 className="font-headline-lg text-[22px] italic uppercase tracking-tighter leading-tight bg-gradient-to-r from-white to-primary bg-clip-text text-transparent font-black">
                  PRÊT À PARIER ?
                </h2>
                <p className="font-body-md text-[13px] text-on-surface-variant leading-relaxed">
                  Scannez pour rejoindre la partie, choisissez votre pseudo et recevez <strong className="text-white font-bold">1 000 ToilesCoins offerts</strong> !
                </p>
                <div className="flex items-center gap-1.5 text-primary pt-1">
                  <span className="material-symbols-outlined text-[18px]">phone_iphone</span>
                  <span className="font-label-caps text-[10px] tracking-widest font-bold">100% GRATUIT &amp; INSTANTANÉ</span>
                </div>
              </div>
            </div>

          </div>

        </div>

        <GameEventOverlay />

        {/* Ticker Bottom Banner */}
        <div className="absolute bottom-0 left-0 w-full h-[76px] glass-strong border-t border-white/10 flex items-center overflow-hidden z-50">
          <div className="h-full bg-gradient-to-r from-secondary-container to-[#1e46e0] px-8 flex items-center justify-center z-10 border-r border-white/20 shadow-[10px_0_25px_rgba(0,0,0,0.5)] shrink-0">
            <span className="font-headline-lg text-[16px] text-white uppercase italic tracking-wider font-extrabold whitespace-nowrap">
              EN DIRECT DU BAR
            </span>
          </div>

          <div className="flex-grow h-full overflow-hidden relative flex items-center">
            <div className="absolute whitespace-nowrap animate-ticker flex items-center">
              {[0, 1].map((rep) => (
                <span key={rep} className="flex items-center gap-20 px-10">
                  {tickerEvents.length > 0 ? (
                    tickerEvents.map((evt) => {
                      const icon = evt.type === 'goal' ? 'sports_soccer' : evt.type === 'badge' ? 'military_tech' : 'info';
                      const color = evt.type === 'goal' ? 'text-primary' : evt.type === 'badge' ? 'text-error' : 'text-secondary';
                      return (
                        <span key={evt.id + '-' + rep} className="flex items-center gap-3">
                          <span className={`material-symbols-outlined ${color} text-[22px]`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                          <span className="font-data-mono text-[16px] text-on-surface">
                            <span className={`font-bold ${color}`}>{evt.title}</span> {evt.subtitle}
                          </span>
                        </span>
                      );
                    })
                  ) : (
                    <>
                      <span className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-tertiary text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>monetization_on</span>
                        <span className="font-data-mono text-[16px] text-on-surface">
                          REJOIGNEZ LA PARTIE EN SCANNANT LE QR CODE ! RECEVEZ 1 000 TOILESCOINS GRATUITS.
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary text-[22px]">sports_soccer</span>
                        <span className="font-data-mono text-[16px] text-on-surface">
                          PRÉDISEZ LE SCORE DU MATCH ET GAGNEZ DES PINTES GRATUITES AU BAR !
                        </span>
                      </span>
                    </>
                  )}
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

function ComparisonStat({ label, leftVal, rightVal, leftLabel, rightLabel }: { label: string; leftVal: number; rightVal: number; leftLabel?: string; rightLabel?: string }) {
  const total = leftVal + rightVal || 1;
  const pctLeft = (leftVal / total) * 100;
  return (
    <div>
      <div className="flex justify-between font-data-mono text-[13px] text-white mb-1">
        <span className="text-primary font-bold tabular">{leftLabel ?? leftVal}</span>
        <span className="font-label-caps text-[10px] text-on-surface-variant tracking-wider font-bold">{label}</span>
        <span className="tabular text-white font-bold">{rightLabel ?? rightVal}</span>
      </div>
      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden flex border border-white/5">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pctLeft}%` }} />
        <div className="h-full bg-white/20 transition-all duration-500 flex-grow" style={{ width: `${100 - pctLeft}%` }} />
      </div>
    </div>
  );
}

function TvStat({ label, left, right, pct }: { label: string; left: string; right: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between font-data-mono text-[14px] text-white mb-1.5">
        <span className="text-primary font-bold tabular">{left}</span>
        <span className="font-label-caps text-[10px] text-on-surface-variant tracking-wider font-bold">{label}</span>
        <span className="tabular text-on-surface-variant">{right}</span>
      </div>
      <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
        <div className="h-full bg-gradient-to-r from-secondary-container to-primary rounded-full transition-all duration-500" style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}

