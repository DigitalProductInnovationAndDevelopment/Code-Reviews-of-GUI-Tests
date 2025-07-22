#!/usr/bin/env node
/**
 * CRITICAL: This script provides non-blocking lint feedback via reviewdog.
 * Enhanced with debugging to troubleshoot missing comments.
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

const IS_PR = process.env.GITHUB_EVENT_NAME === 'pull_request' || 
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

  console.log(`🔍 Running reviewdog for ${name}...`);
  
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync(`artifacts/${name}-reviewdog-input.txt`, input);
  
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
    
    console.log(`📊 Exit code: ${rd.status}`);
  } catch (error) {
    console.error(`❌ Failed to run reviewdog for ${name}:`, error.message);
  }
}

function runPrettier() {
  console.log('\n▶ Prettier (direct diff generation)');
  
  try {
    // First check what prettier would change
    let filesToCheck = '';
    try {
      filesToCheck = execSync('npx prettier --list-different "tests/**/*.{js,ts,tsx,json}"', { encoding: 'utf8' });
    } catch (e) {
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
    
    // Generate diff WITHOUT modifying files
    let combinedDiff = '';
    let totalChanges = 0;
    let sampleLines = [];
    
    for (const file of filesToFormat) {
      try {
        console.log(`🔍 Processing ${file}...`);
        
        // Read original content
        const originalContent = fs.readFileSync(file, 'utf8');
        
        // Get formatted content without writing to file
        const formattedContent = execSync(`npx prettier "${file}"`, { encoding: 'utf8' });
        
        if (originalContent !== formattedContent) {
          // Create temp files for diff
          const tempOriginal = `${file}.original.tmp`;
          const tempFormatted = `${file}.formatted.tmp`;
          
          fs.writeFileSync(tempOriginal, originalContent);
          fs.writeFileSync(tempFormatted, formattedContent);
          
          try {
            // Generate unified diff
            const fileDiff = execSync(`diff -u "${tempOriginal}" "${tempFormatted}" || true`, { encoding: 'utf8' });
            
            if (fileDiff) {
              // Convert to git diff format
              const gitStyleDiff = fileDiff
                .replace(new RegExp(`--- ${tempOriginal}`, 'g'), `--- a/${file}`)
                .replace(new RegExp(`\\+\\+\\+ ${tempFormatted}`, 'g'), `+++ b/${file}`);
              
              // Add git diff header
              combinedDiff += `diff --git a/${file} b/${file}\n`;
              combinedDiff += `index 0000000..1111111 100644\n`;
              combinedDiff += gitStyleDiff;
              if (!gitStyleDiff.endsWith('\n')) combinedDiff += '\n';
              
              // Count changes
              const addedLines = (gitStyleDiff.match(/^\+(?!\+)/gm) || []).length;
              const removedLines = (gitStyleDiff.match(/^-(?!-)/gm) || []).length;
              totalChanges += addedLines + removedLines;
              
              // Collect sample lines for display
              const diffLines = gitStyleDiff.split('\n');
              diffLines.forEach(line => {
                if ((line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')) {
                  if (sampleLines.length < 20) {
                    sampleLines.push(line);
                  }
                }
              });
              
              console.log(`  ├─ +${addedLines} -${removedLines} changes`);
            }
          } finally {
            // Cleanup temp files
            try { fs.unlinkSync(tempOriginal); } catch {}
            try { fs.unlinkSync(tempFormatted); } catch {}
          }
        }
      } catch (error) {
        console.log(`  ├─ ⚠️  Failed to process ${file}: ${error.message}`);
      }
    }
    
    console.log(`📈 Total changes found: ${totalChanges}`);
    
    if (!combinedDiff || totalChanges === 0) {
      console.log('📝 No substantial changes detected');
      return {
        filesWithIssues: filesToFormat.length,
        totalChanges: 0,
        files: filesToFormat,
        sample: ''
      };
    }
    
    // Save full diff
    fs.writeFileSync('artifacts/prettier-diff-full.txt', combinedDiff);
    console.log(`💾 Full diff saved to artifacts/prettier-diff-full.txt (${combinedDiff.length} bytes)`);
    
    // Send to reviewdog with truncation if needed
    let reviewdogDiff = combinedDiff;
    if (totalChanges > 50) {
      console.log(`⚠️  Too many changes (${totalChanges}) for inline comments. Truncating to first 50...`);
      // Truncate diff to first 50 changes
      const lines = combinedDiff.split('\n');
      let changeCount = 0;
      let truncatedDiff = '';
      
      for (const line of lines) {
        truncatedDiff += line + '\n';
        if ((line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')) {
          changeCount++;
          if (changeCount >= 50) break;
        }
      }
      reviewdogDiff = truncatedDiff;
    }
    
    console.log('\n🔍 Sending diff to reviewdog...');
    runReviewdog(reviewdogDiff, 'diff', 'prettier');
    
    return {
      filesWithIssues: filesToFormat.length,
      totalChanges: totalChanges,
      files: filesToFormat,
      sample: sampleLines.join('\n'),
      exceedsLimit: totalChanges > 50
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
  
  try {
    let raw = '';
    try {
      raw = execSync('npx eslint "tests/**/*.{js,ts,tsx}" --format json', { encoding: 'utf8' });
    } catch (e) {
      raw = e.stdout?.toString() || '';
    }

    if (!raw) {
      console.log('✅ No ESLint output');
      return { files: 0, errors: 0, warnings: 0 };
    }

    let results = [];
    try {
      results = JSON.parse(raw);
    } catch (parseError) {
      console.error('❌ Failed to parse ESLint JSON:', parseError.message);
      console.log('First 200 chars of output:', raw.substring(0, 200));
      return { files: 0, errors: 0, warnings: 0, error: 'Parse error' };
    }

    let errors = 0,
      warnings = 0,
      fixErr = 0,
      fixWarn = 0,
      first = '',
      files = new Set();

    results.forEach(f => {
      if (f.messages && f.messages.length) {
        files.add(f.filePath);
      }
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
      fs.writeFileSync('artifacts/eslint-results.json', raw);
      console.log('🔍 Sending to reviewdog...');
      runReviewdog(raw, 'eslint', 'eslint');
    }

    return {
      files: files.size,
      errors,
      warnings,
      fixableErrors: fixErr,
      fixableWarnings: fixWarn,
      first,
      exceedsLimit: errors + warnings > 50
    };
    
  } catch (error) {
    console.error('❌ ESLint failed:', error.message);
    return { files: 0, errors: 0, warnings: 0, error: error.message };
  }
}

// Main execution
console.log('🚀 Starting lint checks...');

// Environment info
console.log('🔍 Environment:');
console.log(`  ├─ Event: ${process.env.GITHUB_EVENT_NAME}`);
console.log(`  ├─ Is PR: ${IS_PR}`);
console.log(`  ├─ Has Token: ${!!HAS_REVIEWDOG_TOKEN}`);

const prettier = runPrettier();
const eslint = runESLint();

// Save summary
const summary = { prettier, eslint };
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/lint-summary.json', JSON.stringify(summary, null, 2));
console.log('📁 Summary saved to artifacts/lint-summary.json');

console.log('\n📋 Summary:');
console.log(`├─ Prettier: ${prettier.filesWithIssues} files, ${prettier.totalChanges} changes`);
console.log(`└─ ESLint: ${eslint.files} files, ${eslint.errors} errors, ${eslint.warnings} warnings`);

// Always exit with success
process.exit(0);