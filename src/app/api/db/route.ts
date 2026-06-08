import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { broadcast } from '@/lib/sse-bus';
import { calculateDynamicOdds } from '@/lib/odds';

const MATCH_ID = 'a0000000-0000-0000-0000-000000000001';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

// ─── GET /api/db?op=<operation> ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const op = req.nextUrl.searchParams.get('op');

  if (op === 'state') {
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(MATCH_ID);
    const marketsRaw = db.prepare('SELECT * FROM markets WHERE match_id = ? ORDER BY created_at').all(MATCH_ID) as Record<string, unknown>[];
    const markets = marketsRaw.map(m => ({
      ...m,
      outcomes: db.prepare('SELECT * FROM outcomes WHERE market_id = ?').all(m.id as string),
    }));
    const bots = db.prepare('SELECT * FROM players WHERE is_bot = 1 ORDER BY rank').all();
    const settings = db.prepare('SELECT * FROM game_settings WHERE match_id = ?').get(MATCH_ID);
    return json({ match, markets, bots, settings });
  }

  if (op === 'player') {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return json({ error: 'missing id' }, 400);
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
    const bets = db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY created_at DESC').all(id);
    return json({ player, bets });
  }

  return json({ error: 'unknown op' }, 400);
}

// ─── POST /api/db ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { op } = body;

  // ── Register player ──
  if (op === 'register') {
    const { username, avatar } = body;
    const id = 'user-' + crypto.randomUUID().slice(0, 8);
    db.prepare(`INSERT INTO players (id,username,avatar,toiles_coins,total_winnings,successful_bets,total_bets,rank,rank_change,is_bot) VALUES (?,?,?,1000,0,0,0,99,'same',0)`)
      .run(id, username, avatar);
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
      .run(betId, userId, MATCH_ID, marketId, market.title, outcomeId, outcome.name, amount, outcome.current_odds);

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
    const settings = db.prepare('SELECT * FROM game_settings WHERE match_id = ?').get(MATCH_ID) as { double_gains_active: number } | undefined;
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
    const cols = Object.keys(stats).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE matches SET ${cols} WHERE id = ?`).run(...Object.values(stats), MATCH_ID);
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(MATCH_ID);
    broadcast('match_update', match);
    return json({ success: true, match });
  }

  // ── Create flash market ──
  if (op === 'create_flash_market') {
    const { title, outcomes } = body;
    const mId = 'm-flash-' + Date.now();
    const closesAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    db.prepare(`INSERT INTO markets (id,match_id,type,title,is_active,is_closed,resolved_outcome_id,is_flash,closes_at) VALUES (?,?,?,?,1,0,NULL,1,?)`)
      .run(mId, MATCH_ID, 'flash', `⚡ PARI FLASH : ${title.toUpperCase()}`, closesAt);
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
    db.prepare('UPDATE game_settings SET double_gains_active = ? WHERE match_id = ?').run(body.active ? 1 : 0, MATCH_ID);
    broadcast('settings_update', { doubleGainsActive: body.active });
    return json({ success: true });
  }

  // ── Trigger game event (goal, etc.) ──
  if (op === 'game_event') {
    broadcast('game_event', { type: body.type, title: body.title, subtitle: body.subtitle, meta: body.meta });
    return json({ success: true });
  }

  // ── Update leaderboard rankings ──
  if (op === 'update_leaderboard') {
    const bots = db.prepare('SELECT * FROM players WHERE is_bot = 1 ORDER BY (toiles_coins + total_winnings) DESC').all() as Record<string, unknown>[];
    const updRank = db.prepare('UPDATE players SET rank = ?, rank_change = ? WHERE id = ?');
    bots.forEach((p, i) => updRank.run(i + 1, i + 1 < (p.rank as number) ? 'up' : i + 1 > (p.rank as number) ? 'down' : 'same', p.id));
    const updated = db.prepare('SELECT * FROM players WHERE is_bot = 1 ORDER BY rank').all();
    broadcast('leaderboard_update', updated);
    return json({ success: true, leaderboard: updated });
  }

  return json({ error: 'unknown op' }, 400);
}
