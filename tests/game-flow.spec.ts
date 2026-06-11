import { test, expect } from '@playwright/test';

test.describe('LTNBet Deep Game Logic & E2E Flow', () => {

  // Helper function to create a fresh match session in the database
  async function setupMatchSession(request: any, matchId: string, status: string, homeScore: number, awayScore: number) {
    await request.post('/api/db', {
      data: {
        op: 'create_session',
        force: true,
        match: {
          id: matchId,
          homeTeam: 'France',
          awayTeam: 'Angleterre',
          homeScore,
          awayScore,
          status,
          startsAt: new Date().toISOString(),
          betsClosedAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          elapsedTime: 10,
          possessionHome: 50,
          shotsOnTargetHome: 0,
          cornersHome: 0,
          cardsHome: 0
        }
      }
    });
  }

  test('1. Dynamic Odds Adjustment after betting', async ({ page, request }) => {
    const matchId = 'match-dyn-odds';
    // Setup a live 0-0 match
    await setupMatchSession(request, matchId, 'live', 0, 0);

    const randomUser = `UsrOdds-${Math.floor(Math.random() * 1000)}`;
    await page.goto('/join');
    await page.locator('#username').fill(randomUser);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL('/');
    await page.waitForTimeout(1500);

    // Save initial odds for France to win
    const buttonFrance = page.locator('button:visible').filter({ has: page.locator('span', { hasText: /^France$/ }) }).first();
    const initialOddsText = await buttonFrance.locator('span.font-data-mono').first().innerText();
    const initialOdds = parseFloat(initialOddsText);
    expect(initialOdds).toBeGreaterThan(1);

    // Place a bet on France
    await buttonFrance.click();
    
    // Select the visible 100 button
    const betButton100 = page.locator('button:visible').filter({ hasText: /^100$/ }).first();
    await expect(betButton100).toBeVisible();
    await betButton100.click();

    const confirmBetButton = page.locator('button:visible:has-text("Valider mon pari")').first();
    await expect(confirmBetButton).toBeVisible();
    await confirmBetButton.click();
    
    await expect(page.locator('body')).toContainText('Pari validé');
    await page.waitForTimeout(2500); // Wait for modal to close

    // Place a second bet on France to push odds further down
    await buttonFrance.click();
    await expect(betButton100).toBeVisible();
    await betButton100.click();
    await expect(confirmBetButton).toBeVisible();
    await confirmBetButton.click();
    
    await expect(page.locator('body')).toContainText('Pari validé');
    await page.waitForTimeout(2500);

    // The odds for France should have decreased or shifted due to the bets placed
    const newOddsText = await buttonFrance.locator('span.font-data-mono').first().innerText();
    const newOdds = parseFloat(newOddsText);
    expect(newOdds).not.toBe(initialOdds);
  });

  test('2. Suspended outcomes on impossible odds', async ({ page, request }) => {
    const matchId = 'match-susp-odds';
    // Setup match with score 2 - 0
    await setupMatchSession(request, matchId, 'live', 2, 0);

    const randomUser = `UsrSusp-${Math.floor(Math.random() * 1000)}`;
    await page.goto('/join');
    await page.locator('#username').fill(randomUser);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL('/');
    await page.waitForTimeout(1500);

    // Score is 2-0. Exact score outcomes like 1-0 must be suspended (current_odds = 0)
    // Find the button for "1-0" exact score
    const button10 = page.locator('button:visible').filter({ has: page.locator('span', { hasText: /^1-0$/ }) }).first();
    await expect(button10).toBeDisabled();
    await expect(button10).toContainText('Suspendu');

    // Draw result is still possible if away team scores 2 goals, so draw option should NOT be suspended
    const drawOption = page.locator('button:visible').filter({ has: page.locator('span', { hasText: /^Nul$/ }) }).first();
    await expect(drawOption).toBeEnabled();
  });

  test('3. Double gains option & correct payouts', async ({ page, request }) => {
    const matchId = 'match-double-gains';
    // Setup match
    await setupMatchSession(request, matchId, 'live', 0, 0);

    const randomUser = `UsrDbl-${Math.floor(Math.random() * 1000)}`;
    await page.goto('/join');
    await page.locator('#username').fill(randomUser);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL('/');
    await page.waitForTimeout(1500);

    // Activate Double Gains directly via API to prevent E2E race condition/hydration delay
    await request.post('/api/db', {
      data: {
        op: 'toggle_double_gains',
        active: true
      }
    });

    // Go back to Home page
    await page.goto('/');
    await page.waitForTimeout(1500);

    // France button should show doubled odds banner
    await expect(page.locator('body')).toContainText('MODE DOUBLE GAINS');

    // Place bet of 100 on France (assume odds are 1.80, so payout is 100 * 1.80 * 2 = 360)
    const buttonFrance = page.locator('button:visible').filter({ has: page.locator('span', { hasText: /^France$/ }) }).first();
    await buttonFrance.click();
    
    const betButton100 = page.locator('button:visible').filter({ hasText: /^100$/ }).first();
    await expect(betButton100).toBeVisible();
    await betButton100.click();

    const confirmBetButton = page.locator('button:visible:has-text("Valider mon pari")').first();
    await expect(confirmBetButton).toBeVisible();
    await confirmBetButton.click();

    await expect(page.locator('body')).toContainText('Pari validé');
    await page.waitForTimeout(2500);

    // Resolve market: France wins
    await page.goto('/admin');
    await page.locator('#admin-pw').fill('toiles2024');
    await page.locator('button:has-text("Déverrouiller")').click();
    await expect(page.locator('h1')).toContainText('Panel Admin');
    await page.waitForTimeout(1000);

    const resolveBtn = page.locator('button:visible:has-text("France (")').first();
    await resolveBtn.click();
    await page.waitForTimeout(1000);

    // Go to Profile and verify balance has been updated with double payout
    await page.goto('/');
    await page.waitForTimeout(1000);
    // Initial 1000 - 100 (bet) + 360 (doubled payout) = 1260 ToilesCoins
    const tcIndicator = page.locator('header span.font-bold.text-home');
    await expect(tcIndicator).toHaveText(/1[,\s]?260/);
  });

  test('4. Missions progression tracking', async ({ page, request }) => {
    const matchId = 'match-missions';
    // Setup match
    await setupMatchSession(request, matchId, 'live', 0, 0);

    const randomUser = `UsrMsn-${Math.floor(Math.random() * 1000)}`;
    await page.goto('/join');
    await page.locator('#username').fill(randomUser);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL('/');
    await page.waitForTimeout(1500);

    // Mission 1 is to place 3 bets. Let's place 3 bets of 100 on different options
    // Bet 1: France
    const btnFrance = page.locator('button:visible').filter({ has: page.locator('span', { hasText: /^France$/ }) }).first();
    await btnFrance.click();

    const betButton100 = page.locator('button:visible').filter({ hasText: /^100$/ }).first();
    await expect(betButton100).toBeVisible();
    await betButton100.click();

    const confirmBetButton = page.locator('button:visible:has-text("Valider mon pari")').first();
    await expect(confirmBetButton).toBeVisible();
    await confirmBetButton.click();
    await page.waitForTimeout(2500);

    // Bet 2: Nul
    const btnDraw = page.locator('button:visible').filter({ has: page.locator('span', { hasText: /^Nul$/ }) }).first();
    await btnDraw.click();
    await expect(betButton100).toBeVisible();
    await betButton100.click();
    await expect(confirmBetButton).toBeVisible();
    await confirmBetButton.click();
    await page.waitForTimeout(2500);

    // Bet 3: Angleterre
    const btnAway = page.locator('button:visible').filter({ has: page.locator('span', { hasText: /^Angleterre$/ }) }).first();
    await btnAway.click();
    await expect(betButton100).toBeVisible();
    await betButton100.click();
    await expect(confirmBetButton).toBeVisible();
    await confirmBetButton.click();
    await page.waitForTimeout(2500);

    // Get the player ID from localStorage
    const userId = await page.evaluate(() => {
      const profile = JSON.parse(localStorage.getItem('ltn_user_profile') || '{}');
      return profile.id;
    });

    // Fetch the player data from API directly to verify the mission completion (backend verification)
    const playerRes = await request.get(`/api/db?op=player&id=${userId}`);
    const playerData = await playerRes.json();
    const mission = playerData.missions.find((m: any) => m.id === 'm-1'); // Place 3 bets
    expect(mission).toBeDefined();
    expect(mission.isCompleted).toBe(true);

    // Balance after 3 bets is 700 TC (since missions do not award coins in this app design)
    await page.goto('/');
    await page.waitForTimeout(1000);
    const tcIndicator = page.locator('header span.font-bold.text-home');
    await expect(tcIndicator).toHaveText(/700/);
  });

});
