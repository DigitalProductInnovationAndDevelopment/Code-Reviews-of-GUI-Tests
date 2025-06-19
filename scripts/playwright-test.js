#!/usr/bin/env node
/**
 * Runs Playwright and writes a compact summary that works for every
 * recent JSON-reporter schema (v1.30-latest).
 */
const { execSync } = require('child_process');
const fs = require('fs');

execSync('npx playwright install --with-deps', { stdio: 'inherit' });
execSync('npx playwright test',                { stdio: 'inherit' });

const REPORT = 'playwright-metrics.json';
if (!fs.existsSync(REPORT))
  throw new Error(`${REPORT} missing – enable the JSON reporter`);

const json = JSON.parse(fs.readFileSync(REPORT, 'utf8'));

/* ── 1. Try the modern “stats” block first ────────────────────── */
let { total, passed, failed, skipped, duration } = json.stats ?? {};

/* ── 2. Fallback: derive from individual tests if any field null ─*/
if (total == null || passed == null || failed == null) {
  const flatten = s => (s.specs ? s.specs.flatMap(sp => sp.tests)
                               : s.suites.flatMap(flatten));
  const tests = json.suites?.flatMap(flatten) ?? [];

  const status = t => t.outcome ?? t.status ?? t.results?.[0]?.status ?? '';
  passed  = tests.filter(t => ['passed','expected'].includes(status(t))).length;
  failed  = tests.filter(t => ['failed','unexpected'].includes(status(t))).length;
  skipped = tests.filter(t => status(t) === 'skipped').length;
  total   = tests.length;
  duration ??= json.duration ?? 0;
}

const passRate = total ? +(passed / total * 100).toFixed(2) : 0;

/* ── 3. Write artefacts ───────────────────────────────────────── */
fs.mkdirSync('artifacts', { recursive: true });
if (fs.existsSync('playwright-report'))
  fs.cpSync('playwright-report', 'artifacts/playwright-report', { recursive: true });

fs.writeFileSync(
  'artifacts/playwright-summary.json',
  JSON.stringify(
    {
      total, passed, failed, skipped,
      expected: passed,   // expose both naming styles
      unexpected: failed,
      duration,
      pass_rate: passRate
    },
    null,
    2
  )
);
console.log('✅ playwright-summary.json updated');
