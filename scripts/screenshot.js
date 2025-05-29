const { chromium } = require('playwright');
const core = require('@actions/core');

(async () => {
  // 1. Launch browser
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Reduce image size
  await page.setViewportSize({ width: 800, height: 600 });
  
  // 2. Capture screenshots as base64
  let imagesMarkdown = '';
  
  // Example 1: Homepage
  await page.goto('https://example.com');
  const screenshot1 = await page.screenshot({ 
    type: 'jpeg',  // Smaller than PNG
    quality: 70,   // Reduce quality
    fullPage: false
  });
  imagesMarkdown += `![Homepage](data:image/jpeg;base64,${screenshot1.toString('base64')})\n\n`;
  
  // Example 2: About page
  await page.goto('https://example.com/about');
  const screenshot2 = await page.screenshot({ 
    type: 'jpeg',
    quality: 70,
    fullPage: false
  });
  imagesMarkdown += `![About](data:image/jpeg;base64,${screenshot2.toString('base64')})\n\n`;
  
  // 3. Close browser
  await browser.close();
  
  // 4. Output images for GitHub comment
  core.setOutput('images', imagesMarkdown);
})().catch(error => {
  core.setFailed(`❌ Screenshot failed: ${error}`);
  process.exit(1);
});
