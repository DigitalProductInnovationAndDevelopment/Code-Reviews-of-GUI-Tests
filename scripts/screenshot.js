const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const core = require('@actions/core');

const outputDir = path.join(__dirname, '../screenshots');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

(async () => {
  // Use try/catch to handle errors gracefully
  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    // Set smaller viewport to reduce image size
    await page.setViewportSize({ width: 1200, height: 800 });
    
    // Example 1: Homepage (replace with your URLs)
    await page.goto('https://example.com', { waitUntil: 'networkidle' });
    await page.screenshot({ 
      path: path.join(outputDir, 'home.png'),
      quality: 80, // Reduce quality for smaller file size
      fullPage: false
    });
    
    // Example 2: Another page
    await page.goto('https://example.com/about', { waitUntil: 'networkidle' });
    await page.screenshot({ 
      path: path.join(outputDir, 'about.png'),
      quality: 80,
      fullPage: false
    });
    
    await browser.close();
    
    // Generate markdown with embedded images
    const images = [];
    const files = fs.readdirSync(outputDir);
    
    for (const file of files) {
      if (file.endsWith('.png')) {
        const data = fs.readFileSync(path.join(outputDir, file), 'base64');
        images.push(`![${file}](data:image/png;base64,${data})`);
      }
    }
    
    // Set output for GitHub Actions
    core.setOutput('images', images.join('\n\n'));
    
  } catch (error) {
    core.setFailed(`Screenshot capture failed: ${error.message}`);
    process.exit(1);
  }
})();
