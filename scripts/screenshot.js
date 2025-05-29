// scripts/screenshot.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '../tests_artifacts');

// Create directory if not exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Test with public demo sites
  await page.goto('https://demo.playwright.dev/todomvc');
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'todo-app.png') });
  
  await page.goto('https://example.com');
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'example.png') });
  
  await browser.close();
})();
