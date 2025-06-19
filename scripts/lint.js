#!/usr/bin/env node
/**
 * One-stop linter:
 *   • formats code with Prettier → sends diff to reviewdog (inline “suggested-change” comments)
 *   • runs ESLint → streams JSON to reviewdog (inline rule comments, fails build on remaining errors)
 *   • writes a machine-readable summary to artifacts/lint-summary.json
 *
 * reviewdog must already be on $PATH (done by the workflow’s action-setup step).
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/* helper ───────────────────────────────────────────────────────────────*/
function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts }).trim();
}

/* Prettier ─────────────────────────────────────────────────────────────*/
function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');
  // 1 format in-place
  sh('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });

  // 2 collect diff + list of changed files
  const diff = sh('git diff -U0 -- tests || true');
  const changedFiles = diff
    ? sh('git diff --name-only -- tests').split('\n').filter(Boolean)
    : [];

  // 3 reviewdog (if there’s anything to comment)
  if (diff) {
    spawnSync(
      'reviewdog',
      [
        '-f=diff',
        '-name=prettier',
        '-reporter=github-pr-review',
        '-level=info',
        '-fail-on-error=false',
      ],
      { input: diff, stdio: ['pipe', 'inherit', 'inherit'], encoding: 'utf8' },
    );
  } else {
    console.log('✓ Prettier: nothing to fix');
  }

  // 4 restore working tree so CI artefacts stay clean
  sh('git checkout -- .');

  return { filesWithIssues: changedFiles.length };
}

/* ESLint ───────────────────────────────────────────────────────────────*/
function runESLint() {
  console.log('\n▶ ESLint');
  let eslintJSON = '';
  try {
    eslintJSON = sh(
      'npx eslint tests --ext .js,.ts,.tsx -f json',
      { stdio: 'pipe' },
    );
  } catch (e) {
    eslintJSON = e.stdout; // exit-code 1 means “lint errors found”
  }

  const results = eslintJSON ? JSON.parse(eslintJSON) : [];
  const summary = {
    files: results.length,
    errors: 0,
    warnings: 0,
    firstError: null,
  };

  for (const file of results) {
    for (const msg of file.messages) {
      if (msg.severity === 2) summary.errors += 1;
      if (msg.severity === 1) summary.warnings += 1;
      if (!summary.firstError && msg.severity === 2) {
        summary.firstError = `${msg.ruleId} in ${path.basename(file.filePath)}:${msg.line}`;
      }
    }
  }

  if (results.length) {
    spawnSync(
      'reviewdog',
      ['-f=eslint', '-name=eslint', '-reporter=github-pr-review'],
      { input: eslintJSON, stdio: ['pipe', 'inherit', 'inherit'], encoding: 'utf8' },
    );
  } else {
    console.log('✓ ESLint: clean');
  }

  // reviewdog’s own exit status mirrors “errors remain?”
  if (summary.errors) process.exitCode = 1;

  return summary;
}

/* Run both & write artefact ───────────────────────────────────────────*/
const prettier = runPrettier();
const eslint = runESLint();

fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/lint-summary.json', JSON.stringify({ prettier, eslint }, null, 2));
fs.writeFileSync(
  'artifacts/lint-summary.txt',
  `Prettier: ${prettier.filesWithIssues} file(s) need formatting\n` +
    `ESLint:   ${eslint.errors} error(s), ${eslint.warnings} warning(s)\n`,
);
