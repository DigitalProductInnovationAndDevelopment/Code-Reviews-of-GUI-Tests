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
  
  // First, find files that need formatting
  let filesToFormat = [];
  try {
    execSync('npx prettier --check "tests/**/*.{js,ts,tsx,json}"', { stdio: 'pipe' });
  } catch (error) {
    const output = error.stdout?.toString() || '';
    const matches = output.match(/[^\s]+\.(js|ts|tsx|json)/g);
    if (matches) {
      filesToFormat = matches.filter(file => file.startsWith('tests/'));
    }
  }
  
  // If no files need formatting, return early
  if (filesToFormat.length === 0) {
    console.log('No files need formatting');
    return {
      filesWithIssues: 0,
      totalChanges: 0,
      files: [],
      sample: ''
    };
  }
  
  // Apply prettier formatting
  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });
  
  // Create a patch file directly with git
  const diff = execSync('git diff -- tests', { encoding: 'utf8' });
  const files = diff ? execSync('git diff --name-only -- tests', { encoding: 'utf8' }).split('\n').filter(Boolean) : [];
  const totalChanges = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;
  
  // Save the diff for debugging
  fs.writeFileSync(path.join(artifactsDir, 'prettier-diff.patch'), diff);

  if (diff && IS_PR) {
    console.log('Running reviewdog for Prettier...');
    
    // Try using temporary patch file with different reviewdog flags
    const reviewdogCmd = [
      'reviewdog',
      '-diff="git diff -- tests"',
      '-f=diff',
      '-name=prettier',
      '-reporter=github-pr-review',
      '-filter-mode=nofilter',
      '-level=warning',
      '-tee'
    ].join(' ');
    
    try {
      console.log(`Executing: ${reviewdogCmd}`);
      execSync(reviewdogCmd, { 
        stdio: 'inherit',
        env: {
          ...process.env,
          REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
        }
      });
    } catch (error) {
      console.error('Error running reviewdog with git diff:', error.message);
    }
  }
  
  // Reset git changes
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
  
  // Create a temporary directory for ESLint fixed files
  const eslintFixedDir = path.join(artifactsDir, 'eslint-fixed');
  if (!fs.existsSync(eslintFixedDir)) {
    fs.mkdirSync(eslintFixedDir, { recursive: true });
  }
  
  // Run ESLint and capture output
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
  
  // Run ESLint with --fix to create fixed versions of files
  if (files.size > 0 && IS_PR) {
    console.log('Creating fixed versions of files with ESLint issues...');
    
    // For each file with issues, create a fixed version
    for (const file of files) {
      try {
        const fileName = path.basename(file);
        const fixedContent = execSync(`npx eslint "${file}" --fix-dry-run --format=json`, { encoding: 'utf8' });
        const fixedResults = JSON.parse(fixedContent);
        
        if (fixedResults[0]?.output) {
          // Write the fixed content to the temp directory
          fs.writeFileSync(path.join(eslintFixedDir, fileName), fixedResults[0].output);
          
          // Create a diff between original and fixed file
          const diffCmd = `diff -u "${file}" "${path.join(eslintFixedDir, fileName)}" || true`;
          const diff = execSync(diffCmd, { encoding: 'utf8' });
          
          // Add file headers to make it a proper git diff
          const fileHeader = `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n`;
          const fullDiff = fileHeader + diff;
          
          // Save the diff for debugging
          fs.writeFileSync(path.join(artifactsDir, `eslint-${fileName}.patch`), fullDiff);
          
          // Run reviewdog on this diff
          if (fullDiff.includes('+') && fullDiff.includes('-')) {
            const reviewdogCmd = [
              'reviewdog',
              '-f=diff',
              '-name=eslint',
              '-reporter=github-pr-review',
              '-filter-mode=nofilter',
              '-level=warning'
            ].join(' ');
            
            const rd = spawnSync('reviewdog', [
              '-f=diff',
              '-name=eslint',
              '-reporter=github-pr-review',
              '-filter-mode=nofilter',
              '-level=warning'
            ], {
              input: fullDiff,
              stdio: ['pipe', 'inherit', 'inherit'],
              encoding: 'utf8',
              env: {
                ...process.env,
                REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
              }
            });
            
            if (rd.error) {
              console.error(`Error running reviewdog for ${file}:`, rd.error.message);
            }
          }
        }
      } catch (error) {
        console.error(`Error processing ${file}:`, error.message);
      }
    }
  }
  
  // Also run reviewdog with the standard ESLint JSON output
  if (raw && IS_PR) {
    console.log('Running reviewdog with ESLint JSON output...');
    
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
      console.error('Error running reviewdog with ESLint JSON:', rd.error.message);
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