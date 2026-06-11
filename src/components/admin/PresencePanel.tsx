'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { getAvatarConfig } from '@/lib/avatars';

interface OnlinePlayer {
  id: string;
  username: string;
  avatar: string;
  toiles_coins: number;
  total_bets: number;
  rank: number;
  last_seen: string;
}

interface Props {
  onCountChange?: (count: number) => void;
}

const POLL_MS = 8_000;

// En-têtes admin : le secret vient de sessionStorage (saisi au déverrouillage), pas d'un NEXT_PUBLIC_*
// (qui serait figé au build et donc VIDE dans l'image Docker → 401). Cohérent avec le store/modal.
function adminHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const s = sessionStorage.getItem('ltn_admin_secret');
    if (s) h['x-admin-secret'] = s;
  }
  return h;
}

export default function PresencePanel({ onCountChange }: Props) {
  const [players, setPlayers] = useState<OnlinePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmKickAll, setConfirmKickAll] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/db?op=presence').then((r) => r.json());
      const list: OnlinePlayer[] = res.players || [];
      setPlayers(list);
      onCountChange?.(res.count ?? list.length);
    } catch {
      /* réseau : on garde l'état précédent */
    }
    setLoading(false);
  }, [onCountChange]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const kick = async (userId: string) => {
    await fetch('/api/db', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ op: 'kick_player', userId }),
    });
    setPlayers((prev) => prev.filter((p) => p.id !== userId));
  };

  const kickAll = async () => {
    await fetch('/api/db', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ op: 'kick_all' }),
    });
    setPlayers([]);
    setConfirmKickAll(false);
    onCountChange?.(0);
  };

  return (
    <section className="glass-panel rounded-2xl p-6 space-y-4 border border-white/8">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <h2 className="font-label-caps text-label-caps text-on-surface tracking-widest flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[18px] text-emerald-400">group</span>
          JOUEURS CONNECTÉS
          <span className="font-data-mono text-[12px] text-emerald-300 bg-emerald-500/12 border border-emerald-500/25 px-2 py-0.5 rounded-full tabular">
            {players.length}
          </span>
        </h2>
        {players.length > 0 && (
          confirmKickAll ? (
            <button
              onClick={kickAll}
              className="bg-error/30 hover:bg-error/40 border border-error/60 text-error font-label-caps text-[9px] px-3 py-1.5 rounded-lg cursor-pointer animate-pulse font-bold"
            >
              CONFIRMER
            </button>
          ) : (
            <button
              onClick={() => setConfirmKickAll(true)}
              className="bg-error/10 hover:bg-error/20 border border-error/25 text-error font-label-caps text-[9px] px-3 py-1.5 rounded-lg cursor-pointer"
            >
              TOUT DÉCONNECTER
            </button>
          )
        )}
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {loading ? (
          <p className="text-center text-[11px] text-on-surface-variant/40 py-6 font-data-mono">Chargement…</p>
        ) : players.length === 0 ? (
          <p className="text-center text-[11px] text-on-surface-variant/40 py-6 font-data-mono">
            Aucun joueur connecté pour le moment.
          </p>
        ) : (
          players.map((p) => {
            const av = getAvatarConfig(p.avatar);
            return (
              <div key={p.id} className="bg-white/[0.03] p-2.5 rounded-xl border border-white/8 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${av.color} flex items-center justify-center text-[16px] overflow-hidden shrink-0 border border-white/10`}>
                  {av.imagePath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={av.imagePath} alt={av.name} className="w-full h-full object-cover" />
                  ) : (
                    av.emoji
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block text-[13px] text-white font-bold truncate">{p.username}</span>
                  <span className="block text-[10px] font-data-mono text-on-surface-variant/60 tabular">
                    {p.toiles_coins.toLocaleString()} TC · {p.total_bets} paris
                  </span>
                </div>
                <span className="flex items-center gap-1 text-[9px] font-label-caps text-emerald-300/80 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> EN LIGNE
                </span>
                <button
                  onClick={() => kick(p.id)}
                  title="Déconnecter ce joueur"
                  className="bg-error/10 hover:bg-error/20 border border-error/25 text-error w-7 h-7 rounded-lg cursor-pointer flex items-center justify-center shrink-0"
                >
                  <span className="material-symbols-outlined text-[15px]">logout</span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
