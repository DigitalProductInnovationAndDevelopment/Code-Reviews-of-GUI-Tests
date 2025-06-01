// tests/example.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Playwright Basic Workflow Tests', () => {
  test('should load example.com and verify title', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page).toHaveTitle(/Example Domain/);
    // This line captures a screenshot and saves it to the 'published-screenshots' folder.
    // The filename will be 'example-domain.png'.
    await page.screenshot({ path: 'published-screenshots/example-domain.png' });
  });

  test('should find and click the More information link', async ({ page }) => {
    await page.goto('https://example.com');
    await page.click('text=More information');
    await expect(page).toHaveURL(/iana.org/);
    // This line captures another screenshot and saves it to the 'published-screenshots' folder.
    // The filename will be 'navigation.png'.
    await page.screenshot({ path: 'published-screenshots/navigation.png' });
  });
});
