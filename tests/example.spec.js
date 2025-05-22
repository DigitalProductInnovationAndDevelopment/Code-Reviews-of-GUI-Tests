const { test, expect } = require('@playwright/test');

test('basic test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example Domain/);

  // Take screenshot after page title verification
  await page.screenshot({ path: 'example-domain.png' });
});