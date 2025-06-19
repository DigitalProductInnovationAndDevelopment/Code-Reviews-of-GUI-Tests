#!/usr/bin/env node
/**
 * Runs Prettier, reviewdog & ESLint exactly like the original
 * workflow and drops machine-readable summaries into /artifacts.
 */
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ART = path.resolve('artifacts');
fs.mkdirSync(ART, { recursive: true });

/* ── Prettier ────────────────────────────────────────────────────────── */
let prettierLog = '';
try {
  prettierLog = execSync(
    'npx prettier --check "tests/**/*.{js,ts,tsx,jsx,json,yml,yaml,md}"',
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
} catch (err) {
  prettierLog = err.stdout.toString() + err.stderr.toString();
}
fs.writeFileSync(path.join(ART, 'prettier-check.log'), prettierLog);

const hasIssues = /Code style issues found in/.test(prettierLog);
let totalChanges = 0;

if (hasIssues) {
  execSync(
    'npx prettier --write "tests/**/*.{js,ts,tsx,jsx,json,yml,yaml,md}"',
    { stdio: 'inherit' }
  );
  const patch = execSync('git diff -U0 --no-color', { encoding: 'utf8' });
  fs.writeFileSync(path.join(ART, 'prettier.patch'), patch);
  totalChanges = (patch.match(/^@@/gm) || []).length;

  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    execSync(
      `cat artifacts/prettier.patch | reviewdog -f=diff -name="prettier" -reporter=github-pr-review -level=warning`,
      {
        stdio: 'inherit',
        env: { ...process.env, REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN }
      }
    );
  } else {
    console.log('::group::Prettier diff (push build)');
    console.log(patch);
    console.log('::endgroup::');
  }
}

fs.writeFileSync(
  path.join(ART, 'prettier-summary.json'),
  JSON.stringify(
    {
      has_issues: hasIssues,
      files_with_issues: (prettierLog.match(/Code style issues found in/g) || []).length,
      total_changes: totalChanges
    },
    null,
    2
  )
);

/* ── ESLint ──────────────────────────────────────────────────────────── */
execSync(
  `npx eslint "tests/**/*.{js,ts,tsx}" -f json    -o ${ART}/eslint-tests.json  || true`,
  { shell: true, stdio: 'inherit' }
);
execSync(
  `npx eslint "tests/**/*.{js,ts,tsx}" -f stylish -o ${ART}/eslint-stylish.txt || true`,
  { shell: true, stdio: 'inherit' }
);

const eslintReport = JSON.parse(fs.readFileSync(`${ART}/eslint-tests.json`, 'utf8'));
const totals = {
  total_files: eslintReport.length,
  errors: eslintReport.reduce((s, f) => s + f.errorCount, 0),
  warnings: eslintReport.reduce((s, f) => s + f.warningCount, 0),
  fixable_errors: eslintReport.reduce((s, f) => s + f.fixableErrorCount, 0),
  fixable_warnings: eslintReport.reduce((s, f) => s + f.fixableWarningCount, 0)
};

function topRules(sev) {
  const counts = {};
  eslintReport.forEach(f =>
    f.messages
      .filter(m => m.severity === sev)
      .forEach(m => (counts[m.ruleId] = (counts[m.ruleId] || 0) + 1))
  );
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([r, c]) => `${r}: ${c}`)
    .join(', ') || 'None';
}

totals.error_rules   = topRules(2);
totals.warning_rules = topRules(1);
totals.problematic_files = eslintReport
  .sort((a, b) => b.errorCount + b.warningCount - (a.errorCount + a.warningCount))
  .slice(0, 3)
  .map(f => path.basename(f.filePath))
  .join(', ') || 'None';

fs.writeFileSync(`${ART}/eslint-summary.json`, JSON.stringify(totals, null, 2));

console.log('✨ lint.js finished without terminating the build.');
process.exit(0);               // never fail – mirrors original behaviour
