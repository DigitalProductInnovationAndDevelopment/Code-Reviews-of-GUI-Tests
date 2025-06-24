#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

const IS_PR =
  process.env.GITHUB_EVENT_NAME === 'pull_request' ||
  process.env.GITHUB_EVENT_NAME === 'pull_request_target';

const HAS_REVIEWDOG_TOKEN = process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN;

// Helper function to split large hunks into smaller ones for Apply suggestions
function splitLargeHunksForSuggestions(diff) {
  const lines = diff.split('\n');
  const result = [];
  let currentFileHeader = [];
  let changes = [];
  let lineNumber = 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('diff --git ')) {
      // New file - process previous file's changes first
      if (changes.length > 0) {
        result.push(...createSmallHunks(currentFileHeader, changes));
      }
      
      // Start new file
      currentFileHeader = [line];
      changes = [];
      lineNumber = 1;
      continue;
    }
    
    if (line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')){
      currentFileHeader.push(line);
      continue;
    }
    
    if (line.startsWith('@@')) {
      // Skip original hunk header - we'll create our own smaller ones
      continue;
    }
    
    // Collect actual changes
    if (line.startsWith('-') || line.startsWith('+') || line.startsWith(' ')) {
      changes.push({line, originalLineNum: lineNumber});
      if (!line.startsWith('+')) lineNumber++;
    }
  }
  
  // Process the last file
  if (changes.length > 0) {
    result.push(...createSmallHunks(currentFileHeader, changes));
  }
  
  return result.join('\n');
}

// Create small hunks (max 8 lines each) that work with diff_context
function createSmallHunks(fileHeader, changes) {
  const result = [...fileHeader];
  const chunkSize = 6; // Small chunks for Apply suggestions
  let hunkCount = 0;
  
  for (let i = 0; i < changes.length && hunkCount < 20; i += chunkSize) {
    const chunk = changes.slice(i, i + chunkSize);
    if (chunk.length === 0) break;
    
    const firstLine = Math.max(1, chunk[0].originalLineNum);
    const removedLines = chunk.filter(c => c.line.startsWith('-')).length;
    const addedLines = chunk.filter(c => c.line.startsWith('+')).length;
    const contextLines = chunk.filter(c => c.line.startsWith(' ')).length;
    
    // Create a small hunk header
    result.push(`@@ -${firstLine},${removedLines + contextLines} +${firstLine},${addedLines + contextLines} @@`);
    
    // Add the changes
    chunk.forEach(change => {
      result.push(change.line);
    });
    
    hunkCount++;
  }
  
  console.log(`📦 Split into ${hunkCount} small hunks for Apply suggestions`);
  return result;
}

function runReviewdog(input, format, name) {
  if (!IS_PR) {
    console.log(`📝 Skipping reviewdog - not a PR (IS_PR: ${IS_PR})`);
    return;
  }
  
  if (!HAS_REVIEWDOG_TOKEN) {
    console.log(`📝 Skipping reviewdog - no token (HAS_TOKEN: ${!!HAS_REVIEWDOG_TOKEN})`);
    return;
  }

  console.log(`🔍 Running reviewdog for ${name}...`);
  
  try {
    let processedInput = input;
    
    // For prettier, split large hunks into smaller ones that work with diff_context
    if (name === 'prettier' && input) {
      console.log(`🔧 Splitting large prettier hunks for Apply suggestions...`);
      processedInput = splitLargeHunksForSuggestions(input);
    }
    
    // Use github-pr-review with diff_context for Apply suggestion buttons
    const configs = [
      {
        name: 'github-pr-review with diff_context (Apply suggestions)',
        args: [
          `-f=${format}`,
          `-name=${name}`,
          '-reporter=github-pr-review',
          '-filter-mode=diff_context',
          '-level=info',
          '-fail-on-error=false'
        ]
      },
      {
        name: 'github-pr-review with added (fallback)',
        args: [
          `-f=${format}`,
          `-name=${name}`,
          '-reporter=github-pr-review',
          '-filter-mode=added', 
          '-level=info',
          '-fail-on-error=false'
        ]
      },
      {
        name: 'github-pr-review with nofilter (last resort)',
        args: [
          `-f=${format}`,
          `-name=${name}`,
          '-reporter=github-pr-review',
          '-filter-mode=nofilter',
          '-level=info',
          '-fail-on-error=false'
        ]
      }
    ];
    
    // Save the input for debugging
    fs.writeFileSync(`artifacts/${name}-reviewdog-input.txt`, processedInput);
    console.log(`📁 Saved reviewdog input to artifacts/${name}-reviewdog-input.txt`);
    
    // Show a sample of what we're sending to reviewdog
    const inputLines = processedInput.split('\n');
    console.log(`📋 Sample input (first 15 lines):`);
    inputLines.slice(0, 15).forEach((line, i) => {
      console.log(`${i+1}: ${line}`);
    });
    
    // Try each configuration until one works
    for (const config of configs) {
      console.log(`🧪 Trying reviewdog config: ${config.name}`);
      
      const rd = spawnSync('reviewdog', config.args, { 
        input: processedInput, 
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf8',
        env: {
          ...process.env,
          REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
        }
      });
      
      console.log(`📊 Config "${config.name}" exit code: ${rd.status}`);
      
      // Show reviewdog output for debugging
      if (rd.stdout) {
        console.log(`📤 Reviewdog stdout: ${rd.stdout.slice(0, 300)}...`);
      }
      if (rd.stderr) {
        console.log(`📤 Reviewdog stderr: ${rd.stderr.slice(0, 300)}...`);
      }
      
      if (rd.status === 0) {
        console.log(`✅ Success with config: ${config.name}`);
        if (config.name.includes('diff_context')) {
          console.log(`🎯 This should create Apply suggestion buttons!`);
        }
        break;
      } else {
        console.log(`❌ Failed with config: ${config.name}, trying next...`);
      }
    }
    
  } catch (error) {
    console.error(`❌ Failed to run reviewdog for ${name}:`, error.message);
  }
}

