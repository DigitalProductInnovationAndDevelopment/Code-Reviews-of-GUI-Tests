#!/usr/bin/env node
/**
 * Installs browsers, runs Playwright tests, copies the full HTML report,
 * and writes a compact JSON summary to artifacts/playwright-summary.json.
 *
 * Works with any Playwright JSON schema that contains the top-level "stats"
 * object (v1.30+).  Falls back to scanning tests when "stats" is absent.
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

/* 1 ─ install browsers & run tests (honours reporter config) */
execSync('npx playwright install --with-deps', { stdio: 'inherit' });
execSync('npx playwright test',                { stdio: 'inherit' });

/* 2 ─ read the JSON reporter output */
const REPORT_FILE = 'playwright-metrics.json';    // set in playwright.config.js
if (!fs.existsSync(REPORT_FILE))
  throw new Error(`${REPORT_FILE} not found – ensure Playwright writes it`);

const report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));

/* 3 ─ derive counts — prefer "stats", else scan individual tests */
let { total, expected: passed, unexpected: failed, skipped = 0, duration = 0 } =
  report.stats ?? {};

if (total === undefined) {
  // Old schema – flatten tests and count by outcome/status
  const flatten = s => (s.suites ? s.suites.flatMap(flatten) : s.specs.flatMap(sp => sp.tests));
  const tests = report.suites.flatMap(flatten);

  passed  = tests.filter(t => (t.outcome ?? t.results?.[0]?.status) === 'expected').length;
  failed  = tests.filter(t => (t.outcome ?? t.results?.[0]?.status) === 'unexpected' || (t.outcome ?? t.results?.[0]?.status) === 'failed').length;
  skipped = tests.filter(t => (t.outcome ?? t.results?.[0]?.status) === 'skipped').length;
  total   = tests.length;
}

const passRate = total ? +(passed / total * 100).toFixed(2) : 0;

/* 4 ─ write artefacts */
fs.mkdirSync('artifacts', { recursive: true });
if (fs.existsSync('playwright-report'))
  fs.cpSync('playwright-report', 'artifacts/playwright-report', { recursive: true });

fs.writeFileSync(
  'artifacts/playwright-summary.json',
  JSON.stringify(
    {
      total,
      passed,
      failed,
      skipped,
      expected:   passed,      // expose both naming styles
      unexpected: failed,
      duration,
      pass_rate: passRate
    },
    null,
    2
  )
);

console.log('✅ Playwright summary → artifacts/playwright-summary.json');
