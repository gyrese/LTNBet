import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db, { suspendImpossibleOutcomes, awardEarnedBadges, progressExactScoreMission } from '@/lib/db';
import { broadcast } from '@/lib/sse-bus';
import { calculateDynamicOdds } from '@/lib/odds';
import { triggerWebhooks } from '@/lib/webhooks';
import { getParsedOdds } from '@/lib/odds-provider';
import { buildSessionBlueprint, type BlueprintMarket } from '@/lib/session-blueprint';
import { getOnlinePlayers, countOnline, clearPresence, getActiveLeaderboardPlayers } from '@/lib/presence';
import { resolveHalftimeMarkets, resolveFulltimeMarkets } from '@/lib/resolve';

const ARCHIVE_DIR = path.join(process.cwd(), 'data', 'archives');
const CLOSE_AFTER_MS = 30 * 60 * 1000; // 30 min après la fin du match

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// Match actuellement actif (lancé par l'hôte et non clôturé). undefined si aucun.
function getActiveMatchRow(): Row | undefined {
  return db.prepare('SELECT * FROM matches WHERE is_active = 1 AND session_closed = 0 LIMIT 1').get() as Row | undefined;
}

function getActiveMatchId(): string {
  // Uniquement le match ACTIF. Pas de repli sur le dernier match archivé : sinon une page admin
  // restée ouverte après clôture modifierait silencieusement un match terminé (AV-7).
  const row = getActiveMatchRow();
  return row ? (row.id as string) : '';
}

// Construit l'archive JSON complète d'un match (résultats + paris + classement) et l'écrit sur disque.
function archiveMatch(matchId: string): string | null {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as Row | undefined;
  if (!match) return null;

  const marketsRaw = db.prepare('SELECT * FROM markets WHERE match_id = ? ORDER BY created_at').all(matchId) as Row[];
  const markets = marketsRaw.map(m => ({
    ...m,
    outcomes: db.prepare('SELECT * FROM outcomes WHERE market_id = ?').all(m.id),
  }));
  const bets = db.prepare(`
    SELECT b.*, p.username, p.avatar
    FROM bets b LEFT JOIN players p ON b.user_id = p.id
    WHERE b.match_id = ? ORDER BY b.created_at
  `).all(matchId) as Row[];
  const leaderboard = db.prepare(`
    SELECT id, username, avatar, is_bot, toiles_coins, total_winnings, successful_bets, total_bets, rank
    FROM players ORDER BY (toiles_coins + total_winnings) DESC
  `).all() as Row[];

  const archive = {
    archivedAt: new Date().toISOString(),
    match,
    summary: {
      score: `${match.home_team} ${match.home_score}-${match.away_score} ${match.away_team}`,
      totalBets: bets.length,
      totalStaked: bets.reduce((s, b) => s + (b.amount as number), 0),
      totalPaidOut: bets.reduce((s, b) => s + (b.payout as number), 0),
      players: leaderboard.filter(p => p.is_bot === 0).length,
    },
    markets,
    bets,
    leaderboard,
  };

  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const file = `${matchId}-${Date.now()}.json`;
  fs.writeFileSync(path.join(ARCHIVE_DIR, file), JSON.stringify(archive, null, 2), 'utf8');
  return file;
}

