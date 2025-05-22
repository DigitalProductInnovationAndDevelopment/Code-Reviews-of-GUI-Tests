const { test, expect } = require('@playwright/test');

test('Simple Google search with screenshot', async ({ page }) => {
  await page.goto('https://www.google.com');

  // Take screenshot of the homepage
  await page.screenshot({ path: 'screenshot.png' });

  await page.fill('input[name="q"]', 'Playwright');
  await page.keyboard.press('Enter');

  await page.waitForSelector('#search');
  const firstResult = await page.locator('#search .g').first().innerText();
  expect(firstResult.toLowerCase()).toContain('playwright');
});