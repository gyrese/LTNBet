import { NextResponse } from 'next/server';

// Données statiques ou lues depuis la base de données
const MATCH_DATA = {
  id: 'match-france-england-2026',
  teams: {
    home: { name: 'France', code: 'FRA', score: 1 },
    away: { name: 'Angleterre', code: 'ENG', score: 0 }
  },
  status: 'live',
  time_elapsed: 65,
  stats: {
    possession_home: 55,
    possession_away: 45,
    shots_on_target_home: 4,
    shots_on_target_away: 2,
    corners_home: 5,
    corners_away: 3,
    cards_home: 1,
    cards_away: 0
  },
  markets: [
    {
      id: 'm-resultat-final',
      title: 'Résultat du match',
      is_closed: false,
      outcomes: [
        { name: 'France', odds: 1.40, bets_amount: 8500 },
        { name: 'Nul', odds: 3.20, bets_amount: 2400 },
        { name: 'Angleterre', odds: 5.50, bets_amount: 1100 }
      ]
    },
    {
      id: 'm-score-exact',
      title: 'Score exact',
      is_closed: false,
      outcomes: [
        { name: '1-0', odds: 2.10, bets_amount: 4500 },
        { name: '2-0', odds: 4.50, bets_amount: 1200 },
        { name: '2-1', odds: 6.00, bets_amount: 2100 }
      ]
    }
  ]
};

export async function GET() {
  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    match: MATCH_DATA
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
