/**
 * Orchestrateur live — fusionne les sources de données pour un match actif.
 *
 * ARCHITECTURE (décidée pour le tier gratuit) :
 *   Cotes (base)              : odds-api.io — UNIQUEMENT à la création de session (hors de cette boucle).
 *   Score / statut / buteurs  : Football-Data.org (PRIMAIRE) — gratuit, ~10 req/min, CdM/Euro/grands champ. couverts.
 *   Stats détaillées          : API-Football (possession, tirs, corners, cartes, fautes) — SEULE source de ces stats.
 *   Backups score             : API-Football (complet) → odds-api.io (dernier recours).
 *
 * Pourquoi ce découpage : l'app recalcule ses propres cotes dynamiques à partir des mises
 * des joueurs (calculateDynamicOdds) → aucune cote live n'est nécessaire. odds-api ne sert
 * donc qu'avant le match. Football-Data est fiable et généreux pour le score live ; on réserve
 * le maigre quota d'API-Football (~100 req/jour) aux stats, qu'il est le seul à fournir.
 *
 * Découverte automatique :
 *   - fd_match_id (Football-Data) découvert par noms d'équipes + date au 1er sync, puis persisté.
 *   - apifs_id (API-Football) découvert de la même façon pour les stats.
 */

import { getLiveEvent } from './odds-provider';
import type { OaiLiveEvent } from './odds-provider';
import { findFixtureId, getFixtureLiveData } from './api-football-provider';
import type { ApifStats, ApifScorerEvent } from './api-football-provider';
import { findFdMatchId, getFdLiveDataById } from './football-data-provider';

// ─── Types publics ────────────────────────────────────────────────────────────

export interface MatchRow {
  id: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  status: string;
  starts_at: string | null;
  elapsed_time: number;
  odds_event_id: string | null;
  apifs_id: string | null;
  fd_match_id: string | null;
  [key: string]: unknown;
}

export type ScorerEvent = ApifScorerEvent;

export interface LiveData {
  score: { home: number; away: number };
  status: 'upcoming' | 'live' | 'half_time' | 'finished';
  elapsedTime: number;
  halftimeScore: { home: number; away: number } | null;
  stats: ApifStats | null;
  scorers: ScorerEvent[];
  cornerDataAvailable: boolean;
  sources: string[];
  /** ID API-Football auto-découvert ce cycle → le caller doit le persister. */
  discoveredApifId?: number;
  /** ID Football-Data auto-découvert ce cycle → le caller doit le persister. */
  discoveredFdId?: number;
}

// ─── Helpers internes ─────────────────────────────────────────────────────────

/** Mappe un statut brut odds-api.io vers nos statuts internes. `null` = inconnu (garder l'actuel). */
function mapOaiStatus(raw: string): 'upcoming' | 'live' | 'half_time' | 'finished' | null {
  const s = raw.toLowerCase();
  if (['finished', 'ended', 'ft', 'aet', 'pen', 'closed'].includes(s)) return 'finished';
  if (['ht', 'halftime', 'half_time', 'pause'].includes(s)) return 'half_time';
  if (['live', 'inplay', 'playing', '1h', '2h', 'et'].includes(s)) return 'live';
  return null;
}

/** Extrait le score de la 1re mi-temps depuis un event odds-api.io (clé de période variable). */
function htFromOai(ev: OaiLiveEvent): { home: number; away: number } | null {
  const periods = ev.scores?.periods;
  if (!periods) return null;
  for (const k of ['p1', '1', 'firstHalf', 'first', '1h', 'first_half', 'ht']) {
    const p = (periods as Record<string, { home: number; away: number }>)[k];
    if (p && typeof p.home === 'number' && typeof p.away === 'number') return p;
  }
  return null;
}

/** Parse un apifs_id stocké en DB (peut être "12345" ou "apifs-12345"). */
function parseApifId(raw: string | null): number | null {
  if (!raw) return null;
  const n = parseInt(raw.replace('apifs-', ''), 10);
  return isNaN(n) ? null : n;
}

/** Parse un fd_match_id stocké en DB. */
function parseFdId(raw: string | null): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

