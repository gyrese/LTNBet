/**
 * Présence des joueurs : un joueur réel est « en ligne » si son dernier heartbeat
 * (players.last_seen) date de moins de PRESENCE_TTL_MS. Les bots du classement
 * (is_bot = 1) ne sont jamais comptés comme connectés.
 */

import db from './db';

export const PRESENCE_TTL_MS = 45_000; // 45 s sans heartbeat → hors-ligne

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** Enregistre un heartbeat pour un joueur réel. */
export function markOnline(userId: string): void {
  if (!userId) return;
  db.prepare('UPDATE players SET last_seen = ? WHERE id = ? AND is_bot = 0').run(new Date().toISOString(), userId);
}

/** Efface la présence d'un joueur (utilisé au kick / logout). */
export function clearPresence(userId: string): void {
  if (!userId) return;
  db.prepare('UPDATE players SET last_seen = NULL WHERE id = ?').run(userId);
}

function cutoffISO(): string {
  return new Date(Date.now() - PRESENCE_TTL_MS).toISOString();
}

/** Liste des joueurs réels actuellement en ligne (heartbeat récent). */
export function getOnlinePlayers(): Row[] {
  return db
    .prepare(
      `SELECT id, username, avatar, toiles_coins, total_bets, rank, last_seen
       FROM players
       WHERE is_bot = 0 AND last_seen IS NOT NULL AND last_seen >= ?
       ORDER BY last_seen DESC`,
    )
    .all(cutoffISO()) as Row[];
}

/** Nombre de joueurs réels en ligne. */
export function countOnline(): number {
  const row = db
    .prepare('SELECT COUNT(*) AS c FROM players WHERE is_bot = 0 AND last_seen IS NOT NULL AND last_seen >= ?')
    .get(cutoffISO()) as { c: number };
  return row.c;
}
