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

import db, { awardEarnedBadges, progressExactScoreMission, awardLegendeBadge } from './db';
import { broadcast } from './sse-bus';
import { getActiveLeaderboardPlayers } from './presence';

/** Résout un marché : paie les gagnants, marque les perdants, attribue badges, diffuse. */
export function resolveMarket(matchId: string, marketId: string, outcomeId: string) {
  // Garde anti double-résolution : un marché déjà résolu a déjà payé ses gagnants. Sans cette
  // garde, une double bascule de statut (live→finished→live→finished) re-paierait les paris.
  const existing = db.prepare('SELECT resolved_outcome_id FROM markets WHERE id = ?').get(marketId) as { resolved_outcome_id: string | null } | undefined;
  if (existing?.resolved_outcome_id) return;

  db.prepare('UPDATE markets SET is_closed = 1, resolved_outcome_id = ? WHERE id = ?').run(outcomeId, marketId);

  const pendingBets = db.prepare(`SELECT * FROM bets WHERE market_id = ? AND status = 'pending'`).all(marketId) as Record<string, unknown>[];

  for (const bet of pendingBets) {
    if (bet.outcome_id === outcomeId) {
      // Double Gains figé par pari (double_at_bet), pas l'état global au moment de résoudre.
      const mult = bet.double_at_bet === 1 ? (bet.odds_at_bet as number) * 2 : (bet.odds_at_bet as number);
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

  // Badge « Légende des Toiles » : le nouveau leader (réel, avec un pari gagné) le décroche.
  const legende = awardLegendeBadge();
  if (legende) {
    const subtitle = `${legende.username} débloque « Légende des Toiles » !`;
    db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'badge', ?, ?)`)
      .run(`ge-badge-${legende.userId}-legende-${Date.now()}`, matchId, 'NOUVEAU BADGE ! 🏅', subtitle);
    broadcast('game_event', { type: 'badge', title: 'NOUVEAU BADGE ! 🏅', subtitle });
    broadcast('player_update', db.prepare('SELECT * FROM players WHERE id = ?').get(legende.userId));
  }

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
 * Résout les marchés de mi-temps en reconstituant le score de la pause à partir de la liste des
 * buteurs (buts marqués avant la 46e minute). Utile à la FIN du match (les marchés mi-temps ne
 * doivent pas rester « en attente » si on n'est jamais passé par une transition mi-temps propre).
 * Idempotent : les marchés déjà résolus sont ignorés.
 * @param finalHome/finalAway score final — sert à juger la fiabilité (0-0 final ⇒ 0-0 mi-temps sûr).
 */
export function resolveHalftimeFromScorers(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
  scorers: ResolveScorer[],
  finalHome: number,
  finalAway: number,
) {
  let htHome = 0;
  let htAway = 0;
  for (const s of scorers) {
    if (s.minute > 0 && s.minute <= 45) {
      if (s.team === 'home') htHome++;
      else htAway++;
    }
  }
  // Fiable si on dispose des buteurs (liste API/ESPN) OU si le match a fini 0-0 (alors mi-temps = 0-0).
  const reliable = scorers.length > 0 || (finalHome === 0 && finalAway === 0);
  resolveHalftimeMarkets(matchId, homeTeam, awayTeam, htHome, htAway, reliable);
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

  // 6. Marchés additionnels Oui/Non (type 'flash' du blueprint : double chance, +1.5/+3.5 buts,
  //    +1.5 par équipe, clean sheets). ⚠️ Sans ce bloc, ces ~9 marchés restaient « pending » à la
  //    résolution (c'était LA cause de « plein de paris non validés » à la fin manuelle d'un match).
  const resolveYesNo = (suffix: string, condition: boolean) => {
    const mId = `m-${matchId}-${suffix}`;
    const m = db.prepare("SELECT * FROM markets WHERE id = ?").get(mId) as Record<string, unknown> | undefined;
    if (m && !m.is_closed) {
      const winnerName = condition ? 'Oui' : 'Non';
      const w = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(m.id, winnerName) as Record<string, unknown> | undefined;
      if (w) resolveMarket(matchId, m.id as string, w.id as string);
    }
  };

  resolveYesNo('dc-home-nul', homeScore >= awayScore);
  resolveYesNo('dc-away-nul', awayScore >= homeScore);
  resolveYesNo('dc-home-away', homeScore !== awayScore);
  resolveYesNo('ou15', (homeScore + awayScore) > 1.5);
  resolveYesNo('ou35', (homeScore + awayScore) > 3.5);
  resolveYesNo('home-over15', homeScore > 1.5);
  resolveYesNo('away-over15', awayScore > 1.5);
  resolveYesNo('home-cleansheet', awayScore === 0);
  resolveYesNo('away-cleansheet', homeScore === 0);

  warnUnresolvedMarkets(matchId, 'fin de match');
}

// ─── Premier buteur ────────────────────────────────────────────────────────────

/** Normalise un nom de joueur pour le rapprochement inter-API (sans accents, minuscule). */
function normName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface ResolveScorer {
  team: 'home' | 'away';
  playerName: string;
  minute: number;
}

/**
 * Résout le marché « Premier Buteur » — UNIQUEMENT si le nom du 1er buteur (API) correspond
 * de façon fiable à une issue nommée du marché. Sinon on laisse en résolution manuelle (on
 * ne paie jamais sur un rapprochement de nom douteux). Les issues génériques « Vedette » ne
 * sont pas auto-résolues.
 */
export function resolveFirstScorerMarket(
  matchId: string,
  scorers: ResolveScorer[],
  homeTeam: string,
  awayTeam: string,
) {
  const market = db.prepare("SELECT * FROM markets WHERE type = 'first_scorer' AND match_id = ? AND is_closed = 0").get(matchId) as Record<string, unknown> | undefined;
  if (!market) return;

  if (!scorers.length) {
    console.warn(`[resolve] first_scorer (${matchId}): aucun buteur connu → résolution manuelle requise`);
    return;
  }

  const first = scorers[0];
  const outcomes = db.prepare('SELECT id, name FROM outcomes WHERE market_id = ?').all(market.id) as { id: string; name: string }[];
  const sn = normName(first.playerName);

  // 1) Égalité stricte normalisée. 2) Contenance forte (≥4 car.) pour « K. Mbappé » vs « Mbappe ».
  let win = outcomes.find(o => normName(o.name) === sn && sn.length > 0);
  if (!win) {
    win = outcomes.find(o => {
      const on = normName(o.name);
      if (on.length < 4) return false;
      return sn.includes(on) || on.includes(sn);
    });
  }

  if (win) {
    resolveMarket(matchId, market.id as string, win.id);
  } else {
    const team = first.team === 'home' ? homeTeam : awayTeam;
    console.warn(
      `[resolve] first_scorer (${matchId}): pas de correspondance fiable pour « ${first.playerName} » ` +
      `(${team}, ${first.minute}') → résolution manuelle requise.`,
    );
  }
}
