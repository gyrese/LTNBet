import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db';
import { broadcast } from '@/lib/sse-bus';
import { calculateDynamicOdds } from '@/lib/odds';
import { triggerWebhooks } from '@/lib/webhooks';

const ARCHIVE_DIR = path.join(process.cwd(), 'data', 'archives');
const CLOSE_AFTER_MS = 30 * 60 * 1000; // 30 min après la fin du match

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

// Match actuellement actif (lancé par l'hôte et non clôturé). undefined si aucun.
function getActiveMatchRow(): Row | undefined {
  return db.prepare('SELECT * FROM matches WHERE is_active = 1 AND session_closed = 0 LIMIT 1').get() as Row | undefined;
}

function getActiveMatchId(): string {
  const row = getActiveMatchRow();
  if (row) return row.id as string;
  const latest = db.prepare('SELECT id FROM matches ORDER BY starts_at DESC LIMIT 1').get() as { id: string } | undefined;
  return latest?.id || '';
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
    // Return all players (bots + users) sorted by rank for the global leaderboard with badge count
    const bots = db.prepare('SELECT p.*, (SELECT COUNT(*) FROM player_badges pb WHERE pb.player_id = p.id) as badge_count FROM players p ORDER BY rank').all();
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

  return json({ error: 'unknown op' }, 400);
}

