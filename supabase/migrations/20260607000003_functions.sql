-- ============================================================
-- RPC place_bet — atomic bet placement + odds recalculation
-- ============================================================
create or replace function public.place_bet(
  p_market_id  uuid,
  p_outcome_id uuid,
  p_amount     integer
)
returns jsonb language plpgsql security definer as $$
declare
  v_player      public.players%rowtype;
  v_market      public.markets%rowtype;
  v_outcome     public.outcomes%rowtype;
  v_bet_id      uuid;
  v_odds        numeric(6,2);
begin
  -- 1. Auth
  select * into v_player from public.players where auth_id = auth.uid();
  if not found then
    return jsonb_build_object('success', false, 'error', 'Non authentifié');
  end if;

  -- 2. Validate amount
  if p_amount <= 0 then
    return jsonb_build_object('success', false, 'error', 'Montant invalide');
  end if;
  if v_player.toiles_coins < p_amount then
    return jsonb_build_object('success', false, 'error', 'ToilesCoins insuffisants');
  end if;

  -- 3. Validate market (lock row to prevent race)
  select * into v_market from public.markets where id = p_market_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Marché introuvable');
  end if;
  if v_market.is_closed or not v_market.is_active then
    return jsonb_build_object('success', false, 'error', 'Marché fermé');
  end if;
  if v_market.closes_at is not null and v_market.closes_at < now() then
    return jsonb_build_object('success', false, 'error', 'Marché expiré');
  end if;

  -- 4. Get outcome
  select * into v_outcome from public.outcomes where id = p_outcome_id and market_id = p_market_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Outcome introuvable');
  end if;

  -- 5. Snapshot current odds (will be recomputed after, but we store odds at bet time)
  v_odds := v_outcome.current_odds;

  -- 6. Debit player balance atomically
  update public.players
  set toiles_coins = toiles_coins - p_amount,
      total_bets   = total_bets + 1
  where id = v_player.id;

  -- 7. Insert bet
  insert into public.bets (
    user_id, match_id, market_id, market_title,
    outcome_id, outcome_name, amount, odds_at_bet, status, payout
  ) values (
    v_player.id, v_market.match_id, p_market_id, v_market.title,
    p_outcome_id, v_outcome.name, p_amount, v_odds, 'pending', 0
  ) returning id into v_bet_id;

  -- 8. Update outcome pool
  update public.outcomes
  set total_bet_amount = total_bet_amount + p_amount,
      total_bets_count = total_bets_count + 1
  where id = p_outcome_id;

  -- 9. Recompute odds for all outcomes in this market (simplified proportional)
  perform public.recompute_market_odds(p_market_id);

  return jsonb_build_object('success', true, 'bet_id', v_bet_id, 'odds_at_bet', v_odds);
end;
$$;

-- ============================================================
-- RPC recompute_market_odds (proportional + bookmaker margin 8%)
-- ============================================================
create or replace function public.recompute_market_odds(p_market_id uuid)
returns void language plpgsql security definer as $$
declare
  v_total        integer;
  v_margin       numeric := 0.08;
  v_damp         integer := 2000;
  v_weight       numeric;
  rec            record;
  v_implied_prob numeric;
  v_new_odds     numeric;
begin
  select coalesce(sum(total_bet_amount), 0) into v_total
  from public.outcomes where market_id = p_market_id;

  v_weight := v_total::numeric / (v_total + v_damp);

  for rec in
    select id, base_odds, total_bet_amount
    from public.outcomes where market_id = p_market_id
  loop
    -- blend base probability with public share
    declare
      v_base_prob numeric := 1.0 / rec.base_odds;
      v_pub_prob  numeric := case when v_total > 0
                               then rec.total_bet_amount::numeric / v_total
                               else v_base_prob end;
      v_blended   numeric := (1.0 - v_weight) * v_base_prob + v_weight * v_pub_prob;
    begin
      v_implied_prob := v_blended * (1.0 + v_margin);
      v_new_odds     := greatest(1.10, round(1.0 / v_implied_prob, 2));
      update public.outcomes set current_odds = v_new_odds where id = rec.id;
    end;
  end loop;
end;
$$;

-- ============================================================
-- RPC resolve_market — pays ALL bettors for a given outcome
-- ============================================================
create or replace function public.resolve_market(
  p_market_id  uuid,
  p_outcome_id uuid
)
returns jsonb language plpgsql security definer as $$
declare
  v_settings       public.game_settings%rowtype;
  v_match_id       uuid;
  v_double_gains   boolean := false;
  v_multiplier     numeric := 1.0;
  v_winner_count   integer := 0;
  v_loser_count    integer := 0;
  rec              record;
  v_payout         integer;
begin
  -- Admin only
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', 'Accès refusé');
  end if;

  -- Get match_id for double gains check
  select match_id into v_match_id from public.markets where id = p_market_id;

  select * into v_settings from public.game_settings where match_id = v_match_id;
  if found then
    v_double_gains := v_settings.double_gains_active
                      and (v_settings.double_gains_until is null
                           or v_settings.double_gains_until > now());
    if v_double_gains then v_multiplier := 2.0; end if;
  end if;

  -- Process all pending bets for this market
  for rec in
    select b.id, b.user_id, b.outcome_id, b.amount, b.odds_at_bet
    from public.bets b
    where b.market_id = p_market_id and b.status = 'pending'
  loop
    if rec.outcome_id = p_outcome_id then
      v_payout := round(rec.amount * rec.odds_at_bet * v_multiplier)::integer;
      update public.bets
      set status = 'won', payout = v_payout
      where id = rec.id;
      update public.players
      set toiles_coins    = toiles_coins + v_payout,
          total_winnings  = total_winnings + v_payout,
          successful_bets = successful_bets + 1
      where id = rec.user_id;
      v_winner_count := v_winner_count + 1;
    else
      update public.bets set status = 'lost', payout = 0 where id = rec.id;
      v_loser_count := v_loser_count + 1;
    end if;
  end loop;

  -- Close and mark market as resolved
  update public.markets
  set is_closed = true, is_active = false, resolved_outcome_id = p_outcome_id
  where id = p_market_id;

  return jsonb_build_object(
    'success', true,
    'winners', v_winner_count,
    'losers',  v_loser_count,
    'double_gains', v_double_gains
  );
end;
$$;

-- ============================================================
-- RPC update_leaderboard_ranks — recompute ranks for all players
-- ============================================================
create or replace function public.update_leaderboard_ranks()
returns void language plpgsql security definer as $$
declare
  rec    record;
  v_rank integer := 0;
begin
  for rec in
    select id, rank as old_rank
    from public.players
    order by (toiles_coins + total_winnings) desc
  loop
    v_rank := v_rank + 1;
    update public.players set
      rank_change = case
        when rank is null              then 'same'
        when v_rank < rank             then 'up'
        when v_rank > rank             then 'down'
        else 'same'
      end,
      rank = v_rank
    where id = rec.id;
  end loop;
end;
$$;
