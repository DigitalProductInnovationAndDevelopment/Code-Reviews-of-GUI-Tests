// playwright.config.js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    // Corrected to output HTML report to a subfolder within published-screenshots
    // This should fix the 'published-screenshots/html/' not found warning.
    ["html", { open: "never", outputFolder: "published-screenshots/html" }],
    // Ensure JSON report is also in published-screenshots
    ["json", { outputFile: "published-screenshots/results.json" }]
  ],
  use: {
    trace: "on-first-retry",
    headless: true, // Playwright runs headless by default in CI
    screenshot: "on", // Takes screenshots on failure or specific steps
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // You can add other projects for different browsers here if needed, e.
    // {
    //  name: "firefox",
    //  use: { ...devices["Desktop Firefox"] },
    // },
    // {
    //  name: "webkit",
    //  use: { ...devices["Desktop Safari"] },
    // },
  ],
});
