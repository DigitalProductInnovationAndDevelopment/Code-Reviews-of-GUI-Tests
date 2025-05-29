const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../tests_artifacts');

// Create output directory if needed
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Increased timeout to 60 seconds
const TIMEOUT = 60000;

(async () => {
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Set longer navigation timeout
    page.setDefaultTimeout(TIMEOUT);

    // 1. Capture login page
    await page.goto('https://your-app.com/login', { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'login-state.png') });

    // 2. Fill login form with more reliable selectors
    await page.waitForSelector('#username, [id="username"], input[name="username"]', { state: 'visible', timeout: TIMEOUT });
    await page.fill('#username', 'testuser');

    await page.waitForSelector('#password, [id="password"], input[name="password"]', { state: 'visible', timeout: TIMEOUT });
    await page.fill('#password', 'testpass');

    await page.waitForSelector('#login-btn, [id="login-btn"], button[type="submit"]', { state: 'visible', timeout: TIMEOUT });
    await page.click('#login-btn');

    // 3. Wait for navigation to complete
    await page.waitForURL('**/dashboard', { timeout: TIMEOUT });
    await page.waitForLoadState('networkidle');

    // 4. Capture dashboard with explicit wait
    await page.waitForSelector('.dashboard, [class*="dashboard"], .main-content', { state: 'visible', timeout: TIMEOUT });
    await page.screenshot({ 
      path: path.join(OUTPUT_DIR, 'dashboard-state.png'),
      fullPage: true 
    });

  } catch (error) {
    console.error('Screenshot capture failed:', error);
    
    // Capture error screenshot for debugging
    if (page) {
      await page.screenshot({ 
        path: path.join(OUTPUT_DIR, 'error-state.png'),
        fullPage: true 
      });
    }
    
    // Rethrow error to fail the workflow
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
