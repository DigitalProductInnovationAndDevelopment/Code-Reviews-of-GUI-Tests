#!/usr/bin/env node
/**
 * Runs Playwright, copies the HTML report, and writes a compact JSON summary
 * that works for every Playwright ≥ v1.30 JSON schema.
 */
const { execSync } = require('child_process');
const fs = require('fs');

/* ── Run tests ─────────────────────────────────────────────────── */
execSync('npx playwright install --with-deps', { stdio: 'inherit' });
execSync('npx playwright test',                { stdio: 'inherit' });

/* ── Load reporter output ──────────────────────────────────────── */
const REPORT = 'playwright-metrics.json';
if (!fs.existsSync(REPORT))
  throw new Error(`${REPORT} missing – enable the JSON reporter`);

const data = JSON.parse(fs.readFileSync(REPORT, 'utf8'));

/* ── Prefer the “stats” object when present ────────────────────── */
let {
  total       = undefined,
  expected    = undefined,
  unexpected  = undefined,
  skipped     = undefined,
  duration    = data.stats?.duration ?? 0,
} = data.stats ?? {};

/* ── Fallback: derive counts from individual tests ─────────────── */
if (total == null || expected == null || unexpected == null) {
  const collect = s => [
    ...(s.tests ?? []),
    ...((s.suites ?? []).flatMap(collect)),
  ];
  const tests = (data.suites ?? []).flatMap(collect);

  const status = t => t.outcome ?? t.status ?? t.results?.[0]?.status ?? '';
  expected    = tests.filter(t => ['expected', 'passed'].includes(status(t))).length;
  unexpected  = tests.filter(t => ['unexpected', 'failed'].includes(status(t))).length;
  skipped     = tests.filter(t =>  status(t) === 'skipped').length;
  total       = tests.length;
}

const passRate = total ? +(expected / total * 100).toFixed(2) : 0;

/* ── Write artefacts ───────────────────────────────────────────── */
fs.mkdirSync('artifacts', { recursive: true });
if (fs.existsSync('playwright-report'))
  fs.cpSync('playwright-report', 'artifacts/playwright-report', { recursive: true });

fs.writeFileSync(
  'artifacts/playwright-summary.json',
  JSON.stringify(
    {
      total,
      passed: expected,        // legacy name
      failed: unexpected,
      expected,
      unexpected,
      skipped,
      duration,
      pass_rate: passRate
    },
    null,
    2
  )
);
console.log('✅ playwright-summary.json written');
