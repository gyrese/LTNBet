'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';

import { AVATARS, getAvatarConfig } from '@/lib/avatars';

const pickRandomAvatarId = (excludeId?: string) => {
  const pool = excludeId ? AVATARS.filter((a) => a.id !== excludeId) : AVATARS;
  return pool[Math.floor(Math.random() * pool.length)].id;
};

export default function JoinPage() {
  const router = useRouter();
  const { currentUser, registerUser } = useGameStore();
  const [username, setUsername] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0].id);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const currentAvatar = getAvatarConfig(selectedAvatar);

  // Pioche un avatar aléatoire au montage (évite un mismatch d'hydratation SSR)
  useEffect(() => {
    setSelectedAvatar(pickRandomAvatarId());
  }, []);

  const shuffleAvatar = () => setSelectedAvatar((prev) => pickRandomAvatarId(prev));

  useEffect(() => {
    if (currentUser) {
      router.push('/');
    }
  }, [currentUser, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = username.trim();
    if (!trimmed) return setError('Veuillez saisir un pseudo.');
    if (trimmed.length < 3) return setError('Le pseudo doit contenir au moins 3 caractères.');
    if (trimmed.length > 15) return setError('Le pseudo ne peut pas dépasser 15 caractères.');

    setLoading(true);
    const res = await registerUser(trimmed, selectedAvatar);
    if (!res.success) {
      setError(res.error || 'Inscription impossible, réessaie.');
      setLoading(false);
      return;
    }
    router.push('/');
  };

  return (
    <div className="min-h-dvh flex flex-col justify-center items-center px-4 py-10 relative">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mb-7 animate-float"
      >
        <Image
          src="/logoltnbet.png"
          alt="LTNBet"
          width={520}
          height={208}
          className="h-44 sm:h-52 w-auto object-contain drop-shadow-[0_0_40px_rgba(43,91,255,0.55)]"
          priority
        />
      </motion.div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="glass-strong gradient-border w-full max-w-md p-7 md:p-8 rounded-3xl relative z-10"
      >
        <div className="text-center mb-7">
          <p className="font-label-caps text-[10px] text-on-surface-variant tracking-[0.25em]">
            PRONOSTICS · BAR LES TOILES NOIRES
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Pseudo */}
          <div className="space-y-2">
            <label htmlFor="username" className="block font-label-caps text-[10px] text-on-surface-variant tracking-wider">
              CHOISISSEZ UN PSEUDO
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-[20px]">
                badge
              </span>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ex: Nostradamus92"
                autoComplete="off"
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white font-body-md placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-transparent transition-all"
              />
            </div>
            {error && (
              <p className="text-error font-data-mono text-[12px] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px]">error</span>
                {error}
              </p>
            )}
          </div>

          {/* Avatar */}
          <div className="space-y-2.5">
            <label className="block font-label-caps text-[10px] text-on-surface-variant tracking-wider">
              VOTRE AVATAR
            </label>
            <div className="flex flex-col items-center gap-3 py-1">
              <motion.div
                key={selectedAvatar}
                initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className={`w-28 h-28 rounded-full bg-gradient-to-br ${currentAvatar.color} flex items-center justify-center text-5xl overflow-hidden shadow-[inset_0_4px_12px_rgba(255,255,255,0.3),_0_12px_28px_rgba(0,0,0,0.6)] border-4 border-t-white/25 border-r-white/15 border-b-black/45 border-l-black/25 glow-accent`}
              >
                {currentAvatar.imagePath ? (
                  <img src={currentAvatar.imagePath} alt={currentAvatar.name} className="w-full h-full object-cover" />
                ) : (
                  currentAvatar.emoji
                )}
              </motion.div>

              <button
                type="button"
                onClick={shuffleAvatar}
                className="group flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 transition-all cursor-pointer font-label-caps text-[10px] text-on-surface-variant tracking-wider"
              >
                <span className="material-symbols-outlined text-[16px] transition-transform duration-300 group-hover:rotate-180 group-active:rotate-180">
                  refresh
                </span>
                ACTUALISER
              </button>
            </div>
          </div>

          {/* CTA */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full font-headline-lg-mobile text-[19px] py-3.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
          >
            <span className={`material-symbols-outlined text-[22px] ${loading ? 'animate-spin' : ''}`}>
              {loading ? 'progress_activity' : 'rocket_launch'}
            </span>
            {loading ? 'Connexion…' : 'Rejoindre la partie'}
          </button>
        </form>

        {/* Welcome bonus */}
        <div className="mt-7 text-center bg-gradient-to-r from-tertiary/12 to-transparent border border-tertiary/20 rounded-2xl p-4">
          <p className="font-data-mono text-[13px] text-tertiary flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              redeem
            </span>
            1 000 ToilesCoins offerts à l&apos;inscription
          </p>
          <p className="font-body-md text-[10px] text-on-surface-variant/50 mt-1.5">
            Application 100% ludique · Aucun argent réel en jeu
          </p>
        </div>
      </motion.div>
    </div>
  );
}
