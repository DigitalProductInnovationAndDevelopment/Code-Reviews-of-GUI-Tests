const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_DIR = path.join(__dirname, '../tests_artifacts');
const TIMEOUT = 120000; // 2 minutes timeout
const TARGET_URL = process.env.TARGET_URL || 'https://your-app.com/login'; // From environment variable

// Create output directory if needed
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

(async () => {
  let browser;
  let page;

  try {
    console.log('Launching browser...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();

    // Set extended timeout for all actions
    page.setDefaultTimeout(TIMEOUT);

    // 1. Navigate to target URL
    console.log(`Navigating to: ${TARGET_URL}`);
    await page.goto(TARGET_URL, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT
    });
    
    // Capture initial page state
    console.log('Page loaded. Capturing login page...');
    await page.screenshot({ path: path.join(OUTPUT_DIR, '01-login-page.png') });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'login-page.html'), await page.content());
    
    // 2. Attempt to find and fill username
    console.log('Searching for username field...');
    const usernameSelectors = [
      '#username',
      'input[name="username"]',
      'input[type="text"]',
      'input[type="email"]',
      'input[id*="user"]',
      'input[name*="user"]'
    ];
    
    const usernameField = await findVisibleElement(page, usernameSelectors);
    if (!usernameField) throw new Error('Username field not found');
    await usernameField.fill('testuser');
    console.log('Username filled');

    // 3. Attempt to find and fill password
    console.log('Searching for password field...');
    const passwordSelectors = [
      '#password',
      'input[name="password"]',
      'input[type="password"]',
      'input[id*="pass"]',
      'input[name*="pass"]'
    ];
    
    const passwordField = await findVisibleElement(page, passwordSelectors);
    if (!passwordField) throw new Error('Password field not found');
    await passwordField.fill('testpass');
    console.log('Password filled');

    // 4. Attempt to find and click login button
    console.log('Searching for login button...');
    const loginButtonSelectors = [
      '#login-btn',
      'button[type="submit"]',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'button:has-text("Login")',
      'input[type="submit"]'
    ];
    
    const loginButton = await findVisibleElement(page, loginButtonSelectors);
    if (!loginButton) throw new Error('Login button not found');
    await loginButton.click();
    console.log('Login button clicked');

    // 5. Wait for navigation to complete
    console.log('Waiting for post-login page...');
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    
    // Capture dashboard state
    console.log('Page loaded. Capturing dashboard...');
    await page.waitForSelector('.dashboard, .main-content, [class*="content"]', {
      state: 'visible',
      timeout: TIMEOUT
    });
    
    await page.screenshot({ 
      path: path.join(OUTPUT_DIR, '02-dashboard.png'),
      fullPage: true 
    });

    console.log('Screenshots captured successfully!');

  } catch (error) {
    console.error('Screenshot capture failed:', error);
    
    // Capture error state if page exists
    if (page) {
      try {
        await page.screenshot({ 
          path: path.join(OUTPUT_DIR, '99-error-state.png'),
          fullPage: true 
        });
        fs.writeFileSync(path.join(OUTPUT_DIR, 'error-page.html'), await page.content());
      } catch (innerError) {
        console.error('Failed to capture error state:', innerError);
      }
    }
    
    // Rethrow error to fail the workflow
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();

// Helper function to find first visible element from a list of selectors
async function findVisibleElement(page, selectors) {
  for (const selector of selectors) {
    try {
      const element = await page.waitForSelector(selector, {
        state: 'visible',
        timeout: 15000 // 15s per selector
      });
      if (element) return element;
    } catch (e) {
      // Continue to next selector
    }
  }
  return null;
}
