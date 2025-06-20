#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const IS_PR =
  process.env.GITHUB_EVENT_NAME === 'pull_request' ||
  process.env.GITHUB_EVENT_NAME === 'pull_request_target';

// Create artifacts directory if it doesn't exist
const artifactsDir = path.join(process.cwd(), 'artifacts');
if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

function runPrettier() {
  console.log('\n▶ Prettier (check → generate suggestions → reviewdog)');
  
  // Step 1: First check which files need formatting
  let filesToFormat = [];
  try {
    execSync('npx prettier --check "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });
  } catch (error) {
    // Prettier found files that need formatting
    const output = error.stdout?.toString() || '';
    
    // Extract the files that need formatting
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
  
  // Step 2: For each file that needs formatting, generate a diff with suggestions
  let allDiffs = '';
  let totalChanges = 0;
  
  for (const file of filesToFormat) {
    // Create a temporary formatted file
    const formattedContent = execSync(`npx prettier "${file}"`, { encoding: 'utf8' });
    const originalContent = fs.readFileSync(file, 'utf8');
    
    // Only proceed if there are actual changes
    if (formattedContent !== originalContent) {
      // Write the formatted content to a temporary file
      const tempFile = path.join(artifactsDir, `${path.basename(file)}.formatted`);
      fs.writeFileSync(tempFile, formattedContent);
      
      // Generate a diff between the original and formatted file
      const diff = execSync(`diff -u "${file}" "${tempFile}" || true`, { encoding: 'utf8' });
      
      // Count the changes
      const changes = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;
      totalChanges += changes;
      
      // Add file header to the diff
      const fileHeader = `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n`;
      allDiffs += fileHeader + diff;
    }
  }
  
  // Step 3: Send the diff to reviewdog if in PR mode
  if (allDiffs && IS_PR) {
    // Save the diff to a file for debugging
    fs.writeFileSync(path.join(artifactsDir, 'prettier-diff.patch'), allDiffs);
    
    console.log('Running Prettier diff through reviewdog...');
    execSync('reviewdog -version', { stdio: 'inherit' }); // Shows actual version used!
    
    const rd = spawnSync(
      'reviewdog',
      [
        '-f=diff',
        '-name=prettier',
        '-reporter=github-pr-review',
        '-filter-mode=nofilter',
        '-level=info',
        '-diff="cat artifacts/prettier-diff.patch"' // Use the saved diff file
      ],
      { 
        stdio: ['inherit', 'inherit', 'inherit'],
        env: {
          ...process.env,
          REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
        }
      }
    );
    
    if (rd.error) {
      console.error('Reviewdog error:', rd.error);
    }
    
    // Alternative approach: pipe the diff directly to reviewdog
    const rd2 = spawnSync(
      'reviewdog',
      [
        '-f=diff',
        '-name=prettier',
        '-reporter=github-pr-review',
        '-filter-mode=nofilter',
        '-level=info'
      ],
      { 
        input: allDiffs,
        stdio: ['pipe', 'inherit', 'inherit'],
        encoding: 'utf8',
        env: {
          ...process.env,
          REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
        }
      }
    );
    
    if (rd2.error) {
      console.error('Reviewdog (direct pipe) error:', rd2.error);
    }
  }
  
  return {
    filesWithIssues: filesToFormat.length,
    totalChanges,
    files: filesToFormat,
    sample: allDiffs.split('\n').slice(0, 20).join('\n')
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
    // Save ESLint results to a file for debugging
    fs.writeFileSync(path.join(artifactsDir, 'eslint-results.json'), raw);
    
    console.log('Running ESLint through reviewdog...');
    
    // Run ESLint with --fix-dry-run to get fix suggestions
    let eslintWithFixes;
    try {
      eslintWithFixes = execSync('npx eslint tests --ext .js,.ts,.tsx -f json --fix-dry-run', { encoding: 'utf8' });
      // Save the fixed results for debugging
      fs.writeFileSync(path.join(artifactsDir, 'eslint-with-fixes.json'), eslintWithFixes);
    } catch (e) {
      eslintWithFixes = e.stdout?.toString() || '';
      if (eslintWithFixes) {
        fs.writeFileSync(path.join(artifactsDir, 'eslint-with-fixes.json'), eslintWithFixes);
      }
    }
    
    const rd = spawnSync(
      'reviewdog',
      [
        '-f=eslint',
        '-name=eslint',
        '-reporter=github-pr-review',
        '-filter-mode=nofilter',
        '-level=info',
        '-fail-on-error=false'
      ],
      { 
        input: eslintWithFixes || raw,
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