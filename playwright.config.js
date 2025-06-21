// playwright.config.js
import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

const outputDir = process.env.PLAYWRIGHT_SCREENSHOT_DIR || 'test-results'; // This might not be directly used if --output is used via CLI

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    // If you plan to stick to the 'published-screenshots' direct output
    // then the json reporter should also point there.
    // However, for this simplified approach, let Playwright's --output handle it.
    // So for now, we'll assume the default json report is handled by --output.
    ['json', { outputFile: path.join('published-screenshots', 'results.json') }] // Ensure this points to the right place
  ],
  use: {
    trace: 'on-first-retry',
    headless: true,   // <<< MAKE SURE THIS IS TRUE
    screenshot: 'on', // <<< MAKE SURE THIS IS 'on' TO ALWAYS CAPTURE SCREENS
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