// Clôture la session : archive le match, verrouille les paris, retire le match de l'affichage actif.
function closeAndArchive(matchId: string): string | null {
  const m = db.prepare('SELECT finished_at FROM matches WHERE id = ?').get(matchId) as Row | undefined;
  if (m && !m.finished_at) {
    db.prepare('UPDATE matches SET finished_at = ? WHERE id = ?').run(new Date().toISOString(), matchId);
  }
  const file = archiveMatch(matchId);
  db.prepare("UPDATE matches SET session_closed = 1, is_active = 0, status = 'finished' WHERE id = ?").run(matchId);
  return file;
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

// ─── GET /api/db?op=<operation> ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const op = req.nextUrl.searchParams.get('op');

  if (op === 'state') {
    let match = getActiveMatchRow();

    // Auto-fermeture : 30 min après la fin du match, on archive et on clôture la session.
    if (match && match.status === 'finished' && match.finished_at) {
      const elapsed = Date.now() - new Date(match.finished_at).getTime();
      if (elapsed > CLOSE_AFTER_MS) {
        const file = closeAndArchive(match.id);
        broadcast('session_closed', { matchId: match.id, archive: file });
        match = undefined;
      }
    }

    const markets = match
      ? (db.prepare('SELECT * FROM markets WHERE match_id = ? ORDER BY created_at').all(match.id) as Record<string, unknown>[]).map(m => ({
          ...m,
          outcomes: db.prepare('SELECT * FROM outcomes WHERE market_id = ?').all(m.id as string),
        }))
      : [];
    // Return active players (bots + online/betting users) sorted by rank with badge count
    const bots = getActiveLeaderboardPlayers(getActiveMatchId());
    const settings = match ? db.prepare('SELECT * FROM game_settings WHERE match_id = ?').get(match.id) : null;
    const rewards = db.prepare('SELECT * FROM rewards').all();
    const rewardLedger = db.prepare('SELECT * FROM reward_ledger ORDER BY created_at DESC').all();

    return json({ match: match ?? null, markets, bots, settings, rewards, rewardLedger });
  }

  // Liste des archives (matchs clôturés) consultables
  if (op === 'archives') {
    if (!fs.existsSync(ARCHIVE_DIR)) return json({ archives: [] });
    const archives = fs.readdirSync(ARCHIVE_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(ARCHIVE_DIR, f), 'utf8'));
          return { file: f, archivedAt: data.archivedAt, summary: data.summary, match: data.summary?.score };
        } catch { return null; }
      })
      .filter(Boolean)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => String(b.archivedAt).localeCompare(String(a.archivedAt)));
    return json({ archives });
  }

  // Détail d'une archive
  if (op === 'archive') {
    const file = path.basename(req.nextUrl.searchParams.get('file') || ''); // basename → anti path-traversal
    const fp = path.join(ARCHIVE_DIR, file);
    if (!file || !fs.existsSync(fp)) return json({ error: 'Archive introuvable.' }, 404);
    return json(JSON.parse(fs.readFileSync(fp, 'utf8')));
  }

  if (op === 'player') {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return json({ error: 'missing id' }, 400);
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
    if (!player) return json({ player: null }, 200);
    const bets = db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY created_at DESC').all(id);

    // Initialize player missions if empty
    const playerMissionsCount = db.prepare('SELECT COUNT(*) as count FROM player_missions WHERE player_id = ?').get(id) as { count: number };
    if (playerMissionsCount.count === 0) {
      const allMissions = db.prepare('SELECT id FROM missions').all() as { id: string }[];
      const insPlayerMission = db.prepare('INSERT OR IGNORE INTO player_missions (player_id, mission_id, progress, is_completed) VALUES (?, ?, 0, 0)');
      for (const m of allMissions) {
        insPlayerMission.run(id, m.id);
      }
    }

    const badges = db.prepare('SELECT badge_code FROM player_badges WHERE player_id = ?').all(id).map((r: any) => r.badge_code);
    const missions = db.prepare(`
      SELECT pm.progress, pm.is_completed, m.id, m.title, m.description, m.reward_coins, m.reward_badge_code, m.type, m.target 
      FROM player_missions pm 
      JOIN missions m ON pm.mission_id = m.id 
      WHERE pm.player_id = ?
    `).all(id).map((m: any) => ({
      ...m,
      isCompleted: Boolean(m.is_completed),
      rewardBadgeCode: m.reward_badge_code || undefined
    }));

    return json({ player, bets, badges, missions });
  }

  if (op === 'ticker') {
    const events = db.prepare('SELECT * FROM game_events ORDER BY created_at DESC LIMIT 10').all();
    return json({ events });
  }

  // Présence : joueurs réels actuellement connectés (heartbeat récent), pour le panel admin.
  if (op === 'presence') {
    return json({ players: getOnlinePlayers(), count: countOnline() });
  }

  return json({ error: 'unknown op' }, 400);
}

// ─── POST /api/db ─────────────────────────────────────────────────────────────

