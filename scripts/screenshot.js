const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '../tests_artifacts');

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  await page.screenshot({ path: path.join(dir, 'screenshot.png') });
  await browser.close();
})();
