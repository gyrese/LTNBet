'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';
import Navigation from '@/components/Navigation';
import GameEventOverlay from '@/components/GameEventOverlay';

function useIsClient() {
  return useSyncExternalStore(() => () => {}, () => true, () => false);
}

export default function HistoryPage() {
  const router = useRouter();
  const { currentUser, myBets } = useGameStore();
  const isClient = useIsClient();

  useEffect(() => {
    if (!isClient) return;
    if (!currentUser) {
      router.push('/join');
    }
  }, [isClient, currentUser, router]);

  if (!isClient || !currentUser) return null;

  return (
    <div className="min-h-dvh flex flex-col text-on-surface pb-28 md:pb-12 pt-24">
      <Navigation />
      <GameEventOverlay />

      <main className="grow w-full max-w-container-max mx-auto px-4 md:px-16 py-6 space-y-6">
        <motion.section 
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-4 max-w-3xl mx-auto"
        >
          <div className="flex items-center gap-3 border-b border-white/10 pb-4">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[26px]">history</span>
            </div>
            <div>
              <span className="block font-label-caps text-[9px] text-primary tracking-widest">SUIVI DES PRONOSTICS</span>
              <h1 className="font-headline-lg italic uppercase text-white text-[24px] md:text-[30px] leading-tight">
                Mes Paris
              </h1>
            </div>
          </div>

          {/* Bento quick stats inside history */}
          <div className="grid grid-cols-3 gap-3 bg-white/[0.02] border border-white/6 rounded-2xl p-4">
            <div className="text-center">
              <span className="block font-label-caps text-[9px] text-on-surface-variant mb-1">TOTAL PARIS</span>
              <span className="font-data-mono font-bold text-white text-base tabular">{myBets.length}</span>
            </div>
            <div className="text-center border-x border-white/10">
              <span className="block font-label-caps text-[9px] text-on-surface-variant mb-1">PARIS GAGNÉS</span>
              <span className="font-data-mono font-bold text-emerald-400 text-base tabular">
                {myBets.filter(b => b.status === 'won').length}
              </span>
            </div>
            <div className="text-center">
              <span className="block font-label-caps text-[9px] text-on-surface-variant mb-1">EN ATTENTE</span>
              <span className="font-data-mono font-bold text-primary text-base tabular">
                {myBets.filter(b => b.status === 'pending').length}
              </span>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            {myBets.length > 0 ? (
              myBets.map((bet, idx) => (
                <motion.div
                  key={bet.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                  className="glass-panel rounded-2xl p-4 flex items-center justify-between transition-colors hover:bg-white/[0.02]"
                  style={{
                    borderLeft: `3px solid ${
                      bet.status === 'won' ? '#00D48F' : bet.status === 'lost' ? '#FF3B47' : '#7B61FF'
                    }`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-white/10"
                      style={{
                        background:
                          bet.status === 'won'
                            ? 'rgba(0,212,143,0.10)'
                            : bet.status === 'lost'
                            ? 'rgba(255,59,71,0.10)'
                            : 'rgba(123,97,255,0.10)',
                        color:
                          bet.status === 'won'
                            ? '#00D48F'
                            : bet.status === 'lost'
                            ? '#FF3B47'
                            : '#7B61FF',
                      }}
                    >
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

                  <div className="text-right shrink-0">
                    {bet.status === 'won' ? (
                      <>
                        <p className="font-data-mono font-bold text-sm md:text-base tabular" style={{ color: '#00D48F' }}>
                          +{bet.payout} TC
                        </p>
                        <span
                          className="inline-block px-2 py-0.5 rounded-full font-label-caps text-[9px] mt-1 font-bold"
                          style={{
                            background: 'rgba(0,212,143,0.12)',
                            color: '#00D48F',
                          }}
                        >
                          GAGNÉ
                        </span>
                      </>
                    ) : bet.status === 'lost' ? (
                      <>
                        <p className="font-data-mono text-error font-bold text-sm md:text-base tabular">-{bet.amount} TC</p>
                        <span
                          className="inline-block px-2 py-0.5 rounded-full font-label-caps text-[9px] mt-1 font-bold"
                          style={{
                            background: 'rgba(255,59,71,0.12)',
                            color: '#FF3B47',
                          }}
                        >
                          PERDU
                        </span>
                      </>
                    ) : (
                      <>
                        <p className="font-data-mono text-primary font-bold text-sm md:text-base tabular">{bet.amount} TC</p>
                        <span
                          className="inline-block px-2 py-0.5 rounded-full font-label-caps text-[9px] mt-1 font-bold"
                          style={{
                            background: 'rgba(123,97,255,0.12)',
                            color: '#9278FF',
                          }}
                        >
                          EN ATTENTE
                        </span>
                      </>
                    )}
                  </div>
                </motion.div>
              ))
            ) : (
              <div
                className="text-center py-14 text-on-surface-variant/40 font-body-md glass-panel rounded-2xl flex flex-col items-center gap-2"
              >
                <span className="material-symbols-outlined text-[40px] opacity-30">sports_soccer</span>
                Aucun pari enregistré pour le moment.
              </div>
            )}
          </div>
        </motion.section>
      </main>
    </div>
  );
}
