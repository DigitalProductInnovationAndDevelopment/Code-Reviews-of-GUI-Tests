#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

const IS_PR =
  process.env.GITHUB_EVENT_NAME === 'pull_request' ||
  process.env.GITHUB_EVENT_NAME === 'pull_request_target';

// Debug environment
console.log('Environment Debug:');
console.log('- GITHUB_EVENT_NAME:', process.env.GITHUB_EVENT_NAME);
console.log('- IS_PR:', IS_PR);
console.log('- GITHUB_TOKEN exists:', !!process.env.GITHUB_TOKEN);
console.log('- REVIEWDOG_GITHUB_API_TOKEN exists:', !!process.env.REVIEWDOG_GITHUB_API_TOKEN);
console.log('- GITHUB_HEAD_REF:', process.env.GITHUB_HEAD_REF);
console.log('- GITHUB_BASE_REF:', process.env.GITHUB_BASE_REF);

function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');
  
  // Format files with Prettier
  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });
  
  // Generate diff using git
  const diff = execSync('git diff -- tests || true', { encoding: 'utf8' });
  const files = diff ? execSync('git diff --name-only -- tests', { encoding: 'utf8' }).split('\n').filter(Boolean) : [];
  const totalChanges = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;

  console.log(`- Files with changes: ${files.length}`);
  console.log(`- Total line changes: ${totalChanges}`);

  // Save diff for debugging
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/prettier-diff.txt', diff);
  fs.writeFileSync('artifacts/prettier-diff-size.txt', `Diff size: ${diff.length} bytes\nTotal changes: ${totalChanges}\nFiles: ${files.length}`);
  
  if (diff && IS_PR) {
    // Show the version for debugging
    console.log('\nReviewdog version:');
    execSync('reviewdog -version', { stdio: 'inherit' });
    
    // Increase the limit significantly - GitHub can handle up to 50 annotations per step
    const limitedDiff = limitDiffHunks(diff, 40); // Increased from 8 to 40
    fs.writeFileSync('artifacts/prettier-limited-diff.txt', limitedDiff);
    
    // Count hunks in original vs limited diff
    const originalHunks = (diff.match(/^@@/gm) || []).length;
    const limitedHunks = (limitedDiff.match(/^@@/gm) || []).length;
    console.log(`- Original hunks: ${originalHunks}`);
    console.log(`- Limited hunks: ${limitedHunks}`);
    
    // Run reviewdog
    console.log('Running reviewdog with limited diff...');
    const rd = spawnSync(
      'reviewdog',
      [
        '-f=diff',
        '-name=prettier',
        '-reporter=github-pr-review',
        '-filter-mode=nofilter',  // Changed from diff_context to nofilter
        '-level=warning',
        '-fail-on-error=false',
        '-tee'  // Also output to stdout for debugging
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
    
    console.log(`- Reviewdog exit code: ${rd.status}`);
    if (rd.error) {
      console.error('Reviewdog error:', rd.error);
    }
    
    // Try alternative reporter if main one fails
    if (rd.status !== 0) {
      console.log('\nTrying github-check reporter as fallback...');
      const rd2 = spawnSync(
        'reviewdog',
        [
          '-f=diff',
          '-name=prettier-check',
          '-reporter=github-check',
          '-filter-mode=nofilter',
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
      console.log(`- Fallback exit code: ${rd2.status}`);
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
  let currentFile = null;
  
  for (const line of lines) {
    // Track file headers
    if (line.startsWith('diff --git')) {
      currentFile = line;
      result.push(line);
      continue;
    }
    
    // Always include file headers
    if (line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
      result.push(line);
      continue;
    }
    
    // Count and limit hunks
    if (line.startsWith('@@')) {
      hunkCount++;
      if (hunkCount > maxHunks) {
        // Add a comment indicating truncation
        if (hunkCount === maxHunks + 1) {
          result.push(`... (${hunkCount - maxHunks} more hunks truncated to avoid GitHub annotation limits)`);
        }
        continue;
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

  console.log(`- Files with issues: ${files.size}`);
  console.log(`- Total errors: ${errors}`);
  console.log(`- Total warnings: ${warnings}`);

  if (raw && IS_PR) {
    // Save the full ESLint results
    fs.writeFileSync('artifacts/eslint-results.json', raw);
    
    // Limit ESLint results - increase limits
    let limitedResults = [];
    if (results.length > 0) {
      // Process each file but limit messages
      limitedResults = results.map(file => {
        // For each file, limit to the first 10 messages (increased from 5)
        const limitedMessages = file.messages.slice(0, 10);
        return {
          ...file,
          messages: limitedMessages,
          warningCount: file.messages.filter(m => m.severity === 1).length,
          errorCount: file.messages.filter(m => m.severity === 2).length,
          fixableErrorCount: file.messages.filter(m => m.severity === 2 && m.fix).length,
          fixableWarningCount: file.messages.filter(m => m.severity === 1 && m.fix).length
        };
      });
      
      // Increase file limit to 10 (from 2)
      limitedResults = limitedResults.slice(0, 10);
      
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
          '-fail-on-error=false',
          '-tee'
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
      
      console.log(`- ESLint reviewdog exit code: ${rd.status}`);
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

// Run both linters
console.log('\n========== Starting Lint Process ==========');
const prettier = runPrettier();
const eslint = runESLint();

// Write summary
const summary = {
  prettier,
  eslint,
  metadata: {
    timestamp: new Date().toISOString(),
    isPR: IS_PR,
    eventName: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF
  }
};

fs.writeFileSync('artifacts/lint-summary.json', JSON.stringify(summary, null, 2));
console.log('\n📝 artifacts/lint-summary.json written');