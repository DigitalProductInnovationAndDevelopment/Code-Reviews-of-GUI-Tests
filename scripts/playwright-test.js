#!/usr/bin/env node
/**
 * Installs browsers, runs Playwright tests, then writes a compact
 * summary to artifacts/playwright-summary.json *and* copies the full
 * HTML report into artifacts/playwright-report/.
 *
 * Works with Playwright ≥ 1.30 (outcome === expected / unexpected).
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

/* 1 – install browsers & run tests */
execSync('npx playwright install --with-deps', { stdio: 'inherit' });
execSync('npx playwright test',                { stdio: 'inherit' });

/* 2 – read the JSON reporter output */
const REPORT_FILE = 'playwright-metrics.json';   // written via reporter config
if (!fs.existsSync(REPORT_FILE))
  throw new Error(`${REPORT_FILE} not found – ensure Playwright writes it`);

const report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));

/* 3 – flatten tests and derive counts using the modern "outcome" field */
function flattenTests(suite) {
  if (suite.specs) return suite.specs.flatMap(s => s.tests);
  // recurse into nested suites
  return suite.suites ? suite.suites.flatMap(flattenTests) : [];
}

const tests = report.suites.flatMap(flattenTests);

const passed   = tests.filter(t => t.outcome === 'expected').length;
const failed   = tests.filter(t => t.outcome === 'unexpected').length;
const skipped  = tests.filter(t => t.outcome === 'skipped').length;
const total    = tests.length;
const passRate = total ? +(passed / total * 100).toFixed(2) : 0;
const duration = report.stats?.duration ?? 0;

/* 4 – put artefacts where the rest of the pipeline expects them */
fs.mkdirSync('artifacts', { recursive: true });
fs.cpSync('playwright-report', 'artifacts/playwright-report', { recursive: true });

fs.writeFileSync(
  'artifacts/playwright-summary.json',
  JSON.stringify(
    {
      total,
      passed,              // kept for backward-compat with dashboard
      failed,
      skipped,
      expected:   passed,  // expose both naming conventions
      unexpected: failed,
      duration,
      pass_rate: passRate
    },
    null,
    2
  )
);

console.log('✅ Playwright summary written → artifacts/playwright-summary.json');
