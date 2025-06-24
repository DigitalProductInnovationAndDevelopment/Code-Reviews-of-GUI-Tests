#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

const IS_PR =
  process.env.GITHUB_EVENT_NAME === 'pull_request' ||
  process.env.GITHUB_EVENT_NAME === 'pull_request_target';

const HAS_REVIEWDOG_TOKEN = process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN;

function runReviewdog(input, format, name) {
  if (!IS_PR || !HAS_REVIEWDOG_TOKEN) {
    console.log(`📝 Skipping reviewdog (IS_PR: ${IS_PR}, HAS_TOKEN: ${!!HAS_REVIEWDOG_TOKEN})`);
    return;
  }

  console.log(`🔍 Running reviewdog for ${name}...`);
  
  try {
    const reviewdogArgs = [
      `-f=${format}`,
      `-name=${name}`,
      '-reporter=github-pr-review',
      '-filter-mode=added',  // Only show lines that were added/changed
      '-level=info',
      '-fail-on-error=false'
    ];
    
    // For prettier, add more context to show the actual fixes
    if (name === 'prettier') {
      reviewdogArgs.push('-diff-strip-prefix-num=1');
    }
    
    const rd = spawnSync('reviewdog', reviewdogArgs, { 
      input: input, 
      stdio: ['pipe', 'inherit', 'inherit'], 
      encoding: 'utf8',
      env: {
        ...process.env,
        REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
      }
    });
    
    if (rd.error) {
      console.error(`❌ Reviewdog error for ${name}:`, rd.error.message);
    } else if (rd.status === 0) {
      console.log(`✅ Reviewdog completed successfully for ${name}`);
    } else {
      console.warn(`⚠️  Reviewdog completed with status ${rd.status} for ${name}`);
    }
    
    // Also save the input for debugging
    fs.writeFileSync(`artifacts/${name}-reviewdog-input.txt`, input);
    
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
    
    // Generate diff - this shows the prettier changes
    console.log('📊 Generating diff...');
    const diff = execSync('git diff --no-color HEAD -- tests/', { encoding: 'utf8' });
    
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
    console.log('Sample diff:\n', sampleDiff);
    
    // Restore original state
    console.log('🔄 Restoring original state...');
    execSync('git stash pop || true', { stdio: 'pipe' });
    
    // Run reviewdog with the diff if we have changes
    if (diff && diff.trim() && totalChanges > 0) {
      console.log('🔍 Sending to reviewdog...');
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