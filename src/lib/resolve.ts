/**
 * Résolution des marchés de paris — module partagé.
 *
 * Utilisé par :
 *   - le sync live (transitions détectées automatiquement) ;
 *   - les actions admin manuelles (passage à « Mi-temps »/« Terminé » dans /admin).
 *
 * Le marché « Premier Buteur » n'est PAS résolu ici (le système ne peut pas savoir quelle
 * « Vedette » a marqué) → toujours à régler à la main dans le panneau de résolution.
 */

import db, { awardEarnedBadges, progressExactScoreMission } from './db';
import { broadcast } from './sse-bus';
import { getActiveLeaderboardPlayers } from './presence';

/** Résout un marché : paie les gagnants, marque les perdants, attribue badges, diffuse. */
export function resolveMarket(matchId: string, marketId: string, outcomeId: string) {
  db.prepare('UPDATE markets SET is_closed = 1, resolved_outcome_id = ? WHERE id = ?').run(outcomeId, marketId);

  const pendingBets = db.prepare(`SELECT * FROM bets WHERE market_id = ? AND status = 'pending'`).all(marketId) as Record<string, unknown>[];
  const settings = db.prepare('SELECT * FROM game_settings WHERE match_id = ?').get(matchId) as { double_gains_active: number } | undefined;
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

  const resolvedMarket = db.prepare('SELECT * FROM markets WHERE id = ?').get(marketId);
  const allOutcomes = db.prepare('SELECT * FROM outcomes WHERE market_id = ?').all(marketId);
  broadcast('market_update', { ...resolvedMarket as object, outcomes: allOutcomes });

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
        .run(`ge-badge-${uid}-${code}-${Date.now()}`, matchId, 'NOUVEAU BADGE ! 🏅', subtitle);
      broadcast('game_event', { type: 'badge', title: 'NOUVEAU BADGE ! 🏅', subtitle });
    }
    broadcast('player_update', db.prepare('SELECT * FROM players WHERE id = ?').get(uid));
  }

  // Mission « score exact » (cosmétique) : complétée pour les gagnants de ce marché.
  if ((resolvedMarket as { type?: string } | undefined)?.type === 'exact_score') {
    for (const uid of winnerIds) progressExactScoreMission(uid);
  }

  const players = db.prepare('SELECT * FROM players ORDER BY toiles_coins DESC').all() as Record<string, unknown>[];
  const updRank = db.prepare('UPDATE players SET rank = ?, rank_change = ? WHERE id = ?');
  players.forEach((p, i) => {
    const newRank = i + 1;
    const oldRank = (p.rank as number) || 99;
    const change = newRank < oldRank ? 'up' : newRank > oldRank ? 'down' : 'same';
    updRank.run(newRank, change, p.id);
  });
  broadcast('leaderboard_update', getActiveLeaderboardPlayers(matchId));
}

/** Logue les marchés encore ouverts après résolution (résolution manuelle requise). */
export function warnUnresolvedMarkets(matchId: string, context: string) {
  const open = db.prepare("SELECT title FROM markets WHERE match_id = ? AND is_closed = 0").all(matchId) as { title: string }[];
  if (open.length) {
    console.warn(`[resolve] ${context}: ${open.length} marché(s) non résolu(s) automatiquement → à régler dans l'admin : ${open.map(m => m.title).join(', ')}`);
  }
}

/**
 * Résolution des marchés de mi-temps.
 * @param reliable false → score de pause non fiable, on ne résout pas (évite de faux résultats).
 */
export function resolveHalftimeMarkets(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  htHome: number,
  htAway: number,
  reliable: boolean = true,
) {
  if (!reliable) {
    const open = db.prepare("SELECT title FROM markets WHERE match_id = ? AND type IN ('halftime_result','halftime_score') AND is_closed = 0").all(matchId) as { title: string }[];
    if (open.length) console.warn(`[resolve] mi-temps: score non fiable → ${open.length} marché(s) laissé(s) pour résolution manuelle : ${open.map(m => m.title).join(', ')}`);
    return;
  }

  const htResultMarket = db.prepare("SELECT * FROM markets WHERE type = 'halftime_result' AND match_id = ?").get(matchId) as Record<string, unknown> | undefined;
  if (htResultMarket && !htResultMarket.is_closed) {
    let name = 'Nul';
    if (htHome > htAway) name = homeTeam;
    else if (htHome < htAway) name = awayTeam;
    const w = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(htResultMarket.id, name) as Record<string, unknown> | undefined;
    if (w) resolveMarket(matchId, htResultMarket.id as string, w.id as string);
  }

  const htScoreMarket = db.prepare("SELECT * FROM markets WHERE type = 'halftime_score' AND match_id = ?").get(matchId) as Record<string, unknown> | undefined;
  if (htScoreMarket && !htScoreMarket.is_closed) {
    const scoreStr = `${htHome}-${htAway}`;
    let w = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(htScoreMarket.id, scoreStr) as Record<string, unknown> | undefined;
    if (!w) w = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = 'Autre Score'").get(htScoreMarket.id) as Record<string, unknown> | undefined;
    if (w) resolveMarket(matchId, htScoreMarket.id as string, w.id as string);
  }
}

