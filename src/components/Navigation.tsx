'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';

const NAV_ITEMS = [
  { href: '/', label: 'PARIS', icon: 'stadium' },
  { href: '/history', label: 'MES PARIS', icon: 'history' },
  { href: '/ranking', label: 'CLASSEMENT', icon: 'leaderboard' },
  { href: '/profile', label: 'PROFIL', icon: 'person' },
];

export default function Navigation() {
  const pathname = usePathname();
  const { currentUser } = useGameStore();

  if (!currentUser) return null;

  return (
    <>
      {/* ============ TOP APP BAR ============ */}
      <header className="fixed top-0 inset-x-0 z-50">
        <div
          className="border-b shadow-[0_8px_32px_-16px_rgba(0,0,0,0.9)]"
          style={{
            background: 'linear-gradient(180deg, rgba(14,14,44,0.97) 0%, rgba(10,10,30,0.95) 100%)',
            borderColor: 'rgba(123,97,255,0.18)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          <div className="w-full max-w-container-max mx-auto flex justify-between items-center px-4 md:px-16 py-2">

            {/* Brand */}
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center group">
                <Image
                  src="/logoltnbet.png"
                  alt="LTNBet"
                  width={200}
                  height={80}
                  className="h-14 md:h-16 w-auto object-contain transition-all"
                  style={{
                    filter: 'drop-shadow(0 0 14px rgba(123,97,255,0.50))',
                  }}
                  priority
                />
              </Link>
              <div className="hidden lg:flex items-center gap-1.5 font-data-mono text-[12px] text-on-surface-variant pl-4 ml-1 border-l border-white/10">
                <span className="material-symbols-outlined text-[15px] text-primary">military_tech</span>
                Rang #{currentUser.rank}
              </div>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex gap-1 items-center">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative font-label-caps text-[11px] tracking-widest px-4 py-2.5 rounded-xl transition-colors ${
                      isActive ? 'text-white' : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill-desktop"
                        className="absolute inset-0 rounded-xl border border-primary/45"
                        style={{
                          background: 'linear-gradient(180deg, rgba(123,97,255,0.22) 0%, rgba(123,97,255,0.05) 100%)',
                          boxShadow: '0 0 18px rgba(123,97,255,0.22)',
                        }}
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Balance chip — orange energy */}
            <div
              className="flex items-center gap-1.5 font-data-mono px-3.5 py-2 rounded-full border"
              style={{
                background: 'linear-gradient(180deg, rgba(255,80,0,0.18) 0%, rgba(255,80,0,0.06) 100%)',
                borderColor: 'rgba(255,80,0,0.28)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 0 16px rgba(255,80,0,0.14)',
              }}
            >
              <span
                className="material-symbols-outlined text-[18px] text-home"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                monetization_on
              </span>
              <span className="font-bold text-home tabular">{currentUser.toilesCoins.toLocaleString()}</span>
              <span className="text-[11px] text-home/60">TC</span>
            </div>
          </div>
        </div>
      </header>

      {/* ============ FLOATING BOTTOM NAV (mobile) ============ */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 pointer-events-none">
        <div
          className="pointer-events-auto max-w-md mx-auto rounded-2xl flex justify-around items-center px-2 py-2"
          style={{
            background: 'linear-gradient(160deg, rgba(20,20,60,0.97) 0%, rgba(10,10,30,0.99) 100%)',
            border: '1px solid rgba(123,97,255,0.20)',
            boxShadow: '0 -4px 30px -8px rgba(123,97,255,0.22), 0 -20px 40px -20px rgba(0,0,0,0.9)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
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
                    className="absolute inset-0 rounded-xl border border-primary/45"
                    style={{
                      background: 'linear-gradient(180deg, rgba(123,97,255,0.26) 0%, rgba(123,97,255,0.06) 100%)',
                      boxShadow: '0 0 16px rgba(123,97,255,0.20)',
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <span
                  className={`material-symbols-outlined relative z-10 text-[24px] transition-colors ${
                    isActive ? 'text-primary' : 'text-on-surface-variant/60'
                  }`}
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : undefined }}
                >
                  {item.icon}
                </span>
                <span
                  className={`font-label-caps text-[9px] relative z-10 transition-colors ${
                    isActive ? 'text-primary' : 'text-on-surface-variant/50'
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
