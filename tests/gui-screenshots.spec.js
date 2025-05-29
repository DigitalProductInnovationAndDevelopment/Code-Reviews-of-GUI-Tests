const { test } = require('@playwright/test');

test.describe('GUI Visual Capture [screenshot]', () => {
  test('Home page visual state', async ({ page }) => {
    await page.goto('https://your-app.com', { waitUntil: 'networkidle' });
    await page.screenshot({
      path: 'screenshots/home.jpg',
      type: 'jpeg',
      quality: 60,
      fullPage: false
    });
  });

  test('Login page visual state', async ({ page }) => {
    await page.goto('https://your-app.com/login', { waitUntil: 'networkidle' });
    await page.screenshot({
      path: 'screenshots/login.jpg',
      type: 'jpeg',
      quality: 60,
      fullPage: false
    });
  });

  test('Dashboard visual state', async ({ page }) => {
    await page.goto('https://your-app.com/dashboard', { waitUntil: 'networkidle' });
    await page.screenshot({
      path: 'screenshots/dashboard.jpg',
      type: 'jpeg',
      quality: 60,
      fullPage: false
    });
  });
});
