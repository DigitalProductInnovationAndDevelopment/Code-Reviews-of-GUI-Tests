// playwright.config.js
// ------------------------------------------------------------
// Generates three reporters:
//   • list   – nice console output on CI
//   • json   – metrics saved to ./playwright-metrics.json
//   • html   – full HTML report in ./playwright-report/
// ------------------------------------------------------------
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',

  /* Browser / context defaults */
  use: {
    headless: true,
    screenshot: 'on',
    trace: 'on',
    video: 'off',
    ignoreHTTPSErrors: true,
  },

  /* Reporters – order does not matter */
  reporter: [
    // human-readable console list
    [ 'list' ],

    // machine-readable metrics JSON
    [ 'json', { outputFile: /** absolute path is safer */ require('path').resolve(__dirname, 'playwright-metrics.json') } ],

    // self-contained HTML report (for dashboard)
    [ 'html', { outputFolder: 'playwright-report', open: 'never' } ],
  ],
});
