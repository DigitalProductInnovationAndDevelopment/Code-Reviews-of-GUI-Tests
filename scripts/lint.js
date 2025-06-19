#!/usr/bin/env node
/**
 * Runs Prettier and ESLint, posts inline suggestions via reviewdog on PRs,
 * always writes artifacts/lint-summary.json.
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

const IS_PR =
  process.env.GITHUB_EVENT_NAME === 'pull_request' ||
  process.env.GITHUB_EVENT_NAME === 'pull_request_target';

const capture = cmd => execSync(cmd, { encoding: 'utf8' }).trim();

function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');
  // Write/fix in-place, get diff
  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });
  const diff = capture('git diff -- tests || true');
  const files = diff ? capture('git diff --name-only -- tests').split('\n').filter(Boolean) : [];
  const totalChanges = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;

  // Inline suggestions (only in PR context)
  if (diff && IS_PR) {
    const rd = spawnSync(
      'reviewdog',
      [
        '-f=diff',
        '-name=prettier',
        '-reporter=github-pr-suggest', // "Apply suggestion" button!
        '-filter-mode=nofilter',
        '-level=info',
        '-fail-on-error=false'
      ],
      { input: diff, stdio: ['pipe', 'inherit', 'inherit'], encoding: 'utf8' }
    );
    if (rd.error) throw rd.error;
  }
  execSync('git checkout -- .'); // Reset for next steps

  return {
    filesWithIssues: files.length,
    totalChanges,
    files,
    sample: diff.split('\n').slice(0, 20).join('\n')
  };
}

function runESLint() {
  console.log('\n▶ ESLint');
  let raw = '';
  try {
    raw = capture('npx eslint tests --ext .js,.ts,.tsx -f json');
  } catch (e) {
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

  if (raw && IS_PR) {
    const rd = spawnSync(
      'reviewdog',
      [
        '-f=eslint',
        '-name=eslint',
        '-reporter=github-pr-review',
        '-filter-mode=nofilter'
      ],
      { input: raw, stdio: ['pipe', 'inherit', 'inherit'], encoding: 'utf8' }
    );
    if (rd.error) throw rd.error;
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

const prettier = runPrettier();
const eslint = runESLint();

fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/lint-summary.json', JSON.stringify({ prettier, eslint }, null, 2));
console.log('📝 artifacts/lint-summary.json written');
