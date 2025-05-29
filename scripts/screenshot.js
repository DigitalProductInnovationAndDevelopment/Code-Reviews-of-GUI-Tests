const { chromium } = require('playwright');

(async () => {
  let browser;
  try {
    // Launch Chromium (explicitly specify)
    browser = await chromium.launch({ 
      channel: 'chromium',
      headless: true
    });
    
    const page = await browser.newPage();
    await page.setViewportSize({ width: 800, height: 600 });
    
    // Capture homepage
    await page.goto('https://example.com', { 
      waitUntil: 'networkidle',
      timeout: 60000
    });
    await page.screenshot({ 
      path: 'screenshots/home.jpg',
      type: 'jpeg',
      quality: 70
    });
    
    // Capture about page
    await page.goto('https://example.com/about', { 
      waitUntil: 'networkidle',
      timeout: 60000
    });
    await page.screenshot({ 
      path: 'screenshots/about.jpg',
      type: 'jpeg',
      quality: 70
    });
    
    console.log('✅ Screenshots captured successfully!');
  } catch (error) {
    console.error('❌ Screenshot failed:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();