/**
 * Résolution des marchés de fin de match.
 * @param cornerDataAvailable false → pas de données de corners, marché laissé ouvert.
 */
export function resolveFulltimeMarkets(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
  cornersHome: number,
  cornerDataAvailable: boolean = true,
) {
  // 1. Score exact — avec catch-all « Autre Score »
  const scoreMarket = db.prepare("SELECT * FROM markets WHERE type = 'exact_score' AND match_id = ?").get(matchId) as Record<string, unknown> | undefined;
  if (scoreMarket && !scoreMarket.is_closed) {
    const finalScore = `${homeScore}-${awayScore}`;
    let w = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(scoreMarket.id, finalScore) as Record<string, unknown> | undefined;
    if (!w) w = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = 'Autre Score'").get(scoreMarket.id) as Record<string, unknown> | undefined;
    if (w) resolveMarket(matchId, scoreMarket.id as string, w.id as string);
    else console.warn(`[resolve] exact_score: aucune issue « ${finalScore} » ni « Autre Score » → résolution manuelle requise`);
  }

  // 2. Résultat final
  const resultMarket = db.prepare("SELECT * FROM markets WHERE type = 'final_result' AND match_id = ?").get(matchId) as Record<string, unknown> | undefined;
  if (resultMarket && !resultMarket.is_closed) {
    let name = 'Nul';
    if (homeScore > awayScore) name = homeTeam;
    else if (homeScore < awayScore) name = awayTeam;
    const w = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(resultMarket.id, name) as Record<string, unknown> | undefined;
    if (w) resolveMarket(matchId, resultMarket.id as string, w.id as string);
  }

  // 3. BTTS
  const bttsMarket = db.prepare("SELECT * FROM markets WHERE type = 'btts' AND match_id = ?").get(matchId) as Record<string, unknown> | undefined;
  if (bttsMarket && !bttsMarket.is_closed) {
    const name = (homeScore > 0 && awayScore > 0) ? 'Oui' : 'Non';
    const w = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(bttsMarket.id, name) as Record<string, unknown> | undefined;
    if (w) resolveMarket(matchId, bttsMarket.id as string, w.id as string);
  }

  // 4. Plus/Moins 2.5 buts
  const ou25Market = db.prepare("SELECT * FROM markets WHERE type = 'over_under_25' AND match_id = ?").get(matchId) as Record<string, unknown> | undefined;
  if (ou25Market && !ou25Market.is_closed) {
    const name = (homeScore + awayScore > 2.5) ? 'Oui' : 'Non';
    const w = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(ou25Market.id, name) as Record<string, unknown> | undefined;
    if (w) resolveMarket(matchId, ou25Market.id as string, w.id as string);
  }

  // 5. Corners — uniquement si données disponibles (sinon résolution manuelle)
  const cornersMarket = db.prepare("SELECT * FROM markets WHERE type = 'corners_count' AND match_id = ?").get(matchId) as Record<string, unknown> | undefined;
  if (cornersMarket && !cornersMarket.is_closed) {
    if (!cornerDataAvailable) {
      console.warn(`[resolve] corners: pas de données de corners → résolution manuelle requise (marché ${cornersMarket.id})`);
    } else {
      let name = 'Moins de 5';
      if (cornersHome >= 5 && cornersHome <= 7) name = 'Entre 5 et 7';
      else if (cornersHome > 7) name = 'Plus de 7';
      const w = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(cornersMarket.id, name) as Record<string, unknown> | undefined;
      if (w) resolveMarket(matchId, cornersMarket.id as string, w.id as string);
    }
  }

  warnUnresolvedMarkets(matchId, 'fin de match');
}
