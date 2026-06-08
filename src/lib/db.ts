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

// Alter table migrations to add is_active column on existing DB databases safely
try {
  db.exec('ALTER TABLE matches ADD COLUMN is_active INTEGER DEFAULT 0;');
} catch (e) {
  // Column already exists, ignore
}

// Seed initial data if empty
const matchExists = db.prepare('SELECT id FROM matches WHERE id = ?').get('a0000000-0000-0000-0000-000000000001');
if (!matchExists) {
  const now = Date.now();
  db.prepare(`INSERT INTO matches (id, home_team, away_team, home_score, away_score, status, starts_at, bets_closed_at, elapsed_time, possession_home, shots_on_target_home, corners_home, cards_home, is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(
    'a0000000-0000-0000-0000-000000000001',
    'France', 'Angleterre', 1, 0, 'live',
    new Date(now - 65 * 60 * 1000).toISOString(),
    new Date(now + 15 * 60 * 1000).toISOString(),
    65, 55, 4, 5, 1
  );

  const markets = [
    { id: 'b0000000-0000-0000-0000-000000000001', type: 'final_result', title: 'RÉSULTAT DU MATCH' },
    { id: 'b0000000-0000-0000-0000-000000000002', type: 'exact_score', title: 'SCORE EXACT' },
    { id: 'b0000000-0000-0000-0000-000000000003', type: 'first_scorer', title: 'PREMIER BUTEUR' },
    { id: 'b0000000-0000-0000-0000-000000000004', type: 'corners_count', title: 'NOMBRE DE CORNERS FRANCE' },
  ];
  const insM = db.prepare(`INSERT INTO markets (id,match_id,type,title,is_active,is_closed,resolved_outcome_id,is_flash,closes_at) VALUES (?,?,?,?,1,0,NULL,0,NULL)`);
  for (const m of markets) insM.run(m.id, 'a0000000-0000-0000-0000-000000000001', m.type, m.title);

  const outcomes = [
    ['o-res-home','b0000000-0000-0000-0000-000000000001','France',1.40,1.40,8500,42],
    ['o-res-draw','b0000000-0000-0000-0000-000000000001','Nul',3.20,3.20,2400,12],
    ['o-res-away','b0000000-0000-0000-0000-000000000001','Angleterre',5.50,5.50,1100,6],
    ['o-se-10','b0000000-0000-0000-0000-000000000002','1-0',2.10,2.10,4500,23],
    ['o-se-20','b0000000-0000-0000-0000-000000000002','2-0',4.50,4.50,1200,8],
    ['o-se-21','b0000000-0000-0000-0000-000000000002','2-1',6.00,6.00,2100,14],
    ['o-se-30','b0000000-0000-0000-0000-000000000002','3-0',8.50,8.50,500,3],
    ['o-se-11','b0000000-0000-0000-0000-000000000002','1-1',5.00,5.00,1900,11],
    ['o-se-01','b0000000-0000-0000-0000-000000000002','0-1',9.00,9.00,200,2],
    ['o-pb-mbappe','b0000000-0000-0000-0000-000000000003','Kylian Mbappé',3.50,3.50,6200,35],
    ['o-pb-griezmann','b0000000-0000-0000-0000-000000000003','Antoine Griezmann',5.00,5.00,2800,15],
    ['o-pb-giroud','b0000000-0000-0000-0000-000000000003','Olivier Giroud',4.50,4.50,3100,18],
    ['o-pb-kane','b0000000-0000-0000-0000-000000000003','Harry Kane',6.00,6.00,1200,7],
    ['o-pb-bellingham','b0000000-0000-0000-0000-000000000003','Jude Bellingham',8.00,8.00,900,5],
    ['o-co-l5','b0000000-0000-0000-0000-000000000004','Moins de 5',2.20,2.20,1500,8],
    ['o-co-57','b0000000-0000-0000-0000-000000000004','Entre 5 et 7',1.80,1.80,4800,26],
    ['o-co-m7','b0000000-0000-0000-0000-000000000004','Plus de 7',3.10,3.10,1200,7],
  ];
  const insO = db.prepare(`INSERT INTO outcomes VALUES (?,?,?,?,?,?,?)`);
  for (const o of outcomes) insO.run(...o);

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

  db.prepare(`INSERT INTO game_settings VALUES (?,0)`).run('a0000000-0000-0000-0000-000000000001');
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

export default db;
