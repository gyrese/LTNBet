/**
 * Test des sources live (Football-Data primaire + API-Football stats) AVANT le match.
 *
 * Reproduit la logique de matching de l'app (normTeam / teamsMatch) pour confirmer que
 * « France » / « Sénégal » (ou n'importe quelles équipes) sont bien retrouvées chez chaque
 * fournisseur, et affiche le score, le statut et les stats disponibles.
 *
 * Lancer pendant un match EN COURS (les stats n'existent qu'en live) :
 *
 *   node --env-file=.env.local scripts/test-live-sources.mjs "France" "Senegal" 2026-06-15
 *
 * Le 3e argument (date YYYY-MM-DD) est optionnel (défaut : aujourd'hui, UTC).
 */

const [, , homeArg, awayArg, dateArg] = process.argv;

if (!homeArg || !awayArg) {
  console.error('Usage: node --env-file=.env.local scripts/test-live-sources.mjs "<Domicile>" "<Exterieur>" [YYYY-MM-DD]');
  process.exit(1);
}

const date = dateArg || new Date().toISOString().slice(0, 10);
const FD_KEY = process.env.FOOTBALL_DATA_ORG_KEY;
const APIF_KEY = process.env.FOOTBALL_API_KEY;

// ─── Matching d'équipes (identique aux providers de l'app) ─────────────────────

