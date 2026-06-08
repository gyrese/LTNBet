import { test, expect } from '@playwright/test';

test.describe('Stadium Live Game Integration Flow', () => {

  test('should complete the entire user lifecycle, betting, and admin resolution', async ({ page }) => {
    const randomUser = `Test-${Math.floor(Math.random() * 100000)}`;

    const testMatchId = `test-match-${Math.floor(Math.random() * 100000)}`;

    // Reset/Create a fresh active match session so the test starts in a predictable state
    await page.request.post('/api/db', {
      data: {
        op: 'create_session',
        match: {
          id: testMatchId,
          homeTeam: 'France',
          awayTeam: 'Angleterre',
          homeScore: 1,
          awayScore: 0,
          status: 'live',
          startsAt: new Date().toISOString(),
          betsClosedAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          elapsedTime: 65,
          possessionHome: 55,
          shotsOnTargetHome: 4,
          cornersHome: 5,
          cardsHome: 1
        }
      }
    });

    // 1. Go to Join Page
    await page.goto('/join');
    await expect(page).toHaveTitle(/Les Toiles Noires/);

    // Fill username
    const usernameInput = page.locator('#username');
    await expect(usernameInput).toBeVisible();
    await usernameInput.fill(randomUser);

    // Click register button
    const joinButton = page.locator('button[type="submit"]');
    await expect(joinButton).toBeVisible();
    await joinButton.click();

    // 2. Redirected to Home page
    await expect(page).toHaveURL('/');
    
    // Wait for the hydration mount to complete
    await page.waitForTimeout(1000);

    // Verify balance shows 1000 TC
    const tcIndicator = page.locator('header span.font-bold.text-tertiary');
    await expect(tcIndicator).toHaveText(/1[,\s]?000/);

    // Verify France match is present
    await expect(page.locator('body')).toContainText('France');

    // Click on the first bet option (France to win)
    const betOption = page.locator('button').filter({ has: page.locator('span', { hasText: /^France$/ }) }).first();
    await expect(betOption).toBeVisible();
    await betOption.click();

    // Click amount button "100"
    const betButton100 = page.locator('button').filter({ hasText: /^100$/ });
    await expect(betButton100).toBeVisible();
    await betButton100.click();

    // Click validate bet
    const confirmBetButton = page.locator('button:has-text("Valider mon pari")');
    await expect(confirmBetButton).toBeVisible();
    await confirmBetButton.click();

    // Check success status
    await expect(page.locator('body')).toContainText('Pari validé');

    // Wait for the modal/overlay to close automatically
    await page.waitForTimeout(2500);

    // Balance should now show 900 TC
    await expect(tcIndicator).toHaveText(/900/);

    // 3. Check Profile Page
    await page.goto('/profile');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toContainText(randomUser);
    await expect(page.locator('body')).toContainText('EN ATTENTE');

    // 4. Check Rankings Page
    await page.goto('/ranking');
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toContainText(randomUser);

    // 5. Open Admin Panel
    await page.goto('/admin');
    await page.waitForTimeout(500);

    // Click on "Déverrouiller l'accès Admin"
    const unlockBtn = page.locator('button:has-text("Déverrouiller l\'accès Admin")');
    await expect(unlockBtn).toBeVisible();
    await unlockBtn.click();

    // Admin panel should be visible
    await expect(page.locator('h1')).toContainText('Panel Admin');

    // Trigger a goal
    const goalBtn = page.locator('button:has-text("+")').first();
    await expect(goalBtn).toBeVisible();
    await goalBtn.click();

    // Resolve market
    const resolveBtn = page.locator('button:has-text("France (")').first();
    await expect(resolveBtn).toBeVisible();
    await resolveBtn.click();

    // 6. Verify Screen Page loads
    await page.goto('/screen');
    await page.waitForTimeout(500);
    await expect(page.locator('header')).toContainText('Toiles Noires');
  });

});
