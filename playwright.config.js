// playwright.config.js (ESM-compatible)
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: './tests',
  use: {
    headless: true,
    screenshot: 'on',
    trace: 'on',
    video: 'off',
    ignoreHTTPSErrors: true,
  },
  reporter: [
    ['json', { outputFile: 'playwright-metrics.json' }],
    ['html', { outputFile: 'report.html', open: 'never' }],
  ],
});
