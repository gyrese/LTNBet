/**
 * ESPN — endpoints publics non documentés (`site.api.espn.com`).
 *
 * Source GRATUITE et SANS quota ni clé pour : score + statut + buteurs en direct.
 * Complète API-Football (réservé aux stats détaillées : possession, tirs… quota limité).
 *
 * ⚠️ API non officielle → parsing DÉFENSIF de bout en bout : toute forme inattendue renvoie
 * `null`, et l'orchestrateur (`live-provider`) retombe alors sur les autres sources. Ajouter
 * ESPN ne peut donc rien casser.
 */

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

// Ligues scannées à la découverte (Coupe du Monde en priorité). Une fois trouvé, l'ID est persisté
// (colonne matches.espn_id = "slug:eventId") → plus aucun scan ensuite.
const LEAGUE_SLUGS = [
  'fifa.world', 'fifa.friendly', 'uefa.euro', 'uefa.nations',
  'fifa.worldq.uefa', 'fifa.worldq.conmebol', 'conmebol.america', 'uefa.champions',
];

export interface EspnScorer { team: 'home' | 'away'; playerName: string; minute: number }

export interface EspnLiveData {
  score: { home: number; away: number };
  status: 'upcoming' | 'live' | 'half_time' | 'finished';
  elapsedTime: number;
  scorers: EspnScorer[];
}

// ─── Formes (partielles) des réponses ESPN ─────────────────────────────────────

interface EspnStatus {
  type?: { state?: string; detail?: string; description?: string; shortDetail?: string };
  displayClock?: string;
  clock?: number;
  period?: number;
}
interface EspnCompetitor {
  homeAway?: string;
  score?: string | number;
  team?: { id?: string | number; displayName?: string; name?: string; shortDisplayName?: string };
}
interface EspnDetail {
  scoringPlay?: boolean;
  team?: { id?: string | number };
  clock?: { displayValue?: string };
  athletesInvolved?: { displayName?: string; shortName?: string }[];
}
interface EspnCompetition {
  competitors?: EspnCompetitor[];
  status?: EspnStatus;
  details?: EspnDetail[];
}
interface EspnEvent {
  id?: string | number;
  competitions?: EspnCompetition[];
  status?: EspnStatus;
}
interface EspnScoreboard { events?: EspnEvent[] }

// ─── Helpers ────────────────────────────────────────────────────────────────

