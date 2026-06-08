import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const players = db.prepare('SELECT * FROM players ORDER BY (toiles_coins + total_winnings) DESC').all() as any[];

    const leaderboard = players.map((p, idx) => {
      const badgesCount = p.is_bot
        ? Math.max(1, 4 - Math.floor(idx / 3))
        : Math.min(5, Math.floor(p.successful_bets / 2) + (p.total_winnings > 5000 ? 1 : 0));

      return {
        rank: idx + 1,
        username: p.username,
        balance: p.toiles_coins,
        total_winnings: p.total_winnings,
        badges_count: badgesCount
      };
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      leaderboard
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Impossible de récupérer le classement.' }, { status: 500 });
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
