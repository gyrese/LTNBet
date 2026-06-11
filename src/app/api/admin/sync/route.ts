import { NextResponse } from 'next/server';
import db, { suspendImpossibleOutcomes, awardEarnedBadges, progressExactScoreMission } from '@/lib/db';
import { broadcast } from '@/lib/sse-bus';
import { triggerWebhooks } from '@/lib/webhooks';
import { getActiveLeaderboardPlayers } from '@/lib/presence';
import { getLiveData } from '@/lib/live-provider';
import type { MatchRow, ScorerEvent } from '@/lib/live-provider';
import type { ApifStats } from '@/lib/api-football-provider';

// Migrations de colonnes au démarrage
for (const sql of [
  'ALTER TABLE matches ADD COLUMN last_sync_at TEXT;',
  'ALTER TABLE matches ADD COLUMN fd_match_id TEXT;',
]) { try { db.exec(sql); } catch { /* existe déjà */ } }

// ─── Résolution des marchés ────────────────────────────────────────────────────

function resolveMarket(matchId: string, marketId: string, outcomeId: string) {
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

  const players = db.prepare('SELECT * FROM players ORDER BY (toiles_coins + total_winnings) DESC').all() as Record<string, unknown>[];
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
function warnUnresolvedMarkets(matchId: string, context: string) {
  const open = db.prepare("SELECT title FROM markets WHERE match_id = ? AND is_closed = 0").all(matchId) as { title: string }[];
  if (open.length) {
    console.warn(`[resolve] ${context}: ${open.length} marché(s) non résolu(s) automatiquement → à régler dans l'admin : ${open.map(m => m.title).join(', ')}`);
  }
}

/**
 * Résolution marchés de mi-temps.
 * @param reliable false → score de pause non fiable, on ne résout pas (évite de faux résultats).
 */
function resolveHalftimeMarkets(
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
 * Résolution marchés de fin de match.
 * @param cornerDataAvailable false → pas de données de corners, marché laissé ouvert.
 */
function resolveFulltimeMarkets(
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
      console.warn(`[resolve] corners: pas de données de corners (session sans stats) → résolution manuelle requise (marché ${cornersMarket.id})`);
    } else {
      let name = 'Moins de 5';
      if (cornersHome >= 5 && cornersHome <= 7) name = 'Entre 5 et 7';
      else if (cornersHome > 7) name = 'Plus de 7';
      const w = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(cornersMarket.id, name) as Record<string, unknown> | undefined;
      if (w) resolveMarket(matchId, cornersMarket.id as string, w.id as string);
    }
  }

  // 6. Résolution des nouveaux marchés additionnels (type: 'flash')
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

// ─── Helpers sync ─────────────────────────────────────────────────────────────

/** Émet un événement de but (avec nom du buteur si disponible). */
function emitGoalEvent(
  match: MatchRow,
  homeScore: number,
  awayScore: number,
  scorers: ScorerEvent[],
  now: number,
) {
  const scoringTeam = homeScore > (match.home_score as number) ? 'home' : 'away';
  const teamName = scoringTeam === 'home' ? match.home_team : match.away_team;
  const newScore = `${homeScore}-${awayScore}`;

  // Trouver le dernier buteur de l'équipe si disponible
  const lastScorer = [...scorers].reverse().find(s => s.team === scoringTeam);
  const scorer = lastScorer?.playerName ?? `${teamName} Striker`;

  const title = `BUT POUR ${String(teamName).toUpperCase()} ! ⚽`;
  const subtitle = `${scorer} marque ! (${newScore})`;

  db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle, meta) VALUES (?, ?, 'goal', ?, ?, ?)`).run(
    'ge-goal-' + now, match.id, title, subtitle,
    JSON.stringify({ team: scoringTeam, scorer, score: newScore }),
  );
  triggerWebhooks('match.goal', { team: scoringTeam, score: newScore });
  broadcast('game_event', { type: 'goal', title, subtitle, meta: { team: scoringTeam } });
}

/**
 * Logue un indice pour aider l'admin à résoudre manuellement le marché "Premier Buteur".
 * (La résolution automatique est impossible sans lier les noms de joueurs aux outcomes "Vedette".)
 */
function logFirstScorerHint(matchId: string, scorers: ScorerEvent[], homeTeam: string, awayTeam: string) {
  const market = db.prepare("SELECT * FROM markets WHERE type = 'first_scorer' AND match_id = ? AND is_closed = 0").get(matchId) as Record<string, unknown> | undefined;
  if (!market) return;

  if (!scorers.length) {
    console.warn(`[resolve] first_scorer (${matchId}): marché ouvert, aucun buteur connu → résolution manuelle requise`);
    return;
  }

  const first = scorers[0];
  const team = first.team === 'home' ? homeTeam : awayTeam;
  console.warn(
    `[resolve] first_scorer (${matchId}): marché ouvert → résolution manuelle requise.\n` +
    `  1er buteur connu : ${first.playerName} (${team}, ${first.minute}') — Vedette ${team} ou Autre Buteur ?`,
  );
}