// Ops réservées à l'admin (staff du bar). Les ops joueur (register, place_bet,
// update_mission_progress, update_leaderboard) ne sont PAS dans cette liste.
const ADMIN_OPS = new Set([
  'create_session', 'preview_session', 'resolve_market', 'update_match', 'end_match',
  'close_session', 'delete_session', 'reset_all', 'create_flash_market', 'close_market',
  'delete_market', 'toggle_double_gains', 'attribute_reward', 'create_reward', 'claim_reward',
  'kick_player', 'kick_all', 'game_event',
]);

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body;

  // Secret admin partagé. Tant qu'il n'est PAS défini en env, on ne bloque rien (compat / anti-lockout).
  // Le mot de passe historique 'toiles2024' sert de repli pour le déverrouillage si l'env est absent.
  const ADMIN_SECRET = process.env.ADMIN_API_SECRET;

  // Déverrouillage admin : valide le secret saisi (feedback immédiat côté gate).
  if (op === 'admin_check') {
    const expected = ADMIN_SECRET || 'toiles2024';
    const ok = req.headers.get('x-admin-secret') === expected;
    return json({ success: ok }, ok ? 200 : 401);
  }

  // Garde des ops sensibles (actif uniquement si ADMIN_API_SECRET est défini).
  if (ADMIN_SECRET && ADMIN_OPS.has(op) && req.headers.get('x-admin-secret') !== ADMIN_SECRET) {
    return json({ success: false, error: 'Accès admin requis.' }, 401);
  }

  // ── Register player (or login if exists) ──
  if (op === 'register') {
    const { username, avatar, deviceToken } = body;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingPlayer = db.prepare('SELECT * FROM players WHERE username = ?').get(username) as any;
    if (existingPlayer) {
      const stored = existingPlayer.device_token as string | null;
      if (!stored) {
        // Compte historique sans jeton : le premier navigateur qui revient l'adopte.
        const token = deviceToken || crypto.randomUUID();
        db.prepare('UPDATE players SET avatar = ?, device_token = ? WHERE id = ?').run(avatar, token, existingPlayer.id);
        const player = db.prepare('SELECT * FROM players WHERE id = ?').get(existingPlayer.id);
        broadcast('player_update', player);
        return json({ player, deviceToken: token });
      }
      if (deviceToken && stored === deviceToken) {
        // Reprise de session depuis le MÊME appareil → autorisée.
        db.prepare('UPDATE players SET avatar = ? WHERE id = ?').run(avatar, existingPlayer.id);
        const player = db.prepare('SELECT * FROM players WHERE id = ?').get(existingPlayer.id);
        broadcast('player_update', player);
        return json({ player, deviceToken: stored });
      }
      // Pseudo déjà pris par un autre appareil → refus (empêche le vol de compte/solde).
      return json({ taken: true, error: 'Ce pseudo est déjà utilisé. Choisis-en un autre.' }, 409);
    }

    const id = 'user-' + crypto.randomUUID().slice(0, 8);
    const newToken = deviceToken || crypto.randomUUID();
    db.prepare(`INSERT INTO players (id,username,avatar,toiles_coins,total_winnings,successful_bets,total_bets,rank,rank_change,is_bot,device_token) VALUES (?,?,?,1000,0,0,0,99,'same',0,?)`)
      .run(id, username, avatar, newToken);

    // Initialize player missions
    const allMissions = db.prepare('SELECT id FROM missions').all() as { id: string }[];
    const insPlayerMission = db.prepare('INSERT OR IGNORE INTO player_missions (player_id, mission_id, progress, is_completed) VALUES (?, ?, 0, 0)');
    for (const m of allMissions) {
      insPlayerMission.run(id, m.id);
    }

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
    broadcast('player_update', player);
    return json({ player, deviceToken: newToken });
  }

  // ── Place bet ──
  if (op === 'place_bet') {
    const { userId, marketId, outcomeId, amount } = body;

    // Verrou de session : pas de pari si aucun match actif, match terminé ou session clôturée.
    const activeMatch = getActiveMatchRow();
    if (!activeMatch) return json({ success: false, error: 'Aucun match en cours.' });
    if (activeMatch.session_closed) return json({ success: false, error: 'La session est fermée.' });
    if (activeMatch.status === 'finished') return json({ success: false, error: 'Le match est terminé, les paris sont fermés.' });

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(userId) as Record<string, number> | undefined;
    if (!player) return json({ success: false, error: 'Joueur introuvable.' });
    if (player.toiles_coins < amount) return json({ success: false, error: 'ToilesCoins insuffisants.' });

    const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(marketId) as Record<string, unknown> | undefined;
    if (!market || !market.is_active || market.is_closed) return json({ success: false, error: 'Pari fermé.' });
    // Pari flash : fenêtre de 5 min (closes_at). Passé ce délai, on refuse (l'admin peut aussi le geler).
    if (market.is_flash && market.closes_at && new Date(market.closes_at as string).getTime() < Date.now())
      return json({ success: false, error: 'Pari flash expiré.' });

    const outcome = db.prepare('SELECT * FROM outcomes WHERE id = ?').get(outcomeId) as Record<string, unknown> | undefined;
    if (!outcome) return json({ success: false, error: 'Option introuvable.' });
    // Garde-fou serveur : une issue suspendue (cote ramenée à 0 par suspendImpossibleOutcomes) est refusée.
    if (Number(outcome.current_odds) <= 1) return json({ success: false, error: 'Cote indisponible (issue suspendue).' });

    const betId = 'bet-' + crypto.randomUUID().slice(0, 8);
    db.prepare(`INSERT INTO bets (id,user_id,match_id,market_id,market_title,outcome_id,outcome_name,amount,odds_at_bet,status,payout) VALUES (?,?,?,?,?,?,?,?,?,'pending',0)`)
      .run(betId, userId, getActiveMatchId(), marketId, market.title, outcomeId, outcome.name, amount, outcome.current_odds);

    db.prepare('UPDATE players SET toiles_coins = toiles_coins - ?, total_bets = total_bets + 1 WHERE id = ?').run(amount, userId);
    db.prepare('UPDATE outcomes SET total_bet_amount = total_bet_amount + ?, total_bets_count = total_bets_count + 1 WHERE id = ?').run(amount, outcomeId);

    // Recalculate dynamic odds
    const allOutcomes = db.prepare('SELECT * FROM outcomes WHERE market_id = ?').all(marketId) as { id: string; total_bet_amount: number; total_bets_count: number; base_odds: number }[];
    const calc = calculateDynamicOdds(allOutcomes.map(o => ({ id: o.id, baseOdds: o.base_odds, currentOdds: o.base_odds, totalBetAmount: o.total_bet_amount, totalBetsCount: o.total_bets_count })));
    for (const c of calc) db.prepare('UPDATE outcomes SET current_odds = ? WHERE id = ?').run(c.odds, c.id);

    const updatedPlayer = db.prepare('SELECT * FROM players WHERE id = ?').get(userId);
    const updatedOutcomes = db.prepare('SELECT * FROM outcomes WHERE market_id = ?').all(marketId);
    broadcast('player_update', updatedPlayer);
    broadcast('outcomes_update', { marketId, outcomes: updatedOutcomes });

    return json({ success: true, bet: db.prepare('SELECT * FROM bets WHERE id = ?').get(betId) });
  }

  // ── Resolve market ──
  if (op === 'resolve_market') {
    const { marketId, outcomeId } = body;
    db.prepare('UPDATE markets SET is_closed = 1, resolved_outcome_id = ? WHERE id = ?').run(outcomeId, marketId);

    const pendingBets = db.prepare(`SELECT * FROM bets WHERE market_id = ? AND status = 'pending'`).all(marketId) as Record<string, unknown>[];
    const settings = db.prepare('SELECT * FROM game_settings WHERE match_id = ?').get(getActiveMatchId()) as { double_gains_active: number } | undefined;
    const doubleGains = settings?.double_gains_active === 1;

    for (const bet of pendingBets) {
      if (bet.outcome_id === outcomeId) {
        const mult = doubleGains ? (bet.odds_at_bet as number) * 2 : (bet.odds_at_bet as number);
        const payout = Math.round((bet.amount as number) * mult);
        db.prepare(`UPDATE bets SET status = 'won', payout = ? WHERE id = ?`).run(payout, bet.id);
        db.prepare('UPDATE players SET toiles_coins = toiles_coins + ?, total_winnings = total_winnings + ?, successful_bets = successful_bets + 1 WHERE id = ?').run(payout, payout, bet.user_id);
      } else {
        db.prepare(`UPDATE bets SET status = 'lost', payout = 0 WHERE id = ?`).run(bet.id);
      }
    }

    const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(marketId);
    const allOutcomes = db.prepare('SELECT * FROM outcomes WHERE market_id = ?').all(marketId);
    broadcast('market_update', { ...market as object, outcomes: allOutcomes });

    // Broadcast player updates
    for (const bet of pendingBets) {
      const p = db.prepare('SELECT * FROM players WHERE id = ?').get(bet.user_id);
      if (p) broadcast('player_update', p);
    }

    // Attribution des badges aux gagnants (Oracle Bleu, Visionnaire, Roi des Buteurs, Nostradamus).
    const winnerIds = new Set(pendingBets.filter(b => b.outcome_id === outcomeId).map(b => b.user_id as string));
    for (const uid of winnerIds) {
      const newBadges = awardEarnedBadges(uid);
      if (!newBadges.length) continue;
      const pl = db.prepare('SELECT username FROM players WHERE id = ?').get(uid) as { username: string } | undefined;
      for (const code of newBadges) {
        const bd = db.prepare('SELECT title FROM badges WHERE code = ?').get(code) as { title: string } | undefined;
        const subtitle = `${pl?.username || 'Un joueur'} débloque « ${bd?.title || code} » !`;
        db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'badge', ?, ?)`)
          .run(`ge-badge-${uid}-${code}-${Date.now()}`, getActiveMatchId(), 'NOUVEAU BADGE ! 🏅', subtitle);
        broadcast('game_event', { type: 'badge', title: 'NOUVEAU BADGE ! 🏅', subtitle });
      }
      broadcast('player_update', db.prepare('SELECT * FROM players WHERE id = ?').get(uid));
    }

    // Mission « score exact » (cosmétique) : complétée pour les gagnants de ce marché.
    if ((market as { type?: string } | undefined)?.type === 'exact_score') {
      for (const uid of winnerIds) progressExactScoreMission(uid);
    }

    // Recalculate ranking & broadcast leaderboard
    const players = db.prepare('SELECT * FROM players ORDER BY (toiles_coins + total_winnings) DESC').all() as any[];
    const updRank = db.prepare('UPDATE players SET rank = ?, rank_change = ? WHERE id = ?');
    players.forEach((p, i) => {
      const newRank = i + 1;
      const oldRank = p.rank || 99;
      const change = newRank < oldRank ? 'up' : newRank > oldRank ? 'down' : 'same';
      updRank.run(newRank, change, p.id);
    });
    const updatedLeaderboard = getActiveLeaderboardPlayers(getActiveMatchId());
    broadcast('leaderboard_update', updatedLeaderboard);

    return json({ success: true });
  }

  // ── Update match ──
  if (op === 'update_match') {
    const { stats } = body;
    const activeMatchId = getActiveMatchId();
    if (!activeMatchId) return json({ success: false, error: 'Aucun match actif.' });
    // Whitelist stricte des colonnes (les NOMS viennent du client → jamais interpolés sans contrôle).
    const ALLOWED_MATCH_COLS = new Set([
      'home_score', 'away_score', 'status', 'elapsed_time', 'possession_home',
      'shots_on_target_home', 'corners_home', 'cards_home', 'shots_home', 'shots_away',
      'shots_on_target_away', 'corners_away', 'cards_away', 'fouls_home', 'fouls_away',
      'passes_accuracy_home', 'passes_accuracy_away',
    ]);
    const entries = Object.entries(stats as Record<string, unknown>).filter(([k]) => ALLOWED_MATCH_COLS.has(k));
    if (!entries.length) return json({ success: false, error: 'Aucune colonne valide à mettre à jour.' });
    const cols = entries.map(([k]) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE matches SET ${cols} WHERE id = ?`).run(...entries.map(([, v]) => v), activeMatchId);

    // Fin de match : on horodate finished_at (une seule fois) → déclenche le verrou des paris + le compte à rebours de 30 min.
    if (stats.status === 'finished') {
      db.prepare('UPDATE matches SET finished_at = COALESCE(finished_at, ?) WHERE id = ?').run(new Date().toISOString(), activeMatchId);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(activeMatchId) as any;
    if (match) {
      suspendImpossibleOutcomes(match.id, match.home_score, match.away_score);
    }

    // Résolution AUTO des paris quand l'admin bascule le statut à la main (Mi-temps / Terminé).
    // Le « Premier Buteur » reste manuel (le système ne connaît pas la Vedette qui a marqué).
    if (match && stats.status === 'half_time') {
      resolveHalftimeMarkets(match.id, match.home_team, match.away_team, match.home_score, match.away_score, true);
    } else if (match && stats.status === 'finished') {
      const corners = (match.corners_home as number) ?? 0;
      resolveFulltimeMarkets(match.id, match.home_team, match.away_team, match.home_score, match.away_score, corners, corners > 0);
    }

    // Trigger webhooks
    if (stats.status) {
      triggerWebhooks('match.status_change', { status: stats.status, time_elapsed: match.elapsed_time });
      if (stats.status === 'finished') {
        triggerWebhooks('match.finished', match);
      }
    }

    broadcast('match_update', match);
    return json({ success: true, match });
  }

  // ── Terminer le match (verrouille les paris, garde les résultats visibles) ──
  if (op === 'end_match') {
    const activeMatchId = getActiveMatchId();
    if (!activeMatchId) return json({ success: false, error: 'Aucun match actif.' });
    db.prepare("UPDATE matches SET status = 'finished', finished_at = COALESCE(finished_at, ?) WHERE id = ?").run(new Date().toISOString(), activeMatchId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(activeMatchId) as any;
    // Résolution auto des marchés de fin (résultat, score, BTTS, +2.5, corners). Buteur = manuel.
    if (match) {
      const corners = (match.corners_home as number) ?? 0;
      resolveFulltimeMarkets(match.id, match.home_team, match.away_team, match.home_score, match.away_score, corners, corners > 0);
    }
    triggerWebhooks('match.finished', match);
    broadcast('match_update', match);
    return json({ success: true, match });
  }

  // ── Fermer la session : archive JSON + verrouillage définitif ──
  if (op === 'close_session') {
    const activeMatchId = body.matchId || getActiveMatchId();
    if (!activeMatchId) return json({ success: false, error: 'Aucun match à fermer.' });
    const file = closeAndArchive(activeMatchId);
    broadcast('session_closed', { matchId: activeMatchId, archive: file });
    return json({ success: true, archive: file });
  }

  // ── Exclure un joueur précis (kick) : déconnexion forcée ciblée ──
  if (op === 'kick_player') {
    const { userId } = body;
    if (!userId) return json({ success: false, error: 'Joueur manquant.' });
    clearPresence(userId);
    broadcast('force_logout', { userId });
    return json({ success: true });
  }

  // ── Déconnecter tous les joueurs (sans fermer la session) ──
  if (op === 'kick_all') {
    db.prepare('UPDATE players SET last_seen = NULL WHERE is_bot = 0').run();
    broadcast('force_logout', { all: true });
    return json({ success: true });
  }

  // ── Supprimer la session : efface toute donnée liée à ce match ──
  if (op === 'delete_session') {
    const matchId = body.matchId || getActiveMatchId();
    if (!matchId) return json({ success: false, error: 'Aucun match à supprimer.' });

    const deleteSession = db.transaction(() => {
      const oldMarkets = db.prepare('SELECT id FROM markets WHERE match_id = ?').all(matchId) as { id: string }[];
      for (const m of oldMarkets) {
        db.prepare('DELETE FROM outcomes WHERE market_id = ?').run(m.id);
      }
      db.prepare('DELETE FROM markets WHERE match_id = ?').run(matchId);
      db.prepare('DELETE FROM bets WHERE match_id = ?').run(matchId);
      db.prepare('DELETE FROM game_events WHERE match_id = ?').run(matchId);
      db.prepare('DELETE FROM game_settings WHERE match_id = ?').run(matchId);
      db.prepare('DELETE FROM matches WHERE id = ?').run(matchId);
    });

    deleteSession();
    broadcast('session_reset', { match: null, markets: [] });
    return json({ success: true });
  }

  // ── Réinitialiser : efface tout (matchs, marchés, paris, joueurs réels) pour repartir propre ──
  if (op === 'reset_all') {
    const reset = db.transaction(() => {
      db.prepare('DELETE FROM bets').run();
      db.prepare('DELETE FROM outcomes').run();
      db.prepare('DELETE FROM markets').run();
      db.prepare('DELETE FROM game_events').run();
      db.prepare('DELETE FROM game_settings').run();
      db.prepare('DELETE FROM matches').run();
      db.prepare('DELETE FROM player_missions').run();
      db.prepare('DELETE FROM player_badges').run();
      db.prepare('DELETE FROM reward_ledger').run();
      // On retire les joueurs réels ; les bots du classement restent.
      db.prepare('DELETE FROM players WHERE is_bot = 0').run();
    });
    reset();
    broadcast('session_reset', { match: null, markets: [] });
    return json({ success: true });
  }

  // ── Create flash market ──
  if (op === 'create_flash_market') {
    const { title, outcomes } = body;
    const mId = 'm-flash-' + Date.now();
    const closesAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    db.prepare(`INSERT INTO markets (id,match_id,type,title,is_active,is_closed,resolved_outcome_id,is_flash,closes_at) VALUES (?,?,?,?,1,0,NULL,1,?)`)
      .run(mId, getActiveMatchId(), 'flash', `⚡ PARI FLASH : ${title.toUpperCase()}`, closesAt);
    const insO = db.prepare(`INSERT INTO outcomes (id,market_id,name,base_odds,current_odds) VALUES (?,?,?,?,?)`);
    for (let i = 0; i < outcomes.length; i++) {
      const o = outcomes[i];
      insO.run(`o-flash-${Date.now()}-${i}`, mId, o.name, o.baseOdds, o.baseOdds);
    }
    const mkt = db.prepare('SELECT * FROM markets WHERE id = ?').get(mId);
    const ocs = db.prepare('SELECT * FROM outcomes WHERE market_id = ?').all(mId);
    broadcast('market_insert', { ...mkt as object, outcomes: ocs });
    broadcast('game_event', { type: 'flash_market', title: '⚡ NOUVEAU PARI FLASH !', subtitle: title });
    return json({ success: true });
  }

  // ── Close / delete market ──
  if (op === 'close_market') {
    db.prepare('UPDATE markets SET is_closed = 1, is_active = 0 WHERE id = ?').run(body.marketId);
    broadcast('market_update', db.prepare('SELECT * FROM markets WHERE id = ?').get(body.marketId));
    return json({ success: true });
  }

  if (op === 'delete_market') {
    db.prepare('DELETE FROM markets WHERE id = ?').run(body.marketId);
    broadcast('market_delete', { marketId: body.marketId });
    return json({ success: true });
  }

  // ── Toggle double gains ──
  if (op === 'toggle_double_gains') {
    db.prepare('UPDATE game_settings SET double_gains_active = ? WHERE match_id = ?').run(body.active ? 1 : 0, getActiveMatchId());
    broadcast('settings_update', { doubleGainsActive: body.active });
    return json({ success: true });
  }

  // ── Trigger game event (goal, etc.) ──
  if (op === 'game_event') {
    if (body.type === 'goal') {
      triggerWebhooks('match.goal', body.meta || {});
    }
    // Record game event in the database
    const eventId = 'ge-' + Date.now();
    db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle, meta) VALUES (?, ?, ?, ?, ?, ?)`).run(
      eventId,
      getActiveMatchId(),
      body.type,
      body.title,
      body.subtitle || '',
      body.meta ? JSON.stringify(body.meta) : null
    );

    broadcast('game_event', { type: body.type, title: body.title, subtitle: body.subtitle, meta: body.meta });
    return json({ success: true });
  }

  // ── Update leaderboard rankings ──
  if (op === 'update_leaderboard') {
    const players = db.prepare('SELECT * FROM players ORDER BY (toiles_coins + total_winnings) DESC').all() as Record<string, unknown>[];
    const updRank = db.prepare('UPDATE players SET rank = ?, rank_change = ? WHERE id = ?');
    players.forEach((p, i) => {
      const newRank = i + 1;
      const oldRank = (p.rank as number) || 99;
      const change = newRank < oldRank ? 'up' : newRank > oldRank ? 'down' : 'same';
      updRank.run(newRank, change, p.id);
    });
    const updated = getActiveLeaderboardPlayers(getActiveMatchId());
    broadcast('leaderboard_update', updated);
    return json({ success: true, leaderboard: updated });
  }

  // ── Unlock badge ──
  if (op === 'unlock_badge') {
    const { userId, badgeCode } = body;
    const matchId = getActiveMatchId();
    const wonBets = db.prepare("SELECT COUNT(*) as count FROM bets WHERE user_id = ? AND match_id = ? AND status = 'won'").get(userId, matchId) as { count: number };
    if (wonBets.count > 0) {
      db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_code) VALUES (?, ?)').run(userId, badgeCode);
    }
    const badges = db.prepare('SELECT badge_code FROM player_badges WHERE player_id = ?').all(userId).map((r: any) => r.badge_code);
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(userId);
    broadcast('player_update', player);
    return json({ success: true, badges });
  }

  // ── Update mission progress ──
  if (op === 'update_mission_progress') {
    const { userId, type, increment } = body;
    const playerMissions = db.prepare(`
      SELECT pm.*, m.target, m.reward_coins, m.reward_badge_code 
      FROM player_missions pm 
      JOIN missions m ON pm.mission_id = m.id 
      WHERE pm.player_id = ? AND m.type = ? AND pm.is_completed = 0
    `).all(userId, type) as any[];

    for (const pm of playerMissions) {
      const newProgress = Math.min(pm.target, pm.progress + increment);
      const isCompleted = newProgress >= pm.target ? 1 : 0;
      
      db.prepare('UPDATE player_missions SET progress = ?, is_completed = ? WHERE player_id = ? AND mission_id = ?')
        .run(newProgress, isCompleted, userId, pm.mission_id);

      if (isCompleted) {
        // NB : on NE crédite PAS de ToilesCoins ici. Les missions se déclenchent au moment où l'on PARIE
        // (ex. parier sur un buteur), ce qui ferait « gagner » de l'argent en pariant. Dans une app de paris,
        // le solde ne doit refléter que les mises et les gains de paris résolus. On garde la progression + les badges.

        // Award badge if any
        if (pm.reward_badge_code) {
          const matchId = getActiveMatchId();
          const wonBets = db.prepare("SELECT COUNT(*) as count FROM bets WHERE user_id = ? AND match_id = ? AND status = 'won'").get(userId, matchId) as { count: number };
          if (wonBets.count > 0) {
            db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_code) VALUES (?, ?)').run(userId, pm.reward_badge_code);
            const badgeDetails = db.prepare('SELECT * FROM badges WHERE code = ?').get(pm.reward_badge_code) as any;
            
            broadcast('game_event', {
              type: 'badge',
              title: 'BADGE DÉBLOQUÉ ! 🏅',
              subtitle: `Badge "${badgeDetails?.title || pm.reward_badge_code.toUpperCase()}" débloqué !`
            });
          }
        }
      }
    }

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(userId);
    const missions = db.prepare(`
      SELECT pm.progress, pm.is_completed, m.id, m.title, m.description, m.reward_coins, m.reward_badge_code, m.type, m.target 
      FROM player_missions pm 
      JOIN missions m ON pm.mission_id = m.id 
      WHERE pm.player_id = ?
    `).all(userId).map((m: any) => ({
      ...m,
      isCompleted: Boolean(m.is_completed),
      rewardBadgeCode: m.reward_badge_code || undefined
    }));
    const badges = db.prepare('SELECT badge_code FROM player_badges WHERE player_id = ?').all(userId).map((r: any) => r.badge_code);

    broadcast('player_update', player);
    return json({ success: true, player, missions, badges });
  }

  // ── Create reward ──
  if (op === 'create_reward') {
    const { title, description, cost } = body;
    const id = 'reward-' + Date.now();
    const image = cost > 4000 ? '🍔' : '🍺';
    db.prepare('INSERT INTO rewards (id, title, description, cost_toiles_coins, image) VALUES (?, ?, ?, ?, ?)')
      .run(id, title, description, cost, image);
    const rewards = db.prepare('SELECT * FROM rewards').all();
    return json({ success: true, rewards });
  }

  // ── Attribute reward ──
  if (op === 'attribute_reward') {
    const { userId, rewardId } = body;
    const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId) as any;
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(userId) as any;
    if (!reward || !player) return json({ success: false, error: 'Récompense ou joueur introuvable' });

    const ledgerId = 'led-' + crypto.randomUUID().slice(0, 8);
    db.prepare('INSERT INTO reward_ledger (id, user_id, reward_id, reward_title, assigned_by, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ledgerId, userId, rewardId, reward.title, 'Admin Les Toiles Noires', 'pending');

    broadcast('game_event', {
      type: 'jackpot',
      title: 'RÉCOMPENSE ATTRIBUÉE ! 🎁',
      subtitle: `${player.username} remporte : ${reward.title} !`
    });

    const rewardLedger = db.prepare('SELECT * FROM reward_ledger ORDER BY created_at DESC').all();
    return json({ success: true, rewardLedger });
  }

  // ── Claim reward ──
  if (op === 'claim_reward') {
    const { ledgerId } = body;
    db.prepare("UPDATE reward_ledger SET status = 'claimed', updated_at = datetime('now') WHERE id = ?").run(ledgerId);
    const rewardLedger = db.prepare('SELECT * FROM reward_ledger ORDER BY created_at DESC').all();
    return json({ success: true, rewardLedger });
  }

  // ── Prévisualiser une session (cotes auto) SANS persister — pour l'écran de revue admin ──
  if (op === 'preview_session') {
    const { match } = body;
    if (!match || !match.homeTeam || !match.awayTeam) {
      return json({ success: false, error: 'Match invalide.' });
    }
    const matchId = match.id || 'm-' + Date.now();
    const eventId = match.oddsEventId ?? (typeof matchId === 'string' && matchId.startsWith('oai-') ? matchId.slice(4) : null);

    const parsed = eventId ? await getParsedOdds(eventId) : null;
    const markets = buildSessionBlueprint({ id: matchId, homeTeam: match.homeTeam, awayTeam: match.awayTeam }, parsed);
    const apiOddsCount = markets.reduce((s, m) => s + m.outcomes.filter(o => o.oddsSource === 'api').length, 0);

    return json({
      success: true,
      match: { ...match, id: matchId },
      markets,
      oddsBookmaker: parsed?.bookmaker ?? null,
      apiOddsCount,
    });
  }

  // ── Create match session ──
  if (op === 'create_session') {
    const { match } = body;
    const matchId = match.id || 'm-' + Date.now();

    // Garde-fou : une seule session active à la fois. On refuse de lancer un AUTRE match
    // tant que la session en cours n'est pas fermée (sauf relance du même match ou force).
    const active = getActiveMatchRow();
    if (active && active.id !== matchId && !body.force && !(match && match.force)) {
      return json({
        success: false,
        error: `Une session est déjà en cours (${active.home_team} vs ${active.away_team}). Fermez-la avant d'en lancer une nouvelle.`,
      });
    }
    // Cotes : lien direct par event id odds-api.io (aucun matching de noms).
    // - Si l'admin a revu/édité les marchés (body.markets), on les conserve tels quels.
    // - Sinon on récupère les cotes auto et on construit le blueprint (cote réelle ou défaut).
    const eventId = match.oddsEventId ?? (typeof matchId === 'string' && matchId.startsWith('oai-') ? matchId.slice(4) : null);

    let blueprint: BlueprintMarket[];
    if (Array.isArray(body.markets) && body.markets.length) {
      blueprint = body.markets as BlueprintMarket[];
    } else {
      const parsed = eventId ? await getParsedOdds(eventId) : null;
      blueprint = buildSessionBlueprint({ id: matchId, homeTeam: match.homeTeam, awayTeam: match.awayTeam }, parsed);
    }

    const createSession = db.transaction(() => {
    // 0. Purge idempotente (relancer le même match ne plante pas)
    const oldMarkets = db.prepare('SELECT id FROM markets WHERE match_id = ?').all(matchId) as { id: string }[];
    for (const m of oldMarkets) {
      db.prepare('DELETE FROM outcomes WHERE market_id = ?').run(m.id);
    }
    db.prepare('DELETE FROM markets WHERE match_id = ?').run(matchId);
    db.prepare('DELETE FROM bets WHERE match_id = ?').run(matchId);
    db.prepare('DELETE FROM game_events WHERE match_id = ?').run(matchId);
    db.prepare('DELETE FROM matches WHERE id = ?').run(matchId);

    // 1. Désactiver tous les autres matchs
    db.prepare('UPDATE matches SET is_active = 0').run();

    // 2. Insérer le nouveau match (+ lien event de cotes odds-api.io)
    db.prepare(`
      INSERT INTO matches (
        id, home_team, away_team, home_score, away_score, status, starts_at,
        bets_closed_at, elapsed_time, possession_home, shots_on_target_home,
        corners_home, cards_home, is_active, odds_event_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      matchId,
      match.homeTeam,
      match.awayTeam,
      match.homeScore ?? 0,
      match.awayScore ?? 0,
      match.status ?? 'upcoming',
      match.startsAt || new Date().toISOString(),
      match.betsClosedAt || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      match.elapsedTime ?? 0,
      match.possessionHome ?? 50,
      match.shotsOnTargetHome ?? 0,
      match.cornersHome ?? 0,
      match.cardsHome ?? 0,
      eventId ? String(eventId) : null
    );

    // 3. Insérer les réglages pour ce match
    db.prepare('INSERT OR IGNORE INTO game_settings (match_id, double_gains_active) VALUES (?, 0)').run(matchId);

    // 4. Créer les marchés + outcomes depuis le blueprint (cote réelle/défaut + provenance)
    const insM = db.prepare(`INSERT INTO markets (id, match_id, type, title, is_active, is_closed, resolved_outcome_id, is_flash, closes_at) VALUES (?, ?, ?, ?, 1, 0, NULL, 0, NULL)`);
    const insO = db.prepare(`INSERT INTO outcomes (id, market_id, name, base_odds, current_odds, total_bet_amount, total_bets_count, odds_source) VALUES (?, ?, ?, ?, ?, 0, 0, ?)`);
    for (const mkt of blueprint) {
      insM.run(mkt.id, matchId, mkt.type, mkt.title);
      for (const oc of mkt.outcomes) {
        const oddVal = Number(oc.baseOdds) > 1 ? Math.round(Number(oc.baseOdds) * 100) / 100 : 1.10;
        insO.run(oc.id, mkt.id, oc.name, oddVal, oddVal, oc.oddsSource || 'default');
      }
    }

    suspendImpossibleOutcomes(matchId, match.homeScore ?? 0, match.awayScore ?? 0);

    // Récupérer le nouvel état complet
    const activeMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
    const activeMarketsRaw = db.prepare('SELECT * FROM markets WHERE match_id = ? ORDER BY created_at').all(matchId) as Record<string, unknown>[];
    const activeMarkets = activeMarketsRaw.map(mkt => ({
      ...mkt,
      outcomes: db.prepare('SELECT * FROM outcomes WHERE market_id = ?').all(mkt.id as string),
    }));

    return { activeMatch, activeMarkets };
    });

    const { activeMatch, activeMarkets } = createSession();

    broadcast('match_update', activeMatch);
    broadcast('settings_update', { doubleGainsActive: false });
    // Nouveau match : les clients doivent recharger tout leur état (marchés inexistants chez eux)
    broadcast('session_reset', { match: activeMatch, markets: activeMarkets });

    return json({ success: true, match: activeMatch, markets: activeMarkets });
  }

  return json({ error: 'unknown op' }, 400);
}
