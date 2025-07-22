#!/usr/bin/env node
/**
 * CRITICAL: This script provides non-blocking lint feedback via reviewdog.
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

const IS_PR = process.env.GITHUB_EVENT_NAME === 'pull_request';
const HAS_REVIEWDOG_TOKEN = process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN;

function runReviewdog(input, format, name) {
  if (!IS_PR || !HAS_REVIEWDOG_TOKEN) {
    console.log(`📝 Skipping reviewdog (IS_PR: ${IS_PR}, HAS_TOKEN: ${!!HAS_REVIEWDOG_TOKEN})`);
    return;
  }

  console.log(`🔍 Running reviewdog for ${name}...`);
  
  try {
    const rd = spawnSync('reviewdog', [
      `-f=${format}`,
      `-name=${name}`,
      '-reporter=github-pr-review',
      '-filter-mode=nofilter',
      '-level=info',
      '-fail-on-error=false'
    ], { 
      input: input, 
      stdio: ['pipe', 'inherit', 'inherit'],
      encoding: 'utf8',
      env: {
        ...process.env,
        REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
      }
    });
    
    console.log(`📊 Reviewdog exit code: ${rd.status}`);
  } catch (error) {
    console.error(`❌ Failed to run reviewdog for ${name}:`, error.message);
  }
}

function runPrettier() {
  console.log('\n▶ Prettier');
  
  try {
    // Get list of files that need formatting
    let output = '';
    try {
      execSync('npx prettier --check "tests/**/*.{js,ts,tsx,json}"', { encoding: 'utf8' });
      console.log('✅ All files are properly formatted');
      return {
        filesWithIssues: 0,
        totalChanges: 0,
        files: [],
        sample: ''
      };
    } catch (e) {
      output = e.stdout || '';
    }

    // Parse prettier output to get files
    const lines = output.split('\n').filter(line => line.trim());
    const files = [];
    
    lines.forEach(line => {
      // Prettier output format: "[warn] filename"
      if (line.includes('[warn]')) {
        const match = line.match(/\[warn\]\s+(.+)/);
        if (match) files.push(match[1]);
      }
      // Or just the filename if checking failed
      else if (line.includes('tests/') && !line.includes('Checking formatting...')) {
        files.push(line.trim());
      }
    });

    // Count total changes by checking each file
    let totalChanges = 0;
    let combinedDiff = '';
    
    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      
      try {
        const original = fs.readFileSync(file, 'utf8');
        
        // Format the file to string (not writing to disk)
        const formatted = execSync(`npx prettier "${file}"`, { encoding: 'utf8' });
        
        // Count character-level differences for more accurate count
        if (original !== formatted) {
          // Count line differences
          const originalLines = original.split('\n');
          const formattedLines = formatted.split('\n');
          
          // Generate a simple unified diff manually
          let fileDiff = `--- a/${file}\n+++ b/${file}\n`;
          let changeCount = 0;
          
          // Simple line-by-line comparison
          const maxLen = Math.max(originalLines.length, formattedLines.length);
          for (let i = 0; i < maxLen; i++) {
            if (originalLines[i] !== formattedLines[i]) {
              if (i < originalLines.length) {
                fileDiff += `-${originalLines[i]}\n`;
                changeCount++;
              }
              if (i < formattedLines.length) {
                fileDiff += `+${formattedLines[i]}\n`;
                changeCount++;
              }
            }
          }
          
          totalChanges += changeCount;
          
          // Add to combined diff
          combinedDiff += `diff --git a/${file} b/${file}\n`;
          combinedDiff += `index 0000000..1111111 100644\n`;
          combinedDiff += fileDiff;
        }
      } catch (error) {
        console.log(`Error processing ${file}:`, error.message);
      }
    }

    console.log(`📝 Found ${files.length} files needing formatting with ${totalChanges} changes`);

    // Send to reviewdog
    if (combinedDiff && IS_PR) {
      runReviewdog(combinedDiff, 'diff', 'prettier');
    }

    return {
      filesWithIssues: files.length,
      totalChanges: totalChanges,
      files: files,
      sample: combinedDiff.split('\n').slice(0, 20).join('\n')
    };
    
  } catch (error) {
    console.error('❌ Prettier failed:', error.message);
    return {
      filesWithIssues: 0,
      totalChanges: 0,
      files: [],
      error: error.message
    };
  }
}

function runESLint() {
  console.log('\n▶ ESLint');
  
  try {
    let jsonOutput = '';
    try {
      jsonOutput = execSync('npx eslint "tests/**/*.{js,ts,tsx}" --format json', { encoding: 'utf8' });
    } catch (e) {
      // ESLint exits with 1 if there are issues
      jsonOutput = e.stdout || '';
    }

    if (!jsonOutput || jsonOutput.trim() === '') {
      console.log('✅ No ESLint issues found');
      return { files: 0, errors: 0, warnings: 0 };
    }

    const results = JSON.parse(jsonOutput);
    let errors = 0, warnings = 0, fixableErrors = 0, fixableWarnings = 0;
    let firstError = '';
    const filesWithIssues = new Set();

    results.forEach(file => {
      if (file.messages && file.messages.length > 0) {
        filesWithIssues.add(file.filePath);
        
        file.messages.forEach(msg => {
          if (msg.severity === 2) {
            errors++;
            if (msg.fix) fixableErrors++;
            if (!firstError) {
              firstError = `${msg.ruleId} in ${file.filePath}:${msg.line}`;
            }
          } else if (msg.severity === 1) {
            warnings++;
            if (msg.fix) fixableWarnings++;
          }
        });
      }
    });

    console.log(`📊 ESLint: ${errors} errors, ${warnings} warnings in ${filesWithIssues.size} files`);

    // Send to reviewdog
    if (jsonOutput && (errors > 0 || warnings > 0) && IS_PR) {
      runReviewdog(jsonOutput, 'eslint', 'eslint');
    }

    return {
      files: filesWithIssues.size,
      errors,
      warnings,
      fixableErrors,
      fixableWarnings,
      first: firstError
    };
    
  } catch (error) {
    console.error('❌ ESLint failed:', error.message);
    return { files: 0, errors: 0, warnings: 0, error: error.message };
  }
}

// Main execution
console.log('🚀 Starting lint checks...');

const prettier = runPrettier();
const eslint = runESLint();

// Save summary
const summary = { prettier, eslint };
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/lint-summary.json', JSON.stringify(summary, null, 2));
console.log('📁 Summary saved to artifacts/lint-summary.json');

// Always exit successfully
process.exit(0);