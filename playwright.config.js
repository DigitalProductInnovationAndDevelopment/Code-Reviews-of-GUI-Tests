// playwright.config.js
import { defineConfig, devices } from '@playwright/test';
import * as path from 'path'; // <--- ADD THIS LINE

// Determine the output directory based on the environment variable
// This variable is set in the GitHub Actions workflow
const outputDir = process.env.PLAYWRIGHT_SCREENSHOT_DIR || 'test-results'; // <--- ADD/UPDATE THIS LINE

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
    ['html', { open: 'never' }], // Keep your HTML reporter configuration
    // Add the JSON reporter here, pointing to the dynamically set outputDir
    ['json', { outputFile: path.join(outputDir, 'results.json') }] // <--- ADD/UPDATE THIS LINE
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect traces on first retry and on `trace: 'on-first-retry'` */
    trace: 'on-first-retry',
    
    // Set the output directory for screenshots and other artifacts
    output: outputDir, // This is already correctly using the env var
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://127.0.0.1:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
