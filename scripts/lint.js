#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

const IS_PR =
  process.env.GITHUB_EVENT_NAME === 'pull_request' ||
  process.env.GITHUB_EVENT_NAME === 'pull_request_target';

// Create artifacts directory if it doesn't exist
fs.mkdirSync('artifacts', { recursive: true });

function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');
  
  // Format files with Prettier
  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });
  
  // Generate diff using git
  const diff = execSync('git diff -- tests || true', { encoding: 'utf8' });
  const files = diff ? execSync('git diff --name-only -- tests', { encoding: 'utf8' }).split('\n').filter(Boolean) : [];
  const totalChanges = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;

  // Write diff to file for debugging
  if (diff) {
    fs.writeFileSync('artifacts/prettier-diff.txt', diff);
  }

  // Send to reviewdog if in PR mode and we have changes
  if (diff && IS_PR) {
    console.log('Running reviewdog for Prettier...');
    // Show the version for debugging
    execSync('reviewdog -version', { stdio: 'inherit' });
    
    // CRITICAL FIX: Use github-pr-review instead of github-pr-suggest
    const rd = spawnSync(
      'reviewdog',
      [
        '-f=diff',
        '-name=prettier',
        '-reporter=github-pr-review', // Changed from github-pr-suggest to github-pr-review
        '-filter-mode=nofilter',
        '-level=info',
        '-fail-on-error=false',
      ],
      { 
        input: diff, 
        stdio: ['pipe', 'inherit', 'inherit'], 
        encoding: 'utf8',
        env: {
          ...process.env,
          // Ensure both token variables are set
          REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
        }
      }
    );
    
    if (rd.error) {
      console.error('Reviewdog error:', rd.error.message);
    }
  }
  
  // Clean up git changes so they don't affect other steps
  execSync('git checkout -- .'); 

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
  
  // Write ESLint output to file for debugging
  if (raw) {
    fs.writeFileSync('artifacts/eslint-results.json', raw);
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
    console.log('Running reviewdog for ESLint...');
    
    // CRITICAL FIX: Use github-pr-review instead of github-pr-review
    const rd = spawnSync(
      'reviewdog',
      [
        '-f=eslint',
        '-name=eslint',
        '-reporter=github-pr-review',
        '-filter-mode=nofilter',
        '-fail-on-error=false'
      ],
      { 
        input: raw, 
        stdio: ['pipe', 'inherit', 'inherit'], 
        encoding: 'utf8',
        env: {
          ...process.env,
          // Ensure both token variables are set
          REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
        }
      }
    );
    
    if (rd.error) {
      console.error('Reviewdog error:', rd.error.message);
    }
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

fs.writeFileSync('artifacts/lint-summary.json', JSON.stringify({ prettier, eslint }, null, 2));
console.log('📝 artifacts/lint-summary.json written');