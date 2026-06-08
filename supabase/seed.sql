-- ============================================================
-- Seed data — Les Toiles Noires Predictor
-- ============================================================

-- ---- BADGES ----
insert into public.badges (code, title, description, icon) values
  ('nostradamus', 'Nostradamus',         '5 bons paris consécutifs',              'emoji_events'),
  ('oracle_bleu', 'Oracle Bleu',         '10 bons paris au total',                'visibility'),
  ('roi_buteurs', 'Roi des Buteurs',      '5 buteurs trouvés dans le match',       'military_tech'),
  ('visionnaire', 'Visionnaire',         'Trouver un score exact',                'workspace_premium'),
  ('legende',     'Légende des Toiles',  'Atteindre le top 1 du classement',      'hub')
on conflict (code) do nothing;

-- ---- MISSIONS ----
insert into public.missions (title, description, reward_coins, reward_badge_code, type, target) values
  ('Parier sur le match',    'Placer au moins 3 paris sur le match en direct',     250,  null,         'bet_count',    3),
  ('Nostradamus en Herbe',   'Trouver au moins un score exact sur le match',       500,  'visionnaire', 'exact_score',  1),
  ('Prédicteur de Buteurs',  'Parier sur un buteur à tout moment',                 300,  null,         'buteur_count', 1)
on conflict do nothing;

-- ---- REWARDS ----
insert into public.rewards (title, description, cost_toiles_coins, image) values
  ('Pinte offerte',          'Une pinte au choix à réclamer au comptoir.',         2500, '🍺'),
  ('Cocktail Création',      'Le cocktail signature du barman offert.',            3500, '🍹'),
  ('Burger Toiles Noires',   'Le burger classique avec frites.',                   5000, '🍔'),
  ('Casquette France Toiles','Une casquette collector aux couleurs du bar.',        4000, '🧢')
on conflict do nothing;

-- ---- MATCH ----
insert into public.matches (
  id, home_team, away_team, home_score, away_score,
  status, starts_at, bets_closed_at,
  elapsed_time, possession_home, shots_on_target_home, corners_home, cards_home
) values (
  'a0000000-0000-0000-0000-000000000001',
  'France', 'Angleterre', 1, 0,
  'live',
  now() - interval '65 minutes',
  now() + interval '15 minutes',
  65, 55, 4, 5, 1
) on conflict do nothing;

-- ---- GAME SETTINGS for the match ----
insert into public.game_settings (match_id, double_gains_active)
values ('a0000000-0000-0000-0000-000000000001', false)
on conflict (match_id) do nothing;

-- ---- MARKETS ----
insert into public.markets (id, match_id, type, title, is_active, is_closed, is_flash) values
  ('b0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001', 'final_result', 'RÉSULTAT DU MATCH', true, false, false),
  ('b0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001', 'exact_score',  'SCORE EXACT',       true, false, false),
  ('b0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001', 'first_scorer', 'PREMIER BUTEUR',    true, false, false),
  ('b0000000-0000-0000-0000-000000000004',
   'a0000000-0000-0000-0000-000000000001', 'corners_count','NOMBRE DE CORNERS FRANCE', true, false, false)
on conflict do nothing;

-- ---- OUTCOMES : Résultat du match ----
insert into public.outcomes (market_id, name, base_odds, current_odds, total_bet_amount, total_bets_count) values
  ('b0000000-0000-0000-0000-000000000001', 'France',     1.40, 1.40, 8500, 42),
  ('b0000000-0000-0000-0000-000000000001', 'Nul',        3.20, 3.20, 2400, 12),
  ('b0000000-0000-0000-0000-000000000001', 'Angleterre', 5.50, 5.50, 1100,  6)
on conflict do nothing;

-- ---- OUTCOMES : Score exact ----
insert into public.outcomes (market_id, name, base_odds, current_odds, total_bet_amount, total_bets_count) values
  ('b0000000-0000-0000-0000-000000000002', '1-0', 2.10, 2.10, 4500, 23),
  ('b0000000-0000-0000-0000-000000000002', '2-0', 4.50, 4.50, 1200,  8),
  ('b0000000-0000-0000-0000-000000000002', '2-1', 6.00, 6.00, 2100, 14),
  ('b0000000-0000-0000-0000-000000000002', '3-0', 8.50, 8.50,  500,  3),
  ('b0000000-0000-0000-0000-000000000002', '1-1', 5.00, 5.00, 1900, 11),
  ('b0000000-0000-0000-0000-000000000002', '0-1', 9.00, 9.00,  200,  2)
on conflict do nothing;

-- ---- OUTCOMES : Premier buteur ----
insert into public.outcomes (market_id, name, base_odds, current_odds, total_bet_amount, total_bets_count) values
  ('b0000000-0000-0000-0000-000000000003', 'Kylian Mbappé',      3.50, 3.50, 6200, 35),
  ('b0000000-0000-0000-0000-000000000003', 'Antoine Griezmann',  5.00, 5.00, 2800, 15),
  ('b0000000-0000-0000-0000-000000000003', 'Olivier Giroud',     4.50, 4.50, 3100, 18),
  ('b0000000-0000-0000-0000-000000000003', 'Harry Kane',         6.00, 6.00, 1200,  7),
  ('b0000000-0000-0000-0000-000000000003', 'Jude Bellingham',    8.00, 8.00,  900,  5)
on conflict do nothing;

-- ---- OUTCOMES : Corners France ----
insert into public.outcomes (market_id, name, base_odds, current_odds, total_bet_amount, total_bets_count) values
  ('b0000000-0000-0000-0000-000000000004', 'Moins de 5',   2.20, 2.20, 1500,  8),
  ('b0000000-0000-0000-0000-000000000004', 'Entre 5 et 7', 1.80, 1.80, 4800, 26),
  ('b0000000-0000-0000-0000-000000000004', 'Plus de 7',    3.10, 3.10, 1200,  7)
on conflict do nothing;

-- ---- BOT PLAYERS ----
insert into public.players (id, auth_id, username, avatar, toiles_coins, total_winnings, successful_bets, total_bets, is_bot, rank) values
  ('c0000000-0000-0000-0000-000000000001', null, 'ToileMaster',   'avatar_1',  9200, 15000, 18, 25, true,  1),
  ('c0000000-0000-0000-0000-000000000002', null, 'AlexPro99',     'avatar_2',  8450, 12000, 15, 22, true,  2),
  ('c0000000-0000-0000-0000-000000000003', null, 'ShadowBet',     'avatar_3',  7950, 11000, 12, 20, true,  3),
  ('c0000000-0000-0000-0000-000000000004', null, 'BetSniper',     'avatar_4',  7820,  9800, 10, 15, true,  4),
  ('c0000000-0000-0000-0000-000000000005', null, 'LunaStat',      'avatar_5',  7650,  8900,  9, 18, true,  5),
  ('c0000000-0000-0000-0000-000000000006', null, 'NeoPredict',    'avatar_6',  7400,  7200,  8, 14, true,  6),
  ('c0000000-0000-0000-0000-000000000007', null, 'BleuFerveur',   'avatar_7',  6300,  6100,  7, 13, true,  7),
  ('c0000000-0000-0000-0000-000000000008', null, 'KikiPronos',    'avatar_8',  5800,  5000,  6, 12, true,  8),
  ('c0000000-0000-0000-0000-000000000009', null, 'BucoliqueBar',  'avatar_9',  4100,  3800,  5, 10, true,  9),
  ('c0000000-0000-0000-0000-000000000010', null, 'OracleBière',   'avatar_10', 3850,  3500,  4,  9, true, 10)
on conflict do nothing;
