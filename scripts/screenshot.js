const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../tests_artifacts');

async function captureScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Example: Capture login page
  await page.goto('https://your-app-url.com/login');
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'login-state.png') });

  // Example: Capture dashboard after login
  await page.fill('#username', 'testuser');
  await page.fill('#password', 'testpass');
  await page.click('#login-btn');
  await page.waitForSelector('.dashboard');
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'dashboard-state.png') });

  await browser.close();
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

captureScreenshots().catch(console.error);