function normTeam(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\b(fc|sc|as|ac|afc|cf|rc|sd|rcd|ud|cd|ss|sk|fk|vv|sv)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamsMatch(a, b) {
  const na = normTeam(a);
  const nb = normTeam(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = new Set(na.split(' ').filter((w) => w.length >= 3));
  const hits = nb.split(' ').filter((w) => w.length >= 3 && wa.has(w));
  return hits.length >= 2 || (hits.length === 1 && hits[0].length >= 5);
}

const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const ko = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

console.log(`\n=== Test sources live ===`);
console.log(`Recherche : ${homeArg} vs ${awayArg}  (date ${date})\n`);

// ─── 1. Football-Data.org (score / statut / mi-temps — PRIMAIRE) ───────────────

async function testFootballData() {
  console.log('── Football-Data.org (score + statut + buteurs) ──');
  if (!FD_KEY) { console.log(ko('  FOOTBALL_DATA_ORG_KEY absente → source indisponible.\n')); return; }
  try {
    const res = await fetch(`https://api.football-data.org/v4/matches?dateFrom=${date}&dateTo=${date}`, {
      headers: { 'X-Auth-Token': FD_KEY },
    });
    if (res.status === 429) { console.log(ko('  Rate limited (429) — réessaie dans 1 min.\n')); return; }
    if (!res.ok) { console.log(ko(`  HTTP ${res.status}\n`)); return; }
    const data = await res.json();
    const matches = data.matches || [];
    console.log(dim(`  ${matches.length} match(s) ce jour dans les compétitions couvertes.`));

    const found = matches.find((m) => {
      const h = teamsMatch(m.homeTeam.name, homeArg) || teamsMatch(m.homeTeam.shortName ?? '', homeArg);
      const a = teamsMatch(m.awayTeam.name, awayArg) || teamsMatch(m.awayTeam.shortName ?? '', awayArg);
      return h && a;
    });

    if (!found) {
      console.log(ko('  ✗ Match NON trouvé.'));
      if (matches.length) {
        console.log(dim('    Matchs disponibles ce jour :'));
        for (const m of matches.slice(0, 15)) console.log(dim(`      · ${m.homeTeam.name} vs ${m.awayTeam.name}  [${m.competition?.name ?? '?'}]`));
      } else {
        console.log(dim('    (aucun match couvert ce jour — la CdM doit être dans la fenêtre du plan gratuit)'));
      }
      console.log();
      return;
    }

    console.log(ok(`  ✓ Trouvé : ${found.homeTeam.name} vs ${found.awayTeam.name}  (FD id ${found.id})`));
    console.log(`    Statut    : ${found.status}`);
    console.log(`    Score     : ${found.score?.fullTime?.home ?? '-'} - ${found.score?.fullTime?.away ?? '-'}`);
    console.log(`    Mi-temps  : ${found.score?.halfTime?.home ?? '-'} - ${found.score?.halfTime?.away ?? '-'}`);
    const goals = found.goals || [];
    if (goals.length) {
      console.log('    Buteurs   :');
      for (const g of goals) console.log(`      ${g.minute ?? '?'}'  ${g.scorer?.name ?? '?'} (${g.team?.name ?? '?'})`);
    }
    console.log();
  } catch (e) {
    console.log(ko(`  Erreur réseau : ${e.message}\n`));
  }
}

// ─── 2. API-Football (stats détaillées — SEULE source) ─────────────────────────

async function testApiFootball() {
  console.log('── API-Football (stats : possession, tirs, corners…) ──');
  if (!APIF_KEY) { console.log(ko('  FOOTBALL_API_KEY absente → stats indisponibles.\n')); return; }
  try {
    const res = await fetch(`https://v3.football.api-sports.io/fixtures?date=${date}`, {
      headers: { 'x-apisports-key': APIF_KEY },
    });
    if (!res.ok) { console.log(ko(`  HTTP ${res.status}\n`)); return; }
    const data = await res.json();
    const fixtures = data.response || [];
    console.log(dim(`  ${fixtures.length} fixture(s) ce jour. Quota du jour : ${JSON.stringify(data.errors ?? {})}`));

    const found = fixtures.find((f) =>
      teamsMatch(f.teams.home.name, homeArg) && teamsMatch(f.teams.away.name, awayArg),
    );

    if (!found) {
      console.log(ko('  ✗ Fixture NON trouvé.'));
      const sample = fixtures.filter((f) =>
        teamsMatch(f.teams.home.name, homeArg) || teamsMatch(f.teams.away.name, awayArg) ||
        teamsMatch(f.teams.home.name, awayArg) || teamsMatch(f.teams.away.name, homeArg),
      ).slice(0, 10);
      if (sample.length) {
        console.log(dim('    Candidats proches :'));
        for (const f of sample) console.log(dim(`      · ${f.teams.home.name} vs ${f.teams.away.name}  [${f.league?.name ?? '?'}]`));
      }
      console.log();
      return;
    }

    const fid = found.fixture.id;
    console.log(ok(`  ✓ Trouvé : ${found.teams.home.name} vs ${found.teams.away.name}  (fixture ${fid})`));
    console.log(`    Statut : ${found.fixture.status?.short} (${found.fixture.status?.elapsed ?? '-'}')  Score : ${found.goals?.home ?? '-'} - ${found.goals?.away ?? '-'}`);

    const sres = await fetch(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${fid}`, {
      headers: { 'x-apisports-key': APIF_KEY },
    });
    const sdata = await sres.json();
    const rows = sdata.response || [];
    if (!rows.length) {
      console.log(dim('    Stats : aucune (le match n\'est probablement pas encore en cours — relance pendant le live).'));
    } else {
      for (const r of rows) {
        const get = (t) => r.statistics.find((s) => s.type === t)?.value ?? '-';
        console.log(`    ${r.team.name}: possession ${get('Ball Possession')}, tirs ${get('Total Shots')}, cadrés ${get('Shots on Goal')}, corners ${get('Corner Kicks')}`);
      }
    }
    console.log();
  } catch (e) {
    console.log(ko(`  Erreur réseau : ${e.message}\n`));
  }
}

await testFootballData();
await testApiFootball();

console.log('=== Fin ===');
console.log(dim('Si Football-Data trouve le match → le score live fonctionnera lundi.'));
console.log(dim('Si API-Football trouve le fixture ET renvoie des stats en live → les stats détaillées fonctionneront.\n'));
