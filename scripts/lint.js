#!/usr/bin/env node
/**
 * Runs Prettier + ESLint only on /tests/** and
 *   • feeds Prettier patch to reviewdog (PR inline comments)
 *   • writes concise JSON summaries for the dashboard
 * Never fails the build.
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ART = path.resolve('artifacts');
fs.mkdirSync(ART, { recursive: true });

/*───────────────────────────────*
 * 1) PRETTIER (tests/**)        *
 *───────────────────────────────*/
const GLOB = 'tests/**/*.{js,ts,tsx,jsx,json,yml,yaml,md}';
let prettierLog = '';

try {
  prettierLog = execSync(`npx prettier --check "${GLOB}"`, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
} catch (err) {
  prettierLog = (err.stdout || '') + (err.stderr || '');
}

const hasIssues = /Code style issues found in/.test(prettierLog);
let filesWithIssues = (prettierLog.match(/Code style issues found in/g) || []).length;
let totalChanges = 0;
let samplePatch  = '';

if (hasIssues) {
  /* format so we can diff */
  execSync(`npx prettier --write "${GLOB}"`, { stdio: 'inherit' });
  const patch = execSync('git diff -U0 --no-color', { encoding: 'utf8' });
  fs.writeFileSync(path.join(ART, 'prettier.patch'), patch);
  totalChanges = (patch.match(/^@@/gm) || []).length;
  /* one ≤20-line example for the dashboard */
  samplePatch = patch.split('\n').slice(0, 20).join('\n');

  /* PR inline comments via reviewdog (only when token present) */
  if (process.env.GITHUB_EVENT_NAME === 'pull_request' && process.env.GITHUB_TOKEN) {
    try {
      execSync(
        'cat artifacts/prettier.patch | reviewdog -f=diff ' +
          '-name="prettier" -reporter=github-pr-review -level=warning',
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN
          }
        }
      );
    } catch {
      console.warn('reviewdog returned non-zero (ignored)');
    }
  }
}

fs.writeFileSync(
  path.join(ART, 'prettier-summary.json'),
  JSON.stringify(
    { has_issues: hasIssues, files_with_issues: filesWithIssues,
      total_changes: totalChanges, sample_patch: samplePatch },
    null, 2)
);

/*───────────────────────────────*
 * 2) ESLINT (tests/**)          *
 *───────────────────────────────*/
console.log('\n🔍 Running ESLint on /tests/**…');
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

fs.writeFileSync(`${ART}/eslint-summary.json`, JSON.stringify(totals, null, 2));

console.log('\n✨ lint.js finished (never fails build).');
process.exit(0);