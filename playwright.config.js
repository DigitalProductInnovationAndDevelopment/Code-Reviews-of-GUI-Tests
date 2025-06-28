// playwright.config.js (ESM-compatible)
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    headless: true,
    screenshot: 'on',
    trace: 'on',
    video: 'off',
    ignoreHTTPSErrors: true,
  },
  reporter: [
    ['list'],                                       
    ['json', { outputFile: 'playwright-metrics.json' }], 
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
});
