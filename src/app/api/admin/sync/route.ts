import { NextResponse } from 'next/server';
import db, { suspendImpossibleOutcomes } from '@/lib/db';
import { broadcast } from '@/lib/sse-bus';
import { triggerWebhooks } from '@/lib/webhooks';
import { getLiveData } from '@/lib/live-provider';
import type { MatchRow, ScorerEvent } from '@/lib/live-provider';
import type { ApifStats } from '@/lib/api-football-provider';
import { resolveHalftimeMarkets, resolveHalftimeFromScorers, resolveFulltimeMarkets, resolveFirstScorerMarket } from '@/lib/resolve';

// Migrations de colonnes au démarrage
for (const sql of [
  'ALTER TABLE matches ADD COLUMN last_sync_at TEXT;',
  'ALTER TABLE matches ADD COLUMN fd_match_id TEXT;',
  // Liste complète des buteurs (JSON [{team,playerName,minute}]) tenue à jour depuis l'API →
  // affichage fiable des « bons buteurs » côté joueurs/écran (corrige les noms au fil des syncs).
  'ALTER TABLE matches ADD COLUMN scorers TEXT;',
  // ID ESPN auto-découvert ("slug:eventId") — source gratuite score/buteurs.
  'ALTER TABLE matches ADD COLUMN espn_id TEXT;',
]) { try { db.exec(sql); } catch { /* existe déjà */ } }

type Status = 'upcoming' | 'live' | 'half_time' | 'finished';

// ─── Machine à états pilotée par le temps (secours quand l'API ne répond pas) ──
//
// Principe : l'API (statut réel 1H/HT/2H/FT) PRIME quand elle répond → précision maximale.
// Sinon, on dérive l'état du match à partir de l'heure de coup d'envoi (`starts_at`) pour
// que le match se déroule TOUJOURS automatiquement (coup d'envoi → mi-temps → 2e période →
// fin), même si l'API gratuite est en panne / hors quota. Les seuils sont généreux pour
// éviter une mi-temps/fin prématurée si on dépend du temps.
const KICK_GRACE_MIN = 3;     // l'API dit « pas commencé » mais l'heure est passée depuis ≥3 min → on lance
const HARD_FINISH_MIN = 130;  // filet ultime : un match qui traîne au-delà est forcé terminé

function timeBackboneStatus(mins: number): Status {
  if (mins < 0) return 'upcoming';
  if (mins < 48) return 'live';        // 1re période (+ temps additionnel)
  if (mins < 63) return 'half_time';   // pause ~15 min
  if (mins < HARD_FINISH_MIN) return 'live'; // 2e période
  return 'finished';
}

/** Minute de jeu estimée depuis le coup d'envoi (secours quand l'API ne fournit pas de minute). */
function fallbackElapsed(mins: number): number {
  if (mins <= 0) return 0;
  if (mins <= 45) return Math.floor(mins);
  if (mins < 63) return 45;                       // figé à 45' pendant la pause
  return Math.min(90, Math.floor(mins) - 17);     // 2e période : on retire ~17 min de pause
}

// ─── Helpers sync ─────────────────────────────────────────────────────────────