function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');
  
  try {
    // Create artifacts directory
    fs.mkdirSync('artifacts', { recursive: true });
    
    // First, let's see what files prettier would change
    let filesToCheck = '';
    try {
      filesToCheck = execSync('npx prettier --list-different "tests/**/*.{js,ts,tsx,json}"', { encoding: 'utf8' });
    } catch (e) {
      // If no files need formatting, prettier exits with code 1
      filesToCheck = e.stdout?.toString() || '';
    }
    
    const filesToFormat = filesToCheck.split('\n').filter(Boolean);
    
    if (filesToFormat.length === 0) {
      console.log('✅ No prettier formatting needed');
      return {
        filesWithIssues: 0,
        totalChanges: 0,
        files: [],
        sample: ''
      };
    }
    
    console.log(`📝 Found ${filesToFormat.length} files needing formatting:`, filesToFormat);
    
    // Simple approach: stash changes, run prettier, capture diff, restore
    console.log('💾 Stashing current changes...');
    execSync('git stash push -m "temp-prettier-stash" || true', { stdio: 'pipe' });
    
    // Run prettier
    console.log('🎨 Running prettier...');
    execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });
    
    // Generate diff optimized for suggestions
    console.log('📊 Generating diff optimized for suggestions...');
    const diff = execSync('git diff --no-color --unified=3 --no-prefix HEAD -- tests/', { encoding: 'utf8' });
    
    // Count changes more accurately
    const addedLines = (diff.match(/^\+(?!\+)/gm) || []).length;
    const removedLines = (diff.match(/^-(?!-)/gm) || []).length;
    const totalChanges = addedLines + removedLines;
    
    console.log(`📈 Changes found: +${addedLines} -${removedLines} (total: ${totalChanges})`);
    
    // Save detailed diff for debugging
    fs.writeFileSync('artifacts/prettier-diff.txt', diff);
    fs.writeFileSync('artifacts/prettier-files.json', JSON.stringify(filesToFormat, null, 2));
    
    // Show sample of the diff
    const diffLines = diff.split('\n');
    const sampleDiff = diffLines.slice(0, 30).join('\n');
    console.log('Sample diff (first 30 lines):\n', sampleDiff);
    
    // Restore original state
    console.log('🔄 Restoring original state...');
    execSync('git stash pop || true', { stdio: 'pipe' });
    
    // Run reviewdog with the diff if we have changes
    if (diff && diff.trim() && totalChanges > 0) {
      console.log('🔍 Sending to reviewdog...');
      
      // Debug: show first few lines of what we're sending to reviewdog
      const debugDiff = diff.split('\n').slice(0, 20).join('\n');
      console.log('📋 First 20 lines being sent to reviewdog:\n', debugDiff);
      
      runReviewdog(diff, 'diff', 'prettier');
    } else {
      console.log('📝 No substantial changes detected for reviewdog');
    }
    
    return {
      filesWithIssues: filesToFormat.length,
      totalChanges,
      files: filesToFormat,
      sample: sampleDiff
    };
    
  } catch (error) {
    console.error('❌ Prettier failed:', error.message);
    
    // Cleanup: try to restore state
    try {
      execSync('git stash pop || true', { stdio: 'pipe' });
    } catch (cleanupError) {
      console.error('⚠️  Cleanup warning:', cleanupError.message);
    }
    
    return {
      filesWithIssues: 0,
      totalChanges: 0,
      files: [],
      sample: '',
      error: error.message
    };
  }
}

