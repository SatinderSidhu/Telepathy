const { test, expect, chromium } = require('@playwright/test');

const BASE_URL = 'http://localhost:5173';

const USER1 = { email: 'testuser1@test.com', password: 'password123', username: 'testuser1' };
const USER2 = { email: 'testuser2@test.com', password: 'password123', username: 'testuser2' };

// Navigation options — Vite's HMR keeps connections open so 'load' never fires
const NAV_OPTS = { waitUntil: 'domcontentloaded' };

// Helper: create a browser context with fake media devices
async function createBrowserContext(browser) {
  return browser.newContext({
    permissions: ['camera', 'microphone'],
  });
}

// Helper: login a user in a page
async function loginUser(page, user) {
  await page.goto(`${BASE_URL}/login`, NAV_OPTS);
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  // Wait for redirect to chat page
  await page.waitForSelector('.chat-page', { timeout: 15000 });
}

// ========================================
// Test 1: Both users can login
// ========================================
test.describe('Authentication', () => {
  test('User 1 can login and see chat page', async ({ browser }) => {
    const context = await createBrowserContext(browser);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/login`, NAV_OPTS);
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toHaveText('Sign In');

    await page.fill('input[type="email"]', USER1.email);
    await page.fill('input[type="password"]', USER1.password);
    await page.click('button[type="submit"]');

    // Should redirect to chat page
    await page.waitForSelector('.chat-page', { timeout: 15000 });
    await expect(page.locator('.user-info span')).toHaveText(USER1.username);

    await context.close();
  });

  test('User 2 can login and see chat page', async ({ browser }) => {
    const context = await createBrowserContext(browser);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/login`, NAV_OPTS);
    await page.waitForSelector('h1', { timeout: 10000 });
    await expect(page.locator('h1')).toHaveText('Sign In');

    await page.fill('input[type="email"]', USER2.email);
    await page.fill('input[type="password"]', USER2.password);
    await page.click('button[type="submit"]');

    await page.waitForSelector('.chat-page', { timeout: 15000 });
    await expect(page.locator('.user-info span')).toHaveText(USER2.username);

    await context.close();
  });

  test('Login with wrong password shows error', async ({ browser }) => {
    const context = await createBrowserContext(browser);
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/login`, NAV_OPTS);
    // Wait for React to hydrate — check that the form is interactive
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.click();
    await emailInput.fill(USER1.email);
    await passwordInput.click();
    await passwordInput.fill('wrongpassword');
    // Verify inputs are filled before submitting
    await expect(emailInput).toHaveValue(USER1.email);
    await expect(passwordInput).toHaveValue('wrongpassword');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('.error-msg')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.error-msg')).toHaveText('Invalid credentials');

    await context.close();
  });
});

// ========================================
// Test 2: User1 searches for User2, starts a conversation
// ========================================
test.describe('Chat Setup', () => {
  test('User1 can search for User2 and start a conversation', async ({ browser }) => {
    const context = await createBrowserContext(browser);
    const page = await context.newPage();

    await loginUser(page, USER1);

    // Search for user2
    await page.fill('.search-box input', USER2.username);

    // Wait for search results to appear
    await page.waitForSelector('.search-results .chat-item', { timeout: 5000 });
    const searchResult = page.locator('.search-results .chat-item').first();
    await expect(searchResult.locator('.chat-name')).toHaveText(USER2.username);

    // Click to start conversation
    await searchResult.click();

    // Should now show the message thread with user2's name
    await page.waitForSelector('.message-thread .thread-header', { timeout: 5000 });
    await expect(page.locator('.thread-header h3')).toHaveText(USER2.username);

    // Conversation should appear in the chat list
    await expect(page.locator('.conversations .chat-item').first()).toBeVisible();

    await context.close();
  });
});

// ========================================
// Test 3: Both users login, User1 calls User2, User2 accepts
// ========================================
test.describe('Video Call Flow', () => {
  test('User1 calls User2, User2 accepts, call connects', async () => {
    // Launch a fresh browser with fake media devices
    const browser = await chromium.launch({
      headless: false,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    });

    const context1 = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const context2 = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Enable console logging for debugging
    page1.on('console', msg => console.log(`[User1] ${msg.text()}`));
    page2.on('console', msg => console.log(`[User2] ${msg.text()}`));

    try {
      // --- Step 1: Both users login ---
      console.log('--- Step 1: Logging in both users ---');
      await loginUser(page1, USER1);
      await loginUser(page2, USER2);
      console.log('Both users logged in successfully');

      // --- Step 2: User1 finds or creates a conversation with User2 ---
      console.log('--- Step 2: User1 opening conversation with User2 ---');

      // Check if conversation already exists in the list
      const existingConv = page1.locator('.conversations .chat-item', { hasText: USER2.username });
      const convCount = await existingConv.count();

      if (convCount > 0) {
        await existingConv.first().click();
      } else {
        await page1.fill('.search-box input', USER2.username);
        await page1.waitForSelector('.search-results .chat-item', { timeout: 5000 });
        await page1.locator('.search-results .chat-item').first().click();
      }

      await page1.waitForSelector('.thread-header h3', { timeout: 5000 });
      await expect(page1.locator('.thread-header h3')).toHaveText(USER2.username);
      console.log('User1 has conversation with User2 open');

      // --- Step 3: User2 also opens the conversation with User1 ---
      console.log('--- Step 3: User2 opening conversation with User1 ---');

      const existingConv2 = page2.locator('.conversations .chat-item', { hasText: USER1.username });
      const convCount2 = await existingConv2.count();

      if (convCount2 > 0) {
        await existingConv2.first().click();
      } else {
        await page2.fill('.search-box input', USER1.username);
        await page2.waitForSelector('.search-results .chat-item', { timeout: 5000 });
        await page2.locator('.search-results .chat-item').first().click();
      }

      await page2.waitForSelector('.thread-header h3', { timeout: 5000 });
      await expect(page2.locator('.thread-header h3')).toHaveText(USER1.username);
      console.log('User2 has conversation with User1 open');

      // --- Step 4: User1 starts a video call ---
      console.log('--- Step 4: User1 starting video call ---');
      await page1.locator('.thread-actions button[title="Video call"]').click();

      // User1 should see the call screen
      await page1.waitForSelector('.call-screen', { timeout: 5000 });
      console.log('User1 sees call screen');

      // --- Step 5: User2 should see incoming call overlay ---
      console.log('--- Step 5: Waiting for incoming call on User2 ---');
      await page2.waitForSelector('.incoming-call-overlay', { timeout: 15000 });
      const incomingCallText = await page2.locator('.incoming-call-modal h3').textContent();
      console.log(`User2 sees: "${incomingCallText}"`);
      expect(incomingCallText).toContain('video');

      // --- Step 6: User2 accepts the call ---
      console.log('--- Step 6: User2 accepting call ---');
      await page2.locator('.incoming-call-modal .btn-accept').click();

      // User2 should now see the call screen
      await page2.waitForSelector('.call-screen', { timeout: 5000 });
      console.log('User2 sees call screen');

      // --- Step 7: Wait for call to connect ---
      console.log('--- Step 7: Waiting for call to connect ---');

      // Both users must reach "connected" status (hard assertions)
      await page1.waitForFunction(
        () => document.querySelector('.call-status')?.textContent === 'connected',
        { timeout: 30000 }
      );
      await page2.waitForFunction(
        () => document.querySelector('.call-status')?.textContent === 'connected',
        { timeout: 15000 }
      );

      const user1Status = await page1.locator('.call-status').textContent();
      const user2Status = await page2.locator('.call-status').textContent();
      console.log(`User1 call status: "${user1Status}"`);
      console.log(`User2 call status: "${user2Status}"`);

      expect(user1Status).toBe('connected');
      expect(user2Status).toBe('connected');

      // Both should have call screens visible
      await expect(page1.locator('.call-screen')).toBeVisible();
      await expect(page2.locator('.call-screen')).toBeVisible();

      // --- Step 8: Verify remote video tiles (the core regression check) ---
      // Each user MUST see at least 1 remote video tile from the other user.
      // The placeholder "Waiting for others to join..." must NOT be the only tile.
      console.log('--- Step 8: Verifying remote video tiles ---');

      await expect(page1.locator('.video-tile:not(.placeholder)')).toHaveCount(1, { timeout: 15000 });
      await expect(page2.locator('.video-tile:not(.placeholder)')).toHaveCount(1, { timeout: 15000 });

      // The placeholder should be gone once a remote tile appears
      await expect(page1.locator('.video-tile.placeholder')).toHaveCount(0);
      await expect(page2.locator('.video-tile.placeholder')).toHaveCount(0);

      console.log('SUCCESS: Both users connected with remote video tiles!');

      // Verify local video is visible for both users
      await expect(page1.locator('.local-video')).toBeVisible();
      await expect(page2.locator('.local-video')).toBeVisible();
      console.log('Both users have local video visible');

      // --- Step 9: Both users end the call ---
      console.log('--- Step 9: Ending call ---');
      await page1.locator('.btn-end').click();
      await page1.waitForSelector('.message-thread', { timeout: 5000 });
      console.log('User1 back to message thread');

      // Give User2 a moment to receive call:ended event
      const user2BackToThread = await page2.waitForSelector('.message-thread', { timeout: 5000 })
        .then(() => true)
        .catch(() => false);

      if (!user2BackToThread) {
        // User2 didn't auto-leave — click end call manually
        console.log('User2 did not auto-leave call, clicking End Call');
        await page2.locator('.btn-end').click();
        await page2.waitForSelector('.message-thread', { timeout: 5000 });
      }
      console.log('User2 back to message thread');

      console.log('--- Call flow test completed ---');
    } finally {
      await context1.close();
      await context2.close();
      await browser.close();
    }
  });

  test('Video call enables camera and toggle works', async () => {
    const browser = await chromium.launch({
      headless: false,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    });

    const context1 = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const context2 = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    page1.on('console', msg => console.log(`[User1] ${msg.text()}`));
    page2.on('console', msg => console.log(`[User2] ${msg.text()}`));

    try {
      // --- Setup: Both users login and open conversation ---
      await loginUser(page1, USER1);
      await loginUser(page2, USER2);

      // User1 opens conversation with User2
      const existingConv = page1.locator('.conversations .chat-item', { hasText: USER2.username });
      if (await existingConv.count() > 0) {
        await existingConv.first().click();
      } else {
        await page1.fill('.search-box input', USER2.username);
        await page1.waitForSelector('.search-results .chat-item', { timeout: 5000 });
        await page1.locator('.search-results .chat-item').first().click();
      }
      await page1.waitForSelector('.thread-header h3', { timeout: 5000 });

      // User1 starts a video call
      await page1.locator('.thread-actions button[title="Video call"]').click();
      await page1.waitForSelector('.call-screen', { timeout: 5000 });

      // User2 accepts
      await page2.waitForSelector('.incoming-call-overlay', { timeout: 15000 });
      await page2.locator('.incoming-call-modal .btn-accept').click();
      await page2.waitForSelector('.call-screen', { timeout: 5000 });

      // Wait for connected status
      await page1.waitForFunction(
        () => document.querySelector('.call-status')?.textContent === 'connected',
        { timeout: 30000 }
      );
      await page2.waitForFunction(
        () => document.querySelector('.call-status')?.textContent === 'connected',
        { timeout: 15000 }
      );
      console.log('Both users connected');

      // --- Step 1: Verify local video element has an active video stream ---
      console.log('--- Verifying camera is active ---');

      const user1VideoActive = await page1.evaluate(() => {
        const video = document.querySelector('.local-video');
        if (!video || !video.srcObject) return { hasVideo: false };
        const tracks = video.srcObject.getVideoTracks();
        return {
          hasVideo: tracks.length > 0,
          enabled: tracks[0]?.enabled ?? false,
          readyState: tracks[0]?.readyState ?? 'none',
        };
      });

      const user2VideoActive = await page2.evaluate(() => {
        const video = document.querySelector('.local-video');
        if (!video || !video.srcObject) return { hasVideo: false };
        const tracks = video.srcObject.getVideoTracks();
        return {
          hasVideo: tracks.length > 0,
          enabled: tracks[0]?.enabled ?? false,
          readyState: tracks[0]?.readyState ?? 'none',
        };
      });

      console.log('User1 video:', JSON.stringify(user1VideoActive));
      console.log('User2 video:', JSON.stringify(user2VideoActive));

      // Both users must have an active video track from the camera
      expect(user1VideoActive.hasVideo).toBe(true);
      expect(user1VideoActive.enabled).toBe(true);
      expect(user1VideoActive.readyState).toBe('live');

      expect(user2VideoActive.hasVideo).toBe(true);
      expect(user2VideoActive.enabled).toBe(true);
      expect(user2VideoActive.readyState).toBe('live');
      console.log('Both users have active camera streams');

      // --- Step 2: Toggle camera off ---
      console.log('--- Toggling camera off for User1 ---');
      const cameraBtn1 = page1.locator('.btn-control', { hasText: 'Camera Off' });
      await expect(cameraBtn1).toBeVisible();
      await cameraBtn1.click();

      // Button text should change to "Camera On"
      await expect(page1.locator('.btn-control', { hasText: 'Camera On' })).toBeVisible();

      // Video track should be disabled
      const user1VideoAfterOff = await page1.evaluate(() => {
        const video = document.querySelector('.local-video');
        const tracks = video?.srcObject?.getVideoTracks() || [];
        return { enabled: tracks[0]?.enabled ?? true };
      });
      expect(user1VideoAfterOff.enabled).toBe(false);
      console.log('User1 camera toggled OFF — track disabled');

      // --- Step 3: Toggle camera back on ---
      console.log('--- Toggling camera back on for User1 ---');
      const cameraOnBtn1 = page1.locator('.btn-control', { hasText: 'Camera On' });
      await cameraOnBtn1.click();

      // Button text should change back to "Camera Off"
      await expect(page1.locator('.btn-control', { hasText: 'Camera Off' })).toBeVisible();

      // Video track should be re-enabled
      const user1VideoAfterOn = await page1.evaluate(() => {
        const video = document.querySelector('.local-video');
        const tracks = video?.srcObject?.getVideoTracks() || [];
        return { enabled: tracks[0]?.enabled ?? false };
      });
      expect(user1VideoAfterOn.enabled).toBe(true);
      console.log('User1 camera toggled ON — track re-enabled');

      // --- Cleanup ---
      await page1.locator('.btn-end').click();
      await page1.waitForSelector('.message-thread', { timeout: 5000 });

      const user2BackToThread = await page2.waitForSelector('.message-thread', { timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (!user2BackToThread) {
        await page2.locator('.btn-end').click();
        await page2.waitForSelector('.message-thread', { timeout: 5000 });
      }

      console.log('--- Camera test completed ---');
    } finally {
      await context1.close();
      await context2.close();
      await browser.close();
    }
  });
});
