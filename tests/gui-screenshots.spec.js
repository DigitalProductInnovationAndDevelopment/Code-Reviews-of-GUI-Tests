const { test } = require('@playwright/test');

test.describe('GUI Visual Capture [screenshot]', () => {
  test('Home page visual state', async ({ page }) => {
    await page.goto('https://your-app.com', { 
      waitUntil: 'networkidle' 
    });
    
    // Add stability checks (customize selectors for your app)
    await expect(page.locator('body')).not.toBeEmpty();
    await page.waitForTimeout(500); // Brief pause for final animations
    
    await page.screenshot({
      path: 'screenshots/home.jpg',
      type: 'jpeg',
      quality: 60,
      fullPage: false,
      animations: 'disabled' // Freeze animations
    });
  });

  test('Login page visual state', async ({ page }) => {
    await page.goto('https://your-app.com/login', { 
      waitUntil: 'networkidle' 
    });
    
    // Wait for form to be visible
    await expect(page.locator('#login-form')).toBeVisible();
    
    await page.screenshot({
      path: 'screenshots/login.jpg',
      type: 'jpeg',
      quality: 60,
      fullPage: false,
      animations: 'disabled'
    });
  });

  test('Dashboard visual state', async ({ page }) => {
    await page.goto('https://your-app.com/dashboard', { 
      waitUntil: 'networkidle' 
    });
    
    // Wait for data to load
    await expect(page.locator('.data-grid')).not.toHaveClass('loading');
    await expect(page.locator('.user-welcome')).toBeVisible();
    
    await page.screenshot({
      path: 'screenshots/dashboard.jpg',
      type: 'jpeg',
      quality: 60,
      fullPage: true, // Consider full page for dashboards
      animations: 'disabled'
    });
  });
});
