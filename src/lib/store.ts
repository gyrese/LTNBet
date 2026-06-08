import { create } from 'zustand';
import { calculateDynamicOdds } from './odds';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  username: string;
  avatar: string;
  toilesCoins: number;
  totalWinnings: number;
  successfulBets: number;
  totalBets: number;
  rank: number;
  rankChange: 'up' | 'down' | 'same';
  badgeCount?: number;
}

export interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: 'upcoming' | 'live' | 'half_time' | 'finished';
  startsAt: string;
  betsClosedAt: string;
  elapsedTime: number;
  possessionHome: number;
  shotsOnTargetHome: number;
  cornersHome: number;
  cardsHome: number;
}

export interface Outcome {
  id: string;
  name: string;
  baseOdds: number;
  currentOdds: number;
  totalBetAmount: number;
  totalBetsCount: number;
}

export interface Market {
  id: string;
  matchId: string;
  type: string;
  title: string;
  isActive: boolean;
  isClosed: boolean;
  resolvedOutcomeId: string | null;
  isFlash: boolean;
  closesAt: string | null;
  outcomes: Outcome[];
}

export interface Bet {
  id: string;
  userId: string;
  matchId: string;
  marketId: string;
  marketTitle: string;
  outcomeId: string;
  outcomeName: string;
  amount: number;
  oddsAtBet: number;
  status: 'pending' | 'won' | 'lost' | 'cancelled';
  payout: number;
  createdAt: string;
}

export interface Badge {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: string;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  rewardCoins: number;
  rewardBadgeCode?: string;
  type: 'bet_count' | 'buteur_count' | 'exact_score' | 'top_10';
  target: number;
  progress: number;
  isCompleted: boolean;
}

export interface Reward {
  id: string;
  title: string;
  description: string;
  costToilesCoins: number;
  image: string;
}

export interface RewardLedger {
  id: string;
  userId: string;
  username: string;
  rewardId: string;
  rewardTitle: string;
  assignedBy: string;
  status: 'pending' | 'claimed';
  createdAt: string;
}

export interface GameEvent {
  id: string;
  type: 'goal' | 'jackpot' | 'leader_change' | 'half_time' | 'finished' | 'badge' | 'flash_market' | 'double_gains';
  title: string;
  subtitle: string;
  meta?: Record<string, unknown>;
  timestamp: number;
}

interface GameStore {
  currentUser: Player | null;
  isUserAdmin: boolean;
  sessionChecked: boolean;
  supabaseLoaded: boolean;

  registerUser: (username: string, avatar: string) => Promise<void>;
  logoutUser: () => void;
  promoteToAdmin: () => void;
  initFromSupabase: () => Promise<void>;

  match: Match;
  updateMatchStats: (stats: Partial<Match>) => void;
  triggerGoal: (team: 'home' | 'away', scorer?: string) => void;

  markets: Market[];
  placeBet: (marketId: string, outcomeId: string, amount: number) => Promise<{ success: boolean; error?: string }>;
  createFlashMarket: (title: string, outcomes: { name: string; baseOdds: number }[]) => void;
  resolveMarket: (marketId: string, outcomeId: string) => Promise<void>;
  closeMarket: (marketId: string) => void;
  deleteMarket: (marketId: string) => void;

  myBets: Bet[];

  leaderboard: Player[];
  updateLeaderboard: () => void;

  badges: Badge[];
  myBadges: string[];
  missions: Mission[];
  updateMissionProgress: (type: string, increment: number) => void;

  rewards: Reward[];
  rewardLedger: RewardLedger[];
  createReward: (title: string, description: string, cost: number) => void;
  attributeReward: (userId: string, rewardId: string) => void;
  claimReward: (ledgerId: string) => void;

  activeEvent: GameEvent | null;
  clearActiveEvent: () => void;
  triggerGameEvent: (event: Omit<GameEvent, 'id' | 'timestamp'>) => void;

  doubleGainsActive: boolean;
  toggleDoubleGains: (active: boolean) => void;

