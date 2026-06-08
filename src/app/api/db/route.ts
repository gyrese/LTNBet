import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { broadcast } from '@/lib/sse-bus';
import { calculateDynamicOdds } from '@/lib/odds';
import { triggerWebhooks } from '@/lib/webhooks';

function getActiveMatchId(): string {
  const row = db.prepare('SELECT id FROM matches WHERE is_active = 1 LIMIT 1').get() as { id: string } | undefined;
  if (row) return row.id;
  const latest = db.prepare('SELECT id FROM matches ORDER BY starts_at DESC LIMIT 1').get() as { id: string } | undefined;
  return latest?.id || 'a0000000-0000-0000-0000-000000000001';
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

// ─── GET /api/db?op=<operation> ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const op = req.nextUrl.searchParams.get('op');

  if (op === 'state') {
    const activeMatchId = getActiveMatchId();
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(activeMatchId);
    const marketsRaw = db.prepare('SELECT * FROM markets WHERE match_id = ? ORDER BY created_at').all(activeMatchId) as Record<string, unknown>[];
    const markets = marketsRaw.map(m => ({
      ...m,
      outcomes: db.prepare('SELECT * FROM outcomes WHERE market_id = ?').all(m.id as string),
    }));
    // Return all players (bots + users) sorted by rank for the global leaderboard with badge count
    const bots = db.prepare('SELECT p.*, (SELECT COUNT(*) FROM player_badges pb WHERE pb.player_id = p.id) as badge_count FROM players p ORDER BY rank').all();
    const settings = db.prepare('SELECT * FROM game_settings WHERE match_id = ?').get(activeMatchId);
    const rewards = db.prepare('SELECT * FROM rewards').all();
    const rewardLedger = db.prepare('SELECT * FROM reward_ledger ORDER BY created_at DESC').all();

    return json({ match, markets, bots, settings, rewards, rewardLedger });
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
    return json({ success: true });
  }

  // ── Update match ──
  if (op === 'update_match') {
    const { stats } = body;
    const activeMatchId = getActiveMatchId();
    const cols = Object.keys(stats).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE matches SET ${cols} WHERE id = ?`).run(...Object.values(stats), activeMatchId);
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
        // Award coins
        db.prepare('UPDATE players SET toiles_coins = toiles_coins + ? WHERE id = ?').run(pm.reward_coins, userId);
        
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

    // 5. Créer les options (outcomes) pour chaque marché
    const outcomes = [
      // Résultat Final
      [`o-${matchId}-res-home`, `m-${matchId}-resultat`, match.homeTeam, 1.80, 1.80, 0, 0],
      [`o-${matchId}-res-draw`, `m-${matchId}-resultat`, 'Nul', 3.20, 3.20, 0, 0],
      [`o-${matchId}-res-away`, `m-${matchId}-resultat`, match.awayTeam, 2.90, 2.90, 0, 0],
      
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
      [`o-${matchId}-ht-res-home`, `m-${matchId}-res-ht`, match.homeTeam, 2.20, 2.20, 0, 0],
      [`o-${matchId}-ht-res-draw`, `m-${matchId}-res-ht`, 'Nul', 1.90, 1.90, 0, 0],
      [`o-${matchId}-ht-res-away`, `m-${matchId}-res-ht`, match.awayTeam, 3.40, 3.40, 0, 0],

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
      [`o-${matchId}-ou25-yes`, `m-${matchId}-ou25`, 'Oui', 2.10, 2.10, 0, 0],
      [`o-${matchId}-ou25-no`, `m-${matchId}-ou25`, 'Non', 1.70, 1.70, 0, 0],
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

    broadcast('match_update', activeMatch);
    broadcast('settings_update', { doubleGainsActive: false });
    
    // Pour recharger les marchés chez les clients
    for (const mkt of activeMarkets) {
      broadcast('market_update', mkt);
    }

    return json({ success: true, match: activeMatch, markets: activeMarkets });
  }

  return json({ error: 'unknown op' }, 400);
}
