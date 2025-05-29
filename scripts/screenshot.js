// Trigger workflow rerun

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const dir = path.resolve(__dirname, '../tests_artifacts');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://example.com'); // Just a test page
  await page.screenshot({ path: path.join(dir, 'example-screenshot.png') });
  await browser.close();
})();
