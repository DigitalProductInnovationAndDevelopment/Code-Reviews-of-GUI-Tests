#!/usr/bin/env node
/**
 * Unified linter
 *   · Prettier → reviewdog + filenames + first-20-line diff sample + totalChanges
 *   · ESLint   → reviewdog + first error / warning counts
 *   · ALWAYS writes artifacts/lint-summary.json
 *
 * Inline comments appear only on pull-request events; the workflow guards for that.
 */

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const capture = cmd => execSync(cmd, { encoding: 'utf8' }).trim();

/* ── Prettier ─────────────────────────────────────────────── */
function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');

  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });

  const diff   = capture('git diff -U0 -- tests || true');
  const files  = diff ? capture('git diff --name-only -- tests').split('\n').filter(Boolean) : [];
  const totalChanges = (diff.match(/^[+-](?![+-]{3})/gm) || []).length; // count +/- lines (ignore headers)

  if (diff) {
    spawnSync(
      'reviewdog',
      ['-f=diff', '-name=prettier', '-reporter=github-pr-review',
       '-level=info', '-fail-on-error=false'],
      { input: diff, stdio: ['pipe','inherit','inherit'], encoding: 'utf8' }
    );
  } else {
    console.log('✓ Prettier: nothing to fix');
  }

  execSync('git checkout -- .');              // leave tree clean

  return {
    filesWithIssues: files.length,
    totalChanges,
    files,
    sample: diff.split('\n').slice(0, 20).join('\n')
  };
}

/* ── ESLint ───────────────────────────────────────────────── */
function runESLint() {
  console.log('\n▶ ESLint');
  let raw = '';
  try {
    raw = capture('npx eslint tests --ext .js,.ts,.tsx -f json');
  } catch (e) {
    raw = e.stdout.toString();                // exit-1 indicates problems found
  }

  const results = raw ? JSON.parse(raw) : [];
  let errors = 0, warnings = 0, first = '', uniqueFiles = new Set();

  results.forEach(f => {
    if (f.messages.length) uniqueFiles.add(path.basename(f.filePath));
    for (const m of f.messages) {
      if (m.severity === 2) {
        errors++;
        if (!first) first = `${m.ruleId || 'unknown-rule'} in ${path.basename(f.filePath)}:${m.line}`;
      } else if (m.severity === 1) {
        warnings++;
      }
    }
  });

  if (results.length) {
    spawnSync(
      'reviewdog',
      ['-f=eslint', '-name=eslint', '-reporter=github-pr-review'],
      { input: raw, stdio: ['pipe','inherit','inherit'], encoding: 'utf8' }
    );
  } else {
    console.log('✓ ESLint: clean');
  }

  return { files: uniqueFiles.size, errors, warnings, first };
}

/* ── run & ALWAYS write summary artefact ─────────────────── */
let prettierSummary = { filesWithIssues: 0, totalChanges: 0, files: [], sample: '' };
let eslintSummary   = { files: 0, errors: 0, warnings: 0, first: '' };

try {
  prettierSummary = runPrettier();
  eslintSummary   = runESLint();
} finally {
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync(
    'artifacts/lint-summary.json',
    JSON.stringify({ prettier: prettierSummary, eslint: eslintSummary }, null, 2)
  );
  console.log('📝 artifacts/lint-summary.json written');
}
