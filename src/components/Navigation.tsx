'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';

const NAV_ITEMS = [
  { href: '/', label: 'PARIS', icon: 'stadium' },
  { href: '/ranking', label: 'CLASSEMENT', icon: 'leaderboard' },
  { href: '/profile', label: 'PROFIL', icon: 'person' },
];

export default function Navigation() {
  const pathname = usePathname();
  const { currentUser } = useGameStore();

  if (!currentUser) return null;

  return (
    <>
      {/* ============ TOP APP BAR (desktop + tablet) ============ */}
      <header className="fixed top-0 inset-x-0 z-50">
        <div className="glass-strong border-b border-white/10 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.9)]">
          <div className="w-full max-w-container-max mx-auto flex justify-between items-center px-4 md:px-16 py-2">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center group">
                <Image
                  src="/logoltnbet.png"
                  alt="LTNBet"
                  width={200}
                  height={80}
                  className="h-14 md:h-16 w-auto object-contain drop-shadow-[0_0_14px_rgba(43,91,255,0.45)] group-hover:drop-shadow-[0_0_20px_rgba(43,91,255,0.7)] transition-all"
                  priority
                />
              </Link>
              <div className="hidden lg:flex items-center gap-1.5 font-data-mono text-[12px] text-on-surface-variant pl-4 ml-1 border-l border-white/10">
                <span className="material-symbols-outlined text-[15px] text-primary">military_tech</span>
                Rang #{currentUser.rank}
              </div>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex gap-1.5 items-center">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative font-label-caps text-label-caps tracking-widest px-4 py-2.5 rounded-xl transition-colors ${
                      isActive ? 'text-white' : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill-desktop"
                        className="absolute inset-0 rounded-xl bg-white/8 border border-primary/30 glow-accent"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Balance chip */}
            <div className="flex items-center gap-1.5 font-data-mono bg-gradient-to-b from-tertiary/15 to-tertiary/5 px-3.5 py-2 rounded-full border border-tertiary/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
              <span
                className="material-symbols-outlined text-[18px] text-tertiary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                monetization_on
              </span>
              <span className="font-bold text-tertiary tabular">{currentUser.toilesCoins.toLocaleString()}</span>
              <span className="text-tertiary/60 text-[11px]">TC</span>
            </div>
          </div>
        </div>
      </header>

      {/* ============ FLOATING BOTTOM NAV (mobile) ============ */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 pointer-events-none">
        <div className="pointer-events-auto max-w-md mx-auto glass-strong rounded-2xl border border-white/10 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.8)] flex justify-around items-center px-2 py-2">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex flex-col items-center justify-center gap-1 w-[4.5rem] py-1.5 rounded-xl"
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-pill-mobile"
                    className="absolute inset-0 rounded-xl bg-gradient-to-b from-primary/20 to-secondary-container/10 border border-primary/30"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <span
                  className={`material-symbols-outlined relative z-10 text-[24px] transition-colors ${
                    isActive ? 'text-primary' : 'text-on-surface-variant/70'
                  }`}
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : undefined }}
                >
                  {item.icon}
                </span>
                <span
                  className={`font-label-caps text-[9px] relative z-10 transition-colors ${
                    isActive ? 'text-primary' : 'text-on-surface-variant/60'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
