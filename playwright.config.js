const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  use: {
    headless: true,
    screenshot: {
      mode: 'on',
      fullPage: true
    },
    trace: 'on-first-retry',
    video: 'off',
    ignoreHTTPSErrors: true,
    testIdAttribute: 'data-testid',
    contextOptions: {
      recordVideo: {
        dir: 'test-results'
      }
    }
  },
  reporter: [
    ['list'],
    ['json', { outputFile: 'playwright-metrics.json' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
});
