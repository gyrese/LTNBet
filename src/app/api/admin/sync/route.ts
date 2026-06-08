import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { broadcast } from '@/lib/sse-bus';
import { triggerWebhooks } from '@/lib/webhooks';

// Ensure matches table has last_sync_at column
try {
  db.exec('ALTER TABLE matches ADD COLUMN last_sync_at TEXT;');
} catch (e) {
  // Ignore if column already exists
}

function resolveMarket(matchId: string, marketId: string, outcomeId: string) {
  db.prepare('UPDATE markets SET is_closed = 1, resolved_outcome_id = ? WHERE id = ?').run(outcomeId, marketId);

  const pendingBets = db.prepare(`SELECT * FROM bets WHERE market_id = ? AND status = 'pending'`).all(marketId) as Record<string, any>[];
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
}

function resolveHalftimeMarkets(matchId: string, homeTeam: string, awayTeam: string, htHomeScore: number, htAwayScore: number) {
  // 1. halftime_result
  const htResultMarket = db.prepare("SELECT * FROM markets WHERE type = 'halftime_result' AND match_id = ?").get(matchId) as any;
  if (htResultMarket && !htResultMarket.is_closed) {
    let outcomeName = 'Nul';
    if (htHomeScore > htAwayScore) outcomeName = homeTeam;
    else if (htHomeScore < htAwayScore) outcomeName = awayTeam;

    const winOutcome = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(htResultMarket.id, outcomeName) as any;
    if (winOutcome) resolveMarket(matchId, htResultMarket.id, winOutcome.id);
  }

  // 2. halftime_score
  const htScoreMarket = db.prepare("SELECT * FROM markets WHERE type = 'halftime_score' AND match_id = ?").get(matchId) as any;
  if (htScoreMarket && !htScoreMarket.is_closed) {
    const scoreStr = `${htHomeScore}-${htAwayScore}`;
    let winOutcome = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(htScoreMarket.id, scoreStr) as any;
    if (!winOutcome) {
      winOutcome = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = 'Autre Score'").get(htScoreMarket.id) as any;
    }
    if (winOutcome) resolveMarket(matchId, htScoreMarket.id, winOutcome.id);
  }
}

function resolveFulltimeMarkets(matchId: string, homeTeam: string, awayTeam: string, homeScore: number, awayScore: number, cornersHome: number) {
  // 1. exact_score
  const scoreMarket = db.prepare("SELECT * FROM markets WHERE type = 'exact_score' AND match_id = ?").get(matchId) as any;
  if (scoreMarket && !scoreMarket.is_closed) {
    const finalScore = `${homeScore}-${awayScore}`;
    const winOutcome = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(scoreMarket.id, finalScore) as any;
    if (winOutcome) resolveMarket(matchId, scoreMarket.id, winOutcome.id);
  }

  // 2. final_result
  const resultMarket = db.prepare("SELECT * FROM markets WHERE type = 'final_result' AND match_id = ?").get(matchId) as any;
  if (resultMarket && !resultMarket.is_closed) {
    let outcomeName = 'Nul';
    if (homeScore > awayScore) outcomeName = homeTeam;
    else if (homeScore < awayScore) outcomeName = awayTeam;
    
    const winOutcome = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(resultMarket.id, outcomeName) as any;
    if (winOutcome) resolveMarket(matchId, resultMarket.id, winOutcome.id);
  }

  // 3. btts (LES DEUX ÉQUIPES MARQUENT)
  const bttsMarket = db.prepare("SELECT * FROM markets WHERE type = 'btts' AND match_id = ?").get(matchId) as any;
  if (bttsMarket && !bttsMarket.is_closed) {
    const outcomeName = (homeScore > 0 && awayScore > 0) ? 'Oui' : 'Non';
    const winOutcome = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(bttsMarket.id, outcomeName) as any;
    if (winOutcome) resolveMarket(matchId, bttsMarket.id, winOutcome.id);
  }

  // 4. over_under_25 (PLUS DE 2.5 BUTS DANS LE MATCH ?)
  const ou25Market = db.prepare("SELECT * FROM markets WHERE type = 'over_under_25' AND match_id = ?").get(matchId) as any;
  if (ou25Market && !ou25Market.is_closed) {
    const outcomeName = (homeScore + awayScore > 2.5) ? 'Oui' : 'Non';
    const winOutcome = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(ou25Market.id, outcomeName) as any;
    if (winOutcome) resolveMarket(matchId, ou25Market.id, winOutcome.id);
  }

  // 5. corners_count (NOMBRE DE CORNERS)
  const cornersMarket = db.prepare("SELECT * FROM markets WHERE type = 'corners_count' AND match_id = ?").get(matchId) as any;
  if (cornersMarket && !cornersMarket.is_closed) {
    let outcomeName = 'Moins de 5';
    if (cornersHome >= 5 && cornersHome <= 7) outcomeName = 'Entre 5 et 7';
    else if (cornersHome > 7) outcomeName = 'Plus de 7';

    const winOutcome = db.prepare("SELECT * FROM outcomes WHERE market_id = ? AND name = ?").get(cornersMarket.id, outcomeName) as any;
    if (winOutcome) resolveMarket(matchId, cornersMarket.id, winOutcome.id);
  }
}