// ─── POST /api/db ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body;

  // ── Register player (or login if exists) ──
  if (op === 'register') {
    const { username, avatar } = body;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingPlayer = db.prepare('SELECT * FROM players WHERE username = ?').get(username) as any;
    if (existingPlayer) {
      db.prepare('UPDATE players SET avatar = ? WHERE id = ?').run(avatar, existingPlayer.id);
      const player = db.prepare('SELECT * FROM players WHERE id = ?').get(existingPlayer.id);
      broadcast('player_update', player);
      return json({ player });
    }

    const id = 'user-' + crypto.randomUUID().slice(0, 8);
    db.prepare(`INSERT INTO players (id,username,avatar,toiles_coins,total_winnings,successful_bets,total_bets,rank,rank_change,is_bot) VALUES (?,?,?,1000,0,0,0,99,'same',0)`)
      .run(id, username, avatar);

    // Initialize player missions
    const allMissions = db.prepare('SELECT id FROM missions').all() as { id: string }[];
    const insPlayerMission = db.prepare('INSERT OR IGNORE INTO player_missions (player_id, mission_id, progress, is_completed) VALUES (?, ?, 0, 0)');
    for (const m of allMissions) {
      insPlayerMission.run(id, m.id);
    }

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
    broadcast('player_update', player);
    return json({ player });
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

    const outcome = db.prepare('SELECT * FROM outcomes WHERE id = ?').get(outcomeId) as Record<string, unknown> | undefined;
    if (!outcome) return json({ success: false, error: 'Option introuvable.' });

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

    // Recalculate ranking & broadcast leaderboard
    const players = db.prepare('SELECT * FROM players ORDER BY (toiles_coins + total_winnings) DESC').all() as any[];
    const updRank = db.prepare('UPDATE players SET rank = ?, rank_change = ? WHERE id = ?');
    players.forEach((p, i) => {
      const newRank = i + 1;
      const oldRank = p.rank || 99;
      const change = newRank < oldRank ? 'up' : newRank > oldRank ? 'down' : 'same';
      updRank.run(newRank, change, p.id);
    });
    const updatedLeaderboard = db.prepare('SELECT * FROM players ORDER BY rank').all();
    broadcast('leaderboard_update', updatedLeaderboard);

    return json({ success: true });
  }

  // ── Update match ──
  if (op === 'update_match') {
    const { stats } = body;
    const activeMatchId = getActiveMatchId();
    const cols = Object.keys(stats).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE matches SET ${cols} WHERE id = ?`).run(...Object.values(stats), activeMatchId);

    // Fin de match : on horodate finished_at (une seule fois) → déclenche le verrou des paris + le compte à rebours de 30 min.
    if (stats.status === 'finished') {
      db.prepare('UPDATE matches SET finished_at = COALESCE(finished_at, ?) WHERE id = ?').run(new Date().toISOString(), activeMatchId);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(activeMatchId) as any;

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
    const updated = db.prepare('SELECT * FROM players ORDER BY rank').all();
    broadcast('leaderboard_update', updated);
    return json({ success: true, leaderboard: updated });
  }

  // ── Unlock badge ──
  if (op === 'unlock_badge') {
    const { userId, badgeCode } = body;
    db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_code) VALUES (?, ?)').run(userId, badgeCode);
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

  // ── Create match session ──
  if (op === 'create_session') {
    const { match } = body;
    const matchId = match.id || 'm-' + Date.now();

    // Garde-fou : une seule session active à la fois. On refuse de lancer un AUTRE match
    // tant que la session en cours n'est pas fermée (sauf relance du même match).
    const active = getActiveMatchRow();
    if (active && active.id !== matchId) {
      return json({
        success: false,
        error: `Une session est déjà en cours (${active.home_team} vs ${active.away_team}). Fermez-la avant d'en lancer une nouvelle.`,
      });
    }
    // 5. Récupérer les cotes de base (avec option The Odds API)
    let baseOddsHome = 1.80;
    let baseOddsDraw = 3.20;
    let baseOddsAway = 2.90;
    let baseOddsOu25Yes = 2.10;
    let baseOddsOu25No = 1.70;

    const oddsApiKey = process.env.THE_ODDS_API_KEY;
    if (oddsApiKey) {
      try {
        const res = await fetch(`https://api.the-odds-api.com/v4/sports/soccer/odds/?regions=eu&oddsFormat=decimal&apiKey=${oddsApiKey}`)
          .then(r => r.json());

        if (Array.isArray(res)) {
          const apiMatch = res.find((m: any) => 
            m.home_team.toLowerCase().includes(match.homeTeam.toLowerCase()) || 
            match.homeTeam.toLowerCase().includes(m.home_team.toLowerCase()) ||
            m.away_team.toLowerCase().includes(match.awayTeam.toLowerCase()) ||
            match.awayTeam.toLowerCase().includes(m.away_team.toLowerCase())
          );

          if (apiMatch && apiMatch.bookmakers && apiMatch.bookmakers[0]) {
            const h2hMarket = apiMatch.bookmakers[0].markets.find((m: any) => m.key === 'h2h');
            if (h2hMarket && Array.isArray(h2hMarket.outcomes)) {
              const homeOutcome = h2hMarket.outcomes.find((o: any) => o.name === apiMatch.home_team);
              const awayOutcome = h2hMarket.outcomes.find((o: any) => o.name === apiMatch.away_team);
              const drawOutcome = h2hMarket.outcomes.find((o: any) => o.name.toLowerCase() === 'draw' || o.name === 'Draw' || o.name === 'Nul');
              if (homeOutcome) baseOddsHome = homeOutcome.price;
              if (awayOutcome) baseOddsAway = awayOutcome.price;
              if (drawOutcome) baseOddsDraw = drawOutcome.price;
            }

            const totalsMarket = apiMatch.bookmakers[0].markets.find((m: any) => m.key === 'totals');
            if (totalsMarket && Array.isArray(totalsMarket.outcomes)) {
              const over25 = totalsMarket.outcomes.find((o: any) => o.name === 'Over' && o.point === 2.5);
              const under25 = totalsMarket.outcomes.find((o: any) => o.name === 'Under' && o.point === 2.5);
              if (over25) baseOddsOu25Yes = over25.price;
              if (under25) baseOddsOu25No = under25.price;
            }
          }
        }
      } catch (err) {
        console.error('Error fetching from The Odds API:', err);
      }
    }

    const createSession = db.transaction(() => {
    // 0. Purger toute donnée existante de ce match (idempotent : permet de relancer le même match sans erreur)
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

    // 2. Insérer le nouveau match
    db.prepare(`
      INSERT INTO matches (
        id, home_team, away_team, home_score, away_score, status, starts_at,
        bets_closed_at, elapsed_time, possession_home, shots_on_target_home,
        corners_home, cards_home, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
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
      match.cardsHome ?? 0
    );

    // 3. Insérer les réglages pour ce match
    db.prepare('INSERT OR IGNORE INTO game_settings (match_id, double_gains_active) VALUES (?, 0)').run(matchId);

    // 4. Créer les marchés de paris par défaut
    const markets = [
      { id: `m-${matchId}-resultat`, type: 'final_result', title: 'RÉSULTAT DU MATCH' },
      { id: `m-${matchId}-score`, type: 'exact_score', title: 'SCORE EXACT' },
      { id: `m-${matchId}-buteurs`, type: 'first_scorer', title: 'PREMIER BUTEUR' },
      { id: `m-${matchId}-corners`, type: 'corners_count', title: `NOMBRE DE CORNERS ${match.homeTeam.toUpperCase()}` },
      { id: `m-${matchId}-res-ht`, type: 'halftime_result', title: 'RÉSULTAT À LA MI-TEMPS' },
      { id: `m-${matchId}-score-ht`, type: 'halftime_score', title: 'SCORE À LA MI-TEMPS' },
      { id: `m-${matchId}-btts`, type: 'btts', title: 'LES DEUX ÉQUIPES MARQUENT' },
      { id: `m-${matchId}-ou25`, type: 'over_under_25', title: 'PLUS DE 2.5 BUTS DANS LE MATCH ?' },
    ];

    const insM = db.prepare(`INSERT INTO markets (id, match_id, type, title, is_active, is_closed, resolved_outcome_id, is_flash, closes_at) VALUES (?, ?, ?, ?, 1, 0, NULL, 0, NULL)`);
    for (const mkt of markets) {
      insM.run(mkt.id, matchId, mkt.type, mkt.title);
    }

    const outcomes = [
      // Résultat Final
      [`o-${matchId}-res-home`, `m-${matchId}-resultat`, match.homeTeam, baseOddsHome, baseOddsHome, 0, 0],
      [`o-${matchId}-res-draw`, `m-${matchId}-resultat`, 'Nul', baseOddsDraw, baseOddsDraw, 0, 0],
      [`o-${matchId}-res-away`, `m-${matchId}-resultat`, match.awayTeam, baseOddsAway, baseOddsAway, 0, 0],
      
      // Score Exact
      [`o-${matchId}-se-10`, `m-${matchId}-score`, '1-0', 3.50, 3.50, 0, 0],
      [`o-${matchId}-se-20`, `m-${matchId}-score`, '2-0', 6.00, 6.00, 0, 0],
      [`o-${matchId}-se-21`, `m-${matchId}-score`, '2-1', 7.50, 7.50, 0, 0],
      [`o-${matchId}-se-30`, `m-${matchId}-score`, '3-0', 10.0, 10.0, 0, 0],
      [`o-${matchId}-se-01`, `m-${matchId}-score`, '0-1', 9.00, 9.00, 0, 0],
      [`o-${matchId}-se-11`, `m-${matchId}-score`, '1-1', 5.50, 5.50, 0, 0],

      // Premier Buteur
      [`o-${matchId}-pb-vedette-1`, `m-${matchId}-buteurs`, `Buteur ${match.homeTeam} (Vedette)`, 3.80, 3.80, 0, 0],
      [`o-${matchId}-pb-vedette-2`, `m-${matchId}-buteurs`, `Buteur ${match.awayTeam} (Vedette)`, 4.20, 4.20, 0, 0],
      [`o-${matchId}-pb-autre`, `m-${matchId}-buteurs`, 'Autre Buteur', 2.80, 2.80, 0, 0],

      // Corners
      [`o-${matchId}-co-l5`, `m-${matchId}-corners`, 'Moins de 5', 2.20, 2.20, 0, 0],
      [`o-${matchId}-co-57`, `m-${matchId}-corners`, 'Entre 5 et 7', 1.80, 1.80, 0, 0],
      [`o-${matchId}-co-m7`, `m-${matchId}-corners`, 'Plus de 7', 3.10, 3.10, 0, 0],

      // Résultat Mi-Temps
      [`o-${matchId}-ht-res-home`, `m-${matchId}-res-ht`, match.homeTeam, Math.round((baseOddsHome * 1.3) * 100) / 100, Math.round((baseOddsHome * 1.3) * 100) / 100, 0, 0],
      [`o-${matchId}-ht-res-draw`, `m-${matchId}-res-ht`, 'Nul', Math.round((baseOddsDraw * 0.7) * 100) / 100, Math.round((baseOddsDraw * 0.7) * 100) / 100, 0, 0],
      [`o-${matchId}-ht-res-away`, `m-${matchId}-res-ht`, match.awayTeam, Math.round((baseOddsAway * 1.3) * 100) / 100, Math.round((baseOddsAway * 1.3) * 100) / 100, 0, 0],

      // Score Mi-Temps
      [`o-${matchId}-ht-se-00`, `m-${matchId}-score-ht`, '0-0', 2.30, 2.30, 0, 0],
      [`o-${matchId}-ht-se-10`, `m-${matchId}-score-ht`, '1-0', 3.80, 3.80, 0, 0],
      [`o-${matchId}-ht-se-01`, `m-${matchId}-score-ht`, '0-1', 4.80, 4.80, 0, 0],
      [`o-${matchId}-ht-se-11`, `m-${matchId}-score-ht`, '1-1', 6.50, 6.50, 0, 0],
      [`o-${matchId}-ht-se-autre`, `m-${matchId}-score-ht`, 'Autre Score', 5.00, 5.00, 0, 0],

      // Les deux équipes marquent
      [`o-${matchId}-btts-yes`, `m-${matchId}-btts`, 'Oui', 1.85, 1.85, 0, 0],
      [`o-${matchId}-btts-no`, `m-${matchId}-btts`, 'Non', 1.90, 1.90, 0, 0],

      // Plus de 2.5 Buts
      [`o-${matchId}-ou25-yes`, `m-${matchId}-ou25`, 'Oui', baseOddsOu25Yes, baseOddsOu25Yes, 0, 0],
      [`o-${matchId}-ou25-no`, `m-${matchId}-ou25`, 'Non', baseOddsOu25No, baseOddsOu25No, 0, 0],
    ];

    const insO = db.prepare(`INSERT INTO outcomes (id, market_id, name, base_odds, current_odds, total_bet_amount, total_bets_count) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const o of outcomes) {
      insO.run(...o);
    }

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
