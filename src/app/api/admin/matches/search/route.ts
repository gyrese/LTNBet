import { NextResponse } from 'next/server';

// Pool de matchs réalistes (fallback)
const MATCH_POOL = [
  {
    id: 'api-match-fra-esp',
    homeTeam: 'France',
    awayTeam: 'Espagne',
    homeScore: 0,
    awayScore: 0,
    status: 'upcoming',
    startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    elapsedTime: 0,
    possessionHome: 50,
    shotsOnTargetHome: 0,
    cornersHome: 0,
    cardsHome: 0
  },
  {
    id: 'api-match-fra-por',
    homeTeam: 'France',
    awayTeam: 'Portugal',
    homeScore: 2,
    awayScore: 1,
    status: 'live',
    startsAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    elapsedTime: 40,
    possessionHome: 52,
    shotsOnTargetHome: 5,
    cornersHome: 4,
    cardsHome: 1
  },
  {
    id: 'api-match-ita-fra',
    homeTeam: 'Italie',
    awayTeam: 'France',
    homeScore: 1,
    awayScore: 3,
    status: 'finished',
    startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    elapsedTime: 90,
    possessionHome: 44,
    shotsOnTargetHome: 3,
    cornersHome: 2,
    cardsHome: 2
  }
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.toLowerCase() || '';

    const apiKey = process.env.FOOTBALL_API_KEY;

    if (apiKey) {
      // Rechercher les matchs d'aujourd'hui sur l'API externe (consomme 1 requête de recherche)
      const todayStr = new Date().toISOString().split('T')[0];
      const res = await fetch(`https://v3.football.api-sports.io/fixtures?date=${todayStr}`, {
        headers: {
          'x-apisports-key': apiKey
        }
      }).then(r => r.json());

      if (res.response && Array.isArray(res.response)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const apiResults = res.response.map((item: any) => {
          // Mapper le status de l'API
          const shortStatus = item.fixture.status.short;
          let status: 'upcoming' | 'live' | 'half_time' | 'finished' = 'upcoming';
          if (['1H', '2H', 'ET', 'P'].includes(shortStatus)) status = 'live';
          else if (shortStatus === 'HT') status = 'half_time';
          else if (['FT', 'AET', 'PEN'].includes(shortStatus)) status = 'finished';

          return {
            id: 'apifs-' + item.fixture.id, // Prefix to identify API-Football fixture
            homeTeam: item.teams.home.name,
            awayTeam: item.teams.away.name,
            homeScore: item.goals.home ?? 0,
            awayScore: item.goals.away ?? 0,
            status,
            startsAt: item.fixture.date,
            elapsedTime: item.fixture.status.elapsed ?? 0,
            possessionHome: 50, // Les stats détaillées seront récupérées lors du live sync
            shotsOnTargetHome: 0,
            cornersHome: 0,
            cardsHome: 0
          };
        });

        // Filtrer les résultats par le terme de recherche
        const results = query
          ? apiResults.filter(
              (m: { homeTeam: string; awayTeam: string }) =>
                m.homeTeam.toLowerCase().includes(query) ||
                m.awayTeam.toLowerCase().includes(query)
            )
          : apiResults;

        return NextResponse.json({ success: true, results });
      }
    }

    // Fallback Mock local
    const results = query
      ? MATCH_POOL.filter(
          m =>
            m.homeTeam.toLowerCase().includes(query) ||
            m.awayTeam.toLowerCase().includes(query)
        )
      : MATCH_POOL;

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Match search error:', error);
    return NextResponse.json({ success: false, error: 'Erreur recherche de match' }, { status: 500 });
  }
}
