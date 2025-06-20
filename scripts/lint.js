#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');

// ────────────────────────────────
// PRETTIER
// ────────────────────────────────
function runPrettier() {
  console.log('\n▶ Prettier (--list-different → diff)');

  // List files that would be re-formatted
  let list = '';
  try {
    list = execSync(
      'npx prettier --list-different "tests/**/*.{js,ts,tsx,json}"',
      { encoding: 'utf8' }
    );
  } catch (e) {
    // non-zero exit code means "there are differences"
    list = e.stdout?.toString() || '';
  }

  const files = list.split('\n').filter(Boolean);
  let diff = '';

  // Build a unified diff for each offending file (for debugging artefacts)
  for (const file of files) {
    try {
      const fileDiff = execSync(
        // Prettier prints the formatted file to stdout;
        // diff -u compares that stream against the original file.
        `npx prettier "${file}" | diff -u --label "${file} (orig)" "${file}" -`,
        { encoding: 'utf8' }
      );
      diff += fileDiff;
    } catch (e) {
      // diff exits 1 when files differ – capture its stdout
      diff += e.stdout?.toString() || '';
    }
  }

  // Save debugging artefacts
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/prettier-diff.txt', diff);

  return {
    filesWithIssues: files.length,
    files,
    sample: diff.split('\n').slice(0, 20).join('\n'),
  };
}

// ────────────────────────────────
// ESLINT
// ────────────────────────────────
function runESLint() {
  console.log('\n▶ ESLint');

  let raw = '';
  try {
    raw = execSync(
      'npx eslint tests --ext .js,.ts,.tsx -f json',
      { encoding: 'utf8' }
    );
  } catch (e) {
    // eslint exits 1 on lint errors – capture its JSON output
    raw = e.stdout?.toString() || '';
  }

  const results = raw ? JSON.parse(raw) : [];

  let errors = 0,
    warnings = 0,
    fixErr = 0,
    fixWarn = 0,
    first = '',
    files = new Set();

  results.forEach((f) => {
    if (f.messages.length) files.add(f.filePath);
    f.messages.forEach((m) => {
      if (m.severity === 2) {
        errors++;
        if (m.fix) fixErr++;
        if (!first) first = `${m.ruleId || 'unknown-rule'} in ${f.filePath}:${m.line}`;
      } else if (m.severity === 1) {
        warnings++;
        if (m.fix) fixWarn++;
      }
    });
  });

  // Save full ESLint output
  fs.writeFileSync('artifacts/eslint-results.json', raw);

  return {
    files: files.size,
    errors,
    warnings,
    fixableErrors: fixErr,
    fixableWarnings: fixWarn,
    first,
  };
}

// ────────────────────────────────
// MAIN
// ────────────────────────────────
const prettier = runPrettier();
const eslint = runESLint();

fs.writeFileSync(
  'artifacts/lint-summary.json',
  JSON.stringify({ prettier, eslint }, null, 2)
);
console.log('📝 artifacts/lint-summary.json written');

// exit 1 if there are any issues (CI can still ignore via continue-on-error)
if (prettier.filesWithIssues || eslint.errors || eslint.warnings) {
  process.exitCode = 1;
}
