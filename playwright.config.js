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
    ['json', { outputFile: 'metric.json' }],
    ['html', { outputFile: 'report.html', open: 'never' }],
  ],
});