-- ============================================================
-- Les Toiles Noires Predictor — Schema initial
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- PLAYERS
-- ============================================================
create table public.players (
  id            uuid primary key default uuid_generate_v4(),
  auth_id       uuid unique references auth.users(id) on delete cascade,
  username      text not null unique check (char_length(username) between 3 and 15),
  avatar        text not null default 'avatar_1',
  toiles_coins  integer not null default 1000 check (toiles_coins >= 0),
  total_winnings integer not null default 0 check (total_winnings >= 0),
  successful_bets integer not null default 0 check (successful_bets >= 0),
  total_bets    integer not null default 0 check (total_bets >= 0),
  is_admin      boolean not null default false,
  is_bot        boolean not null default false,
  rank          integer,
  rank_change   text check (rank_change in ('up', 'down', 'same')) default 'same',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- MATCHES
-- ============================================================
create table public.matches (
  id              uuid primary key default uuid_generate_v4(),
  home_team       text not null,
  away_team       text not null,
  home_score      integer not null default 0 check (home_score >= 0),
  away_score      integer not null default 0 check (away_score >= 0),
  status          text not null default 'upcoming'
                    check (status in ('upcoming', 'live', 'half_time', 'finished')),
  starts_at       timestamptz not null,
  bets_closed_at  timestamptz,
  elapsed_time    integer not null default 0 check (elapsed_time between 0 and 120),
  possession_home integer not null default 50 check (possession_home between 0 and 100),
  shots_on_target_home integer not null default 0,
  corners_home    integer not null default 0,
  cards_home      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- MARKETS
-- ============================================================
create table public.markets (
  id                  uuid primary key default uuid_generate_v4(),
  match_id            uuid not null references public.matches(id) on delete cascade,
  type                text not null
                        check (type in ('final_result','exact_score','first_scorer','corners_count','flash')),
  title               text not null,
  is_active           boolean not null default true,
  is_closed           boolean not null default false,
  resolved_outcome_id uuid,
  is_flash            boolean not null default false,
  closes_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ============================================================
-- OUTCOMES
-- ============================================================
create table public.outcomes (
  id                uuid primary key default uuid_generate_v4(),
  market_id         uuid not null references public.markets(id) on delete cascade,
  name              text not null,
  base_odds         numeric(6,2) not null check (base_odds >= 1.10),
  current_odds      numeric(6,2) not null check (current_odds >= 1.10),
  total_bet_amount  integer not null default 0 check (total_bet_amount >= 0),
  total_bets_count  integer not null default 0 check (total_bets_count >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- FK outcomes -> markets.resolved_outcome_id (circular, deferred)
alter table public.markets
  add constraint fk_markets_resolved_outcome
  foreign key (resolved_outcome_id) references public.outcomes(id)
  deferrable initially deferred;

-- ============================================================
-- BETS
-- ============================================================
create table public.bets (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.players(id) on delete cascade,
  match_id      uuid not null references public.matches(id) on delete cascade,
  market_id     uuid not null references public.markets(id) on delete cascade,
  market_title  text not null,
  outcome_id    uuid not null references public.outcomes(id) on delete cascade,
  outcome_name  text not null,
  amount        integer not null check (amount > 0),
  odds_at_bet   numeric(6,2) not null check (odds_at_bet >= 1.10),
  status        text not null default 'pending'
                  check (status in ('pending', 'won', 'lost', 'cancelled')),
  payout        integer not null default 0 check (payout >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- BADGES
-- ============================================================
create table public.badges (
  id          uuid primary key default uuid_generate_v4(),
  code        text not null unique,
  title       text not null,
  description text not null,
  icon        text not null
);

create table public.player_badges (
  player_id  uuid not null references public.players(id) on delete cascade,
  badge_code text not null references public.badges(code) on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (player_id, badge_code)
);

-- ============================================================
-- MISSIONS
-- ============================================================
create table public.missions (
  id                uuid primary key default uuid_generate_v4(),
  title             text not null,
  description       text not null,
  reward_coins      integer not null default 0,
  reward_badge_code text references public.badges(code),
  type              text not null
                      check (type in ('bet_count','buteur_count','exact_score','top_10')),
  target            integer not null check (target > 0)
);

create table public.player_missions (
  player_id    uuid not null references public.players(id) on delete cascade,
  mission_id   uuid not null references public.missions(id) on delete cascade,
  progress     integer not null default 0 check (progress >= 0),
  is_completed boolean not null default false,
  primary key (player_id, mission_id)
);

-- ============================================================
-- REWARDS & REWARD LEDGER
-- ============================================================
create table public.rewards (
  id               uuid primary key default uuid_generate_v4(),
  title            text not null,
  description      text not null,
  cost_toiles_coins integer not null check (cost_toiles_coins >= 0),
  image            text not null default '🎁'
);

create table public.reward_ledger (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.players(id) on delete cascade,
  reward_id    uuid not null references public.rewards(id) on delete cascade,
  reward_title text not null,
  assigned_by  text not null default 'admin',
  status       text not null default 'pending'
                 check (status in ('pending', 'claimed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ============================================================
-- GAME EVENTS (feed pour /screen et overlays)
-- ============================================================
create table public.game_events (
  id         uuid primary key default uuid_generate_v4(),
  match_id   uuid references public.matches(id) on delete cascade,
  type       text not null
               check (type in ('goal','jackpot','leader_change','half_time','finished','badge','flash_market','double_gains')),
  title      text not null,
  subtitle   text not null default '',
  meta       jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- GAME SETTINGS (singleton: une ligne par match)
-- ============================================================
create table public.game_settings (
  id                  uuid primary key default uuid_generate_v4(),
  match_id            uuid unique references public.matches(id) on delete cascade,
  double_gains_active boolean not null default false,
  double_gains_until  timestamptz,
  updated_at          timestamptz not null default now()
);

-- ============================================================
-- LEADERBOARD VIEW
-- ============================================================
create or replace view public.leaderboard as
select
  p.id,
  p.username,
  p.avatar,
  p.toiles_coins,
  p.total_winnings,
  p.successful_bets,
  p.total_bets,
  p.rank,
  p.rank_change,
  p.is_bot,
  (p.toiles_coins + p.total_winnings) as score
from public.players p
order by score desc;

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_players_updated    before update on public.players    for each row execute function public.set_updated_at();
create trigger trg_matches_updated    before update on public.matches    for each row execute function public.set_updated_at();
create trigger trg_markets_updated    before update on public.markets    for each row execute function public.set_updated_at();
create trigger trg_outcomes_updated   before update on public.outcomes   for each row execute function public.set_updated_at();
create trigger trg_bets_updated       before update on public.bets       for each row execute function public.set_updated_at();
create trigger trg_reward_led_updated before update on public.reward_ledger for each row execute function public.set_updated_at();
create trigger trg_settings_updated   before update on public.game_settings for each row execute function public.set_updated_at();
