const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  use: {
    headless: true,
    screenshot: 'on',
    trace: 'on',
    video: 'off',
    ignoreHTTPSErrors: true,
  },
  reporter: [
    ['list'],                                        // nice CLI output
    ['json', { outputFile: 'playwright-metrics.json' }],  // <-- 👈 here
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
});
