#!/usr/bin/env node
/**
 * Unified linter for CI:
 *   • Prettier formats → git diff → reviewdog (suggested-change comments)
 *   • ESLint JSON      → reviewdog (inline rule comments)
 *   • Writes lint-summary artefacts for the PR-summary step
 *
 *   Run with “--strict” to make ESLint errors flip exit-code to 1.
 */

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const STRICT = process.argv.includes('--strict');

/* small helper: capture stdout (no inherit) */
const capture = cmd => execSync(cmd, { encoding: 'utf8' }).trim();

/* ─────────── Prettier → reviewdog ─────────────────────────────── */
function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');

  /* 1 – format in place */
  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });

  /* 2 – diff vs HEAD to know what changed */
  const diff = capture('git diff -U0 -- tests || true');
  const changedFiles = diff
    ? capture('git diff --name-only -- tests').split('\n').filter(Boolean)
    : [];

  /* 3 – send suggestions to reviewdog */
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

  /* 4 – restore pristine tree (avoids dirty state for later steps) */
  execSync('git checkout -- .');

  return { filesWithIssues: changedFiles.length };
}

/* ─────────── ESLint → reviewdog ───────────────────────────────── */
function runESLint() {
  console.log('\n▶ ESLint');

  let raw = '';
  try {
    raw = capture('npx eslint tests --ext .js,.ts,.tsx -f json');
  } catch (e) {
    // ESLint exits 1 when problems exist – JSON is still in stdout
    raw = e.stdout.toString();
  }

  const results = raw ? JSON.parse(raw) : [];
  const summary = { files: results.length, errors: 0, warnings: 0, first: null };

  results.forEach(file =>
    file.messages.forEach(m => {
      if (m.severity === 2) {
        summary.errors++;
        if (!summary.first) summary.first = `${m.ruleId} in ${path.basename(file.filePath)}:${m.line}`;
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

  if (STRICT && summary.errors) process.exitCode = 1;   // gate only when strict
  return summary;
}

/* ─────────── run both & emit artefacts ───────────────────────── */
const prettier = runPrettier();
const eslint   = runESLint();

fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync(
  'artifacts/lint-summary.json',
  JSON.stringify({ prettier, eslint }, null, 2),
);
fs.writeFileSync(
  'artifacts/lint-summary.txt',
  `Prettier: ${prettier.filesWithIssues} file(s) need formatting\n` +
  `ESLint:   ${eslint.errors} error(s), ${eslint.warnings} warning(s)\n`,
);
