import { NextResponse } from 'next/server';
import db, { suspendImpossibleOutcomes } from '@/lib/db';
import { broadcast } from '@/lib/sse-bus';
import { triggerWebhooks } from '@/lib/webhooks';
import { getLiveEvent } from '@/lib/odds-provider';

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

    if (match.status !== 'live' && match.status !== 'half_time') {
      return NextResponse.json({ success: true, message: `Match non en direct (${match.status})` });
    }

    const now = Date.now();
    const isApiFootball = typeof match.id === 'string' && match.id.startsWith('apifs-');

    // Halftime skip logic for API-Football (wait 14m before calling API again)
    if (isApiFootball && match.status === 'half_time') {
      const htEvent = db.prepare("SELECT created_at FROM game_events WHERE match_id = ? AND type = 'half_time' ORDER BY created_at DESC LIMIT 1").get(match.id) as { created_at: string } | undefined;
      if (htEvent) {
        const htTime = new Date(htEvent.created_at + ' Z').getTime();
        const elapsedHtMs = now - htTime;
        if (elapsedHtMs < 14 * 60 * 1000) {
          return NextResponse.json({ success: true, message: 'Mi-temps en cours (< 14 min), sync externe ignorée', match });
        }
      }
    }

    // Define dynamic sync intervals to respect rate limits
    let syncInterval = 14000; // default for simulator and odds-api
    if (isApiFootball) {
      if (match.status === 'live') {
        syncInterval = 80000; // 80s
      } else if (match.status === 'half_time') {
        syncInterval = 300000; // 5 min
      }
    }

    if (match.last_sync_at) {
      const lastSync = new Date(match.last_sync_at).getTime();
      if (now - lastSync < syncInterval) {
        return NextResponse.json({ success: true, message: `Sync trop rapide, ignorée (requis: ${syncInterval/1000}s)`, match });
      }
    }

    // Update last sync timestamp immediately to prevent race conditions
    db.prepare('UPDATE matches SET last_sync_at = ? WHERE id = ?').run(new Date(now).toISOString(), match.id);

    const apiKey = process.env.FOOTBALL_API_KEY;

    // 3a. odds-api.io Live Path (source principale : score + statut réels, liés par event id)
    const oaiEventId = match.odds_event_id || (typeof match.id === 'string' && match.id.startsWith('oai-') ? match.id.replace('oai-', '') : null);
    if (oaiEventId) {
      const ev = await getLiveEvent(oaiEventId);
      if (!ev) {
        // Pas de données live : on NE simule PAS un vrai match (évite de faux buts aléatoires).
        return NextResponse.json({ success: true, message: 'oai: pas de données live', match });
      }

      const homeScore = ev.scores?.home ?? match.home_score;
      const awayScore = ev.scores?.away ?? match.away_score;

      const raw = (ev.status || '').toLowerCase();
      let status: string = match.status;
      if (['finished', 'ended', 'ft', 'aet', 'pen', 'closed'].includes(raw)) status = 'finished';
      else if (['ht', 'halftime', 'half_time', 'pause'].includes(raw)) status = 'half_time';
      else if (['live', 'inplay', 'playing', '1h', '2h', 'et'].includes(raw)) status = 'live';
      // raw === 'pending' / inconnu → on conserve le statut courant (l'admin peut le piloter).

      // But marqué : un score a augmenté.
      if (homeScore > match.home_score || awayScore > match.away_score) {
        const scoringTeam = homeScore > match.home_score ? 'home' : 'away';
        const teamName = scoringTeam === 'home' ? match.home_team : match.away_team;
        const newScore = `${homeScore}-${awayScore}`;
        const eventTitle = `BUT POUR ${String(teamName).toUpperCase()} ! ⚽`;
        const eventSubtitle = `${teamName} marque ! (${newScore})`;
        db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle, meta) VALUES (?, ?, 'goal', ?, ?, ?)`).run(
          'ge-goal-' + now, match.id, eventTitle, eventSubtitle, JSON.stringify({ team: scoringTeam, score: newScore }),
        );
        triggerWebhooks('match.goal', { team: scoringTeam, score: newScore });
        broadcast('game_event', { type: 'goal', title: eventTitle, subtitle: eventSubtitle, meta: { team: scoringTeam } });
      }

      // Transition de statut → résolution des marchés.
      if (status !== match.status) {
        const htHome = ev.scores?.periods?.p1?.home ?? homeScore;
        const htAway = ev.scores?.periods?.p1?.away ?? awayScore;
        if (status === 'half_time') {
          db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'half_time', ?, ?)`).run('ge-ht-' + now, match.id, 'MI-TEMPS ! ⏸️', 'Fin de la première période.');
          resolveHalftimeMarkets(match.id, match.home_team, match.away_team, htHome, htAway);
          triggerWebhooks('match.status_change', { status: 'half_time' });
          broadcast('game_event', { type: 'half_time', title: 'MI-TEMPS ! ⏸️', subtitle: 'Fin de la première période.' });
        } else if (status === 'finished') {
          db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'finished', ?, ?)`).run('ge-ft-' + now, match.id, 'FIN DU MATCH ! 🏁', `Score final : ${match.home_team} ${homeScore} - ${awayScore} ${match.away_team}`);
          resolveHalftimeMarkets(match.id, match.home_team, match.away_team, htHome, htAway);
          resolveFulltimeMarkets(match.id, match.home_team, match.away_team, homeScore, awayScore, match.corners_home);
          triggerWebhooks('match.finished', { id: match.id, home_score: homeScore, away_score: awayScore });
          broadcast('game_event', { type: 'finished', title: 'FIN DU MATCH ! 🏁', subtitle: `Score final : ${match.home_team} ${homeScore} - ${awayScore} ${match.away_team}` });
        }
      }

      db.prepare('UPDATE matches SET home_score = ?, away_score = ?, status = ? WHERE id = ?').run(homeScore, awayScore, status, match.id);
      suspendImpossibleOutcomes(match.id, homeScore, awayScore);
      const updatedMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
      broadcast('match_update', updatedMatch);
      return NextResponse.json({ success: true, fromOddsApi: true, match: updatedMatch });
    }    // 3. API-Football Integration Path
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

        // Parse statistics using the second endpoint
        let possessionHome = 50;
        let shotsHome = 0;
        let shotsAway = 0;
        let shotsOnTargetHome = 0;
        let shotsOnTargetAway = 0;
        let cornersHome = 0;
        let cornersAway = 0;
        let cardsHome = 0;
        let cardsAway = 0;
        let foulsHome = 0;
        let foulsAway = 0;
        let passesAccuracyHome = 80;
        let passesAccuracyAway = 80;

        try {
          const statsRes = await fetch(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}`, {
            headers: {
              'x-apisports-key': apiKey
            }
          }).then(r => r.json());

          if (statsRes.response && Array.isArray(statsRes.response)) {
            const homeStats = statsRes.response.find(
              (s: any) => s.team.id === apiFixture.teams.home.id || s.team.name === match.home_team
            );
            const awayStats = statsRes.response.find(
              (s: any) => s.team.id === apiFixture.teams.away.id || s.team.name === match.away_team
            );

            const extractVal = (teamStats: any, type: string) => {
              if (!teamStats || !Array.isArray(teamStats.statistics)) return null;
              return teamStats.statistics.find((st: any) => st.type === type)?.value;
            };

            if (homeStats) {
              const posVal = extractVal(homeStats, 'Ball Possession');
              if (posVal) possessionHome = parseInt(String(posVal).replace('%', '')) || 50;

              shotsHome = parseInt(String(extractVal(homeStats, 'Total Shots') || 0)) || 0;
              shotsOnTargetHome = parseInt(String(extractVal(homeStats, 'Shots on Goal') || 0)) || 0;
              cornersHome = parseInt(String(extractVal(homeStats, 'Corner Kicks') || 0)) || 0;
              
              const yellow = parseInt(String(extractVal(homeStats, 'Yellow Cards') || 0)) || 0;
              const red = parseInt(String(extractVal(homeStats, 'Red Cards') || 0)) || 0;
              cardsHome = yellow + red;

              foulsHome = parseInt(String(extractVal(homeStats, 'Fouls') || 0)) || 0;

              const passesPct = extractVal(homeStats, 'Passes %');
              if (passesPct) passesAccuracyHome = parseInt(String(passesPct).replace('%', '')) || 80;
            }

            if (awayStats) {
              const posVal = extractVal(awayStats, 'Ball Possession');
              if (posVal && !homeStats) possessionHome = 100 - (parseInt(String(posVal).replace('%', '')) || 50);

              shotsAway = parseInt(String(extractVal(awayStats, 'Total Shots') || 0)) || 0;
              shotsOnTargetAway = parseInt(String(extractVal(awayStats, 'Shots on Goal') || 0)) || 0;
              cornersAway = parseInt(String(extractVal(awayStats, 'Corner Kicks') || 0)) || 0;
              
              const yellow = parseInt(String(extractVal(awayStats, 'Yellow Cards') || 0)) || 0;
              const red = parseInt(String(extractVal(awayStats, 'Red Cards') || 0)) || 0;
              cardsAway = yellow + red;

              foulsAway = parseInt(String(extractVal(awayStats, 'Fouls') || 0)) || 0;

              const passesPct = extractVal(awayStats, 'Passes %');
              if (passesPct) passesAccuracyAway = parseInt(String(passesPct).replace('%', '')) || 80;
            }
          }
        } catch (err) {
          console.error('[Sync API-Football] Error fetching statistics:', err);
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
          SET elapsed_time = ?, home_score = ?, away_score = ?, 
              corners_home = ?, corners_away = ?,
              shots_home = ?, shots_away = ?,
              shots_on_target_home = ?, shots_on_target_away = ?,
              cards_home = ?, cards_away = ?,
              possession_home = ?,
              fouls_home = ?, fouls_away = ?,
              passes_accuracy_home = ?, passes_accuracy_away = ?,
              status = ?
          WHERE id = ?
        `).run(
          elapsedTime, homeScore, awayScore, 
          cornersHome, cornersAway,
          shotsHome, shotsAway,
          shotsOnTargetHome, shotsOnTargetAway,
          cardsHome, cardsAway,
          possessionHome,
          foulsHome, foulsAway,
          passesAccuracyHome, passesAccuracyAway,
          status, match.id
        );
        suspendImpossibleOutcomes(match.id, homeScore, awayScore);

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
    suspendImpossibleOutcomes(match.id, homeScore, awayScore);

    const updatedMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
    broadcast('match_update', updatedMatch);

    return NextResponse.json({ success: true, simulator: true, match: updatedMatch });
  } catch (error: any) {
    console.error('[Sync] Error during background match sync:', error);
    return NextResponse.json({ success: false, error: error.message || error }, { status: 500 });
  }
}
