// playwright.config.js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // ⭐ NEW: Explicitly define the output directory for all Playwright artifacts
  // This is where screenshots, visual diffs, and the main report structure will go.
  outputDir: 'published-screenshots',

  reporter: [
    // ⭐ ADJUSTED: 'html' outputFolder is now relative to 'outputDir'
    ['html', { open: 'never', outputFolder: 'html' }],
    // ⭐ ADJUSTED: 'json' outputFile is now relative to 'outputDir'
    ['json', { outputFile: 'results.json' }]
  ],
  use: {
    trace: 'on-first-retry',
    headless: true, // Playwright runs headless by default in CI
    screenshot: 'on', // Takes screenshots on failure or specific steps, and also applies to toHaveScreenshot
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // You can add other projects for different browsers here if needed, e.g.:
    // {
    //    name: 'firefox',
    //    use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //    name: 'webkit',
    //    use: { ...devices['Desktop Safari'] },
    // },
  ],
});
