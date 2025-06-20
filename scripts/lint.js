#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

const IS_PR =
  process.env.GITHUB_EVENT_NAME === 'pull_request' ||
  process.env.GITHUB_EVENT_NAME === 'pull_request_target';

function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');
  
  // Format files with Prettier (KEEP THIS EXACTLY THE SAME)
  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });
  
  // Generate diff using git (KEEP THIS EXACTLY THE SAME)
  const diff = execSync('git diff -- tests || true', { encoding: 'utf8' });
  const files = diff ? execSync('git diff --name-only -- tests', { encoding: 'utf8' }).split('\n').filter(Boolean) : [];
  const totalChanges = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;

  // Save diff for debugging
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/prettier-diff.txt', diff);
  
  if (diff && IS_PR) {
    // Show the version for debugging
    execSync('reviewdog -version', { stdio: 'inherit' });
    
    // Extract a limited diff to avoid GitHub annotation limits
    const limitedDiff = limitDiffHunks(diff, 50);
    fs.writeFileSync('artifacts/prettier-limited-diff.txt', limitedDiff);
    
    // Use the limited diff with reviewdog
    console.log('Running reviewdog with limited diff...');
    const rd = spawnSync(
      'reviewdog',
      [
        '-f=diff',
        '-name=prettier',
        '-reporter=github-pr-review',
        '-filter-mode=diff_context',  // Use the same filter mode as before
        '-level=warning',
        '-fail-on-error=false'
      ],
      { 
        input: limitedDiff, 
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
  
  // Clean up git changes
  execSync('git checkout -- .'); 

  return {
    filesWithIssues: files.length,
    totalChanges,
    files,
    sample: diff.split('\n').slice(0, 20).join('\n')
  };
}

// Function to limit the number of hunks in a diff
function limitDiffHunks(diff, maxHunks) {
  if (!diff) return '';
  
  const lines = diff.split('\n');
  const result = [];
  let hunkCount = 0;
  let inHeader = true;  // Track if we're in the header section
  
  for (const line of lines) {
    // Always include diff header lines
    if (inHeader) {
      result.push(line);
      // When we hit a hunk header, we're no longer in the header section
      if (line.startsWith('@@')) {
        inHeader = false;
        hunkCount++;
      }
      continue;
    }
    
    // If we find a new hunk header
    if (line.startsWith('@@')) {
      hunkCount++;
      // If we've reached our limit, stop adding lines
      if (hunkCount > maxHunks) {
        break;
      }
    }
    
    // Add the line if we're still within our hunk limit
    if (hunkCount <= maxHunks) {
      result.push(line);
    }
  }
  
  return result.join('\n');
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
    // Save the full ESLint results
    fs.writeFileSync('artifacts/eslint-results.json', raw);
    
    // Limit ESLint results to avoid GitHub annotation limits
    let limitedResults = [];
    if (results.length > 0) {
      // Process each file but limit messages
      limitedResults = results.map(file => {
        // For each file, limit to the first 5 messages
        const limitedMessages = file.messages.slice(0, 5);
        return {
          ...file,
          messages: limitedMessages
        };
      });
      
      // Further limit to the first 2 files
      limitedResults = limitedResults.slice(0, 2);
      
      // Save limited results
      const limitedJson = JSON.stringify(limitedResults);
      fs.writeFileSync('artifacts/eslint-limited-results.json', limitedJson);
      
      // Run reviewdog on limited results
      console.log('Running reviewdog with limited ESLint results...');
      const rd = spawnSync(
        'reviewdog',
        [
          '-f=eslint',
          '-name=eslint',
          '-reporter=github-pr-review',
          '-filter-mode=nofilter',
          '-level=warning',
          '-fail-on-error=false'
        ],
        { 
          input: limitedJson, 
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