/** Intervalle de sync. Football-Data est la source primaire du score (≈10 req/min → 15 s sûr). */
function syncIntervalMs(match: MatchRow): number {
  // Les stats API-Football sont cachées indépendamment (cf. STATS_TTL) : le rythme de sync
  // ne multiplie pas leur conso. On ralentit à la mi-temps (rien ne bouge).
  return match.status === 'half_time' ? 60_000 : 15_000;
}

// ─── Simulateur local (aucune clé API configurée) ─────────────────────────────

function handleSimulator(match: MatchRow, now: number): ReturnType<typeof NextResponse.json> {
  const newElapsed = (match.elapsed_time as number) + 1;
  let homeScore = match.home_score as number;
  let awayScore = match.away_score as number;
  let cornersHome = (match.corners_home as number) ?? 0;
  let shotsOnTargetHome = (match.shots_on_target_home as number) ?? 0;
  let cardsHome = (match.cards_home as number) ?? 0;
  let possessionHome = (match.possession_home as number) ?? 50;

  if (newElapsed === 45) {
    db.prepare('UPDATE matches SET status = ?, elapsed_time = ? WHERE id = ?').run('half_time', 45, match.id);
    db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'half_time', ?, ?)`).run('ge-ht-' + now, match.id, 'MI-TEMPS ! ⏸️', 'Fin de la première période.');
    resolveHalftimeMarkets(match.id, match.home_team, match.away_team, homeScore, awayScore, true);
    triggerWebhooks('match.status_change', { status: 'half_time', time_elapsed: 45 });
    broadcast('game_event', { type: 'half_time', title: 'MI-TEMPS ! ⏸️', subtitle: 'Fin de la première période.' });
    const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
    broadcast('match_update', updated);
    return NextResponse.json({ success: true, simulator: true, match: updated });
  }

  if (newElapsed >= 90) {
    db.prepare('UPDATE matches SET status = ?, elapsed_time = ? WHERE id = ?').run('finished', 90, match.id);
    const subtitle = `Score final : ${match.home_team} ${homeScore} - ${awayScore} ${match.away_team}`;
    db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'finished', ?, ?)`).run('ge-ft-' + now, match.id, 'FIN DU MATCH ! 🏁', subtitle);
    // Mi-temps simulateur : score à la 45e = score actuel (pas de score mi-temps distinct stocké).
    resolveHalftimeMarkets(match.id, match.home_team, match.away_team, homeScore, awayScore, false);
    resolveFulltimeMarkets(match.id, match.home_team, match.away_team, homeScore, awayScore, cornersHome, true);
    triggerWebhooks('match.finished', { id: match.id, home_score: homeScore, away_score: awayScore });
    broadcast('game_event', { type: 'finished', title: 'FIN DU MATCH ! 🏁', subtitle });
    const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
    broadcast('match_update', updated);
    return NextResponse.json({ success: true, simulator: true, match: updated });
  }

  const rand = Math.random();
  if (rand < 0.025) {
    const side = Math.random() > 0.55 ? 'home' : 'away';
    if (side === 'home') homeScore++; else awayScore++;
    const scorer = side === 'home' ? `${match.home_team} Striker` : `${match.away_team} Striker`;
    const title = `BUT POUR ${(side === 'home' ? match.home_team : match.away_team).toUpperCase()} ! ⚽`;
    const subtitle = `${scorer} marque ! (${homeScore} - ${awayScore})`;
    db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle, meta) VALUES (?, ?, 'goal', ?, ?, ?)`).run(
      'ge-goal-' + now, match.id, title, subtitle,
      JSON.stringify({ team: side, scorer, score: `${homeScore}-${awayScore}` }),
    );
    triggerWebhooks('match.goal', { team: side, score: `${homeScore}-${awayScore}` });
    broadcast('game_event', { type: 'goal', title, subtitle, meta: { team: side } });
  } else if (rand < 0.12) {
    cornersHome++;
  } else if (rand < 0.24) {
    shotsOnTargetHome++;
  } else if (rand < 0.27) {
    cardsHome++;
  }

  possessionHome = Math.max(35, Math.min(65, possessionHome + (Math.random() > 0.5 ? 1 : -1)));
  db.prepare(`UPDATE matches SET elapsed_time = ?, home_score = ?, away_score = ?, corners_home = ?, shots_on_target_home = ?, cards_home = ?, possession_home = ? WHERE id = ?`).run(
    newElapsed, homeScore, awayScore, cornersHome, shotsOnTargetHome, cardsHome, possessionHome, match.id,
  );
  suspendImpossibleOutcomes(match.id, homeScore, awayScore);
  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
  broadcast('match_update', updated);
  return NextResponse.json({ success: true, simulator: true, match: updated });
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const match = db.prepare('SELECT * FROM matches WHERE is_active = 1 LIMIT 1').get() as MatchRow | undefined;
    if (!match) return NextResponse.json({ success: true, message: 'Aucun match actif' });

    if (!['live', 'half_time'].includes(match.status)) {
      return NextResponse.json({ success: true, message: `Match non en direct (${match.status})` });
    }

    const now = Date.now();

    // Passer en mode simulateur si aucun identifiant externe n'est lié au match.
    const hasExternalIds = !!(match.odds_event_id || match.apifs_id ||
      match.id.startsWith('oai-') || match.id.startsWith('apifs-'));

    if (!hasExternalIds) {
      // Vérifier l'intervalle simulateur (14s)
      if (match.last_sync_at && now - new Date(match.last_sync_at as string).getTime() < 14_000) {
        return NextResponse.json({ success: true, message: 'Sync simulateur trop rapide', match });
      }
      db.prepare('UPDATE matches SET last_sync_at = ? WHERE id = ?').run(new Date(now).toISOString(), match.id);
      return handleSimulator(match, now);
    }

    // Délai de grace mi-temps pour API-Football sans odds-api (évite de brûler le quota pendant la pause)
    if (!match.odds_event_id && match.status === 'half_time') {
      const htEvent = db.prepare("SELECT created_at FROM game_events WHERE match_id = ? AND type = 'half_time' ORDER BY created_at DESC LIMIT 1").get(match.id) as { created_at: string } | undefined;
      if (htEvent) {
        const htTime = new Date(htEvent.created_at.replace(' ', 'T') + 'Z').getTime();
        if (now - htTime < 14 * 60_000) {
          return NextResponse.json({ success: true, message: 'Mi-temps (< 14 min) — sync externe ignorée', match });
        }
      }
    }

    // Rate limiting
    const interval = syncIntervalMs(match);
    if (match.last_sync_at && now - new Date(match.last_sync_at as string).getTime() < interval) {
      return NextResponse.json({ success: true, message: `Sync trop rapide (requis: ${interval / 1000}s)`, match });
    }
    db.prepare('UPDATE matches SET last_sync_at = ? WHERE id = ?').run(new Date(now).toISOString(), match.id);

    // ── Récupération des données live (orchestrateur 3 sources) ─────────────────
    const liveData = await getLiveData(match);

    // Persistance des IDs auto-découverts pour les prochains syncs
    if (liveData?.discoveredApifId) {
      db.prepare('UPDATE matches SET apifs_id = ? WHERE id = ?').run(String(liveData.discoveredApifId), match.id);
    }
    if (liveData?.discoveredFdId) {
      db.prepare('UPDATE matches SET fd_match_id = ? WHERE id = ?').run(String(liveData.discoveredFdId), match.id);
    }

    if (!liveData) {
      return NextResponse.json({ success: true, message: 'Aucune donnée live disponible (tous les providers ont échoué)', match });
    }

    const { score, status, halftimeScore, stats, scorers, cornerDataAvailable } = liveData;
    const homeScore = score.home;
    const awayScore = score.away;

    // ── Détection de but ────────────────────────────────────────────────────────
    if (homeScore > (match.home_score as number) || awayScore > (match.away_score as number)) {
      emitGoalEvent(match, homeScore, awayScore, scorers, now);
    }

    // ── Transitions de statut → résolution des marchés ──────────────────────────
    if (status !== match.status) {
      if (status === 'half_time') {
        db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'half_time', ?, ?)`).run('ge-ht-' + now, match.id, 'MI-TEMPS ! ⏸️', 'Fin de la première période.');
        // À la pause, le score courant EST le score de la mi-temps → fiable.
        resolveHalftimeMarkets(match.id, match.home_team, match.away_team, homeScore, awayScore, true);
        triggerWebhooks('match.status_change', { status: 'half_time' });
        broadcast('game_event', { type: 'half_time', title: 'MI-TEMPS ! ⏸️', subtitle: 'Fin de la première période.' });

      } else if (status === 'finished') {
        const subtitle = `Score final : ${match.home_team} ${homeScore} - ${awayScore} ${match.away_team}`;
        db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'finished', ?, ?)`).run('ge-ft-' + now, match.id, 'FIN DU MATCH ! 🏁', subtitle);

        // Mi-temps : fiable seulement si on a un score de pause distinct (jamais le score final).
        const htReliable = halftimeScore !== null;
        resolveHalftimeMarkets(
          match.id, match.home_team, match.away_team,
          halftimeScore?.home ?? homeScore, halftimeScore?.away ?? awayScore,
          htReliable,
        );

        resolveFulltimeMarkets(
          match.id, match.home_team, match.away_team,
          homeScore, awayScore,
          (stats as ApifStats | null)?.cornersHome ?? (match.corners_home as number) ?? 0,
          cornerDataAvailable,
        );

        logFirstScorerHint(match.id, scorers, match.home_team, match.away_team);
        triggerWebhooks('match.finished', { id: match.id, home_score: homeScore, away_score: awayScore });
        broadcast('game_event', { type: 'finished', title: 'FIN DU MATCH ! 🏁', subtitle });
      }
    }

    // ── Mise à jour DB ───────────────────────────────────────────────────────────
    const setClauses: string[] = ['home_score = ?', 'away_score = ?', 'status = ?'];
    const params: unknown[] = [homeScore, awayScore, status];

    if (liveData.elapsedTime) {
      setClauses.push('elapsed_time = ?');
      params.push(liveData.elapsedTime);
    }

    if (stats) {
      const fields: [string, number][] = [
        ['possession_home', stats.possessionHome],
        ['shots_home', stats.shotsHome],
        ['shots_away', stats.shotsAway],
        ['shots_on_target_home', stats.shotsOnTargetHome],
        ['shots_on_target_away', stats.shotsOnTargetAway],
        ['corners_home', stats.cornersHome],
        ['corners_away', stats.cornersAway],
        ['cards_home', stats.cardsHome],
        ['cards_away', stats.cardsAway],
        ['fouls_home', stats.foulsHome],
        ['fouls_away', stats.foulsAway],
        ['passes_accuracy_home', stats.passesAccuracyHome],
        ['passes_accuracy_away', stats.passesAccuracyAway],
      ];
      for (const [col, val] of fields) {
        setClauses.push(`${col} = ?`);
        params.push(val);
      }
    }

    params.push(match.id);
    db.prepare(`UPDATE matches SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

    suspendImpossibleOutcomes(match.id, homeScore, awayScore);
    const updatedMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
    broadcast('match_update', updatedMatch);

    return NextResponse.json({ success: true, sources: liveData.sources, match: updatedMatch });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Sync] Erreur:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
