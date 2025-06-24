#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

const IS_PR =
  process.env.GITHUB_EVENT_NAME === 'pull_request' ||
  process.env.GITHUB_EVENT_NAME === 'pull_request_target';

const HAS_REVIEWDOG_TOKEN = process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN;

function runReviewdog(input, format, name) {
  if (!IS_PR) {
    console.log(`📝 Skipping reviewdog - not a PR (IS_PR: ${IS_PR})`);
    return;
  }
  
  if (!HAS_REVIEWDOG_TOKEN) {
    console.log(`📝 Skipping reviewdog - no token (HAS_TOKEN: ${!!HAS_REVIEWDOG_TOKEN})`);
    return;
  }

  console.log(`🔍 Running reviewdog for ${name} (replicating ${name === 'prettier' ? 'EPMatt/reviewdog-action-prettier' : 'reviewdog/action-eslint'})...`);
  
  try {
    // Use the exact same configuration as the successful GitHub actions
    let reviewdogArgs;
    
    if (name === 'prettier') {
      // Replicate EPMatt/reviewdog-action-prettier@v1 configuration
      reviewdogArgs = [
        `-f=${format}`,
        `-name=${name}`,
        '-reporter=github-pr-review',
        '-filter-mode=diff_context',  // This is key for Apply suggestions
        '-level=info',
        '-fail-on-error=false'
      ];
    } else {
      // Replicate reviewdog/action-eslint@v1 configuration  
      reviewdogArgs = [
        `-f=${format}`,
        `-name=${name}`,
        '-reporter=github-pr-review',
        '-filter-mode=added',
        '-level=info', 
        '-fail-on-error=false'
      ];
    }
    
    // Save the input for debugging
    fs.writeFileSync(`artifacts/${name}-reviewdog-input.txt`, input);
    console.log(`📁 Saved reviewdog input to artifacts/${name}-reviewdog-input.txt`);
    
    console.log(`🧪 Running reviewdog with config: ${reviewdogArgs.join(' ')}`);
    
    const rd = spawnSync('reviewdog', reviewdogArgs, { 
      input: input, 
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      env: {
        ...process.env,
        REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
      }
    });
    
    console.log(`📊 Reviewdog exit code: ${rd.status}`);
    
    // Show reviewdog output for debugging
    if (rd.stdout) {
      console.log(`📤 Reviewdog stdout: ${rd.stdout.slice(0, 300)}${rd.stdout.length > 300 ? '...' : ''}`);
    }
    if (rd.stderr) {
      console.log(`📤 Reviewdog stderr: ${rd.stderr.slice(0, 300)}${rd.stderr.length > 300 ? '...' : ''}`);
    }
    
    if (rd.status === 0) {
      console.log(`✅ Success! Should have created ${name === 'prettier' ? 'Apply suggestion buttons' : 'inline comments'}`);
    } else {
      console.log(`❌ Reviewdog failed with exit code ${rd.status}`);
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
    
    // Generate diff in the format that EPMatt/reviewdog-action-prettier expects
    console.log('📊 Generating diff for reviewdog (EPMatt/reviewdog-action-prettier format)...');
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
    console.log('Sample diff (first 30 lines):\n', sampleDiff);
    
    // Restore original state
    console.log('🔄 Restoring original state...');
    execSync('git stash pop || true', { stdio: 'pipe' });
    
    // Run reviewdog exactly like EPMatt/reviewdog-action-prettier does
    if (diff && diff.trim() && totalChanges > 0) {
      console.log('🔍 Sending to reviewdog (replicating EPMatt/reviewdog-action-prettier)...');
      
      runReviewdog(diff, 'diff', 'prettier');
    } else {
      console.log('📝 No substantial changes detected');
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
    
    console.log('🔍 Sending to reviewdog (replicating reviewdog/action-eslint)...');
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