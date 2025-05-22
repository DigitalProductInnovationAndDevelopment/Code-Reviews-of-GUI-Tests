test('Search for Playwright', async ({ page }) => {
  await page.goto('https://www.google.com');

  // Dismiss cookie consent if present
  const consentButton = page.locator('button', { hasText: /I agree|Accept all/i });
  if (await consentButton.count() > 0) {
    await consentButton.click();
  }

  await page.waitForSelector('input[name="q"]', { state: 'visible', timeout: 10000 });
  await page.fill('input[name="q"]', 'Playwright');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#search');
  const firstResult = await page.locator('#search .g').first().innerText();
  expect(firstResult.toLowerCase()).toContain('playwright');
});