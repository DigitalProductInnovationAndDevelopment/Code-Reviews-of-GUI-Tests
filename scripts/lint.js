#!/usr/bin/env node
/**
 * One-stop linter:
 *   • Prettier formats → git diff → reviewdog (inline suggestions)
 *   • ESLint JSON      → reviewdog (inline rule comments, fails build on errors)
 *   • Writes summary artefact for the PR comment
 */

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

/* simple helper: capture command output (only when we need it) */
function capture(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

/* ────────────── Prettier → reviewdog ─────────────────────────── */
function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');

  // 1 – format files (we don’t capture output here)
  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });

  // 2 – diff against HEAD to know what changed
  const diff = capture('git diff -U0 -- tests || true');
  const changedFiles = diff
    ? capture('git diff --name-only -- tests').split('\n').filter(Boolean)
    : [];

  // 3 – inline suggestions
  if (diff) {
    spawnSync(
      'reviewdog',
      ['-f=diff', '-name=prettier', '-reporter=github-pr-review', '-level=info', '-fail-on-error=false'],
      { input: diff, stdio: ['pipe', 'inherit', 'inherit'], encoding: 'utf8' },
    );
  } else {
    console.log('✓ Prettier: nothing to fix');
  }

  // 4 – reset working tree (so Playwright sees pristine files)
  execSync('git checkout -- .');

  return { filesWithIssues: changedFiles.length };
}

/* ────────────── ESLint → reviewdog ───────────────────────────── */
function runESLint() {
  console.log('\n▶ ESLint');

  let raw = '';
  try {
    raw = capture('npx eslint tests --ext .js,.ts,.tsx -f json');
  } catch (e) {
    // ESLint exits 1 when it finds problems — stdout still holds the JSON
    raw = e.stdout.toString();
  }

  const results = raw ? JSON.parse(raw) : [];
  const summary = {
    files: results.length,
    errors: 0,
    warnings: 0,
    firstError: null,
  };

  results.forEach(file =>
    file.messages.forEach(msg => {
      if (msg.severity === 2) {
        summary.errors += 1;
        if (!summary.firstError) {
          summary.firstError = `${msg.ruleId} in ${path.basename(file.filePath)}:${msg.line}`;
        }
      } else if (msg.severity === 1) {
        summary.warnings += 1;
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

  // propagate failure if errors remain
  if (summary.errors) process.exitCode = 1;

  return summary;
}

/* ────────────── run both & write artefacts ───────────────────── */
const prettier = runPrettier();
const eslint   = runESLint();

fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/lint-summary.json', JSON.stringify({ prettier, eslint }, null, 2));
fs.writeFileSync(
  'artifacts/lint-summary.txt',
  `Prettier: ${prettier.filesWithIssues} file(s) need formatting\n` +
    `ESLint:   ${eslint.errors} error(s), ${eslint.warnings} warning(s)\n`,
);
