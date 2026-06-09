import { NextResponse } from 'next/server';
import { listLeagues, listEvents, getOddsApiKey, type OaiEvent } from '@/lib/odds-provider';

export const dynamic = 'force-dynamic';

// Mappe le statut odds-api.io vers nos statuts internes.
function mapStatus(s?: string): 'upcoming' | 'live' | 'half_time' | 'finished' {
  const v = (s || '').toLowerCase();
  if (v === 'live' || v === 'inplay' || v === 'playing') return 'live';
  if (v === 'ht' || v === 'half_time' || v === 'halftime') return 'half_time';
  if (v === 'finished' || v === 'ended' || v === 'ft' || v === 'closed') return 'finished';
  return 'upcoming';
}

// Transforme un event odds-api.io en objet « match » consommable par create_session / l'UI.
function toMatch(e: OaiEvent) {
  return {
    id: 'oai-' + e.id,
    oddsEventId: e.id,
    homeTeam: e.home,
    awayTeam: e.away,
    homeScore: e.scores?.home ?? 0,
    awayScore: e.scores?.away ?? 0,
    status: mapStatus(e.status),
    startsAt: e.date,
    league: e.league?.name ?? '',
    leagueSlug: e.league?.slug ?? '',
    elapsedTime: 0,
    possessionHome: 50,
    shotsOnTargetHome: 0,
    cornersHome: 0,
    cardsHome: 0,
  };
}

// Pool de secours si aucune clé n'est configurée (démo locale).
const FALLBACK_POOL = [
  { id: 'demo-fra-esp', oddsEventId: null, homeTeam: 'France', awayTeam: 'Espagne', homeScore: 0, awayScore: 0, status: 'upcoming', startsAt: new Date(Date.now() + 2 * 3600_000).toISOString(), league: 'Match de démonstration', leagueSlug: '', elapsedTime: 0, possessionHome: 50, shotsOnTargetHome: 0, cornersHome: 0, cardsHome: 0 },
  { id: 'demo-fra-por', oddsEventId: null, homeTeam: 'France', awayTeam: 'Portugal', homeScore: 0, awayScore: 0, status: 'upcoming', startsAt: new Date(Date.now() + 26 * 3600_000).toISOString(), league: 'Match de démonstration', leagueSlug: '', elapsedTime: 0, possessionHome: 50, shotsOnTargetHome: 0, cornersHome: 0, cardsHome: 0 },
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const op = searchParams.get('op') || 'events';

    if (!getOddsApiKey()) {
      // Pas de clé → mode démo
      if (op === 'leagues') return NextResponse.json({ success: true, popular: [], all: [], demo: true });
      return NextResponse.json({ success: true, results: FALLBACK_POOL, demo: true });
    }

    // ── Liste des compétitions (pour le sélecteur) ──
    if (op === 'leagues') {
      const { popular, all } = await listLeagues();
      return NextResponse.json({ success: true, popular, all });
    }

    // ── Liste des matchs (filtre ligue + date + recherche texte) ──
    const leagueSlug = searchParams.get('league') || undefined;
    const date = searchParams.get('date') || undefined;
    const q = searchParams.get('q') || undefined;

    // Garde-fou : sans ligue ni recherche, on exige au moins une date pour ne pas
    // ramener le monde entier. Si aucun filtre, on prend la date du jour.
    const effectiveDate = leagueSlug ? date : date || new Date().toISOString().split('T')[0];

    const events = await listEvents({ leagueSlug, date: effectiveDate, search: q, limit: 100 });
    return NextResponse.json({ success: true, results: events.map(toMatch) });
  } catch (error) {
    console.error('Match search error:', error);
    return NextResponse.json({ success: false, error: 'Erreur lors de la recherche de match.' }, { status: 500 });
  }
}
