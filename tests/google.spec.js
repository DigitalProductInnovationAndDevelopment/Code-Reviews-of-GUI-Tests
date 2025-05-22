const { test, expect } = require('@playwright/test');

test('Homepage has correct title', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example Domain/);
});