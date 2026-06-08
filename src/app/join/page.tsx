'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useGameStore } from '@/lib/store';

import { AVATARS } from '@/lib/avatars';

export default function JoinPage() {
  const router = useRouter();
  const { currentUser, registerUser } = useGameStore();
  const [username, setUsername] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0].id);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    await registerUser(trimmed, selectedAvatar);
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

          {/* Avatars */}
          <div className="space-y-2.5">
            <label className="block font-label-caps text-[10px] text-on-surface-variant tracking-wider">
              SÉLECTIONNEZ VOTRE AVATAR
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {AVATARS.map((avatar) => {
                const isSelected = selectedAvatar === avatar.id;
                return (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => setSelectedAvatar(avatar.id)}
                    aria-pressed={isSelected}
                    aria-label={avatar.name}
                    className={`relative flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'border-primary/60 bg-primary/10 glow-accent -translate-y-0.5'
                        : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-[0_0_10px_rgba(125,164,255,0.7)]">
                        <span className="material-symbols-outlined text-on-primary text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                          check
                        </span>
                      </span>
                    )}
                    <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatar.color} flex items-center justify-center text-2xl shadow-inner mb-2 border border-white/10 overflow-hidden`}>
                      {avatar.imagePath ? (
                        <img src={avatar.imagePath} alt={avatar.name} className="w-full h-full object-cover" />
                      ) : (
                        avatar.emoji
                      )}
                    </div>
                    <span className="font-label-caps text-[8px] text-center text-on-surface-variant truncate w-full tracking-wide">
                      {avatar.name}
                    </span>
                  </button>
                );
              })}
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
