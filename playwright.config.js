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
    ['list'], // optional for CLI output
    ['json', { outputFile: 'playwright-report/report.json' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
});