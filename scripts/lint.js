#!/usr/bin/env node
/**
 * Generates artifacts/lint-summary.json (plus prettier-diff.txt & eslint-results.json)
 * No Reviewdog calls and ALWAYS exits 0 so the pipeline keeps going.
 */
const { execSync } = require('child_process');
const fs = require('fs');

// ────────────────  PRETTIER  ────────────────
function runPrettier() {
  console.log('\n▶ Prettier (list → write → diff)');

  // 1️⃣ list files that need work
  let list = '';
  try {
    list = execSync(
      'npx prettier --list-different "tests/**/*.{js,ts,tsx,json}"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
  } catch (e) {
    // prettier exits 1 when it finds unformatted files
    list = (e.stdout || '') + (e.stderr || '');
  }
  const files = list.split(/\r?\n/).filter(Boolean);

  // 2️⃣ rewrite them so we can build a sample diff
  let diff = '';
  let totalChanges = 0;
  if (files.length) {
    execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', {
      stdio: 'inherit',
    });
    diff = execSync('git diff -- tests', { encoding: 'utf8' });
    totalChanges = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;

    fs.mkdirSync('artifacts', { recursive: true });
    fs.writeFileSync('artifacts/prettier-diff.txt', diff);

    // keep the working tree clean for later steps
    execSync('git checkout -- .');
  }

  return {
    filesWithIssues: files.length,
    totalChanges,
    files,
    sample: diff.split('\n').slice(0, 20).join('\n'),
  };
}

// ────────────────  ESLINT  ────────────────
function runESLint() {
  console.log('\n▶ ESLint');

  let raw = '';
  try {
    raw = execSync(
      'npx eslint tests --ext .js,.ts,.tsx -f json',
      { encoding: 'utf8' }
    );
  } catch (e) {
    // eslint exits 1 when it finds problems
    raw = e.stdout?.toString() || '';
  }

  const results = raw ? JSON.parse(raw) : [];
  let errors = 0,
      warnings = 0,
      fixErr = 0,
      fixWarn = 0,
      first = '',
      files = new Set();

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

// ────────────────  MAIN  ────────────────
const prettier = runPrettier();
const eslint   = runESLint();

fs.writeFileSync(
  'artifacts/lint-summary.json',
  JSON.stringify({ prettier, eslint }, null, 2)
);
console.log('📝  artifacts/lint-summary.json written');

// Never fail the job
process.exit(0);
