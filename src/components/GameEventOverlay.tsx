'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import confetti from 'canvas-confetti';

const EVENT_VISUALS: Record<string, { icon: string; ring: string; grad: string; glow: string; iconColor: string }> = {
  goal: {
    icon: 'sports_soccer',
    ring: 'border-secondary-container',
    grad: 'from-secondary-container to-primary-container',
    glow: 'shadow-[0_0_40px_rgba(43,91,255,0.6)]',
    iconColor: 'text-white',
  },
  jackpot: {
    icon: 'workspace_premium',
    ring: 'border-tertiary',
    grad: 'from-[#ffd97a] to-[#c79b1e]',
    glow: 'shadow-[0_0_40px_rgba(246,198,72,0.65)]',
    iconColor: 'text-[#2c2200]',
  },
  leader_change: {
    icon: 'military_tech',
    ring: 'border-tertiary',
    grad: 'from-surface-container-high to-surface-container-highest',
    glow: 'shadow-[0_0_40px_rgba(246,198,72,0.55)]',
    iconColor: 'text-tertiary',
  },
  badge: {
    icon: 'workspace_premium',
    ring: 'border-secondary',
    grad: 'from-[#9db4ff] to-[#16284f]',
    glow: 'shadow-[0_0_40px_rgba(157,180,255,0.6)]',
    iconColor: 'text-primary',
  },
  half_time: {
    icon: 'pause_circle',
    ring: 'border-primary',
    grad: 'from-secondary-container to-primary-container',
    glow: 'shadow-[0_0_40px_rgba(43,91,255,0.5)]',
    iconColor: 'text-white',
  },
  finished: {
    icon: 'flag',
    ring: 'border-error',
    grad: 'from-error/40 to-[#5c0006]',
    glow: 'shadow-[0_0_40px_rgba(255,59,71,0.5)]',
    iconColor: 'text-white',
  },
};

export default function GameEventOverlay() {
  const { activeEvent, clearActiveEvent } = useGameStore();

  useEffect(() => {
    if (!activeEvent) return;

    if (activeEvent.type === 'goal') {
      const end = Date.now() + 4 * 1000;
      const interval = setInterval(() => {
        if (Date.now() > end) {
          clearInterval(interval);
          return;
        }
        confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.8 }, colors: ['#2b5bff', '#FFFFFF', '#ff3b47'] });
        confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors: ['#2b5bff', '#FFFFFF', '#ff3b47'] });
      }, 250);
      const timeout = setTimeout(() => clearActiveEvent(), 6000);
      return () => { clearInterval(interval); clearTimeout(timeout); };
    }

    if (activeEvent.type === 'jackpot') {
      confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 }, colors: ['#ffd24a', '#FFA500', '#FFFFFF'] });
    }

    if (activeEvent.type === 'badge') {
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors: ['#f6c648', '#9db4ff'] });
    }

    const timeout = setTimeout(() => clearActiveEvent(), 6000);
    return () => clearTimeout(timeout);
  }, [activeEvent, clearActiveEvent]);

  const visual = activeEvent ? (EVENT_VISUALS[activeEvent.type] || EVENT_VISUALS.jackpot) : null;

  return (
    <AnimatePresence>
      {activeEvent && visual && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[999] flex items-center justify-center bg-[#05080f]/85 backdrop-blur-md overflow-hidden"
          onClick={clearActiveEvent}
          role="dialog"
          aria-live="assertive"
        >
          {/* Neon background glows */}
          <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
            <div className="w-[520px] h-[520px] bg-secondary-container/25 rounded-full blur-[130px] animate-pulse" />
            <div className="absolute w-[320px] h-[320px] bg-secondary-container/20 rounded-full blur-[90px] -top-10 -left-10" />
            <div className="absolute w-[320px] h-[320px] bg-error/20 rounded-full blur-[90px] -bottom-10 -right-10" />
          </div>

          <motion.div
            initial={{ scale: 0.85, y: 40 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.85, y: -40 }}
            transition={{ type: 'spring', damping: 16, stiffness: 220 }}
            className="relative z-10 text-center px-6 max-w-xl flex flex-col items-center"
          >
            <motion.div
              initial={{ rotate: -8, scale: 0.8 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', damping: 10 }}
              className={`w-28 h-28 rounded-3xl bg-gradient-to-br ${visual.grad} flex items-center justify-center border-2 ${visual.ring} ${visual.glow} mb-7`}
            >
              <span className={`material-symbols-outlined text-[64px] ${visual.iconColor}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                {visual.icon}
              </span>
            </motion.div>

            <h2 className="font-display-hero text-[36px] md:text-[56px] italic uppercase tracking-tighter bg-gradient-to-r from-white via-primary to-white bg-clip-text text-transparent drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] mb-3">
              {activeEvent.title}
            </h2>

            <p className="font-body-lg text-[18px] md:text-[22px] text-on-surface glass-strong px-6 py-3 rounded-2xl tracking-wide">
              {activeEvent.subtitle}
            </p>

            <span className="mt-8 font-label-caps text-[11px] text-on-surface-variant/50 animate-pulse cursor-pointer tracking-widest">
              Touchez pour fermer
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
