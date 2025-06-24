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
    const rd = spawnSync(
      'reviewdog',
      [
        `-f=${format}`,
        `-name=${name}`,
        '-reporter=github-pr-review',
        '-filter-mode=nofilter',
        '-level=info',
        '-fail-on-error=false'
      ],
      { 
        input: input, 
        stdio: ['pipe', 'inherit', 'inherit'], 
        encoding: 'utf8',
        env: {
          ...process.env,
          REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
        }
      }
    );
    
    if (rd.error) {
      console.error(`❌ Reviewdog error for ${name}:`, rd.error.message);
    } else {
      console.log(`✅ Reviewdog completed for ${name}`);
    }
  } catch (error) {
    console.error(`❌ Failed to run reviewdog for ${name}:`, error.message);
  }
}

function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');
  
  try {
    // Format files with Prettier
    execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });
    
    // Generate diff using git
    const diff = execSync('git diff -- tests || true', { encoding: 'utf8' });
    const files = diff ? execSync('git diff --name-only -- tests || true', { encoding: 'utf8' }).split('\n').filter(Boolean) : [];
    const totalChanges = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;

    // Save diff for debugging
    fs.mkdirSync('artifacts', { recursive: true });
    fs.writeFileSync('artifacts/prettier-diff.txt', diff);
    
    if (diff && diff.trim()) {
      console.log(`📝 Found ${totalChanges} formatting changes in ${files.length} files`);
      runReviewdog(diff, 'diff', 'prettier');
    } else {
      console.log('✅ No prettier formatting needed');
    }
    
    // Clean up git changes
    execSync('git checkout -- . || true'); 

    return {
      filesWithIssues: files.length,
      totalChanges,
      files,
      sample: diff.split('\n').slice(0, 20).join('\n')
    };
  } catch (error) {
    console.error('❌ Prettier failed:', error.message);
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