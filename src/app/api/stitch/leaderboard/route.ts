import { NextResponse } from 'next/server';

// Simulation de classement pour Google Stitch
const LEADERBOARD_DATA = [
  { rank: 1, username: 'ToileMaster', balance: 9200, total_winnings: 15000, badges_count: 4 },
  { rank: 2, username: 'AlexPro99', balance: 8450, total_winnings: 12000, badges_count: 3 },
  { rank: 3, username: 'ShadowBet', balance: 7950, total_winnings: 11000, badges_count: 2 },
  { rank: 4, username: 'BetSniper', balance: 7820, total_winnings: 9800, badges_count: 2 },
  { rank: 5, username: 'LunaStat', balance: 7650, total_winnings: 8900, badges_count: 3 },
  { rank: 6, username: 'NeoPredict', balance: 7400, total_winnings: 7200, badges_count: 1 },
  { rank: 7, username: 'BleuFerveur', balance: 6300, total_winnings: 6100, badges_count: 1 },
  { rank: 8, username: 'KikiPronos', balance: 5800, total_winnings: 5000, badges_count: 2 }
];

export async function GET() {
  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    leaderboard: LEADERBOARD_DATA
  }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
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
