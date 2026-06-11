/**
 * Football-Data.org (v4) — SOURCE DE SECOURS pour score/statut et buteurs.
 *
 * Utilisé quand odds-api.io ET API-Football sont indisponibles / quota épuisé.
 * Plan gratuit : ~10 req/min, compétitions majeures uniquement
 * (PL, Liga, Serie A, Bundesliga, Ligue 1, LDC, Europa League, CdM, Euro).
 *
 * Découverte du match : recherche par noms d'équipes + date → cache le FD match ID.
 */

const BASE = 'https://api.football-data.org/v4';

export function getFdKey(): string | undefined {
  return process.env.FOOTBALL_DATA_ORG_KEY;
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function fdFetch<T>(path: string): Promise<T | null> {
  const key = getFdKey();
  if (!key) return null;
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { 'X-Auth-Token': key } });
    if (res.status === 429) {
      console.warn('[football-data] rate limited (429)');
      return null;
    }
    if (!res.ok) {
      console.error(`[football-data] HTTP ${res.status} — ${path}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error('[football-data] fetch error', path, err);
    return null;
  }
}

// ─── Status mapping ───────────────────────────────────────────────────────────

export function mapFdStatus(s: string): 'upcoming' | 'live' | 'half_time' | 'finished' {
  if (s === 'IN_PLAY') return 'live';
  if (s === 'PAUSED') return 'half_time';
  if (s === 'FINISHED' || s === 'AWARDED') return 'finished';
  return 'upcoming';
}

// ─── Team name normalisation (identique à api-football-provider) ──────────────

function normTeam(name: string): string {
  return (name || '')
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

// ─── Types Football-Data.org ──────────────────────────────────────────────────

interface FdMatchSummary {
  id: number;
  status: string;
  homeTeam: { id: number; name: string; shortName?: string };
  awayTeam: { id: number; name: string; shortName?: string };
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
  goals?: Array<{
    minute: number | null;
    team: { id: number; name: string };
    scorer: { name: string };
  }>;
}

interface FdMatchListResponse {
  matches: FdMatchSummary[];
}

// ─── Match discovery ──────────────────────────────────────────────────────────

const fdIdCache = new Map<string, { id: number; at: number }>();
const DISCOVERY_TTL = 30 * 60_000;

export async function findFdMatchId(
  homeTeam: string,
  awayTeam: string,
  dateIso: string,
): Promise<number | null> {
  const date = dateIso.slice(0, 10);
  const key = `${normTeam(homeTeam)}|${normTeam(awayTeam)}|${date}`;
  const cached = fdIdCache.get(key);
  if (cached && Date.now() - cached.at < DISCOVERY_TTL) return cached.id;

  const data = await fdFetch<FdMatchListResponse>(`/matches?dateFrom=${date}&dateTo=${date}`);
  if (!data?.matches) return null;

  const found = data.matches.find(m => {
    const hMatch = teamsMatch(m.homeTeam.name, homeTeam) || teamsMatch(m.homeTeam.shortName ?? '', homeTeam);
    const aMatch = teamsMatch(m.awayTeam.name, awayTeam) || teamsMatch(m.awayTeam.shortName ?? '', awayTeam);
    return hMatch && aMatch;
  });

  if (found) {
    fdIdCache.set(key, { id: found.id, at: Date.now() });
    return found.id;
  }
  return null;
}

// ─── Types retournés ──────────────────────────────────────────────────────────

export interface FdScorerEvent {
  team: 'home' | 'away';
  playerName: string;
  minute: number;
}

export interface FdLiveData {
  score: { home: number; away: number };
  status: 'upcoming' | 'live' | 'half_time' | 'finished';
  halftimeScore: { home: number; away: number } | null;
  scorers: FdScorerEvent[];
}

// ─── Live data par ID FD connu ────────────────────────────────────────────────

export async function getFdLiveDataById(fdMatchId: number): Promise<FdLiveData | null> {
  const data = await fdFetch<FdMatchSummary>(`/matches/${fdMatchId}`);
  if (!data) return null;

  const homeId = data.homeTeam.id;
  const homeScore = data.score?.fullTime?.home ?? 0;
  const awayScore = data.score?.fullTime?.away ?? 0;
  const htH = data.score?.halfTime?.home;
  const htA = data.score?.halfTime?.away;

  const scorers: FdScorerEvent[] = [];
  for (const g of data.goals ?? []) {
    scorers.push({
      team: g.team.id === homeId ? 'home' : 'away',
      playerName: g.scorer.name,
      minute: g.minute ?? 0,
    });
  }

  return {
    score: { home: homeScore, away: awayScore },
    status: mapFdStatus(data.status),
    halftimeScore: htH != null && htA != null ? { home: htH, away: htA } : null,
    scorers,
  };
}
