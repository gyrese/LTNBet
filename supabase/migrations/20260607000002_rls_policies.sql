-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.players       enable row level security;
alter table public.matches        enable row level security;
alter table public.markets        enable row level security;
alter table public.outcomes       enable row level security;
alter table public.bets           enable row level security;
alter table public.badges         enable row level security;
alter table public.player_badges  enable row level security;
alter table public.missions       enable row level security;
alter table public.player_missions enable row level security;
alter table public.rewards        enable row level security;
alter table public.reward_ledger  enable row level security;
alter table public.game_events    enable row level security;
alter table public.game_settings  enable row level security;

-- Helper: is the caller an admin?
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select is_admin from public.players where auth_id = auth.uid()),
    false
  );
$$;

-- Helper: player id from auth
create or replace function public.my_player_id()
returns uuid language sql security definer stable as $$
  select id from public.players where auth_id = auth.uid();
$$;

-- ---- PLAYERS ----
-- Everyone can read players (leaderboard)
create policy "players_read_all"   on public.players for select using (true);
-- Authenticated user can insert their own profile
create policy "players_insert_own" on public.players for insert
  with check (auth_id = auth.uid());
-- User can update their own non-admin fields; admins can update anything
create policy "players_update_own" on public.players for update
  using (auth_id = auth.uid() or public.is_admin())
  with check (auth_id = auth.uid() or public.is_admin());

-- ---- MATCHES ----
create policy "matches_read_all"   on public.matches for select using (true);
create policy "matches_admin_write" on public.matches for all
  using (public.is_admin()) with check (public.is_admin());

-- ---- MARKETS ----
create policy "markets_read_all"    on public.markets for select using (true);
create policy "markets_admin_write" on public.markets for all
  using (public.is_admin()) with check (public.is_admin());

-- ---- OUTCOMES ----
create policy "outcomes_read_all"    on public.outcomes for select using (true);
create policy "outcomes_admin_write" on public.outcomes for all
  using (public.is_admin()) with check (public.is_admin());

-- ---- BETS ----
-- All authenticated users can see all bets (needed for market resolution)
create policy "bets_read_all"    on public.bets for select using (auth.uid() is not null);
-- Users can only insert their own bets
create policy "bets_insert_own"  on public.bets for insert
  with check (user_id = public.my_player_id());
-- Only admins can update bets (resolution)
create policy "bets_admin_update" on public.bets for update
  using (public.is_admin()) with check (public.is_admin());

-- ---- BADGES & PLAYER_BADGES ----
create policy "badges_read_all"        on public.badges for select using (true);
create policy "player_badges_read_all" on public.player_badges for select using (true);
create policy "player_badges_insert_own" on public.player_badges for insert
  with check (player_id = public.my_player_id());

-- ---- MISSIONS & PLAYER_MISSIONS ----
create policy "missions_read_all"           on public.missions for select using (true);
create policy "player_missions_read_own"    on public.player_missions for select
  using (player_id = public.my_player_id() or public.is_admin());
create policy "player_missions_upsert_own"  on public.player_missions for insert
  with check (player_id = public.my_player_id());
create policy "player_missions_update_own"  on public.player_missions for update
  using (player_id = public.my_player_id());

-- ---- REWARDS ----
create policy "rewards_read_all"    on public.rewards for select using (true);
create policy "rewards_admin_write" on public.rewards for all
  using (public.is_admin()) with check (public.is_admin());

-- ---- REWARD LEDGER ----
create policy "reward_ledger_read_own"   on public.reward_ledger for select
  using (user_id = public.my_player_id() or public.is_admin());
create policy "reward_ledger_admin_write" on public.reward_ledger for all
  using (public.is_admin()) with check (public.is_admin());
create policy "reward_ledger_claim_own"  on public.reward_ledger for update
  using (user_id = public.my_player_id())
  with check (user_id = public.my_player_id() and status = 'claimed');

-- ---- GAME EVENTS ----
create policy "game_events_read_all"    on public.game_events for select using (true);
create policy "game_events_admin_write" on public.game_events for all
  using (public.is_admin()) with check (public.is_admin());

-- ---- GAME SETTINGS ----
create policy "game_settings_read_all"    on public.game_settings for select using (true);
create policy "game_settings_admin_write" on public.game_settings for all
  using (public.is_admin()) with check (public.is_admin());
