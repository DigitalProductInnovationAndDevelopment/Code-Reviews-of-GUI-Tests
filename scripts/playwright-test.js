#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');

/* 1 – run Playwright */
execSync('npx playwright install --with-deps', { stdio: 'inherit' });
execSync('npx playwright test',                { stdio: 'inherit' });

/* 2 – parse reporter output */
const REPORT = 'playwright-metrics.json';
if (!fs.existsSync(REPORT))
  throw new Error(`${REPORT} not found – ensure the JSON reporter is enabled`);

const data = JSON.parse(fs.readFileSync(REPORT, 'utf8'));

/* 3 – test counting that works on every recent schema */
const collect = suite =>
  (suite.specs
    ? suite.specs.flatMap(sp => sp.tests)
    : suite.suites.flatMap(collect));

const tests = data.suites.flatMap(collect);

const outcome = t => t.outcome ?? t.status ?? t.results?.[0]?.status ?? 'unknown';

const passed  = tests.filter(t => ['expected', 'passed'].includes(outcome(t))).length;
const failed  = tests.filter(t => ['unexpected', 'failed'].includes(outcome(t))).length;
const skipped = tests.filter(t => outcome(t) === 'skipped').length;
const total   = tests.length;
const rate    = total ? +(passed / total * 100).toFixed(2) : 0;
const dur     = data.stats?.duration ?? 0;

/* 4 – write compact summary and copy HTML report */
fs.mkdirSync('artifacts', { recursive: true });
if (fs.existsSync('playwright-report'))
  fs.cpSync('playwright-report', 'artifacts/playwright-report', { recursive: true });

fs.writeFileSync(
  'artifacts/playwright-summary.json',
  JSON.stringify(
    { total, passed, failed, skipped,
      expected: passed, unexpected: failed,
      duration: dur,  pass_rate: rate },
    null, 2
  )
);
console.log('✅ playwright-summary.json written');
