const { test, expect } = require('@playwright/test');

test('Simple input interaction with screenshot', async ({ page }) => {
  await page.goto('https://example.cypress.io/commands/actions');

  // Take screenshot of the page
  await page.screenshot({ path: 'screenshot.png' });

  // Type into input field with id 'email1'
  await page.fill('#email1', 'playwright@example.com');

  // Take screenshot after filling input
  await page.screenshot({ path: 'filled-input.png' });

  // Assert the input value was set correctly
  const inputValue = await page.inputValue('#email1');
  expect(inputValue).toBe('playwright@example.com');
});