function normTeam(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function teamsMatch(a: string, b: string): boolean {
  const na = normTeam(a);
  const nb = normTeam(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const wa = new Set(na.split(' ').filter(w => w.length >= 3));
  const hits = nb.split(' ').filter(w => w.length >= 3 && wa.has(w));
  return hits.length >= 2 || (hits.length === 1 && hits[0].length >= 5);
}

async function fetchScoreboard(slug: string, datesParam: string): Promise<EspnScoreboard | null> {
  try {
    const res = await fetch(`${BASE}/${slug}/scoreboard?dates=${datesParam}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json() as EspnScoreboard;
  } catch (e) {
    console.error('[espn] fetch error', slug, e);
    return null;
  }
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Fenêtre de 3 jours (J-1 → J+1) pour absorber les décalages de fuseau ESPN. */
function dateRange(dateIso: string): string {
  let base = new Date(dateIso);
  if (isNaN(base.getTime())) base = new Date();
  const DAY = 86_400_000;
  return `${ymd(new Date(base.getTime() - DAY))}-${ymd(new Date(base.getTime() + DAY))}`;
}

function mapStatus(state?: string, detail?: string): 'upcoming' | 'live' | 'half_time' | 'finished' {
  const s = (state || '').toLowerCase();
  if (s === 'post') return 'finished';
  if (s === 'pre') return 'upcoming';
  // 'in' (en cours)
  const d = (detail || '').toLowerCase().replace(/[^a-z]/g, '');
  if (d.includes('halftime') || d === 'ht') return 'half_time';
  return 'live';
}

function firstInt(s: string | undefined): number {
  const m = String(s ?? '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Parse une compétition ESPN → données live normalisées. `null` si forme inexploitable. */
function parseEvent(ev: EspnEvent | undefined): EspnLiveData | null {
  const comp = ev?.competitions?.[0];
  const competitors = comp?.competitors;
  if (!comp || !Array.isArray(competitors)) return null;

  const home = competitors.find(c => c.homeAway === 'home');
  const away = competitors.find(c => c.homeAway === 'away');
  if (!home || !away) return null;

  const st = comp.status ?? ev?.status;
  const status = mapStatus(st?.type?.state, st?.type?.detail ?? st?.type?.shortDetail ?? st?.type?.description);

  let elapsed = firstInt(st?.displayClock);
  if (!elapsed && typeof st?.clock === 'number') elapsed = Math.floor(st.clock / 60);

  const homeId = String(home.team?.id ?? '');
  const scorers: EspnScorer[] = [];
  if (Array.isArray(comp.details)) {
    for (const d of comp.details) {
      if (!d?.scoringPlay) continue; // on ne garde que les buts (pas les cartons)
      const team: 'home' | 'away' = String(d.team?.id ?? '') === homeId ? 'home' : 'away';
      const ath = d.athletesInvolved?.[0];
      const playerName = ath?.displayName ?? ath?.shortName;
      if (!playerName) continue;
      scorers.push({ team, playerName, minute: firstInt(d.clock?.displayValue) });
    }
  }

  return {
    score: { home: firstInt(String(home.score)), away: firstInt(String(away.score)) },
    status,
    elapsedTime: elapsed,
    scorers,
  };
}

// ─── Cache de découverte (in-memory) ───────────────────────────────────────────

const discoveryCache = new Map<string, { id: string; slug: string; at: number }>();
const DISCOVERY_TTL = 30 * 60_000;

/** Trouve l'événement ESPN (id + ligue) à partir des noms d'équipes et de la date. */
export async function findEspnEvent(
  homeTeam: string,
  awayTeam: string,
  dateIso: string,
): Promise<{ eventId: string; leagueSlug: string } | null> {
  const key = `${normTeam(homeTeam)}|${normTeam(awayTeam)}|${dateIso.slice(0, 10)}`;
  const cached = discoveryCache.get(key);
  if (cached && Date.now() - cached.at < DISCOVERY_TTL) return { eventId: cached.id, leagueSlug: cached.slug };

  const datesParam = dateRange(dateIso);
  for (const slug of LEAGUE_SLUGS) {
    const sb = await fetchScoreboard(slug, datesParam);
    const events = sb?.events;
    if (!Array.isArray(events)) continue;
    for (const ev of events) {
      const comp = ev.competitions?.[0];
      const cs = comp?.competitors;
      if (!Array.isArray(cs)) continue;
      const h = cs.find(c => c.homeAway === 'home')?.team;
      const a = cs.find(c => c.homeAway === 'away')?.team;
      const hn = h?.displayName || h?.name || h?.shortDisplayName || '';
      const an = a?.displayName || a?.name || a?.shortDisplayName || '';
      // Orientation conservée : domicile~domicile ET extérieur~extérieur (évite d'inverser les stats).
      if (ev.id && teamsMatch(hn, homeTeam) && teamsMatch(an, awayTeam)) {
        const id = String(ev.id);
        discoveryCache.set(key, { id, slug, at: Date.now() });
        return { eventId: id, leagueSlug: slug };
      }
    }
  }
  return null;
}

/** Données live d'un événement ESPN connu (id + ligue). `null` si introuvable/inexploitable. */
export async function getEspnLiveData(
  eventId: string,
  leagueSlug: string,
  dateIso: string,
): Promise<EspnLiveData | null> {
  const sb = await fetchScoreboard(leagueSlug, dateRange(dateIso));
  const events = sb?.events;
  if (!Array.isArray(events)) return null;
  const ev = events.find(e => String(e.id) === String(eventId));
  return ev ? parseEvent(ev) : null;
}
