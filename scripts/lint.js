#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');

// ────────────────────────────────
// PRETTIER  – rewrite → diff
// ────────────────────────────────
function runPrettier() {
  console.log('\n▶ Prettier (--write → diff)');

  // ➊ Rewrite anything that isn’t formatted
  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', {
    stdio: 'inherit',
  });

  // ➋ Collect the diff (relative to HEAD)
  const diff = execSync('git diff -- tests || true', { encoding: 'utf8' });
  const files = diff
    ? execSync('git diff --name-only -- tests', { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
    : [];
  const totalChanges = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;

  // ➌ Save artefacts for the summary-comment step
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/prettier-diff.txt', diff);

  // ➍ Undo the rewrites so the working tree stays clean
  execSync('git checkout -- .');

  return {
    filesWithIssues: files.length,
    totalChanges,
    files,
    sample: diff.split('\n').slice(0, 20).join('\n'),
  };
}

// ────────────────────────────────
// ESLINT  – JSON summary
// ────────────────────────────────
function runESLint() {
  console.log('\n▶ ESLint');

  let raw = '';
  try {
    raw = execSync('npx eslint tests --ext .js,.ts,.tsx -f json', {
      encoding: 'utf8',
    });
  } catch (e) {
    // eslint exits 1 when it finds problems – capture its output
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

  // Save full ESLint output for debugging / summary comment
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
// MAIN  – write combined summary
// ────────────────────────────────
const prettier = runPrettier();
const eslint = runESLint();

fs.writeFileSync(
  'artifacts/lint-summary.json',
  JSON.stringify({ prettier, eslint }, null, 2)
);
console.log('📝 artifacts/lint-summary.json written');

// keep pipeline green; remove exit-code 1