export async function GET() {
  try {
    // 1. Get active match
    const match = db.prepare('SELECT * FROM matches WHERE is_active = 1 LIMIT 1').get() as any;
    if (!match) {
      return NextResponse.json({ success: true, message: 'Aucun match actif' });
    }

    if (match.status !== 'live') {
      return NextResponse.json({ success: true, message: `Match non en direct (${match.status})` });
    }

    // 2. Rate limiting of sync updates (max once every 14s)
    const now = Date.now();
    if (match.last_sync_at) {
      const lastSync = new Date(match.last_sync_at).getTime();
      if (now - lastSync < 14000) {
        return NextResponse.json({ success: true, message: 'Sync trop rapide, ignorée', match });
      }
    }

    // Update last sync timestamp immediately to prevent race conditions
    db.prepare('UPDATE matches SET last_sync_at = ? WHERE id = ?').run(new Date(now).toISOString(), match.id);

    const apiKey = process.env.FOOTBALL_API_KEY;

    // 3. API-Football Integration Path
    if (apiKey && match.id.startsWith('apifs-')) {
      const fixtureId = match.id.replace('apifs-', '');
      const res = await fetch(`https://v3.football.api-sports.io/fixtures?id=${fixtureId}`, {
        headers: {
          'x-apisports-key': apiKey
        }
      }).then(r => r.json());

      if (res.response && res.response[0]) {
        const apiFixture = res.response[0];
        const homeScore = apiFixture.goals.home ?? 0;
        const awayScore = apiFixture.goals.away ?? 0;
        const elapsedTime = apiFixture.fixture.status.elapsed ?? 0;

        const shortStatus = apiFixture.fixture.status.short;
        let status: 'upcoming' | 'live' | 'half_time' | 'finished' = 'upcoming';
        if (['1H', '2H', 'ET', 'P'].includes(shortStatus)) status = 'live';
        else if (shortStatus === 'HT') status = 'half_time';
        else if (['FT', 'AET', 'PEN'].includes(shortStatus)) status = 'finished';

        // Parse statistics
        let possessionHome = 50;
        let shotsOnTargetHome = 0;
        let cornersHome = 0;
        let cardsHome = 0;

        if (apiFixture.statistics && Array.isArray(apiFixture.statistics)) {
          // Find stats for home team
          const homeStats = apiFixture.statistics.find(
            (s: any) => s.team.name === match.home_team || s.team.id === apiFixture.teams.home.id
          );
          if (homeStats && Array.isArray(homeStats.statistics)) {
            const findVal = (type: string) => homeStats.statistics.find((st: any) => st.type === type)?.value;
            
            const posVal = findVal('Ball Possession');
            if (posVal) possessionHome = parseInt(String(posVal).replace('%', '')) || 50;

            const shotsVal = findVal('Shots on Goal');
            if (shotsVal) shotsOnTargetHome = parseInt(String(shotsVal)) || 0;

            const cornersVal = findVal('Corner Kicks');
            if (cornersVal) cornersHome = parseInt(String(cornersVal)) || 0;

            const yellowCards = parseInt(String(findVal('Yellow Cards') || 0)) || 0;
            const redCards = parseInt(String(findVal('Red Cards') || 0)) || 0;
            cardsHome = yellowCards + redCards;
          }
        }

        // Trigger goal celebration overlay if scores changed
        if (homeScore > match.home_score || awayScore > match.away_score) {
          const scoringTeam = homeScore > match.home_score ? 'home' : 'away';
          const newScore = `${homeScore}-${awayScore}`;

          // Find scorer name from events
          let scorer = scoringTeam === 'home' ? `${match.home_team} Striker` : `${match.away_team} Striker`;
          if (apiFixture.events && Array.isArray(apiFixture.events)) {
            const lastGoalEvent = apiFixture.events
              .filter((e: any) => e.type === 'Goal')
              .pop();
            if (lastGoalEvent && lastGoalEvent.player && lastGoalEvent.player.name) {
              scorer = lastGoalEvent.player.name;
            }
          }

          const eventTitle = `BUT POUR LA ${scoringTeam === 'home' ? match.home_team.toUpperCase() : match.away_team.toUpperCase()} ! ⚽`;
          const eventSubtitle = `${scorer} marque ! (${newScore})`;

          db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle, meta) VALUES (?, ?, 'goal', ?, ?, ?)`).run(
            'ge-goal-' + now,
            match.id,
            eventTitle,
            eventSubtitle,
            JSON.stringify({ team: scoringTeam, scorer, score: newScore })
          );

          triggerWebhooks('match.goal', { team: scoringTeam, score: newScore });
          broadcast('game_event', { type: 'goal', title: eventTitle, subtitle: eventSubtitle, meta: { team: scoringTeam } });
        }

        // Check milestones transitions
        if (status !== match.status) {
          let eventTitle = '';
          let eventSubtitle = '';
          if (status === 'half_time') {
            eventTitle = 'MI-TEMPS ! ⏸️';
            eventSubtitle = 'Fin de la première période.';
            db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'half_time', ?, ?)`).run(
              'ge-ht-' + now, match.id, eventTitle, eventSubtitle
            );

            // Resolve halftime markets
            const htHome = apiFixture.score?.halftime?.home ?? homeScore;
            const htAway = apiFixture.score?.halftime?.away ?? awayScore;
            resolveHalftimeMarkets(match.id, match.home_team, match.away_team, htHome, htAway);

            triggerWebhooks('match.status_change', { status: 'half_time', time_elapsed: 45 });
          } else if (status === 'finished') {
            eventTitle = 'FIN DU MATCH ! 🏁';
            eventSubtitle = `Score final : ${match.home_team} ${homeScore} - ${awayScore} ${match.away_team}`;
            db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'finished', ?, ?)`).run(
              'ge-ft-' + now, match.id, eventTitle, eventSubtitle
            );

            // Resolve halftime markets (safety in case skipped)
            const htHome = apiFixture.score?.halftime?.home ?? homeScore;
            const htAway = apiFixture.score?.halftime?.away ?? awayScore;
            resolveHalftimeMarkets(match.id, match.home_team, match.away_team, htHome, htAway);

            // Resolve all fulltime markets
            resolveFulltimeMarkets(match.id, match.home_team, match.away_team, homeScore, awayScore, cornersHome);

            triggerWebhooks('match.status_change', { status: 'finished', time_elapsed: elapsedTime });
            triggerWebhooks('match.finished', { id: match.id, home_score: homeScore, away_score: awayScore });
          }

          if (eventTitle) {
            broadcast('game_event', { type: status, title: eventTitle, subtitle: eventSubtitle });
          }
        }

        // Save updated data
        db.prepare(`
          UPDATE matches 
          SET elapsed_time = ?, home_score = ?, away_score = ?, corners_home = ?, 
              shots_on_target_home = ?, cards_home = ?, possession_home = ?, status = ?
          WHERE id = ?
        `).run(elapsedTime, homeScore, awayScore, cornersHome, shotsOnTargetHome, cardsHome, possessionHome, status, match.id);

        const updatedMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
        broadcast('match_update', updatedMatch);

        return NextResponse.json({ success: true, fromApi: true, match: updatedMatch });
      }
    }

    // 4. Fallback: Local Simulator Path
    const newElapsedTime = match.elapsed_time + 1;
    let newStatus = match.status;

    // Handle time milestones for simulator
    if (newElapsedTime === 45) {
      newStatus = 'half_time';
      db.prepare('UPDATE matches SET status = ?, elapsed_time = ? WHERE id = ?').run(newStatus, newElapsedTime, match.id);
      
      const eventTitle = 'MI-TEMPS ! ⏸️';
      const eventSubtitle = 'Fin de la première période.';
      db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'half_time', ?, ?)`).run(
        'ge-ht-' + now, match.id, eventTitle, eventSubtitle
      );

      // Resolve halftime markets
      resolveHalftimeMarkets(match.id, match.home_team, match.away_team, match.home_score, match.away_score);

      triggerWebhooks('match.status_change', { status: 'half_time', time_elapsed: 45 });
      broadcast('game_event', { type: 'half_time', title: eventTitle, subtitle: eventSubtitle });
      
      const updatedMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
      broadcast('match_update', updatedMatch);
      return NextResponse.json({ success: true, match: updatedMatch });
    }

    if (newElapsedTime >= 90) {
      newStatus = 'finished';
      db.prepare('UPDATE matches SET status = ?, elapsed_time = ? WHERE id = ?').run(newStatus, 90, match.id);

      const eventTitle = 'FIN DU MATCH ! 🏁';
      const eventSubtitle = `Score final : ${match.home_team} ${match.home_score} - ${match.away_score} ${match.away_team}`;
      db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'finished', ?, ?)`).run(
        'ge-ft-' + now, match.id, eventTitle, eventSubtitle
      );

      // Resolve Halftime Markets (if skipped)
      resolveHalftimeMarkets(match.id, match.home_team, match.away_team, match.home_score, match.away_score);

      // Resolve Fulltime Markets
      resolveFulltimeMarkets(match.id, match.home_team, match.away_team, match.home_score, match.away_score, match.corners_home);

      triggerWebhooks('match.status_change', { status: 'finished', time_elapsed: 90 });
      triggerWebhooks('match.finished', { id: match.id, home_score: match.home_score, away_score: match.away_score });
      broadcast('game_event', { type: 'finished', title: eventTitle, subtitle: eventSubtitle });
      
      const updatedMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
      broadcast('match_update', updatedMatch);
      return NextResponse.json({ success: true, match: updatedMatch });
    }

    // Normal minute simulation (Random Events)
    let homeScore = match.home_score;
    let awayScore = match.away_score;
    let cornersHome = match.corners_home;
    let shotsOnTargetHome = match.shots_on_target_home;
    let cardsHome = match.cards_home;
    let possessionHome = match.possession_home;

    const rand = Math.random();

    // Goal event: ~2.5% chance per minute
    if (rand < 0.025) {
      const scoringTeam = Math.random() > 0.55 ? 'home' : 'away';
      if (scoringTeam === 'home') homeScore++; else awayScore++;
      const scorer = scoringTeam === 'home' ? `${match.home_team} Striker` : `${match.away_team} Striker`;

      const eventTitle = `BUT POUR LA ${scoringTeam === 'home' ? match.home_team.toUpperCase() : match.away_team.toUpperCase()} ! ⚽`;
      const eventSubtitle = `${scorer} marque ! (${homeScore} - ${awayScore})`;

      db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle, meta) VALUES (?, ?, 'goal', ?, ?, ?)`).run(
        'ge-goal-' + now,
        match.id,
        eventTitle,
        eventSubtitle,
        JSON.stringify({ team: scoringTeam, scorer, score: `${homeScore}-${awayScore}` })
      );

      triggerWebhooks('match.goal', { team: scoringTeam, score: `${homeScore}-${awayScore}` });
      broadcast('game_event', { type: 'goal', title: eventTitle, subtitle: eventSubtitle, meta: { team: scoringTeam } });
    }
    // Corner event: ~10% chance
    else if (rand < 0.12) {
      cornersHome++;
    }
    // Shot on target event: ~12% chance
    else if (rand < 0.24) {
      shotsOnTargetHome++;
    }
    // Card event: ~3% chance
    else if (rand < 0.27) {
      cardsHome++;
    }

    // Dynamic possession drift
    possessionHome = Math.max(35, Math.min(65, possessionHome + (Math.random() > 0.5 ? 1 : -1)));

    db.prepare(`
      UPDATE matches 
      SET elapsed_time = ?, home_score = ?, away_score = ?, corners_home = ?, 
          shots_on_target_home = ?, cards_home = ?, possession_home = ?
      WHERE id = ?
    `).run(newElapsedTime, homeScore, awayScore, cornersHome, shotsOnTargetHome, cardsHome, possessionHome, match.id);

    const updatedMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
    broadcast('match_update', updatedMatch);

    return NextResponse.json({ success: true, simulator: true, match: updatedMatch });
  } catch (error: any) {
    console.error('[Sync] Error during background match sync:', error);
    return NextResponse.json({ success: false, error: error.message || error }, { status: 500 });
  }
}
