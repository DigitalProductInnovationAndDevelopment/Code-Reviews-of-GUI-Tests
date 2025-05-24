const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Ensure the screenshots directory exists before tests run
test.beforeAll(() => {
  const dir = path.join(__dirname, '../screenshots');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

test.describe('Playwright Workflow Full Test Suite', () => {
  // This test passes and takes a screenshot
  test('should load example.com and verify title', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page).toHaveTitle(/Example Domain/);
    await page.screenshot({ path: 'screenshots/example-domain.png' });
  });

  // This test intentionally fails to test failure reporting
  test('should fail to find non-existing element', async ({ page }) => {
    await page.goto('https://example.com');
    // Fails fast: 2-second timeout
    await expect(page.locator('text=NonExistingElement')).toBeVisible({ timeout: 2000 });
    await page.screenshot({ path: 'screenshots/failure.png' });
  });

  // Flaky test to trigger retry logic
  test('retry test example', async ({ page }) => {
    await page.goto('https://example.com');
    const random = Math.random();
    expect(random).toBeGreaterThan(0.5); // 50% chance to fail
  });

  // Test video recording by clicking and navigating
  test('video recording test', async ({ page }) => {
    await page.goto('https://example.com');
    await page.click('text=More information');
    await expect(page).toHaveURL(/iana.org/);
    await page.screenshot({ path: 'screenshots/video-test.png' });
  });
});