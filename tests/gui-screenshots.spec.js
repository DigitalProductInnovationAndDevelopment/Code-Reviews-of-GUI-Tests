const { test } = require('@playwright/test');

test.describe('GUI Visual Capture [screenshot]', () => {
  test('Home page visual state', async ({ page }) => {
    await page.goto('https://example.com');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'screenshots/home.jpg',
      type: 'jpeg',
      quality: 60
    });
  });

  test('Login page visual state', async ({ page }) => {
    await page.goto('https://example.com/login');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: 'screenshots/login.jpg',
      type: 'jpeg',
      quality: 60
    });
  });

  test('Dashboard visual state', async ({ page }) => {
    await page.goto('https://example.com/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: 'screenshots/dashboard.jpg',
      type: 'jpeg',
      quality: 60,
      fullPage: true
    });
  });
});