/** Émet un événement de but (avec nom du buteur si disponible). */
function emitGoalEvent(
  match: MatchRow,
  homeScore: number,
  awayScore: number,
  scorers: ScorerEvent[],
  now: number,
) {
  const scoringTeam = homeScore > (match.home_score as number) ? 'home' : 'away';
  const teamName = scoringTeam === 'home' ? match.home_team : match.away_team;
  const newScore = `${homeScore}-${awayScore}`;

  // Trouver le dernier buteur de l'équipe si disponible
  const lastScorer = [...scorers].reverse().find(s => s.team === scoringTeam);
  const scorer = lastScorer?.playerName ?? `${teamName}`;

  const title = `BUT POUR ${String(teamName).toUpperCase()} ! ⚽`;
  const subtitle = `${scorer} marque ! (${newScore})`;

  db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle, meta) VALUES (?, ?, 'goal', ?, ?, ?)`).run(
    'ge-goal-' + now, match.id, title, subtitle,
    JSON.stringify({ team: scoringTeam, scorer, score: newScore }),
  );
  triggerWebhooks('match.goal', { team: scoringTeam, score: newScore });
  broadcast('game_event', { type: 'goal', title, subtitle, meta: { team: scoringTeam } });
}

/** Intervalle de sync. ESPN (gratuit, sans quota) fournit le score/buteurs à chaque cycle → on peut
 *  rafraîchir souvent. API-Football n'est appelé que pour les stats, cachées 5 min (STATS_TTL) → le
 *  quota (~100 req/j) tient largement même à 20 s (≈ 2 appels API-Football toutes les 5 min). */
function syncIntervalMs(match: MatchRow): number {
  return match.status === 'half_time' ? 60_000 : 20_000;
}

// ─── Simulateur local (aucune clé API configurée) ─────────────────────────────

function handleSimulator(match: MatchRow, now: number): ReturnType<typeof NextResponse.json> {
  const newElapsed = (match.elapsed_time as number) + 1;
  let homeScore = match.home_score as number;
  let awayScore = match.away_score as number;
  let cornersHome = (match.corners_home as number) ?? 0;
  let shotsOnTargetHome = (match.shots_on_target_home as number) ?? 0;
  let cardsHome = (match.cards_home as number) ?? 0;
  let possessionHome = (match.possession_home as number) ?? 50;

  if (newElapsed === 45) {
    db.prepare('UPDATE matches SET status = ?, elapsed_time = ? WHERE id = ?').run('half_time', 45, match.id);
    db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'half_time', ?, ?)`).run('ge-ht-' + now, match.id, 'MI-TEMPS ! ⏸️', 'Fin de la première période.');
    resolveHalftimeMarkets(match.id, match.home_team, match.away_team, homeScore, awayScore, true);
    triggerWebhooks('match.status_change', { status: 'half_time', time_elapsed: 45 });
    broadcast('game_event', { type: 'half_time', title: 'MI-TEMPS ! ⏸️', subtitle: 'Fin de la première période.' });
    const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
    broadcast('match_update', updated);
    return NextResponse.json({ success: true, simulator: true, match: updated });
  }

  if (newElapsed >= 90) {
    db.prepare('UPDATE matches SET status = ?, elapsed_time = ? WHERE id = ?').run('finished', 90, match.id);
    const subtitle = `Score final : ${match.home_team} ${homeScore} - ${awayScore} ${match.away_team}`;
    db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'finished', ?, ?)`).run('ge-ft-' + now, match.id, 'FIN DU MATCH ! 🏁', subtitle);
    // Mi-temps simulateur : score à la 45e = score actuel (pas de score mi-temps distinct stocké).
    resolveHalftimeMarkets(match.id, match.home_team, match.away_team, homeScore, awayScore, false);
    resolveFulltimeMarkets(match.id, match.home_team, match.away_team, homeScore, awayScore, cornersHome, true);
    triggerWebhooks('match.finished', { id: match.id, home_score: homeScore, away_score: awayScore });
    broadcast('game_event', { type: 'finished', title: 'FIN DU MATCH ! 🏁', subtitle });
    const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
    broadcast('match_update', updated);
    return NextResponse.json({ success: true, simulator: true, match: updated });
  }

  const rand = Math.random();
  if (rand < 0.025) {
    const side = Math.random() > 0.55 ? 'home' : 'away';
    if (side === 'home') homeScore++; else awayScore++;
    const scorer = side === 'home' ? `${match.home_team}` : `${match.away_team}`;
    const title = `BUT POUR ${(side === 'home' ? match.home_team : match.away_team).toUpperCase()} ! ⚽`;
    const subtitle = `${scorer} marque ! (${homeScore} - ${awayScore})`;
    db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle, meta) VALUES (?, ?, 'goal', ?, ?, ?)`).run(
      'ge-goal-' + now, match.id, title, subtitle,
      JSON.stringify({ team: side, scorer, score: `${homeScore}-${awayScore}` }),
    );
    triggerWebhooks('match.goal', { team: side, score: `${homeScore}-${awayScore}` });
    broadcast('game_event', { type: 'goal', title, subtitle, meta: { team: side } });
  } else if (rand < 0.12) {
    cornersHome++;
  } else if (rand < 0.24) {
    shotsOnTargetHome++;
  } else if (rand < 0.27) {
    cardsHome++;
  }

  possessionHome = Math.max(35, Math.min(65, possessionHome + (Math.random() > 0.5 ? 1 : -1)));
  db.prepare(`UPDATE matches SET elapsed_time = ?, home_score = ?, away_score = ?, corners_home = ?, shots_on_target_home = ?, cards_home = ?, possession_home = ? WHERE id = ?`).run(
    newElapsed, homeScore, awayScore, cornersHome, shotsOnTargetHome, cardsHome, possessionHome, match.id,
  );
  suspendImpossibleOutcomes(match.id, homeScore, awayScore);
  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
  broadcast('match_update', updated);
  return NextResponse.json({ success: true, simulator: true, match: updated });
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const match = db.prepare('SELECT * FROM matches WHERE is_active = 1 LIMIT 1').get() as MatchRow | undefined;
    if (!match) return NextResponse.json({ success: true, message: 'Aucun match actif' });
    if (match.status === 'finished') return NextResponse.json({ success: true, message: 'Match terminé', match });

    const now = Date.now();
    const kickoffMs = match.starts_at ? new Date(match.starts_at as string).getTime() : now;
    const mins = (now - kickoffMs) / 60_000;

    // ── Avant le coup d'envoi : rien à faire (et AUCUN appel API → on préserve le quota) ──
    if (match.status === 'upcoming' && now < kickoffMs) {
      return NextResponse.json({ success: true, message: 'Avant le coup d’envoi', startsInSec: Math.round((kickoffMs - now) / 1000), match });
    }

    // ── Mode simulateur : aucun identifiant externe lié au match ──
    const hasExternalIds = !!(match.odds_event_id || match.apifs_id ||
      match.id.startsWith('oai-') || match.id.startsWith('apifs-'));

    if (!hasExternalIds) {
      // Auto coup d'envoi du simulateur (l'heure de coup d'envoi est atteinte).
      if (match.status === 'upcoming') {
        db.prepare("UPDATE matches SET status = 'live', elapsed_time = 0 WHERE id = ?").run(match.id);
        db.prepare(`INSERT OR IGNORE INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'kickoff', ?, ?)`)
          .run('ge-ko-' + match.id, match.id, 'COUP D’ENVOI ! ⚽', `${match.home_team} – ${match.away_team}, c’est parti !`);
        broadcast('game_event', { type: 'kickoff', title: 'COUP D’ENVOI ! ⚽', subtitle: `${match.home_team} – ${match.away_team}` });
        match.status = 'live';
        match.elapsed_time = 0;
      }
      if (match.last_sync_at && now - new Date(match.last_sync_at as string).getTime() < 14_000) {
        return NextResponse.json({ success: true, message: 'Sync simulateur trop rapide', match });
      }
      db.prepare('UPDATE matches SET last_sync_at = ? WHERE id = ?').run(new Date(now).toISOString(), match.id);
      return handleSimulator(match, now);
    }

    // ── Rate limiting (préserve le quota API) ──
    const interval = syncIntervalMs(match);
    if (match.last_sync_at && now - new Date(match.last_sync_at as string).getTime() < interval) {
      return NextResponse.json({ success: true, message: `Sync trop rapide (requis: ${interval / 1000}s)`, match });
    }
    db.prepare('UPDATE matches SET last_sync_at = ? WHERE id = ?').run(new Date(now).toISOString(), match.id);

    // ── Récupération des données live (orchestrateur 3 sources) ──
    const liveData = await getLiveData(match);

    // Persistance des IDs auto-découverts pour les prochains syncs
    if (liveData?.discoveredApifId) {
      db.prepare('UPDATE matches SET apifs_id = ? WHERE id = ?').run(String(liveData.discoveredApifId), match.id);
    }
    if (liveData?.discoveredFdId) {
      db.prepare('UPDATE matches SET fd_match_id = ? WHERE id = ?').run(String(liveData.discoveredFdId), match.id);
    }
    if (liveData?.discoveredEspnId) {
      db.prepare('UPDATE matches SET espn_id = ? WHERE id = ?').run(liveData.discoveredEspnId, match.id);
    }

    // ── Détermination du statut effectif : API si disponible, sinon secours par le temps ──
    let status: Status;
    let homeScore: number;
    let awayScore: number;
    let halftimeScore: { home: number; away: number } | null;
    let stats: ApifStats | null;
    let scorers: ScorerEvent[];
    let cornerDataAvailable: boolean;
    let elapsedTime: number;
    let hasFreshData = false;

    if (liveData) {
      status = liveData.status;
      homeScore = liveData.score.home;
      awayScore = liveData.score.away;
      halftimeScore = liveData.halftimeScore;
      stats = liveData.stats;
      scorers = liveData.scorers;
      cornerDataAvailable = liveData.cornerDataAvailable;
      elapsedTime = liveData.elapsedTime || fallbackElapsed(mins);
      hasFreshData = true;
      // L'API dit encore « pas commencé » mais l'heure est largement passée → on lance par le temps.
      if (status === 'upcoming' && mins >= KICK_GRACE_MIN) status = 'live';
    } else {
      // Aucune source n'a répondu → on pilote entièrement par le temps (score = dernier connu en DB).
      status = timeBackboneStatus(mins);
      homeScore = match.home_score as number;
      awayScore = match.away_score as number;
      halftimeScore = null;
      stats = null;
      scorers = [];
      cornerDataAvailable = false;
      elapsedTime = fallbackElapsed(mins);
    }

    // Filet ultime : un match qui traîne anormalement est clôturé (évite un blocage en « live »).
    if (status !== 'finished' && mins >= HARD_FINISH_MIN) status = 'finished';
    // Ne jamais régresser vers « upcoming » une fois le match lancé (anti flip-flop si l'API lague).
    if (match.status !== 'upcoming' && status === 'upcoming') status = match.status as Status;

    // Liste des buteurs : celle de ce cycle si l'API en a fourni, sinon la dernière persistée.
    let effectiveScorers: ScorerEvent[] = scorers;
    if (!effectiveScorers.length && match.scorers) {
      try { effectiveScorers = JSON.parse(match.scorers as string) as ScorerEvent[]; } catch { /* ignore */ }
    }

    // ── Détection de but ──
    if (homeScore > (match.home_score as number) || awayScore > (match.away_score as number)) {
      emitGoalEvent(match, homeScore, awayScore, scorers, now);
    }

    // ── Transitions de statut ──
    if (status !== match.status) {
      if (status === 'live' && match.status === 'upcoming') {
        db.prepare(`INSERT OR IGNORE INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'kickoff', ?, ?)`)
          .run('ge-ko-' + match.id, match.id, 'COUP D’ENVOI ! ⚽', `${match.home_team} – ${match.away_team}, c’est parti !`);
        triggerWebhooks('match.status_change', { status: 'live', time_elapsed: 0 });
        broadcast('game_event', { type: 'kickoff', title: 'COUP D’ENVOI ! ⚽', subtitle: `${match.home_team} – ${match.away_team}` });

      } else if (status === 'live' && match.status === 'half_time') {
        // Reprise automatique de la 2e période.
        db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'kickoff', ?, ?)`)
          .run('ge-2h-' + now, match.id, '2E PÉRIODE ! ⚽', 'Reprise du match.');
        triggerWebhooks('match.status_change', { status: 'live' });
        broadcast('game_event', { type: 'kickoff', title: '2E PÉRIODE ! ⚽', subtitle: 'Reprise du match.' });

      } else if (status === 'half_time') {
        db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'half_time', ?, ?)`).run('ge-ht-' + now, match.id, 'MI-TEMPS ! ⏸️', 'Fin de la première période.');
        // À la pause, le score courant EST le score de la mi-temps → fiable UNIQUEMENT si une source
        // a confirmé le score ce cycle (sinon mi-temps déclenchée par le temps sur un score incertain).
        resolveHalftimeMarkets(match.id, match.home_team, match.away_team, homeScore, awayScore, hasFreshData);
        triggerWebhooks('match.status_change', { status: 'half_time' });
        broadcast('game_event', { type: 'half_time', title: 'MI-TEMPS ! ⏸️', subtitle: 'Fin de la première période.' });

      } else if (status === 'finished') {
        const subtitle = `Score final : ${match.home_team} ${homeScore} - ${awayScore} ${match.away_team}`;
        db.prepare(`INSERT INTO game_events (id, match_id, type, title, subtitle) VALUES (?, ?, 'finished', ?, ?)`).run('ge-ft-' + now, match.id, 'FIN DU MATCH ! 🏁', subtitle);

        // Mi-temps : score de pause distinct de l'API si dispo, sinon reconstitué depuis les buteurs
        // (buts avant la 46e). Idempotent : ignoré si déjà résolu à la transition mi-temps.
        if (halftimeScore !== null) {
          resolveHalftimeMarkets(match.id, match.home_team, match.away_team, halftimeScore.home, halftimeScore.away, true);
        } else {
          resolveHalftimeFromScorers(match.id, match.home_team, match.away_team, effectiveScorers, homeScore, awayScore);
        }

        resolveFulltimeMarkets(
          match.id, match.home_team, match.away_team,
          homeScore, awayScore,
          stats?.cornersHome ?? (match.corners_home as number) ?? 0,
          cornerDataAvailable,
        );

        // Premier buteur : auto-résolu uniquement si le nom correspond de façon fiable (sinon manuel).
        resolveFirstScorerMarket(match.id, effectiveScorers, match.home_team, match.away_team);
        triggerWebhooks('match.finished', { id: match.id, home_score: homeScore, away_score: awayScore });
        broadcast('game_event', { type: 'finished', title: 'FIN DU MATCH ! 🏁', subtitle });
      }
    }

    // ── Mise à jour DB ──
    const setClauses: string[] = ['home_score = ?', 'away_score = ?', 'status = ?', 'elapsed_time = ?'];
    const params: unknown[] = [homeScore, awayScore, status, elapsedTime];

    if (status === 'finished') {
      setClauses.push('finished_at = COALESCE(finished_at, ?)');
      params.push(new Date(now).toISOString());
    }

    // Buteurs : on n'écrase la liste persistée QUE si une source fraîche (API/FD) a répondu ce cycle.
    if (hasFreshData && liveData && liveData.sources.some(s => s.startsWith('api-football') || s.startsWith('football-data'))) {
      setClauses.push('scorers = ?');
      params.push(JSON.stringify(scorers));
    }

    if (stats) {
      const fields: [string, number][] = [
        ['possession_home', stats.possessionHome],
        ['shots_home', stats.shotsHome],
        ['shots_away', stats.shotsAway],
        ['shots_on_target_home', stats.shotsOnTargetHome],
        ['shots_on_target_away', stats.shotsOnTargetAway],
        ['corners_home', stats.cornersHome],
        ['corners_away', stats.cornersAway],
        ['cards_home', stats.cardsHome],
        ['cards_away', stats.cardsAway],
        ['fouls_home', stats.foulsHome],
        ['fouls_away', stats.foulsAway],
        ['passes_accuracy_home', stats.passesAccuracyHome],
        ['passes_accuracy_away', stats.passesAccuracyAway],
      ];
      for (const [col, val] of fields) {
        setClauses.push(`${col} = ?`);
        params.push(val);
      }
    }

    params.push(match.id);
    db.prepare(`UPDATE matches SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

    suspendImpossibleOutcomes(match.id, homeScore, awayScore);
    const updatedMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
    broadcast('match_update', updatedMatch);

    return NextResponse.json({ success: true, sources: liveData?.sources ?? ['time-backbone'], match: updatedMatch });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Sync] Erreur:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
