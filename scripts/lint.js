#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const IS_PR =
  process.env.GITHUB_EVENT_NAME === 'pull_request' ||
  process.env.GITHUB_EVENT_NAME === 'pull_request_target';

// Create artifacts directory if it doesn't exist
const artifactsDir = 'artifacts';
if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');
  
  // First, check which files need formatting
  console.log('Checking which files need formatting...');
  let checkOutput = '';
  try {
    checkOutput = execSync('npx prettier --check "tests/**/*.{js,ts,tsx,json}"', { 
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8'
    });
    console.log(checkOutput);
    console.log('No files need formatting according to Prettier');
    
    // Even if prettier says no issues, let's still try to format files
    // This is to handle any potential issues with the check command
    console.log('Still attempting to format files just in case...');
  } catch (error) {
    // This is expected - Prettier exits with error if files need formatting
    checkOutput = error.stdout?.toString() || '';
    console.log('Prettier found files that need formatting:');
    console.log(checkOutput);
  }
  
  // Format files with Prettier and capture any output
  console.log('Applying Prettier formatting...');
  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });
  
  // Generate a git diff and capture it
  console.log('Generating git diff...');
  const diff = execSync('git diff -- "tests/**/*.{js,ts,tsx,json}"', { encoding: 'utf8' });
  
  // If we have a diff, write it to a file for debugging
  if (diff) {
    fs.writeFileSync(path.join(artifactsDir, 'prettier-diff.patch'), diff);
    console.log(`Diff saved to ${path.join(artifactsDir, 'prettier-diff.patch')}`);
    console.log(`Diff length: ${diff.length} characters`);
    
    // Get the list of changed files
    const files = execSync('git diff --name-only -- "tests/**/*.{js,ts,tsx,json}"', { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    
    console.log('Changed files:');
    files.forEach(file => console.log(`- ${file}`));
    
    if (IS_PR) {
      // Try multiple approaches to get reviewdog to work
      
      // Approach 1: Use a temporary file
      console.log('Running reviewdog with diff file...');
      try {
        const reviewdogCmd = `reviewdog -f=diff -name=prettier -reporter=github-pr-review -filter-mode=nofilter -level=warning`;
        const rd = spawnSync('reviewdog', [
          '-f=diff',
          '-name=prettier',
          '-reporter=github-pr-review',
          '-filter-mode=nofilter',
          '-level=warning'
        ], {
          input: diff,
          stdio: ['pipe', 'inherit', 'inherit'],
          encoding: 'utf8',
          env: {
            ...process.env,
            REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
          }
        });
        
        if (rd.error) {
          console.error('Error running reviewdog (Approach 1):', rd.error);
        } else {
          console.log('Reviewdog (Approach 1) completed with status:', rd.status);
        }
      } catch (error) {
        console.error('Exception running reviewdog (Approach 1):', error);
      }
      
      // Approach 2: Use command substitution with git diff
      console.log('Running reviewdog with git diff command...');
      try {
        execSync(`git diff -- "tests/**/*.{js,ts,tsx,json}" | reviewdog -f=diff -name=prettier -reporter=github-pr-review -filter-mode=nofilter -level=warning`, {
          stdio: 'inherit',
          env: {
            ...process.env,
            REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
          }
        });
      } catch (error) {
        console.error('Error running reviewdog (Approach 2):', error.message);
      }
    }
  } else {
    console.log('No changes detected after running Prettier');
  }
  
  // Clean up git changes
  console.log('Cleaning up git changes...');
  execSync('git checkout -- .');
  
  // Return information about what we found
  return {
    filesWithIssues: diff ? (diff.match(/^diff --git/gm) || []).length : 0,
    totalChanges: diff ? (diff.match(/^[+-](?![+-]{3})/gm) || []).length : 0,
    files: diff ? execSync('git diff --name-only -- "tests/**/*.{js,ts,tsx,json}"', { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean) : [],
    sample: diff ? diff.split('\n').slice(0, 20).join('\n') : ''
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
  
  // Save the ESLint results for debugging
  if (raw) {
    fs.writeFileSync(path.join(artifactsDir, 'eslint-results.json'), raw);
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
    console.log('Running reviewdog with ESLint results...');
    
    const rd = spawnSync(
      'reviewdog',
      [
        '-f=eslint',
        '-name=eslint',
        '-reporter=github-pr-review',
        '-filter-mode=nofilter',
        '-level=warning'
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
    } else {
      console.log('Reviewdog completed for ESLint with status:', rd.status);
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

fs.writeFileSync(path.join(artifactsDir, 'lint-summary.json'), JSON.stringify({ prettier, eslint }, null, 2));
console.log('📝 artifacts/lint-summary.json written');