#!/usr/bin/env node
/**
 * Installs browsers, runs tests and puts a compact JSON
 * summary into /artifacts/playwright-summary.json
 */
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

execSync('npx playwright install --with-deps', { stdio: 'inherit' });
execSync('npx playwright test',                { stdio: 'inherit' });

const reportFile = 'playwright-metrics.json';   // produced by your custom reporter
if (!fs.existsSync(reportFile))
  throw new Error(`${reportFile} not found – please ensure the Playwright run writes it`);

const r = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
const flatTests = r.suites?.flatMap(f => f.suites.flatMap(s => s.specs.flatMap(sp => sp.tests))) || [];
const passed = flatTests.filter(t => t.results?.[0]?.status === 'expected').length;
const failed = flatTests.filter(t => t.results?.[0]?.status === 'failed').length;
const skipped = flatTests.filter(t => t.results?.[0]?.status === 'skipped').length;
const total   = flatTests.length;
const passRate = total ? +(passed / total * 100).toFixed(2) : 0;

fs.mkdirSync('artifacts', { recursive: true });
fs.cpSync('playwright-report', 'artifacts/playwright-report', { recursive: true });

fs.writeFileSync(
  'artifacts/playwright-summary.json',
  JSON.stringify(
    {
      total,
      passed,
      failed,
      skipped,
      duration: r.stats?.duration ?? 0,
      pass_rate: passRate
    },
    null,
    2
  )
);
