import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Directory where tests are located
  testDir: './tests',

  // Directory for test artifacts (videos, traces, screenshots generated during runs)
  outputDir: 'published-screenshots/test-results',

  // Directory for visual snapshot baseline images.
  // When you run `npx playwright test --update-snapshots`, images are saved here.
  // When you run `npx playwright test`, images are compared against baselines here.
  snapshotPathTemplate: 'published-screenshots/snapshots/{testFilePath}-{arg}-{projectName}{ext}',

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI.
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use. 'blob' is good for CI as it produces a single JSON file.
  // The interactive HTML report will be generated in the workflow.
  reporter: 'blob',

  use: {
    // Base URL to use in actions like `await page.goto('/')`.
    // baseURL: 'http://127.0.0.1:3000', // Uncomment and set if you have a local dev server

    // Collect trace when retrying the first time.
    trace: 'on-first-retry',
  },

  // Configure projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // You can uncomment and add more projects for different browsers if needed:
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // If your tests require a development server to be running:
  // webServer: {
  //   command: 'npm run start', // Replace with your actual start command (e.g., 'npm start', 'yarn dev')
  //   url: 'http://127.0.0.1:3000', // Replace with the URL your app runs on locally
  //   reuseExistingServer: !process.env.CI, // Reuse server if already running locally
  // },
});
