import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    const activeRow = db.prepare('SELECT id FROM matches WHERE is_active = 1 LIMIT 1').get() as { id: string } | undefined;
    const activeMatchId = activeRow?.id || (db.prepare('SELECT id FROM matches ORDER BY starts_at DESC LIMIT 1').get() as { id: string } | undefined)?.id;

    if (!activeMatchId) {
      return NextResponse.json({ success: false, error: 'Aucun match actif.' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(activeMatchId) as any;
    if (!m) {
      return NextResponse.json({ success: false, error: 'Match introuvable.' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const marketsRaw = db.prepare('SELECT * FROM markets WHERE match_id = ? ORDER BY created_at').all(activeMatchId) as any[];
    const markets = marketsRaw.map(mkt => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outcomesRaw = db.prepare('SELECT * FROM outcomes WHERE market_id = ?').all(mkt.id) as any[];
      return {
        id: mkt.id,
        title: mkt.title,
        is_closed: Boolean(mkt.is_closed),
        outcomes: outcomesRaw.map(o => ({
          name: o.name,
          odds: parseFloat(o.current_odds),
          bets_amount: o.total_bet_amount
        }))
      };
    });

    const matchData = {
      id: m.id,
      teams: {
        home: { name: m.home_team, code: m.home_team.substring(0, 3).toUpperCase(), score: m.home_score },
        away: { name: m.away_team, code: m.away_team.substring(0, 3).toUpperCase(), score: m.away_score }
      },
      status: m.status,
      time_elapsed: m.elapsed_time,
      stats: {
        possession_home: m.possession_home,
        possession_away: 100 - m.possession_home,
        shots_on_target_home: m.shots_on_target_home,
        shots_on_target_away: 2,
        corners_home: m.corners_home,
        corners_away: 3,
        cards_home: m.cards_home,
        cards_away: 0
      },
      markets
    };

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      match: matchData
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Erreur lors de la récupération du match.' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
