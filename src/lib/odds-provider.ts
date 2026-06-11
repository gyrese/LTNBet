/**
 * Client odds-api.io — fournisseur unique pour la découverte de matchs ET les cotes.
 *
 * Pourquoi un seul fournisseur : l'event id renvoyé par /v3/events sert directement
 * de clé pour /v3/odds → aucun matching de noms d'équipes (la cause des cotes « aléatoires »).
 *
 * Endpoints utilisés (vérifiés) :
 *   GET /v3/leagues?sport=football                          → liste des compétitions
 *   GET /v3/events?sport=football&league=<slug>&from&to     → matchs (filtrables ligue + dates)
 *   GET /v3/odds?eventId=<id>&bookmakers=<name[,name]>      → cotes (liste de marchés par bookmaker)
 *
 * Contraintes du plan : le paramètre `bookmakers` est OBLIGATOIRE, et le compte est limité
 * à 2 bookmakers. Si le bookmaker demandé n'est pas autorisé, l'API renvoie la liste des
 * bookmakers permis dans son message d'erreur → on les récupère et on réessaie (self-healing).
 */

const BASE = 'https://api.odds-api.io/v3';

// ─── Configuration ────────────────────────────────────────────────────────────

export function getOddsApiKey(): string | undefined {
  // ODDS_API_IO_KEY est le nom correct ; THE_ODDS_API_KEY est gardé pour compat (la clé
  // historiquement stockée sous ce nom est en réalité une clé odds-api.io).
  return process.env.ODDS_API_IO_KEY || process.env.THE_ODDS_API_KEY || undefined;
}

/** Bookmakers préférés (ordre de priorité). Configurable via .env. */
export function getPreferredBookmakers(): string[] {
  const primary = process.env.ODDS_BOOKMAKER || 'Winamax FR';
  const fallback = process.env.ODDS_BOOKMAKER_FALLBACK || 'Betclic FR';
  return [primary, fallback].filter(Boolean);
}

// ─── Cache mémoire léger (évite de brûler le quota) ───────────────────────────

type CacheEntry = { at: number; data: unknown };
const cache = new Map<string, CacheEntry>();

async function getJson<T>(url: string, ttlMs: number): Promise<T | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (res.ok) cache.set(url, { at: Date.now(), data });
    return data as T;
  } catch (err) {
    console.error('[odds-provider] fetch error', url, err);
    return null;
  }
}

// ─── Types renvoyés par l'API ─────────────────────────────────────────────────

export interface OaiLeague {
  name: string;
  slug: string;
  eventsCount?: number;
}

export interface OaiEvent {
  id: number;
  home: string;
  away: string;
  homeId?: number;
  awayId?: number;
  date: string;
  sport?: { name: string; slug: string };
  league?: { name: string; slug: string };
  status?: string;
  scores?: { home: number; away: number };
}

// ─── Ligues populaires (mises en avant dans l'admin) ──────────────────────────

const POPULAR_KEYWORDS: { label: string; test: RegExp }[] = [
  { label: 'Coupe du Monde', test: /fifa world cup(?!.*(women|qualif|youth|u\d))/i },
  { label: 'Euro', test: /uefa european championship(?!.*(women|youth|u\d|qualif))/i },
  { label: 'Champions League', test: /uefa champions league/i },
  { label: 'Europa League', test: /uefa europa league/i },
  { label: 'Ligue 1', test: /france - ligue 1(?!\d)/i },
  { label: 'Ligue 2', test: /france - ligue 2(?!\d)/i },
  { label: 'Coupe de France', test: /france - coupe de france/i },
  { label: 'Premier League', test: /england - premier league/i },
  { label: 'LaLiga', test: /spain - (laliga(?! ?2)|la liga(?! ?2)|primera division)/i },
  { label: 'Serie A', test: /italy - serie a(?!\w)/i },
  { label: 'Bundesliga', test: /germany - bundesliga(?!.*2)/i },
  { label: 'Eredivisie', test: /netherlands - eredivisie/i },
  { label: 'Primeira Liga', test: /portugal - (liga portugal|primeira)/i },
];

