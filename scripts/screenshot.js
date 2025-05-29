const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Reduce image size
    await page.setViewportSize({ width: 800, height: 600 });
    
    // Example 1: Homepage
    await page.goto('https://example.com', { waitUntil: 'networkidle' });
    await page.screenshot({ 
      path: 'screenshots/home.jpg',
      type: 'jpeg',
      quality: 70,
      fullPage: false
    });
    
    // Example 2: About page
    await page.goto('https://example.com/about', { waitUntil: 'networkidle' });
    await page.screenshot({ 
      path: 'screenshots/about.jpg',
      type: 'jpeg',
      quality: 70,
      fullPage: false
    });
    
    console.log('Screenshots captured successfully!');
  } catch (error) {
    console.error('❌ Screenshot failed:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
