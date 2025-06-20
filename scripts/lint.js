#!/usr/bin/env node
/*  Lint summary generator  —  no Reviewdog calls
    1. Ask Prettier which files are off (`--list-different`)
    2. Rewrite them so we can capture an illustrative diff
    3. Run ESLint and collect its JSON
    4. Emit artifacts/lint-summary.json for summary-comment.js
*/
const { execSync } = require('child_process');
const fs   = require('fs');

// ────────────────────────────────
// PRETTIER
// ────────────────────────────────
function runPrettier() {
  console.log('\n▶ Prettier (list → write → diff)');

  // ➊ Get the list WITHOUT rewriting so we know the real count
  let listOutput = '';
  try {
    listOutput = execSync(
      'npx prettier --list-different "tests/**/*.{js,ts,tsx,json}"',
      { encoding: 'utf8' }
    );
  } catch (e) {
    // non-zero exit means “files differ” – capture the list
    listOutput = e.stdout?.toString() || '';
  }
  const files = listOutput.split('\n').filter(Boolean);

  // ➋ If anything needs fixing, rewrite it so we can show a diff
  let diff = '';
  let totalChanges = 0;
  if (files.length) {
    execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', {
      stdio: 'inherit',
    });

    diff = execSync('git diff -- tests', { encoding: 'utf8' });
    totalChanges = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;

    // save a sample diff for debugging
    fs.mkdirSync('artifacts', { recursive: true });
    fs.writeFileSync('artifacts/prettier-diff.txt', diff);

    // restore the working tree so later steps run on clean code
    execSync('git checkout -- .');
  }

  return {
    filesWithIssues: files.length,
    totalChanges,
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
    // eslint exits 1 when problems are found – capture its JSON
    raw = e.stdout?.toString() || '';
  }

  const results = raw ? JSON.parse(raw) : [];

  let errors = 0,
      warnings = 0,
      fixErr = 0,
      fixWarn = 0,
      first   = '',
      files   = new Set();

  results.forEach(f => {
    if (f.messages.length) files.add(f.filePath);
    f.messages.forEach(m => {
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

  fs.writeFileSync('artifacts/eslint-results.json', raw);

  return { files: files.size, errors, warnings, fixableErrors: fixErr,
           fixableWarnings: fixWarn, first };
}

// ────────────────────────────────
// MAIN
// ────────────────────────────────
const prettier = runPrettier();
const eslint   = runESLint();

fs.writeFileSync(
  'artifacts/lint-summary.json',
  JSON.stringify({ prettier, eslint }, null, 2)
);
console.log('📝  artifacts/lint-summary.json written');

// Always exit 0 so the pipeline continues
process.exit(0);
