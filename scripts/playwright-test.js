#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');

/* run the suite -------------------------------------------------- */
execSync('npx playwright install --with-deps', { stdio: 'inherit' });
execSync('npx playwright test',                { stdio: 'inherit' });

/* parse JSON reporter output ------------------------------------- */
const FILE = 'playwright-metrics.json';
if (!fs.existsSync(FILE)) throw new Error(`${FILE} not found`);
const rpt = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const s        = rpt.stats ?? {};
const passed   = s.expected   ?? s.passed     ?? 0;
const failed   = s.unexpected ?? s.failed     ?? 0;
const skipped  = s.skipped    ?? 0;
const total    = s.total      ?? passed + failed + skipped;
const duration = s.duration   ?? 0;
const rate     = total ? +(passed / total * 100).toFixed(2) : 0;

/* write compact summary + copy HTML report ----------------------- */
fs.mkdirSync('artifacts', { recursive: true });
if (fs.existsSync('playwright-report'))
  fs.cpSync('playwright-report', 'artifacts/playwright-report', { recursive: true });

fs.writeFileSync(
  'artifacts/playwright-summary.json',
  JSON.stringify({ total, passed, failed, skipped, duration, pass_rate: rate }, null, 2)
);
console.log('✅ playwright-summary.json written');
