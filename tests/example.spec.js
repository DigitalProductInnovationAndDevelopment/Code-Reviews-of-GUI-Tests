// tests/example.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Playwright Basic Workflow Tests', () => {
  test('should load example.com and verify title', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page).toHaveTitle(/Example Domain/);
    // THIS LINE IS CRUCIAL FOR PBI 2.2
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR || 'published-screenshots'}/example-domain.png` });
  });

  test('should find and click the More information link', async ({ page }) => {
    await page.goto('https://example.com');
    await page.click('text=More information');
    await expect(page).toHaveURL(/iana.org/);
    // THIS LINE IS CRUCIAL FOR PBI 2.2
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR || 'published-screenshots'}/navigation.png` });
  });
});
