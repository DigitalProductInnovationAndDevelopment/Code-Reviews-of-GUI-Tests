// playwright.config.js
import { defineConfig, devices } from '@playwright/test';
import { join } from 'path';

export default defineConfig({
  // ... other config ...
  use: {
    trace: 'on-first-retry',
    headless: true, // <-- THIS IS CRITICAL
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: process.env.PLAYWRIGHT_SCREENSHOT_DIR
          ? join(process.env.PLAYWRIGHT_SCREENSHOT_DIR, 'results.json')
          : 'playwright-report/results.json',
      },
    ],
    ['html', { open: 'never' }],
  ],
  // ... rest of config ...
});