/**
 * Estime le temps de jeu écoulé à partir du coup d'envoi prévu (Football-Data ne fournit pas
 * de minute live fiable en gratuit). Avance d'une minute à chaque sync → chrono fluide à l'écran.
 */
function estimateElapsed(startsAt: string | null): number | null {
  if (!startsAt) return null;
  const mins = Math.floor((Date.now() - new Date(startsAt).getTime()) / 60_000);
  if (mins < 0 || mins > 140) return null;
  if (mins <= 45) return mins;            // 1re période
  if (mins < 60) return 45;               // creux mi-temps → on fige à 45'
  return Math.min(90, mins - 15);         // 2e période : on retire ~15 min de pause
}

// ─── Orchestrateur principal ──────────────────────────────────────────────────

export async function getLiveData(match: MatchRow): Promise<LiveData | null> {
  const result: LiveData = {
    score: { home: match.home_score, away: match.away_score },
    status: match.status as 'upcoming' | 'live' | 'half_time' | 'finished',
    elapsedTime: match.elapsed_time ?? 0,
    halftimeScore: null,
    stats: null,
    scorers: [],
    cornerDataAvailable: false,
    sources: [],
  };

  let discoveredApifId: number | undefined;
  let discoveredFdId: number | undefined;
  const date = (match.starts_at || new Date().toISOString()).slice(0, 10);

  // ── 1. API-Football : SOURCE PRIMAIRE (score + statut + stats + buteurs en un appel) ──
  // Football-Data ne couvre pas la CdM 2026 en gratuit → API-Football mène. FD/odds-api = filets.

  let apifId = parseApifId(match.apifs_id);
  if (!apifId && process.env.FOOTBALL_API_KEY) {
    const found = await findFixtureId(match.home_team, match.away_team, date);
    if (found) {
      apifId = found;
      discoveredApifId = found;
    }
  }

  let hasScore = false;
  if (apifId !== null) {
    const apif = await getFixtureLiveData(apifId, false); // complet : score+statut+stats+buteurs
    if (apif) {
      result.score = apif.score;
      result.status = apif.status;
      if (apif.elapsedTime) result.elapsedTime = apif.elapsedTime;
      result.halftimeScore = apif.halftimeScore;
      result.stats = apif.stats;
      result.cornerDataAvailable = apif.stats !== null;
      if (apif.scorers.length) result.scorers = apif.scorers;
      result.sources.push('api-football:full');
      hasScore = true;
    }
  }

  // ── 2. FILET : Football-Data (score/statut/buteurs) si API-Football indisponible ──
  if (!hasScore) {
    let fdId = parseFdId(match.fd_match_id);
    if (!fdId && process.env.FOOTBALL_DATA_ORG_KEY) {
      const found = await findFdMatchId(match.home_team, match.away_team, date);
      if (found) {
        fdId = found;
        discoveredFdId = found;
      }
    }
    if (fdId) {
      const fd = await getFdLiveDataById(fdId);
      if (fd) {
        result.score = fd.score;
        result.status = fd.status;
        result.halftimeScore = fd.halftimeScore;
        if (fd.scorers.length) result.scorers = fd.scorers;
        result.sources.push('football-data:score+status');
        hasScore = true;
      }
    }
  }

  // ── 3. FILET ultime : odds-api.io (score/statut, si event id lié) ──
  if (!hasScore && match.odds_event_id) {
    const oai = await getLiveEvent(match.odds_event_id);
    if (oai) {
      result.score = {
        home: oai.scores?.home ?? result.score.home,
        away: oai.scores?.away ?? result.score.away,
      };
      const mapped = mapOaiStatus(oai.status || '');
      if (mapped) result.status = mapped;
      const ht = htFromOai(oai);
      if (ht) result.halftimeScore = ht;
      result.sources.push('odds-api:score(backup)');
      hasScore = true;
    }
  }

  // ── 4. Temps de jeu estimé seulement si aucune source précise (cas FD/odds-api) ──
  if (result.status === 'live' && !result.sources.some((s) => s.startsWith('api-football'))) {
    const est = estimateElapsed(match.starts_at);
    if (est !== null) result.elapsedTime = est;
  }

  // Aucune source n'a répondu → pas de données live ce cycle.
  if (!result.sources.length) return null;

  return { ...result, discoveredApifId, discoveredFdId };
}