  runSimulationStep: () => void;
  _subscribeRealtime: () => void;
}

// ─── DB row → TS mappers ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const matchFromDb = (r: any): Match => ({
  id: r.id,
  homeTeam: r.home_team,
  awayTeam: r.away_team,
  homeScore: r.home_score,
  awayScore: r.away_score,
  status: r.status,
  startsAt: r.starts_at,
  betsClosedAt: r.bets_closed_at ?? '',
  elapsedTime: r.elapsed_time,
  possessionHome: r.possession_home,
  shotsOnTargetHome: r.shots_on_target_home,
  cornersHome: r.corners_home,
  cardsHome: r.cards_home,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const outcomeFromDb = (r: any): Outcome => ({
  id: r.id,
  name: r.name,
  baseOdds: parseFloat(r.base_odds),
  currentOdds: parseFloat(r.current_odds),
  totalBetAmount: r.total_bet_amount,
  totalBetsCount: r.total_bets_count,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const marketFromDb = (r: any): Market => ({
  id: r.id,
  matchId: r.match_id,
  type: r.type,
  title: r.title,
  isActive: Boolean(r.is_active),
  isClosed: Boolean(r.is_closed),
  resolvedOutcomeId: r.resolved_outcome_id ?? null,
  isFlash: Boolean(r.is_flash),
  closesAt: r.closes_at ?? null,
  outcomes: (r.outcomes || []).map(outcomeFromDb),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const playerFromDb = (r: any): Player => ({
  id: r.id,
  username: r.username,
  avatar: r.avatar,
  toilesCoins: r.toiles_coins,
  totalWinnings: r.total_winnings,
  successfulBets: r.successful_bets,
  totalBets: r.total_bets,
  rank: r.rank ?? 99,
  rankChange: r.rank_change ?? 'same',
  badgeCount: r.badge_count ?? 0,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const betFromDb = (r: any): Bet => ({
  id: r.id,
  userId: r.user_id,
  matchId: r.match_id,
  marketId: r.market_id,
  marketTitle: r.market_title,
  outcomeId: r.outcome_id,
  outcomeName: r.outcome_name,
  amount: r.amount,
  oddsAtBet: parseFloat(r.odds_at_bet),
  status: r.status,
  payout: r.payout,
  createdAt: r.created_at,
});

// ─── Static data (badges, missions, rewards) ──────────────────────────────────

const ALL_BADGES: Badge[] = [
  { id: 'b-nostra', code: 'nostradamus', title: 'Nostradamus', description: '5 bons paris consécutifs', icon: 'emoji_events' },
  { id: 'b-oracle', code: 'oracle_bleu', title: 'Oracle Bleu', description: '10 bons paris au total', icon: 'visibility' },
  { id: 'b-buteur', code: 'roi_buteurs', title: 'Roi des Buteurs', description: '5 buteurs trouvés dans le match', icon: 'military_tech' },
  { id: 'b-vision', code: 'visionnaire', title: 'Visionnaire', description: 'Trouver un score exact', icon: 'workspace_premium' },
  { id: 'b-legende', code: 'legende', title: 'Légende des Toiles', description: 'Atteindre le top 1 du classement', icon: 'hub' },
];

const INITIAL_MISSIONS = (): Mission[] => [
  { id: 'm-1', title: 'Parier sur le match', description: 'Placer au moins 3 paris sur le match en direct', rewardCoins: 250, type: 'bet_count', target: 3, progress: 0, isCompleted: false },
  { id: 'm-2', title: 'Nostradamus en Herbe', description: 'Trouver au moins un score exact sur le match', rewardCoins: 500, rewardBadgeCode: 'visionnaire', type: 'exact_score', target: 1, progress: 0, isCompleted: false },
  { id: 'm-3', title: 'Prédicteur de Buteurs', description: 'Parier sur un buteur à tout moment', rewardCoins: 300, type: 'buteur_count', target: 1, progress: 0, isCompleted: false },
];

const INITIAL_REWARDS: Reward[] = [
  { id: 'r-beer', title: 'Pinte offerte', description: 'Une pinte au choix à réclamer au comptoir.', costToilesCoins: 2500, image: '🍺' },
  { id: 'r-cocktail', title: 'Cocktail Création', description: 'Le cocktail signature du barman offert.', costToilesCoins: 3500, image: '🍹' },
  { id: 'r-burger', title: 'Burger Toiles Noires', description: 'Le burger classique avec frites.', costToilesCoins: 5000, image: '🍔' },
  { id: 'r-cap', title: 'Casquette France Toiles', description: 'Une casquette collector aux couleurs du bar.', costToilesCoins: 4000, image: '🧢' },
];

// ─── localStorage helpers ─────────────────────────────────────────────────────

const lsGet = <T>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
};

const lsSet = (key: string, value: unknown) => {
  if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
};

// ─── API helper ───────────────────────────────────────────────────────────────

async function dbPost(body: Record<string, unknown>) {
  const r = await fetch('/api/db', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}

// ─── INITIAL STATE (static seed, replaced by DB on mount) ────────────────────

const INITIAL_MATCH: Match = {
  id: 'a0000000-0000-0000-0000-000000000001',
  homeTeam: 'France', awayTeam: 'Angleterre',
  homeScore: 1, awayScore: 0, status: 'live',
  startsAt: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
  betsClosedAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  elapsedTime: 65, possessionHome: 55, shotsOnTargetHome: 4, cornersHome: 5, cardsHome: 1,
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameStore>((set, get) => ({
  currentUser: lsGet<Player | null>('ltn_user_profile', null),
  isUserAdmin: lsGet<boolean>('ltn_user_admin', false),
  sessionChecked: false,
  supabaseLoaded: false,
  match: INITIAL_MATCH,
  markets: [],
  myBets: lsGet<Bet[]>('ltn_user_bets', []),
  leaderboard: [],
  badges: ALL_BADGES,
  myBadges: lsGet<string[]>('ltn_user_badges', []),
  missions: INITIAL_MISSIONS(),
  rewards: INITIAL_REWARDS,
  rewardLedger: lsGet<RewardLedger[]>('ltn_reward_ledger', []),
  activeEvent: null,
  doubleGainsActive: false,

  // ── Init: load from SQLite via API ─────────────────────────────────────────

  initFromSupabase: async () => {
    try {
      const { match, markets, bots, settings, rewards, rewardLedger } = await fetch('/api/db?op=state').then(r => r.json());
      if (match) set({ match: matchFromDb(match) });
      if (markets) set({ markets: markets.map(marketFromDb) });
      if (bots) set({ leaderboard: bots.map(playerFromDb) });
      if (settings) set({ doubleGainsActive: Boolean(settings.double_gains_active) });
      if (rewards) set({ rewards });
      if (rewardLedger) set({ rewardLedger });

      const userId = lsGet<Player | null>('ltn_user_profile', null)?.id;
      if (userId) {
        const { player, bets, badges, missions } = await fetch(`/api/db?op=player&id=${userId}`).then(r => r.json());
        if (player) {
          set({ currentUser: playerFromDb(player), isUserAdmin: Boolean(player.is_admin) });
          lsSet('ltn_user_profile', playerFromDb(player));
          if (bets) set({ myBets: bets.map(betFromDb) });
          if (badges) set({ myBadges: badges });
          if (missions) set({ missions });
        } else {
          get().logoutUser();
        }
      }
    } catch (e) {
      console.error('initFromSupabase error:', e);
    }
    set({ sessionChecked: true, supabaseLoaded: true });
    get()._subscribeRealtime();
  },

  // ── SSE subscription ───────────────────────────────────────────────────────

  _subscribeRealtime: () => {
    if (typeof window === 'undefined') return;
    const es = new EventSource('/api/events');

    es.addEventListener('match_update', (e) => {
      set({ match: matchFromDb(JSON.parse(e.data)) });
    });

    es.addEventListener('market_update', (e) => {
      const row = JSON.parse(e.data);
      set(s => ({ markets: s.markets.map(m => m.id === row.id ? marketFromDb(row) : m) }));
    });

    es.addEventListener('market_insert', (e) => {
      const row = JSON.parse(e.data);
      set(s => ({ markets: [marketFromDb(row), ...s.markets] }));
      get().triggerGameEvent({ type: 'flash_market', title: '⚡ NOUVEAU PARI FLASH !', subtitle: row.title });
    });

    es.addEventListener('market_delete', (e) => {
      const { marketId } = JSON.parse(e.data);
      set(s => ({ markets: s.markets.filter(m => m.id !== marketId) }));
    });

    es.addEventListener('outcomes_update', (e) => {
      const { marketId, outcomes } = JSON.parse(e.data);
      set(s => ({
        markets: s.markets.map(m => m.id === marketId ? { ...m, outcomes: outcomes.map(outcomeFromDb) } : m),
      }));
    });

    es.addEventListener('player_update', (e) => {
      const row = JSON.parse(e.data);
      const { currentUser } = get();
      if (currentUser && currentUser.id === row.id) {
        const updated = playerFromDb(row);
        set({ currentUser: updated, isUserAdmin: Boolean(row.is_admin) });
        lsSet('ltn_user_profile', updated);
      }
    });

    es.addEventListener('leaderboard_update', (e) => {
      set({ leaderboard: (JSON.parse(e.data) as unknown[]).map(playerFromDb) });
    });

    es.addEventListener('settings_update', (e) => {
      const { doubleGainsActive } = JSON.parse(e.data);
      set({ doubleGainsActive });
    });

    es.addEventListener('game_event', (e) => {
      const ev = JSON.parse(e.data);
      set({ activeEvent: { ...ev, id: 'evt-' + Date.now(), timestamp: Date.now() } });
    });

    // Nouveau match créé par l'admin : recharger entièrement l'état du jeu
    es.addEventListener('session_reset', (e) => {
      const { match, markets } = JSON.parse(e.data);
      set({
        match: matchFromDb(match),
        markets: (markets as unknown[]).map(marketFromDb),
      });
    });
  },

  // ── Auth ───────────────────────────────────────────────────────────────────

  registerUser: async (username: string, avatar: string) => {
    const { player } = await dbPost({ op: 'register', username, avatar });
    if (!player) return;
    const p = playerFromDb(player);
    lsSet('ltn_user_profile', p);
    set({ currentUser: p });
    get().updateLeaderboard();
    import('canvas-confetti').then(c => c.default({ particleCount: 50, spread: 60, origin: { y: 0.8 } }));
  },

  logoutUser: () => {
    ['ltn_user_profile', 'ltn_user_bets', 'ltn_user_badges', 'ltn_user_admin'].forEach(k => {
      if (typeof window !== 'undefined') localStorage.removeItem(k);
    });
    set({ currentUser: null, myBets: [], myBadges: [], isUserAdmin: false });
  },

  promoteToAdmin: () => {
    lsSet('ltn_user_admin', true);
    set({ isUserAdmin: true });
  },

  // ── Match ──────────────────────────────────────────────────────────────────

  updateMatchStats: (stats: Partial<Match>) => {
    set(s => ({ match: { ...s.match, ...stats } }));
    // Map TS keys to DB snake_case
    const mapping: Record<string, string> = {
      homeScore: 'home_score', awayScore: 'away_score', status: 'status',
      elapsedTime: 'elapsed_time', possessionHome: 'possession_home',
      shotsOnTargetHome: 'shots_on_target_home', cornersHome: 'corners_home', cardsHome: 'cards_home',
    };
    const dbStats: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(stats)) if (mapping[k]) dbStats[mapping[k]] = v;
    if (Object.keys(dbStats).length) dbPost({ op: 'update_match', stats: dbStats });
  },

  triggerGoal: (team: 'home' | 'away', scorer?: string) => {
    const name = scorer || (team === 'home' ? 'Équipe de France' : 'Adversaire');
    const { match } = get();
    const homeScore = team === 'home' ? match.homeScore + 1 : match.homeScore;
    const awayScore = team === 'away' ? match.awayScore + 1 : match.awayScore;
    const event: GameEvent = {
      id: 'evt-' + Date.now(),
      type: 'goal',
      title: `BUT POUR LA ${team === 'home' ? 'FRANCE' : 'ENG'} !`,
      subtitle: `${name} marque ! (${homeScore} - ${awayScore})`,
      meta: { team, scorer: name, score: `${homeScore}-${awayScore}` },
      timestamp: Date.now(),
    };
    set(s => ({ match: { ...s.match, homeScore, awayScore }, activeEvent: event }));
    dbPost({ op: 'update_match', stats: { home_score: homeScore, away_score: awayScore } });
    dbPost({ op: 'game_event', type: 'goal', title: event.title, subtitle: event.subtitle, meta: event.meta });
  },

  // ── Betting ────────────────────────────────────────────────────────────────

  placeBet: async (marketId: string, outcomeId: string, amount: number) => {
    const { currentUser, markets } = get();
    if (!currentUser) return { success: false, error: 'Veuillez vous connecter.' };

    // Optimistic local check
    if (currentUser.toilesCoins < amount) return { success: false, error: 'ToilesCoins insuffisants.' };
    const market = markets.find(m => m.id === marketId);
    if (!market || !market.isActive || market.isClosed) return { success: false, error: 'Les paris sur ce marché sont fermés.' };
    const outcome = market.outcomes.find(o => o.id === outcomeId);
    if (!outcome) return { success: false, error: 'Option de pari introuvable.' };

    const result = await dbPost({ op: 'place_bet', userId: currentUser.id, marketId, outcomeId, amount });
    if (!result.success) return { success: false, error: result.error || 'Erreur serveur.' };

    // Update local state immediately (SSE will also confirm)
    const updatedUser = { ...currentUser, toilesCoins: currentUser.toilesCoins - amount, totalBets: currentUser.totalBets + 1 };
    const newBet = betFromDb(result.bet);
    const updatedBets = [newBet, ...get().myBets];
    lsSet('ltn_user_profile', updatedUser);
    lsSet('ltn_user_bets', updatedBets);
    set({ currentUser: updatedUser, myBets: updatedBets });

    get().updateMissionProgress('bet_count', 1);
    if (market.type === 'first_scorer') get().updateMissionProgress('buteur_count', 1);
    get().updateLeaderboard();
    return { success: true };
  },

  createFlashMarket: (title: string, outcomes: { name: string; baseOdds: number }[]) => {
    dbPost({ op: 'create_flash_market', title, outcomes });
  },

  resolveMarket: async (marketId: string, outcomeId: string) => {
    await dbPost({ op: 'resolve_market', marketId, outcomeId });

    // Refresh own bets from server
    const { currentUser } = get();
    if (currentUser) {
      const { bets } = await fetch(`/api/db?op=player&id=${currentUser.id}`).then(r => r.json());
      if (bets) {
        const mapped = (bets as unknown[]).map(betFromDb);
        lsSet('ltn_user_bets', mapped);
        set({ myBets: mapped });
        const coinsWon = (bets as Record<string, unknown>[])
          .filter(b => b.market_id === marketId && b.status === 'won')
          .reduce((s, b) => s + (b.payout as number), 0);
        if (coinsWon >= 1000) get().triggerGameEvent({ type: 'jackpot', title: 'JACKPOT ! 🏆', subtitle: `${currentUser.username} gagne ${coinsWon} TC !` });
      }
    }
    get().updateLeaderboard();
  },

  closeMarket: (marketId: string) => {
    set(s => ({ markets: s.markets.map(m => m.id === marketId ? { ...m, isClosed: true, isActive: false } : m) }));
    dbPost({ op: 'close_market', marketId });
  },

  deleteMarket: (marketId: string) => {
    set(s => ({ markets: s.markets.filter(m => m.id !== marketId) }));
    dbPost({ op: 'delete_market', marketId });
  },

  // ── Leaderboard ────────────────────────────────────────────────────────────

  updateLeaderboard: () => {
    const { leaderboard, currentUser } = get();
    let all = [...leaderboard];
    if (currentUser) {
      const idx = all.findIndex(p => p.id === currentUser.id);
      if (idx !== -1) all[idx] = { ...currentUser };
      else all.push({ ...currentUser });
    }
    all.sort((a, b) => (b.toilesCoins + b.totalWinnings) - (a.toilesCoins + a.totalWinnings));
    const previousLeaderId = leaderboard[0]?.id;
    all = all.map((p, i) => {
      const oldRank = p.rank || 11;
      const newRank = i + 1;
      return { ...p, rank: newRank, rankChange: (oldRank > newRank ? 'up' : oldRank < newRank ? 'down' : 'same') as 'up' | 'down' | 'same' };
    });

    const newLeader = all[0];
    if (previousLeaderId && newLeader && newLeader.id !== previousLeaderId) {
      get().triggerGameEvent({ type: 'leader_change', title: 'CHANGEMENT DE LEADER ! 👑', subtitle: `${newLeader.username} prend la 1ère place !` });
    }

    if (currentUser && newLeader?.id === currentUser.id) {
      const myBadges = get().myBadges;
      if (!myBadges.includes('legende')) {
        const updated = [...myBadges, 'legende'];
        lsSet('ltn_user_badges', updated);
        set({ myBadges: updated });
        get().triggerGameEvent({ type: 'badge', title: 'NOUVEAU BADGE ! 🏅', subtitle: `${currentUser.username} débloque "Légende des Toiles" !` });
      }
    }

    if (currentUser) {
      const userInList = all.find(p => p.id === currentUser.id);
      if (userInList && userInList.rank !== currentUser.rank) {
        const updatedUser = { ...currentUser, rank: userInList.rank, rankChange: userInList.rankChange };
        lsSet('ltn_user_profile', updatedUser);
        set({ currentUser: updatedUser });
      }
    }

    const bots = all.filter(p => p.id.startsWith('c0000000'));
    set({ leaderboard: bots });
    dbPost({ op: 'update_leaderboard' });
  },

  // ── Missions ───────────────────────────────────────────────────────────────

  updateMissionProgress: async (type: string, increment: number) => {
    const { currentUser } = get();
    if (!currentUser) return;
    try {
      const res = await dbPost({ op: 'update_mission_progress', userId: currentUser.id, type, increment });
      if (res.success) {
        if (res.player) {
          const p = playerFromDb(res.player);
          lsSet('ltn_user_profile', p);
          set({ currentUser: p });
        }
        if (res.missions) set({ missions: res.missions });
        if (res.badges) {
          lsSet('ltn_user_badges', res.badges);
          set({ myBadges: res.badges });
        }
      }
    } catch (e) {
      console.error('updateMissionProgress error:', e);
    }
  },

  // ── Rewards ────────────────────────────────────────────────────────────────

  createReward: async (title: string, description: string, cost: number) => {
    try {
      const res = await dbPost({ op: 'create_reward', title, description, cost });
      if (res.success && res.rewards) {
        set({ rewards: res.rewards });
      }
    } catch (e) {
      console.error('createReward error:', e);
    }
  },

  attributeReward: async (userId: string, rewardId: string) => {
    try {
      const res = await dbPost({ op: 'attribute_reward', userId, rewardId });
      if (res.success && res.rewardLedger) {
        set({ rewardLedger: res.rewardLedger });
      }
    } catch (e) {
      console.error('attributeReward error:', e);
    }
  },

  claimReward: async (ledgerId: string) => {
    try {
      const res = await dbPost({ op: 'claim_reward', ledgerId });
      if (res.success && res.rewardLedger) {
        set({ rewardLedger: res.rewardLedger });
      }
    } catch (e) {
      console.error('claimReward error:', e);
    }
  },

  // ── Events ─────────────────────────────────────────────────────────────────

  clearActiveEvent: () => set({ activeEvent: null }),

  triggerGameEvent: (event: Omit<GameEvent, 'id' | 'timestamp'>) => {
    set({ activeEvent: { ...event, id: 'evt-' + Date.now(), timestamp: Date.now() } });
  },

  // ── Settings ───────────────────────────────────────────────────────────────

  toggleDoubleGains: (active: boolean) => {
    set({ doubleGainsActive: active });
    dbPost({ op: 'toggle_double_gains', active });
    if (active) get().triggerGameEvent({ type: 'double_gains', title: '🔥 DOUBLE GAINS ACTIFS ! 🔥', subtitle: 'Toutes les cotes sont doublées !' });
  },

  // ── Simulation ─────────────────────────────────────────────────────────────

  runSimulationStep: () => {
    const { match, markets, leaderboard } = get();
    if (match.status !== 'live') return;

    const newElapsedTime = match.elapsedTime + 1;
    let newStatus: Match['status'] = match.status;

    if (newElapsedTime === 90) {
      newStatus = 'finished';
      get().triggerGameEvent({ type: 'finished', title: 'FIN DU MATCH ! 🏁', subtitle: `Score final : France ${match.homeScore} - ${match.awayScore} Angleterre` });
      const fullTimeScore = `${match.homeScore}-${match.awayScore}`;
      const scoreMarket = markets.find(m => m.type === 'exact_score');
      if (scoreMarket) {
        const outcome = scoreMarket.outcomes.find(o => o.name === fullTimeScore);
        if (outcome) get().resolveMarket(scoreMarket.id, outcome.id);
      }
      const resultMarket = markets.find(m => m.type === 'final_result');
      if (resultMarket) {
        let winId = 'o-res-draw';
        if (match.homeScore > match.awayScore) winId = 'o-res-home';
        else if (match.homeScore < match.awayScore) winId = 'o-res-away';
        get().resolveMarket(resultMarket.id, winId);
      }
    } else if (newElapsedTime === 45) {
      newStatus = 'half_time';
      get().triggerGameEvent({ type: 'half_time', title: 'MI-TEMPS ! ⏸️', subtitle: `${leaderboard[0]?.username || 'Personne'} mène la danse !` });
    }

    get().updateMatchStats({ elapsedTime: newElapsedTime, status: newStatus });

    // Bot bets
    if (Math.random() > 0.6) {
      const bot = leaderboard[Math.floor(Math.random() * leaderboard.length)];
      const openMarkets = markets.filter(m => !m.isClosed && m.isActive);
      if (openMarkets.length > 0) {
        const mkt = openMarkets[Math.floor(Math.random() * openMarkets.length)];
        const oc = mkt.outcomes[Math.floor(Math.random() * mkt.outcomes.length)];
        const amount = Math.min(bot.toilesCoins, Math.floor(Math.random() * 4 + 1) * 50);
        if (amount > 0) {
          const updatedBots = leaderboard.map(b => b.id === bot.id ? { ...b, toilesCoins: b.toilesCoins - amount, totalBets: b.totalBets + 1 } : b);
          const updatedMarkets = markets.map(m => {
            if (m.id !== mkt.id) return m;
            const outcomes = m.outcomes.map(o => o.id === oc.id ? { ...o, totalBetAmount: o.totalBetAmount + amount, totalBetsCount: o.totalBetsCount + 1 } : o);
            const calc = calculateDynamicOdds(outcomes);
            return { ...m, outcomes: outcomes.map(o => { const c = calc.find(x => x.id === o.id); return { ...o, currentOdds: c ? c.odds : o.currentOdds }; }) };
          });
          set({ leaderboard: updatedBots, markets: updatedMarkets });
        }
      }
    }

    if (Math.random() > 0.8) {
      set(s => ({
        match: {
          ...s.match,
          cornersHome: s.match.cornersHome + (Math.random() > 0.7 ? 1 : 0),
          shotsOnTargetHome: s.match.shotsOnTargetHome + (Math.random() > 0.8 ? 1 : 0),
          possessionHome: Math.max(40, Math.min(65, s.match.possessionHome + (Math.random() > 0.5 ? 1 : -1))),
        },
      }));
    }
  },
}));
