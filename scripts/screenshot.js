const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 1. Prepare output directory
const outputDir = path.join(__dirname, '../screenshots');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// 2. Capture screenshots
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Example 1: Homepage
  await page.goto('https://example.com');
  await page.screenshot({ path: path.join(outputDir, 'home.png') });
  
  // Example 2: Another page
  await page.goto('https://example.com/about');
  await page.screenshot({ path: path.join(outputDir, 'about.png') });
  
  await browser.close();
  
  // 3. Generate markdown with embedded images
  const images = fs.readdirSync(outputDir)
    .filter(file => file.endsWith('.png'))
    .map(file => {
      const data = fs.readFileSync(path.join(outputDir, file), 'base64');
      return `![${file}](data:image/png;base64,${data})`;
    })
    .join('\n\n');
  
  // 4. Output for GitHub Actions
  console.log(`::set-output name=images::${images}`);
})();
