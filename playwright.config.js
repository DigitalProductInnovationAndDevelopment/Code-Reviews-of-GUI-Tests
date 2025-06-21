// playwright.config.js
import { defineConfig, devices } from '@playwright/test';
import * as path from 'path'; // <--- IMPORTANT: Make sure this is imported

// This variable is primarily used by the JSON reporter to determine its specific file path.
// The main 'output' directory for Playwright's artifacts will be controlled by the CLI '--output' flag.
const outputDir = process.env.PLAYWRIGHT_SCREENSHOT_DIR || 'test-results';

export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined, // Reduce workers to 1 on CI for more consistent screenshots and less race conditions, if needed. Can be removed if not needed.
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    // HTML reporter. Playwright will place this in the 'html/' subdirectory
    // within the main output directory specified by the '--output' CLI flag.
    ['html', { open: 'never' }], 
    // JSON reporter. Its outputFile needs to be explicitly within the determined outputDir.
    // 'results.json' will be created directly in 'playwright-artifacts-before/' or 'playwright-artifacts-pr/'.
    ['json', { outputFile: path.join(outputDir, 'results.json') }] 
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect traces on first retry and on `trace: 'on-first-retry'` */
    trace: 'on-first-retry',
    
    // IMPORTANT: 'headless', 'screenshot', 'video', 'ignoreHTTPSErrors'
    // are often better controlled via Playwright CLI flags for dynamic runs.
    // Keeping them out here allows the YAML to specify them per run if needed.
    // If you always want them, you can add them back, but ensure they don't conflict
    // with CLI flags. For now, let's keep it minimal for dynamic output.
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // You can add other browsers or device emulation here if needed
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});

