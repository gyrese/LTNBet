import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'ltn.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    home_score INTEGER DEFAULT 0,
    away_score INTEGER DEFAULT 0,
    status TEXT DEFAULT 'upcoming',
    starts_at TEXT,
    bets_closed_at TEXT,
    elapsed_time INTEGER DEFAULT 0,
    possession_home INTEGER DEFAULT 50,
    shots_on_target_home INTEGER DEFAULT 0,
    corners_home INTEGER DEFAULT 0,
    cards_home INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS markets (
    id TEXT PRIMARY KEY,
    match_id TEXT,
    type TEXT,
    title TEXT,
    is_active INTEGER DEFAULT 1,
    is_closed INTEGER DEFAULT 0,
    resolved_outcome_id TEXT,
    is_flash INTEGER DEFAULT 0,
    closes_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS outcomes (
    id TEXT PRIMARY KEY,
    market_id TEXT,
    name TEXT,
    base_odds REAL,
    current_odds REAL,
    total_bet_amount INTEGER DEFAULT 0,
    total_bets_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    username TEXT,
    avatar TEXT,
    toiles_coins INTEGER DEFAULT 1000,
    total_winnings INTEGER DEFAULT 0,
    successful_bets INTEGER DEFAULT 0,
    total_bets INTEGER DEFAULT 0,
    rank INTEGER DEFAULT 99,
    rank_change TEXT DEFAULT 'same',
    is_bot INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS bets (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    match_id TEXT,
    market_id TEXT,
    market_title TEXT,
    outcome_id TEXT,
    outcome_name TEXT,
    amount INTEGER,
    odds_at_bet REAL,
    status TEXT DEFAULT 'pending',
    payout INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS game_events (
    id TEXT PRIMARY KEY,
    match_id TEXT,
    type TEXT,
    title TEXT,
    subtitle TEXT,
    meta TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS game_settings (
    match_id TEXT PRIMARY KEY,
    double_gains_active INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    events TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS badges (
    code TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS player_badges (
    player_id TEXT NOT NULL,
    badge_code TEXT NOT NULL,
    earned_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (player_id, badge_code),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (badge_code) REFERENCES badges(code) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    reward_coins INTEGER DEFAULT 0,
    reward_badge_code TEXT,
    type TEXT NOT NULL,
    target INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS player_missions (
    player_id TEXT NOT NULL,
    mission_id TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    is_completed INTEGER DEFAULT 0,
    PRIMARY KEY (player_id, mission_id),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rewards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    cost_toiles_coins INTEGER DEFAULT 0,
    image TEXT DEFAULT '🎁'
  );

  CREATE TABLE IF NOT EXISTS reward_ledger (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    reward_id TEXT NOT NULL,
    reward_title TEXT NOT NULL,
    assigned_by TEXT DEFAULT 'admin',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE
  );
`);

// Alter table migrations to add columns on existing DB databases safely
try {
  db.exec('ALTER TABLE matches ADD COLUMN is_active INTEGER DEFAULT 0;');
} catch {
  // Column already exists, ignore
}
try {
  db.exec('ALTER TABLE matches ADD COLUMN finished_at TEXT;');
} catch {
  // Column already exists, ignore
}
try {
  db.exec('ALTER TABLE matches ADD COLUMN session_closed INTEGER DEFAULT 0;');
} catch {
  // Column already exists, ignore
}

// Lien vers le fournisseur de cotes/scores (odds-api.io) et, en option, vers API-Football
// pour l'enrichissement des stats live.
try { db.exec('ALTER TABLE matches ADD COLUMN odds_event_id TEXT;'); } catch { /* exists */ }
try { db.exec('ALTER TABLE matches ADD COLUMN apifs_id TEXT;'); } catch { /* exists */ }

// Provenance de la cote de chaque outcome : 'api' | 'default' | 'manual' (badge admin).
try { db.exec("ALTER TABLE outcomes ADD COLUMN odds_source TEXT DEFAULT 'default';"); } catch { /* exists */ }

// Présence : dernière activité d'un joueur (heartbeat) pour le comptage des connectés et le timeout.
try { db.exec('ALTER TABLE players ADD COLUMN last_seen TEXT;'); } catch { /* exists */ }

// Nouvelles colonnes de statistiques détaillées pour les deux équipes
try { db.exec('ALTER TABLE matches ADD COLUMN shots_home INTEGER DEFAULT 0;'); } catch { /* exists */ }
try { db.exec('ALTER TABLE matches ADD COLUMN shots_away INTEGER DEFAULT 0;'); } catch { /* exists */ }
try { db.exec('ALTER TABLE matches ADD COLUMN shots_on_target_away INTEGER DEFAULT 0;'); } catch { /* exists */ }
try { db.exec('ALTER TABLE matches ADD COLUMN corners_away INTEGER DEFAULT 0;'); } catch { /* exists */ }
try { db.exec('ALTER TABLE matches ADD COLUMN cards_away INTEGER DEFAULT 0;'); } catch { /* exists */ }
try { db.exec('ALTER TABLE matches ADD COLUMN fouls_home INTEGER DEFAULT 0;'); } catch { /* exists */ }
try { db.exec('ALTER TABLE matches ADD COLUMN fouls_away INTEGER DEFAULT 0;'); } catch { /* exists */ }
try { db.exec('ALTER TABLE matches ADD COLUMN passes_accuracy_home INTEGER DEFAULT 80;'); } catch { /* exists */ }
try { db.exec('ALTER TABLE matches ADD COLUMN passes_accuracy_away INTEGER DEFAULT 80;'); } catch { /* exists */ }

// Seed bots (joueurs fictifs du classement) si la table est vide.
// NB : aucun match de démo n'est créé — l'hôte lance lui-même la session depuis /admin.
const botCount = db.prepare('SELECT COUNT(*) as count FROM players WHERE is_bot = 1').get() as { count: number };
if (botCount.count === 0) {
  const bots = [
    ['c0000000-0000-0000-0000-000000000001','ToileMaster','avatar_1',9200,15000,18,25,1,'same'],
    ['c0000000-0000-0000-0000-000000000002','AlexPro99','avatar_2',8450,12000,15,22,2,'same'],
    ['c0000000-0000-0000-0000-000000000003','ShadowBet','avatar_3',7950,11000,12,20,3,'same'],
    ['c0000000-0000-0000-0000-000000000004','BetSniper','avatar_4',7820,9800,10,15,4,'up'],
    ['c0000000-0000-0000-0000-000000000005','LunaStat','avatar_5',7650,8900,9,18,5,'down'],
    ['c0000000-0000-0000-0000-000000000006','NeoPredict','avatar_6',7400,7200,8,14,6,'same'],
    ['c0000000-0000-0000-0000-000000000007','BleuFerveur','avatar_1',6300,6100,7,13,7,'up'],
    ['c0000000-0000-0000-0000-000000000008','KikiPronos','avatar_2',5800,5000,6,12,8,'down'],
    ['c0000000-0000-0000-0000-000000000009','BucoliqueBar','avatar_3',4100,3800,5,10,9,'same'],
    ['c0000000-0000-0000-0000-000000000010','OracleBière','avatar_4',3850,3500,4,9,10,'up'],
  ];
  const insP = db.prepare(`INSERT INTO players (id,username,avatar,toiles_coins,total_winnings,successful_bets,total_bets,rank,rank_change,is_bot) VALUES (?,?,?,?,?,?,?,?,?,1)`);
  for (const p of bots) insP.run(...p);
}

// Seed badges if empty
const badgeCount = db.prepare('SELECT COUNT(*) as count FROM badges').get() as { count: number };
if (badgeCount.count === 0) {
  const insBadge = db.prepare('INSERT INTO badges (code, title, description, icon) VALUES (?, ?, ?, ?)');
  insBadge.run('nostradamus', 'Nostradamus', '5 bons paris consécutifs', 'emoji_events');
  insBadge.run('oracle_bleu', 'Oracle Bleu', '10 bons paris au total', 'visibility');
  insBadge.run('roi_buteurs', 'Roi des Buteurs', '5 buteurs trouvés dans le match', 'military_tech');
  insBadge.run('visionnaire', 'Visionnaire', 'Trouver un score exact', 'workspace_premium');
  insBadge.run('legende', 'Légende des Toiles', 'Atteindre le top 1 du classement', 'hub');
}

// Seed missions if empty
const missionCount = db.prepare('SELECT COUNT(*) as count FROM missions').get() as { count: number };
if (missionCount.count === 0) {
  const insMission = db.prepare('INSERT INTO missions (id, title, description, reward_coins, reward_badge_code, type, target) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insMission.run('m-1', 'Parier sur le match', 'Placer au moins 3 paris sur le match en direct', 250, null, 'bet_count', 3);
  insMission.run('m-2', 'Nostradamus en Herbe', 'Trouver au moins un score exact sur le match', 500, 'visionnaire', 'exact_score', 1);
  insMission.run('m-3', 'Prédicteur de Buteurs', 'Parier sur un buteur à tout moment', 300, null, 'buteur_count', 1);
}

// Seed rewards if empty
const rewardCount = db.prepare('SELECT COUNT(*) as count FROM rewards').get() as { count: number };
if (rewardCount.count === 0) {
  const insReward = db.prepare('INSERT INTO rewards (id, title, description, cost_toiles_coins, image) VALUES (?, ?, ?, ?, ?)');
  insReward.run('r-beer', 'Pinte offerte', 'Une pinte au choix à réclamer au comptoir.', 2500, '🍺');
  insReward.run('r-cocktail', 'Cocktail Création', 'Le cocktail signature du barman offert.', 3500, '🍹');
  insReward.run('r-burger', 'Burger Toiles Noires', 'Le burger classique avec frites.', 5000, '🍔');
  insReward.run('r-cap', 'Casquette France Toiles', 'Une casquette collector aux couleurs du bar.', 4000, '🧢');
}

export function suspendImpossibleOutcomes(matchId: string, homeScore: number, awayScore: number) {
  // 1. Get all markets for this match
  const markets = db.prepare('SELECT id, type FROM markets WHERE match_id = ?').all(matchId) as { id: string; type: string }[];
  
  for (const market of markets) {
    const outcomes = db.prepare('SELECT id, name FROM outcomes WHERE market_id = ?').all(market.id) as { id: string; name: string }[];
    
    for (const outcome of outcomes) {
      let isImpossible = false;
      
      if (market.type === 'exact_score' || market.type === 'halftime_score') {
        const parts = outcome.name.split('-');
        if (parts.length === 2) {
          const h = parseInt(parts[0], 10);
          const a = parseInt(parts[1], 10);
          if (!isNaN(h) && !isNaN(a)) {
            if (h < homeScore || a < awayScore) {
              isImpossible = true;
            }
          }
        }
      } 
      else if (market.type === 'over_under_25') {
        const totalGoals = homeScore + awayScore;
        if (totalGoals > 2.5 && outcome.name === 'Non') {
          isImpossible = true;
        }
      } 
      else if (market.type === 'btts') {
        if (homeScore > 0 && awayScore > 0 && outcome.name === 'Non') {
          isImpossible = true;
        }
      }
      
      if (isImpossible) {
        db.prepare('UPDATE outcomes SET current_odds = 0 WHERE id = ?').run(outcome.id);
      }
    }
  }
}

export default db;
