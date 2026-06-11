/**
 * API-Football (v3.football.api-sports.io) — SOURCE PRIMAIRE pour :
 *   - Statistiques live (possession, tirs, corners, cartes, fautes)
 *   - Buteurs / événements de but
 *   - Découverte automatique d'un fixture par noms d'équipes + date
 *
 * Optimisations quota (plan gratuit ≈ 100 req/jour) :
 *   - Le cache des stats dure 5 min → ~18 appels stats / match de 90 min.
 *   - La découverte du fixture est cachée 30 min.
 *   - Quand odds-api.io est la source de score, on utilise statsOnly=true
 *     → zéro appel fixture, seulement les stats cachées.
 */

const BASE = 'https://v3.football.api-sports.io';

export function getApifKey(): string | undefined {
  return process.env.FOOTBALL_API_KEY;
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

interface ApifEnvelope<T> {
  response: T[];
}

async function apiFetch<T>(path: string): Promise<T[] | null> {
  const key = getApifKey();
  if (!key) return null;
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { 'x-apisports-key': key } });
    if (!res.ok) {
      console.error(`[api-football] HTTP ${res.status} — ${path}`);
      return null;
    }
    const json = await res.json() as ApifEnvelope<T>;
    return Array.isArray(json.response) ? json.response : null;
  } catch (err) {
    console.error('[api-football] fetch error', path, err);
    return null;
  }
}

// ─── Team name normalisation (matching inter-API) ────────────────────────────

