#!/usr/bin/env node
/**
 * Unified linter
 *   ▸ Runs Prettier and ESLint
 *   ▸ Sends diffs to reviewdog so inline “Apply suggestion” buttons appear
 *   ▸ Writes artifacts/lint-summary.json for the dashboard & PR comment
 */

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const IS_PR = process.env.GITHUB_EVENT_NAME === 'pull_request';
const capture = cmd => execSync(cmd, { encoding: 'utf8' }).trim();

/* ──────────────────────────  Prettier  ───────────────────────── */
function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');

  // 1. Format files in-place
  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });

  // 2. Diff with context so reviewdog can create code-suggestions
  const diff   = capture('git diff -- tests || true');
  const files  = diff ? capture('git diff --name-only -- tests').split('\n').filter(Boolean) : [];
  const totalChanges = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;

  // 3. Reviewdog suggestions (only on PRs)
  if (diff && IS_PR) {
    spawnSync(
      'reviewdog',
      ['-f=diff',
       '-name=prettier',
       '-reporter=github-pr-suggest',      // ← quick-fix buttons
       '-filter-mode=nofilter',
       '-tee',
       '-level=info',
       '-fail-on-error=false'],
      { input: diff, stdio: ['pipe', 'inherit', 'inherit'], encoding: 'utf8' }
    );
  }

  // 4. Clean working tree for later steps
  execSync('git checkout -- .');

  return {
    filesWithIssues: files.length,
    totalChanges,
    files,
    sample: diff.split('\n').slice(0, 20).join('\n')
  };
}

/* ──────────────────────────  ESLint  ─────────────────────────── */
function runESLint() {
  console.log('\n▶ ESLint');
  let raw = '';
  try {
    raw = capture('npx eslint tests --ext .js,.ts,.tsx -f json');
  } catch (e) {
    raw = e.stdout.toString();               // exit-1 → problems found
  }

  const results = raw ? JSON.parse(raw) : [];
  let errors = 0, warnings = 0, fixErr = 0, fixWarn = 0, first = '', files = new Set();

  results.forEach(f => {
    if (f.messages.length) files.add(path.basename(f.filePath));
    f.messages.forEach(m => {
      if (m.severity === 2) {
        errors++;
        if (m.fix) fixErr++;
        if (!first) first = `${m.ruleId || 'unknown-rule'} in ${path.basename(f.filePath)}:${m.line}`;
      } else if (m.severity === 1) {
        warnings++;
        if (m.fix) fixWarn++;
      }
    });
  });

  if (raw && IS_PR) {
    spawnSync(
      'reviewdog',
      ['-f=eslint',
       '-name=eslint',
       '-reporter=github-pr-review',
       '-filter-mode=nofilter',
       '-tee'],
      { input: raw, stdio: ['pipe', 'inherit', 'inherit'], encoding: 'utf8' }
    );
  }

  return {
    files: files.size,
    errors,
    warnings,
    fixableErrors: fixErr,
    fixableWarnings: fixWarn,
    first
  };
}

/* ───────────────────  Run both & write summary  ─────────────── */
const prettier = runPrettier();
const eslint   = runESLint();

fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync(
  'artifacts/lint-summary.json',
  JSON.stringify({ prettier, eslint }, null, 2)
);

console.log('📝 artifacts/lint-summary.json written');