// Exclut les déclinaisons jeunes/féminines/réserves des « ligues populaires ».
const POPULAR_EXCLUDE = /\b(women|youth|u-?\d{1,2}|reserves?|amateur|futsal|friendlies|beach)\b/i;

/** Renvoie la liste des ligues, avec un sous-ensemble « populaire » mis en avant. */
export async function listLeagues(): Promise<{ popular: OaiLeague[]; all: OaiLeague[] }> {
  const key = getOddsApiKey();
  if (!key) return { popular: [], all: [] };

  const data = await getJson<OaiLeague[]>(`${BASE}/leagues?apiKey=${key}&sport=football`, 5 * 60 * 1000);
  const all = Array.isArray(data) ? data : [];

  const popular: OaiLeague[] = [];
  for (const { test } of POPULAR_KEYWORDS) {
    const match = all.find((l) => test.test(l.name) && !POPULAR_EXCLUDE.test(l.name) && (l.eventsCount ?? 0) > 0);
    if (match && !popular.some((p) => p.slug === match.slug)) popular.push(match);
  }

  return { popular, all };
}

/** Bornes ISO d'une journée (UTC) à partir d'une date YYYY-MM-DD. */
export function dayBounds(dateStr: string): { from: string; to: string } {
  const from = `${dateStr}T00:00:00Z`;
  const to = `${dateStr}T23:59:59Z`;
  return { from, to };
}

export interface OaiLiveEvent {
  id: number;
  home: string;
  away: string;
  status?: string;
  scores?: {
    home: number;
    away: number;
    periods?: Record<string, { home: number; away: number }>;
  };
}

/** Récupère le score + statut live d'un event précis (pour le suivi en direct). */
export async function getLiveEvent(eventId: number | string): Promise<OaiLiveEvent | null> {
  const key = getOddsApiKey();
  if (!key) return null;
  const data = await getJson<OaiLiveEvent[]>(
    `${BASE}/events?apiKey=${key}&sport=football&id=${eventId}`,
    8_000,
  );
  if (Array.isArray(data) && data.length) return data[0];
  return null;
}

/** Liste les matchs d'une ligue (et/ou d'un jour). */
export async function listEvents(opts: {
  leagueSlug?: string;
  date?: string;
  search?: string;
  limit?: number;
}): Promise<OaiEvent[]> {
  const key = getOddsApiKey();
  if (!key) return [];

  const params = new URLSearchParams({ apiKey: key, sport: 'football' });
  if (opts.leagueSlug) params.set('league', opts.leagueSlug);
  if (opts.date) {
    const { from, to } = dayBounds(opts.date);
    params.set('from', from);
    params.set('to', to);
  }
  params.set('limit', String(opts.limit ?? 100));

  const data = await getJson<OaiEvent[]>(`${BASE}/events?${params.toString()}`, 60 * 1000);
  let events = Array.isArray(data) ? data : [];

  if (opts.search) {
    const q = opts.search.toLowerCase();
    events = events.filter((e) => e.home?.toLowerCase().includes(q) || e.away?.toLowerCase().includes(q));
  }

  // Tri par date de coup d'envoi
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return events;
}

// ─── Récupération + parsing des cotes ─────────────────────────────────────────

type OddsMarket = { name: string; updatedAt?: string; odds: Record<string, unknown>[] };
type OddsResponse = {
  id: number;
  home: string;
  away: string;
  status?: string;
  bookmakers?: Record<string, OddsMarket[]>;
};

/**
 * Récupère les cotes brutes d'un event. Si le bookmaker demandé n'est pas autorisé,
 * l'API renvoie « Allowed: X, Y » → on parse et on réessaie automatiquement.
 */
