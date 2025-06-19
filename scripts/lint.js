#!/usr/bin/env node
/**
 * Unified linter for CI & local use
 *
 *  ▸ Prettier  → formats, diff sent to reviewdog (inline “suggest-change” comments)
 *  ▸ ESLint    → JSON sent to reviewdog (inline rule comments)
 *  ▸ Always writes artifacts/lint-summary.{json,txt}
 *
 *    $ node scripts/lint.js           # warnings don’t fail CI
 *    $ node scripts/lint.js --strict  # ESLint errors set exit-code 1
 */

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const STRICT = process.argv.includes('--strict');
const ART_DIR = 'artifacts';

const capture = cmd => execSync(cmd, { encoding: 'utf8' }).trim();

/* ─────────────────── Prettier ─────────────────────────────────── */
function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');
  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });

  const diff = capture('git diff -U0 -- tests || true');
  const changedFiles = diff
    ? capture('git diff --name-only -- tests').split('\n').filter(Boolean)
    : [];

  if (diff) {
    spawnSync(
      'reviewdog',
      ['-f=diff', '-name=prettier', '-reporter=github-pr-review',
       '-level=info', '-fail-on-error=false'],
      { input: diff, stdio: ['pipe', 'inherit', 'inherit'], encoding: 'utf8' },
    );
  } else {
    console.log('✓ Prettier: nothing to fix');
  }

  execSync('git checkout -- .');          // keep tree clean
  return { filesWithIssues: changedFiles.length };
}

/* ─────────────────── ESLint ───────────────────────────────────── */
function runESLint() {
  console.log('\n▶ ESLint');

  let raw = '';
  try {
    raw = capture('npx eslint tests --ext .js,.ts,.tsx -f json');
  } catch (e) {
    raw = e.stdout.toString();            // exit 1 means “found problems”
  }

  const results = raw ? JSON.parse(raw) : [];
  const summary = { files: results.length, errors: 0, warnings: 0, first: null };

  results.forEach(f =>
    f.messages.forEach(m => {
      if (m.severity === 2) {
        summary.errors++;
        if (!summary.first) summary.first = `${m.ruleId} in ${path.basename(f.filePath)}:${m.line}`;
      } else if (m.severity === 1) {
        summary.warnings++;
      }
    }),
  );

  if (results.length) {
    spawnSync(
      'reviewdog',
      ['-f=eslint', '-name=eslint', '-reporter=github-pr-review'],
      { input: raw, stdio: ['pipe', 'inherit', 'inherit'], encoding: 'utf8' },
    );
  } else {
    console.log('✓ ESLint: clean');
  }

  if (STRICT && summary.errors) process.exitCode = 1;   // fail only in strict
  return summary;
}

/* ─────────────────── Run & ALWAYS write summary ──────────────── */
let prettier = { filesWithIssues: 0 };
let eslint   = { errors: 0, warnings: 0, first: null };

try {
  prettier = runPrettier();   // may throw → still handled by finally
  eslint   = runESLint();
}finally {
  fs.mkdirSync('artifacts', { recursive: true });

  // prettierObj & eslintObj came from runPrettier / runESLint returns
  fs.writeFileSync(
    'artifacts/lint-summary.json',
    JSON.stringify(
      {
        prettier: {                 // ← now includes filenames & sample
          filesWithIssues: prettierObj.filesWithIssues,
          files:           prettierObj.files,
          sample:          prettierObj.sample
        },
        eslint: eslintObj           // {files, errors, warnings, first}
      },
      null,
      2
    )
  );
}


