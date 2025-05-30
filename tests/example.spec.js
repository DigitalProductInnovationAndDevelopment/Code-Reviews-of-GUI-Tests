/trial
const { test, expect } = require('@playwright/test');

test.describe('Playwright Basic Workflow Tests', () => {
  test('should load example.com and verify title', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page).toHaveTitle(/Example Domain/);
    await page.screenshot({ path: 'playwright-report/example-domain.png' });
  });
  
  test('should find and click the More information link', async ({ page }) => {
    await page.goto('https://example.com');
    await page.click('text=More information');
    await expect(page).toHaveURL(/iana.org/);
    await page.screenshot({ path: 'playwright-report/navigation.png' });
  });
});