async function fetchRawOdds(eventId: number | string, bookmakers: string[]): Promise<OddsResponse | null> {
  const key = getOddsApiKey();
  if (!key) return null;

  const bmParam = encodeURIComponent(bookmakers.join(','));
  const url = `${BASE}/odds?apiKey=${key}&eventId=${eventId}&bookmakers=${bmParam}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (res.ok) return data as OddsResponse;

    // Auto-réparation : le message d'erreur liste les bookmakers autorisés.
    const msg: string = data?.error || '';
    const allowedMatch = msg.match(/Allowed:\s*([^.]+)\./i);
    if (allowedMatch) {
      const allowed = allowedMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
      if (allowed.length) {
        const retryUrl = `${BASE}/odds?apiKey=${key}&eventId=${eventId}&bookmakers=${encodeURIComponent(allowed.join(','))}`;
        const retry = await fetch(retryUrl);
        if (retry.ok) return (await retry.json()) as OddsResponse;
      }
    }
    console.error('[odds-provider] odds error', msg);
    return null;
  } catch (err) {
    console.error('[odds-provider] odds fetch failed', err);
    return null;
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 1 ? n : null;
};

/** Cotes normalisées prêtes à alimenter nos marchés. `null` = non fourni par l'API. */
export interface ParsedOdds {
  bookmaker: string | null;
  resultHome: number | null;
  resultDraw: number | null;
  resultAway: number | null;
  htResultHome: number | null;
  htResultDraw: number | null;
  htResultAway: number | null;
  ou25Over: number | null;
  ou25Under: number | null;
  bttsYes: number | null;
  bttsNo: number | null;
  correctScores: Record<string, number>; // ex: { "1-0": 3.5 }
  scorers: Array<{ name: string; odds: number }>;

  // Double Chance
  dc1X: number | null;
  dcX2: number | null;
  dc12: number | null;

  // Goals Totals
  ou15Over: number | null;
  ou15Under: number | null;
  ou35Over: number | null;
  ou35Under: number | null;

  // Team Totals (Mexico / South Africa Over/Under 1.5)
  homeOver15: number | null;
  homeUnder15: number | null;
  awayOver15: number | null;
  awayUnder15: number | null;

  // Team Totals (Mexico / South Africa Clean Sheet = Team Totals Under/Over 0.5)
  homeOver05: number | null;
  homeUnder05: number | null;
  awayOver05: number | null;
  awayUnder05: number | null;
}

const EMPTY_PARSED: ParsedOdds = {
  bookmaker: null,
  resultHome: null, resultDraw: null, resultAway: null,
  htResultHome: null, htResultDraw: null, htResultAway: null,
  ou25Over: null, ou25Under: null,
  bttsYes: null, bttsNo: null,
  correctScores: {},
  scorers: [],

  dc1X: null, dcX2: null, dc12: null,
  ou15Over: null, ou15Under: null, ou35Over: null, ou35Under: null,
  homeOver15: null, homeUnder15: null, awayOver15: null, awayUnder15: null,
  homeOver05: null, homeUnder05: null, awayOver05: null, awayUnder05: null,
};

function parseBookmakerMarkets(markets: OddsMarket[], homeTeam: string, awayTeam: string): ParsedOdds {
  const out: ParsedOdds = { ...EMPTY_PARSED, correctScores: {}, scorers: [] };
  const norm = (s: string) => s.toLowerCase().replace(/\s*\(w\)\s*/g, '').trim();
  const home = norm(homeTeam);
  const away = norm(awayTeam);

  for (const m of markets) {
    const name = (m.name || '').toLowerCase();
    const rows = Array.isArray(m.odds) ? m.odds : [];

    // Résultat (1X2)
    if (name === 'ml') {
      const r = rows[0] || {};
      out.resultHome = num(r.home);
      out.resultDraw = num(r.draw);
      out.resultAway = num(r.away);
    }
    // Résultat mi-temps
    else if (name === 'half time result') {
      for (const r of rows) {
        const label = norm(String(r.label ?? ''));
        const odd = num(r.under ?? r.odds ?? r.home ?? r.value);
        if (!odd) continue;
        if (label.includes(home) || label === '1') out.htResultHome = odd;
        else if (label.includes('draw') || label === 'x' || label.includes('nul')) out.htResultDraw = odd;
        else if (label.includes(away) || label === '2') out.htResultAway = odd;
      }
    }
    // Plus / Moins de buts (lignes 1.5, 2.5, 3.5)
    else if (name === 'goals over/under' || name === 'totals') {
      const r15 = rows.find((x) => Number(x.hdp) === 1.5);
      if (r15) {
        out.ou15Over = num(r15.over);
        out.ou15Under = num(r15.under);
      }
      const r25 = rows.find((x) => Number(x.hdp) === 2.5);
      if (r25) {
        out.ou25Over = num(r25.over);
        out.ou25Under = num(r25.under);
      }
      const r35 = rows.find((x) => Number(x.hdp) === 3.5);
      if (r35) {
        out.ou35Over = num(r35.over);
        out.ou35Under = num(r35.under);
      }
    }
    // Les deux équipes marquent
    else if (name === 'both teams to score' || name === 'btts') {
      for (const r of rows) {
        const label = String(r.label ?? '').toLowerCase();
        const odd = num(r.odds ?? r.under ?? r.value);
        if (!odd) continue;
        if (label.includes('yes') || label.includes('oui')) out.bttsYes = odd;
        else if (label.includes('no') || label.includes('non')) out.bttsNo = odd;
      }
    }
    // Score exact
    else if (name === 'correct score') {
      for (const r of rows) {
        const label = String(r.label ?? '').trim();
        const odd = num(r.odds);
        if (label && odd && /^\d+-\d+$/.test(label)) out.correctScores[label] = odd;
      }
    }
    // Double Chance
    else if (name === 'double chance') {
      const r = rows[0] || {};
      out.dc1X = num(r['1X'] ?? r['home_draw'] ?? r.homeDraw);
      out.dcX2 = num(r['X2'] ?? r['draw_away'] ?? r['2X'] ?? r.drawAway);
      out.dc12 = num(r['12'] ?? r['home_away'] ?? r.homeAway);
    }
    // Team Total Home (Mexique Over/Under)
    else if (name === 'team total home') {
      const r05 = rows.find((x) => Number(x.hdp) === 0.5);
      if (r05) {
        out.homeOver05 = num(r05.over);
        out.homeUnder05 = num(r05.under);
      }
      const r15 = rows.find((x) => Number(x.hdp) === 1.5);
      if (r15) {
        out.homeOver15 = num(r15.over);
        out.homeUnder15 = num(r15.under);
      }
    }
    // Team Total Away (Afrique du Sud Over/Under)
    else if (name === 'team total away') {
      const r05 = rows.find((x) => Number(x.hdp) === 0.5);
      if (r05) {
        out.awayOver05 = num(r05.over);
        out.awayUnder05 = num(r05.under);
      }
      const r15 = rows.find((x) => Number(x.hdp) === 1.5);
      if (r15) {
        out.awayOver15 = num(r15.over);
        out.awayUnder15 = num(r15.under);
      }
    }
    // Buteur à tout moment
    else if (name === 'anytime goalscorer' || name === 'anytime scorer' || name === 'anytime scorers') {
      for (const r of rows) {
        const playerName = String(r.label ?? '').trim();
        const odd = num(r.over ?? r.odds ?? r.value ?? r.under);
        if (playerName && odd) {
          out.scorers.push({ name: playerName, odds: odd });
        }
      }
    }
  }

  return out;
}

/**
 * Récupère et normalise les cotes d'un event. Fait une fusion par marché (per-market fallback)
 * en parcourant les bookmakers dans l'ordre de préférence.
 */
export async function getParsedOdds(eventId: number | string): Promise<ParsedOdds> {
  const raw = await fetchRawOdds(eventId, getPreferredBookmakers());
  if (!raw || !raw.bookmakers) return EMPTY_PARSED;

  const bms = raw.bookmakers;
  const names = Object.keys(bms);
  if (!names.length) return EMPTY_PARSED;

  // Tri des bookmakers par préférence
  const prefer = getPreferredBookmakers();
  const orderedBookmakers = [
    ...prefer.filter((p) => names.includes(p)),
    ...names.filter((n) => !prefer.includes(n) && !/no latency/i.test(n)),
    ...names.filter((n) => !prefer.includes(n) && /no latency/i.test(n)),
  ];

  const parsed: ParsedOdds = {
    bookmaker: null,
    resultHome: null, resultDraw: null, resultAway: null,
    htResultHome: null, htResultDraw: null, htResultAway: null,
    ou25Over: null, ou25Under: null,
    bttsYes: null, bttsNo: null,
    correctScores: {},
    scorers: [],

    dc1X: null, dcX2: null, dc12: null,
    ou15Over: null, ou15Under: null, ou35Over: null, ou35Under: null,
    homeOver15: null, homeUnder15: null, awayOver15: null, awayUnder15: null,
    homeOver05: null, homeUnder05: null, awayOver05: null, awayUnder05: null,
  };

  let mainBookmaker: string | null = null;
  const bookmakersUsed: string[] = [];

  for (const bm of orderedBookmakers) {
    const bmMarkets = bms[bm] || [];
    const parsedBm = parseBookmakerMarkets(bmMarkets, raw.home, raw.away);
    let addedSomething = false;

    // Merge 1X2
    if (parsed.resultHome === null && parsedBm.resultHome !== null) {
      parsed.resultHome = parsedBm.resultHome;
      parsed.resultDraw = parsedBm.resultDraw;
      parsed.resultAway = parsedBm.resultAway;
      addedSomething = true;
      if (!mainBookmaker) mainBookmaker = bm;
    }
    // Merge HT result
    if (parsed.htResultHome === null && parsedBm.htResultHome !== null) {
      parsed.htResultHome = parsedBm.htResultHome;
      parsed.htResultDraw = parsedBm.htResultDraw;
      parsed.htResultAway = parsedBm.htResultAway;
      addedSomething = true;
    }
    // Merge Over/Under 2.5
    if (parsed.ou25Over === null && parsedBm.ou25Over !== null) {
      parsed.ou25Over = parsedBm.ou25Over;
      parsed.ou25Under = parsedBm.ou25Under;
      addedSomething = true;
    }
    // Merge BTTS
    if (parsed.bttsYes === null && parsedBm.bttsYes !== null) {
      parsed.bttsYes = parsedBm.bttsYes;
      parsed.bttsNo = parsedBm.bttsNo;
      addedSomething = true;
    }
    // Merge Correct Score
    if (Object.keys(parsed.correctScores).length === 0 && Object.keys(parsedBm.correctScores).length > 0) {
      parsed.correctScores = parsedBm.correctScores;
      addedSomething = true;
    }
    // Merge Double Chance
    if (parsed.dc1X === null && parsedBm.dc1X !== null) {
      parsed.dc1X = parsedBm.dc1X;
      parsed.dcX2 = parsedBm.dcX2;
      parsed.dc12 = parsedBm.dc12;
      addedSomething = true;
    }
    // Merge Totals 1.5 / 3.5
    if (parsed.ou15Over === null && parsedBm.ou15Over !== null) {
      parsed.ou15Over = parsedBm.ou15Over;
      parsed.ou15Under = parsedBm.ou15Under;
      addedSomething = true;
    }
    if (parsed.ou35Over === null && parsedBm.ou35Over !== null) {
      parsed.ou35Over = parsedBm.ou35Over;
      parsed.ou35Under = parsedBm.ou35Under;
      addedSomething = true;
    }
    // Merge Team Totals 1.5
    if (parsed.homeOver15 === null && parsedBm.homeOver15 !== null) {
      parsed.homeOver15 = parsedBm.homeOver15;
      parsed.homeUnder15 = parsedBm.homeUnder15;
      addedSomething = true;
    }
    if (parsed.awayOver15 === null && parsedBm.awayOver15 !== null) {
      parsed.awayOver15 = parsedBm.awayOver15;
      parsed.awayUnder15 = parsedBm.awayUnder15;
      addedSomething = true;
    }
    // Merge Team Totals 0.5
    if (parsed.homeOver05 === null && parsedBm.homeOver05 !== null) {
      parsed.homeOver05 = parsedBm.homeOver05;
      parsed.homeUnder05 = parsedBm.homeUnder05;
      addedSomething = true;
    }
    if (parsed.awayOver05 === null && parsedBm.awayOver05 !== null) {
      parsed.awayOver05 = parsedBm.awayOver05;
      parsed.awayUnder05 = parsedBm.awayUnder05;
      addedSomething = true;
    }
    // Merge Scorers
    if (parsed.scorers.length === 0 && parsedBm.scorers.length > 0) {
      parsed.scorers = parsedBm.scorers;
      addedSomething = true;
    }

    if (addedSomething) {
      bookmakersUsed.push(bm);
    }
  }

  parsed.bookmaker = bookmakersUsed.join(' + ') || mainBookmaker || orderedBookmakers[0] || null;
  return parsed;
}
