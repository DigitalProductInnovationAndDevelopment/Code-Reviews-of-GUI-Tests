const { test, expect } = require('@playwright/test');

test.describe('Playwright Workflow Full Test Suite', () => {
  // This test passes and takes a screenshot after verifying title
  test('should load example.com and verify title', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page).toHaveTitle(/Example Domain/);
    await page.screenshot({ path: 'screenshots/example-domain.png' });
  });

  // This test intentionally fails to trigger screenshots, videos, and traces
  test('should fail to find non-existing element', async ({ page }) => {
    await page.goto('https://example.com');

    // This selector does not exist; test will fail here
    await expect(page.locator('text=NonExistingElement')).toBeVisible();

    // This line will not be reached if the above fails, but if retried,
    // trace will be recorded due to your config
    await page.screenshot({ path: 'screenshots/failure.png' });
  });

  // Test with retry to trigger trace collection on first retry (needs config)
  test('retry test example', async ({ page }) => {
    await page.goto('https://example.com');
    const random = Math.random();
    // Fail roughly 50% of the time to force retry logic to run
    expect(random).toBeGreaterThan(0.5);
  });

  // Test video recording by navigating and clicking
  test('video recording test', async ({ page }) => {
    await page.goto('https://example.com');
    // Playwright starts video recording automatically if enabled in config

    // Interact with page - clicking the "More information" link
    await page.click('text=More information');
    await expect(page).toHaveURL(/iana.org/);

    // Manually take a screenshot at the end as well
    await page.screenshot({ path: 'screenshots/video-test.png' });
  });
});
