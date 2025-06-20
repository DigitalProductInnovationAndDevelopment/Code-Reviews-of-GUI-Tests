#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

const IS_PR =
  process.env.GITHUB_EVENT_NAME === 'pull_request' ||
  process.env.GITHUB_EVENT_NAME === 'pull_request_target';

function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');
  
  // Format files with Prettier (this is your original approach)
  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });
  
  // Generate diff using git (this is your original approach)
  const diff = execSync('git diff -- tests || true', { encoding: 'utf8' });
  const files = diff ? execSync('git diff --name-only -- tests', { encoding: 'utf8' }).split('\n').filter(Boolean) : [];
  const totalChanges = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;

  // Save diff for debugging
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/prettier-diff.txt', diff);
  
  if (diff && IS_PR) {
    // Show the version for debugging
    execSync('reviewdog -version', { stdio: 'inherit' });
    
    // CRITICAL FIX: Use github-pr-review instead of github-pr-suggest
    // And ensure the diff is passed correctly to reviewdog
    console.log('Running reviewdog with diff...');
    const rd = spawnSync(
      'reviewdog',
      [
        '-f=diff',
        '-name=prettier',
        '-reporter=github-pr-review', // This is the key change
        '-filter-mode=nofilter',
        '-level=info',
        '-fail-on-error=false'
      ],
      { 
        input: diff, 
        stdio: ['pipe', 'inherit', 'inherit'], 
        encoding: 'utf8',
        env: {
          ...process.env,
          REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
        }
      }
    );
    
    if (rd.error) {
      console.error('Reviewdog error:', rd.error);
    }
    
    // Also try the direct pipe approach
    try {
      console.log('Trying alternative reviewdog approach...');
      execSync(`cat artifacts/prettier-diff.txt | reviewdog -f=diff -name=prettier -reporter=github-pr-review -filter-mode=nofilter`, {
        stdio: 'inherit',
        env: {
          ...process.env,
          REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
        }
      });
    } catch (error) {
      console.error('Alternative reviewdog approach error:', error.message);
    }
  }
  
  // Clean up git changes
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
    // Save the ESLint results for debugging
    fs.writeFileSync('artifacts/eslint-results.json', raw);
    
    // Run reviewdog with ESLint results
    const rd = spawnSync(
      'reviewdog',
      [
        '-f=eslint',
        '-name=eslint',
        '-reporter=github-pr-review', // Make sure this is github-pr-review not github-pr-suggest
        '-filter-mode=nofilter'
      ],
      { 
        input: raw, 
        stdio: ['pipe', 'inherit', 'inherit'], 
        encoding: 'utf8',
        env: {
          ...process.env,
          REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
        }
      }
    );
    
    if (rd.error) {
      console.error('Error running reviewdog for ESLint:', rd.error.message);
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