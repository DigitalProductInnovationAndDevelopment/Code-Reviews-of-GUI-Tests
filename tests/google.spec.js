const { test, expect } = require('@playwright/test');

test('Google homepage has correct title', async ({ page }) => {
  await page.goto('https://www.google.com');
  await expect(page).toHaveTitle(/Google/);
});

test('Search for Playwright', async ({ page }) => {
  await page.goto('https://www.google.com');
  await page.fill('input[name="q"]', 'Playwright');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#search');
  const firstResult = await page.locator('#search .g').first().innerText();
  expect(firstResult.toLowerCase()).toContain('playwright');
});