function runESLint() {
  console.log('\n▶ ESLint');
  let raw = '';
  
  try {
    // Use modern ESLint command without --ext flag (works with flat config)
    raw = execSync('npx eslint "tests/**/*.{js,ts,tsx}" --format json', { encoding: 'utf8' });
  } catch (e) {
    // ESLint exits with code 1 when there are lint errors, but still outputs JSON
    raw = e.stdout?.toString() || '';
    if (!raw && e.stderr) {
      console.error('❌ ESLint error:', e.stderr.toString());
      return {
        files: 0,
        errors: 0,
        warnings: 0,
        fixableErrors: 0,
        fixableWarnings: 0,
        first: '',
        error: e.stderr.toString()
      };
    }
  }

  let results = [];
  try {
    results = raw ? JSON.parse(raw) : [];
  } catch (parseError) {
    console.error('❌ Failed to parse ESLint JSON:', parseError.message);
    return {
      files: 0,
      errors: 0,
      warnings: 0,
      fixableErrors: 0,
      fixableWarnings: 0,
      first: '',
      error: 'Failed to parse ESLint output'
    };
  }

  let errors = 0,
    warnings = 0,
    fixErr = 0,
    fixWarn = 0,
    first = '',
    files = new Set();

  results.forEach(f => {
    if (f.messages && f.messages.length) files.add(f.filePath);
    if (f.messages) {
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
    }
  });

  console.log(`📊 ESLint: ${errors} errors, ${warnings} warnings in ${files.size} files`);

  if (raw && (errors > 0 || warnings > 0)) {
    // Save the ESLint results for debugging
    fs.writeFileSync('artifacts/eslint-results.json', raw);
    runReviewdog(raw, 'eslint', 'eslint');
  } else {
    console.log('✅ No ESLint issues found');
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

// Main execution
console.log('🚀 Starting lint checks...');

// Check if reviewdog is available
if (IS_PR && HAS_REVIEWDOG_TOKEN) {
  try {
    const reviewdogVersion = execSync('reviewdog -version', { encoding: 'utf8' });
    console.log('🐕 Reviewdog version:', reviewdogVersion.trim());
    
    // Debug environment variables
    console.log('🔍 Environment debug:');
    console.log(`  - GITHUB_EVENT_NAME: ${process.env.GITHUB_EVENT_NAME}`);
    console.log(`  - GITHUB_REPOSITORY: ${process.env.GITHUB_REPOSITORY}`);
    console.log(`  - GITHUB_SHA: ${process.env.GITHUB_SHA}`);
    console.log(`  - GITHUB_REF: ${process.env.GITHUB_REF}`);
    console.log(`  - GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? 'present' : 'missing'}`);
    console.log(`  - REVIEWDOG_GITHUB_API_TOKEN: ${process.env.REVIEWDOG_GITHUB_API_TOKEN ? 'present' : 'missing'}`);
    
  } catch (error) {
    console.error('❌ Reviewdog not found or not working:', error.message);
  }
}

const prettier = runPrettier();
const eslint = runESLint();

const summary = { prettier, eslint };
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/lint-summary.json', JSON.stringify(summary, null, 2));

console.log('\n📋 Summary:');
console.log(`├─ Prettier: ${prettier.filesWithIssues} files, ${prettier.totalChanges} changes`);
console.log(`├─ ESLint: ${eslint.files} files, ${eslint.errors} errors, ${eslint.warnings} warnings`);
console.log('└─ 📝 artifacts/lint-summary.json written');

// Report issues but don't fail the build - this is for CI feedback only
if (eslint.errors > 0) {
  console.log('\n⚠️  ESLint found errors, but continuing (non-blocking mode)');
}

console.log('\n✅ Lint check completed successfully');
process.exit(0);