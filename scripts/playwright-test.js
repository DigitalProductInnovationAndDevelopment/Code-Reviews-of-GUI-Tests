#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');

/* run the tests ------------------------------------------------- */
execSync('npx playwright install --with-deps', { stdio: 'inherit' });
execSync('npx playwright test',                { stdio: 'inherit' });

/* read reporter output ------------------------------------------ */
const JSON_FILE = 'playwright-metrics.json';
if (!fs.existsSync(JSON_FILE))
  throw new Error(`${JSON_FILE} missing – enable the JSON reporter`);
const rpt = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));

/* 1️⃣  try the stats block first -------------------------------- */
let {
  total      = rpt.stats?.total,
  passed     = rpt.stats?.passed     ?? rpt.stats?.expected,
  failed     = rpt.stats?.failed     ?? rpt.stats?.unexpected,
  skipped    = rpt.stats?.skipped,
  duration   = rpt.stats?.duration,
} = {};

/* 2️⃣  fallback: flatten tests if anything is undefined ---------- */
if ([total, passed, failed, skipped].some(v => v == null)) {
  const flatten = s => [
    ...(s.tests ?? []),
    ...((s.suites ?? []).flatMap(flatten)),
  ];
  const tests = (rpt.suites ?? []).flatMap(flatten);
  const status = t => t.outcome ?? t.status ?? t.results?.[0]?.status ?? '';

  passed  = tests.filter(t => ['passed','expected'].includes(status(t))).length;
  failed  = tests.filter(t => ['failed','unexpected'].includes(status(t))).length;
  skipped = tests.filter(t => status(t) === 'skipped').length;
  total   = tests.length;
  duration = duration ?? rpt.duration ?? 0;
}

const passRate = total ? +(passed / total * 100).toFixed(2) : 0;

/* 3️⃣  write compact summary + copy HTML report ------------------ */
fs.mkdirSync('artifacts', { recursive: true });
if (fs.existsSync('playwright-report'))
  fs.cpSync('playwright-report', 'artifacts/playwright-report', { recursive:true });

fs.writeFileSync(
  'artifacts/playwright-summary.json',
  JSON.stringify(
    { total, passed, failed, skipped, duration, pass_rate: passRate },
    null, 2
  )
);
console.log('✅ playwright-summary.json written');
