#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

const IS_PR =
  process.env.GITHUB_EVENT_NAME === 'pull_request' ||
  process.env.GITHUB_EVENT_NAME === 'pull_request_target';

function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');
  
  // Create artifacts directory if it doesn't exist
  fs.mkdirSync('artifacts', { recursive: true });
  
  // First check which files need formatting (without modifying)
  let filesToFormat = [];
  try {
    execSync('npx prettier --check "tests/**/*.{js,ts,tsx,json}"', { stdio: 'pipe' });
  } catch (error) {
    // This is expected - prettier exits with error if files need formatting
    const output = error.stdout?.toString() || '';
    // Extract list of files that need formatting
    const matches = output.match(/[^\s]+\.(js|ts|tsx|json)/g);
    if (matches) {
      filesToFormat = matches.filter(file => file.startsWith('tests/'));
    }
  }
  
  if (filesToFormat.length > 0) {
    console.log(`Found ${filesToFormat.length} files that need formatting`);
    
    // Format the files
    execSync(`npx prettier --write ${filesToFormat.join(' ')}`, { stdio: 'inherit' });
    
    // Generate diff using git
    const diff = execSync('git diff -- tests || true', { encoding: 'utf8' });
    const files = diff ? execSync('git diff --name-only -- tests', { encoding: 'utf8' }).split('\n').filter(Boolean) : [];
    const totalChanges = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;
    
    // Save diff for debugging and reviewdog
    fs.writeFileSync('artifacts/prettier-diff.txt', diff);
    
    if (diff && IS_PR) {
      // Show the version for debugging
      execSync('reviewdog -version', { stdio: 'inherit' });
      
      // Extract a limited number of changes to avoid GitHub annotation limits
      // First, create a more focused diff with just the first file
      if (files.length > 0) {
        const firstFile = files[0];
        console.log(`Creating focused diff for ${firstFile} to stay within GitHub limits...`);
        
        // Try to extract just the changes for the first file
        const fileDiff = execSync(`git diff -- "${firstFile}" || true`, { encoding: 'utf8' });
        
        // Further limit to first 8 hunks to stay within GitHub limits
        const limitedDiff = extractLimitedHunks(fileDiff, 8);
        fs.writeFileSync('artifacts/prettier-limited-diff.txt', limitedDiff);
        
        // Run reviewdog on the limited diff
        console.log('Running reviewdog with limited diff...');
        const rd = spawnSync(
          'reviewdog',
          [
            '-f=diff',
            '-name=prettier',
            '-reporter=github-pr-review',
            '-filter-mode=nofilter',
            '-level=info',
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
    }
    
    // Clean up git changes
    execSync('git checkout -- .'); 
    
    return {
      filesWithIssues: files.length,
      totalChanges,
      files,
      sample: diff.split('\n').slice(0, 20).join('\n')
    };
  } else {
    console.log('No Prettier formatting issues found');
    return {
      filesWithIssues: 0,
      totalChanges: 0,
      files: [],
      sample: ''
    };
  }
}

function extractLimitedHunks(diff, maxHunks) {
  // Split the diff into lines
  const lines = diff.split('\n');
  
  let result = [];
  let currentHunk = 0;
  let inHunk = false;
  let hunkHeader = false;
  
  // Add the diff header lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Add all diff header lines
    if (line.startsWith('diff ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      result.push(line);
      continue;
    }
    
    // Detect hunk header
    if (line.startsWith('@@')) {
      inHunk = true;
      hunkHeader = true;
      currentHunk++;
    }
    
    // If we're in a hunk and haven't reached the max, add the line
    if (inHunk && currentHunk <= maxHunks) {
      result.push(line);
    }
    
    // Reset hunk header flag after adding the header
    if (hunkHeader) {
      hunkHeader = false;
    }
    
    // If we've hit a new hunk header and we're already at max, break
    if (currentHunk > maxHunks && !hunkHeader) {
      inHunk = false;
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
  
  // Create artifacts directory if it doesn't exist
  fs.mkdirSync('artifacts', { recursive: true });
  
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
    
    // Limit ESLint results to avoid GitHub annotation limits
    let limitedResults = [];
    if (results.length > 0) {
      // Take the first file with issues
      const firstFileWithIssues = results.find(f => f.messages.length > 0);
      if (firstFileWithIssues) {
        // Limit to first 8 messages
        const limitedMessages = firstFileWithIssues.messages.slice(0, 8);
        limitedResults = [
          {
            ...firstFileWithIssues,
            messages: limitedMessages
          }
        ];
        
        // Save limited results
        fs.writeFileSync('artifacts/eslint-limited-results.json', JSON.stringify(limitedResults));
        
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
            input: JSON.stringify(limitedResults), 
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