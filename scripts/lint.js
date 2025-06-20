#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

const IS_PR =
  process.env.GITHUB_EVENT_NAME === 'pull_request' ||
  process.env.GITHUB_EVENT_NAME === 'pull_request_target';

function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');
  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });
  const diff = execSync('git diff -- tests || true', { encoding: 'utf8' });
  const files = diff ? execSync('git diff --name-only -- tests', { encoding: 'utf8' }).split('\n').filter(Boolean) : [];
  const totalChanges = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;

  if (diff && IS_PR) {
    execSync('reviewdog -version', { stdio: 'inherit' }); // Shows actual version used!
    const rd = spawnSync(
      'reviewdog',
      [
        '-f=diff',
        '-name=prettier',
        '-reporter=github-pr-suggest', // ← must be "="
        '-filter-mode=nofilter',
        '-level=info',
        '-fail-on-error=false'
      ],
      { input: diff, stdio: ['pipe', 'inherit', 'inherit'], encoding: 'utf8' }
    );
    if (rd.error) throw rd.error;
  }
  execSync('git checkout -- .'); // Clean up for next steps

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
    raw = execSync('npx eslint tests --ext .js,.ts,.tsx -f json', { encoding: 'utf8' });
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