function normTeam(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\b(fc|sc|as|ac|afc|cf|rc|sd|rcd|ud|cd|ss|sk|fk|vv|sv)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamsMatch(a: string, b: string): boolean {
  const na = normTeam(a);
  const nb = normTeam(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = new Set(na.split(' ').filter(w => w.length >= 3));
  const hits = nb.split(' ').filter(w => w.length >= 3 && wa.has(w));
  return hits.length >= 2 || (hits.length === 1 && hits[0].length >= 5);
}

// ─── Fixture discovery ────────────────────────────────────────────────────────

interface ApifFixtureShort {
  fixture: { id: number };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
}

const discoveryCache = new Map<string, { id: number; at: number }>();
const DISCOVERY_TTL = 30 * 60_000;

/** Trouve le fixture id API-Football à partir des noms d'équipes et de la date. */
export async function findFixtureId(
  homeTeam: string,
  awayTeam: string,
  dateIso: string,
): Promise<number | null> {
  const date = dateIso.slice(0, 10);
  const key = `${normTeam(homeTeam)}|${normTeam(awayTeam)}|${date}`;
  const cached = discoveryCache.get(key);
  if (cached && Date.now() - cached.at < DISCOVERY_TTL) return cached.id;

  const fixtures = await apiFetch<ApifFixtureShort>(`/fixtures?date=${date}`);
  if (!fixtures) return null;

  const found = fixtures.find(f =>
    teamsMatch(f.teams.home.name, homeTeam) &&
    teamsMatch(f.teams.away.name, awayTeam),
  );

  if (found) {
    discoveryCache.set(key, { id: found.fixture.id, at: Date.now() });
    return found.fixture.id;
  }
  return null;
}

// ─── Types live ───────────────────────────────────────────────────────────────

export interface ApifStats {
  possessionHome: number;
  shotsHome: number;
  shotsAway: number;
  shotsOnTargetHome: number;
  shotsOnTargetAway: number;
  cornersHome: number;
  cornersAway: number;
  cardsHome: number;
  cardsAway: number;
  foulsHome: number;
  foulsAway: number;
  passesAccuracyHome: number;
  passesAccuracyAway: number;
}

export interface ApifScorerEvent {
  team: 'home' | 'away';
  playerName: string;
  minute: number;
}

export interface ApifLiveData {
  score: { home: number; away: number };
  status: 'upcoming' | 'live' | 'half_time' | 'finished';
  elapsedTime: number;
  halftimeScore: { home: number; away: number } | null;
  stats: ApifStats | null;
  scorers: ApifScorerEvent[];
}

// ─── Status mapping ───────────────────────────────────────────────────────────

export function mapApifStatus(short: string): 'upcoming' | 'live' | 'half_time' | 'finished' {
  if (['1H', '2H', 'ET', 'P'].includes(short)) return 'live';
  if (short === 'HT') return 'half_time';
  if (['FT', 'AET', 'PEN'].includes(short)) return 'finished';
  return 'upcoming';
}

// ─── Stats cache (5 min) ──────────────────────────────────────────────────────

const statsCache = new Map<number, { at: number; data: ApifStats }>();
// API-Football est la source primaire (score + stats) → on préserve le quota : stats rafraîchies
// toutes les 5 min (le score, lui, est récupéré à chaque cycle via l'appel fixture).
const STATS_TTL = 5 * 60_000;

interface ApifStatTeam {
  team: { id: number };
  statistics: Array<{ type: string; value: string | number | null }>;
}

async function fetchStats(fixtureId: number, homeTeamId: number, awayTeamId: number): Promise<ApifStats | null> {
  const cached = statsCache.get(fixtureId);
  if (cached && Date.now() - cached.at < STATS_TTL) return cached.data;

  const rows = await apiFetch<ApifStatTeam>(`/fixtures/statistics?fixture=${fixtureId}`);
  if (!Array.isArray(rows) || !rows.length) return null;

  const hRow = rows.find(r => r.team?.id === homeTeamId);
  const aRow = rows.find(r => r.team?.id === awayTeamId);

  const get = (row: ApifStatTeam | undefined, type: string) =>
    row?.statistics.find(s => s.type === type)?.value ?? null;
  const n = (v: unknown) => { const x = parseInt(String(v ?? 0)); return isNaN(x) ? 0 : x; };
  const pct = (v: unknown) => { const x = parseInt(String(v ?? '').replace('%', '')); return isNaN(x) ? null : x; };

  const stats: ApifStats = {
    possessionHome: pct(get(hRow, 'Ball Possession')) ?? 50,
    shotsHome: n(get(hRow, 'Total Shots')),
    shotsAway: n(get(aRow, 'Total Shots')),
    shotsOnTargetHome: n(get(hRow, 'Shots on Goal')),
    shotsOnTargetAway: n(get(aRow, 'Shots on Goal')),
    cornersHome: n(get(hRow, 'Corner Kicks')),
    cornersAway: n(get(aRow, 'Corner Kicks')),
    cardsHome: n(get(hRow, 'Yellow Cards')) + n(get(hRow, 'Red Cards')),
    cardsAway: n(get(aRow, 'Yellow Cards')) + n(get(aRow, 'Red Cards')),
    foulsHome: n(get(hRow, 'Fouls')),
    foulsAway: n(get(aRow, 'Fouls')),
    passesAccuracyHome: pct(get(hRow, 'Passes %')) ?? 80,
    passesAccuracyAway: pct(get(aRow, 'Passes %')) ?? 80,
  };

  statsCache.set(fixtureId, { at: Date.now(), data: stats });
  return stats;
}

// ─── Live data fetcher ────────────────────────────────────────────────────────

interface ApifFixtureFull {
  fixture: { id: number; status: { short: string; elapsed: number | null } };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  goals: { home: number | null; away: number | null };
  score: { halftime: { home: number | null; away: number | null } };
  events: Array<{
    time: { elapsed: number };
    team: { id: number };
    player: { name: string };
    type: string;
  }>;
}

/**
 * Données live pour un fixture.
 *
 * @param statsOnly Si true, on ne récupère QUE les stats (pas le score/statut).
 *   Utilisé quand odds-api.io est la source de score → zéro appel fixture.
 */
export async function getFixtureLiveData(
  fixtureId: number,
  statsOnly = false,
): Promise<ApifLiveData | null> {
  let homeTeamId = 0;
  let awayTeamId = 0;
  let result: Omit<ApifLiveData, 'stats'> | null = null;

  if (!statsOnly) {
    const fixtures = await apiFetch<ApifFixtureFull>(`/fixtures?id=${fixtureId}`);
    if (!fixtures || !fixtures[0]) return null;
    const f = fixtures[0];

    homeTeamId = f.teams?.home?.id ?? 0;
    awayTeamId = f.teams?.away?.id ?? 0;

    const scorers: ApifScorerEvent[] = [];
    if (Array.isArray(f.events)) {
      for (const ev of f.events) {
        if (ev.type === 'Goal' && ev.player?.name) {
          scorers.push({
            team: ev.team?.id === homeTeamId ? 'home' : 'away',
            playerName: ev.player.name,
            minute: ev.time?.elapsed ?? 0,
          });
        }
      }
    }

    const htH = f.score?.halftime?.home;
    const htA = f.score?.halftime?.away;

    result = {
      score: { home: f.goals?.home ?? 0, away: f.goals?.away ?? 0 },
      status: mapApifStatus(f.fixture?.status?.short ?? ''),
      elapsedTime: f.fixture?.status?.elapsed ?? 0,
      halftimeScore: htH != null && htA != null ? { home: htH, away: htA } : null,
      scorers,
    };
  } else {
    // statsOnly : on a besoin des team IDs pour identifier les lignes de stats.
    // On les retrouve via le cache de découverte si disponible, sinon on fait l'appel.
    const cachedStats = statsCache.get(fixtureId);
    if (cachedStats) {
      return { score: { home: 0, away: 0 }, status: 'live', elapsedTime: 0, halftimeScore: null, stats: cachedStats.data, scorers: [] };
    }
    // Pas en cache → on doit récupérer les IDs d'équipes via un appel fixture minimal.
    const fixtures = await apiFetch<ApifFixtureFull>(`/fixtures?id=${fixtureId}`);
    if (!fixtures || !fixtures[0]) return null;
    const f = fixtures[0];
    homeTeamId = f.teams?.home?.id ?? 0;
    awayTeamId = f.teams?.away?.id ?? 0;

    const scorers: ApifScorerEvent[] = [];
    if (Array.isArray(f.events)) {
      for (const ev of f.events) {
        if (ev.type === 'Goal' && ev.player?.name) {
          scorers.push({
            team: ev.team?.id === homeTeamId ? 'home' : 'away',
            playerName: ev.player.name,
            minute: ev.time?.elapsed ?? 0,
          });
        }
      }
    }
    const htH = f.score?.halftime?.home;
    const htA = f.score?.halftime?.away;
    result = {
      score: { home: f.goals?.home ?? 0, away: f.goals?.away ?? 0 },
      status: mapApifStatus(f.fixture?.status?.short ?? ''),
      elapsedTime: f.fixture?.status?.elapsed ?? 0,
      halftimeScore: htH != null && htA != null ? { home: htH, away: htA } : null,
      scorers,
    };
  }

  const stats = homeTeamId
    ? await fetchStats(fixtureId, homeTeamId, awayTeamId)
    : null;

  return { ...result, stats };
}
