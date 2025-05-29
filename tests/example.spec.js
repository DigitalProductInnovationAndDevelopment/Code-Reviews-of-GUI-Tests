const { test, expect } = require('@playwright/test');

test.describe('Playwright Basic Workflow Tests', () => {
  // Add .screenshot suffix to test name for filtering
  test('should load example.com and verify title [screenshot]', async ({ page }) => {
    await page.goto('https://example.com');
    await expect(page).toHaveTitle(/Example Domain/);
    // Save to screenshots directory instead of playwright-report
    await page.screenshot({ 
      path: 'screenshots/example-domain.jpg',  // Changed path
      type: 'jpeg',  // Use JPEG format
      quality: 60,   // Reduce quality
      fullPage: false
    });
  });
  
  test('should find and click the More information link [screenshot]', async ({ page }) => {
    await page.goto('https://example.com');
    await page.click('text=More information');
    await expect(page).toHaveURL(/iana.org/);
    // Save to screenshots directory with JPEG
    await page.screenshot({ 
      path: 'screenshots/navigation.jpg',
      type: 'jpeg',
      quality: 60,
      fullPage: false
    });
  });
});
