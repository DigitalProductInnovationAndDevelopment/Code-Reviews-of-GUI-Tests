#!/usr/bin/env node
/**
 * CRITICAL: This script provides non-blocking lint feedback via reviewdog.
 * Enhanced with debugging to troubleshoot missing comments.
 * Now includes quick fix suggestions and better error messages.
 */
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

  console.log(`🔍 Running reviewdog for ${name}...`);
  
  // Ensure artifacts directory exists
  try {
    fs.mkdirSync('artifacts', { recursive: true });
  } catch (dirError) {
    console.log('⚠️  Could not create artifacts directory:', dirError.message);
  }
  
  // Save the input for debugging
  try {
    fs.writeFileSync(`artifacts/${name}-reviewdog-input.txt`, input);
    console.log(`📁 Saved reviewdog input to artifacts/${name}-reviewdog-input.txt (${input.length} chars)`);
  } catch (writeError) {
    console.log(`⚠️  Could not save input file (non-critical):`, writeError.message);
  }
  
  try {
    // Try multiple approaches for better debugging
    const configs = [
      {
        name: 'github-pr-review with diff_context',
        args: [
          `-f=${format}`,
          `-name=${name}`,
          '-reporter=github-pr-review',
          '-filter-mode=diff_context',
          '-level=info',
          '-fail-on-error=false',
          '-tee'  // Add tee for debug output
        ]
      },
      {
        name: 'github-check for fallback',
        args: [
          `-f=${format}`,
          `-name=${name}`,
          '-reporter=github-check',
          '-filter-mode=added',
          '-level=info',
          '-fail-on-error=false',
          '-tee'
        ]
      }
    ];
    
    // Try each configuration
    for (const config of configs) {
      console.log(`\n🧪 Trying reviewdog with: ${config.name}`);
      console.log(`📋 Full command: reviewdog ${config.args.join(' ')}`);
      
      // Show first 500 chars of input being sent
      console.log(`📥 Input preview (first 500 chars):\n${input.slice(0, 500)}${input.length > 500 ? '\n...[truncated]' : ''}`);
      
      const rd = spawnSync('reviewdog', config.args, { 
        input: input, 
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf8',
        env: {
          ...process.env,
          REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
        }
      });
      
      console.log(`📊 Exit code: ${rd.status}`);
      
      // Show ALL output for debugging
      if (rd.stdout && rd.stdout.trim()) {
        console.log(`📤 STDOUT (${rd.stdout.length} chars):`);
        console.log(rd.stdout);
      } else {
        console.log(`📤 STDOUT: (empty)`);
      }
      
      if (rd.stderr && rd.stderr.trim()) {
        console.log(`📤 STDERR (${rd.stderr.length} chars):`);
        console.log(rd.stderr);
      } else {
        console.log(`📤 STDERR: (empty)`);
      }
      
      // Save outputs for debugging
      try {
        fs.writeFileSync(`artifacts/${name}-${config.name.replace(/[^a-zA-Z0-9]/g, '_')}-stdout.txt`, rd.stdout || '');
        fs.writeFileSync(`artifacts/${name}-${config.name.replace(/[^a-zA-Z0-9]/g, '_')}-stderr.txt`, rd.stderr || '');
      } catch (writeError) {
        console.log(`⚠️  Could not save reviewdog output (non-critical):`, writeError.message);
      }
      
      if (rd.status === 0) {
        console.log(`✅ Reviewdog completed successfully with ${config.name}`);
      } else {
        console.log(`❌ Reviewdog failed with ${config.name}, exit code: ${rd.status}`);
      }
    }
    
  } catch (error) {
    console.error(`❌ Failed to run reviewdog for ${name}:`, error.message);
  }
}

function runPrettier() {
  console.log('\n▶ Prettier (direct diff generation)');
  
  try {
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
    
    // Generate diff WITHOUT git stash - direct file comparison
    console.log('📊 Generating diff by comparing original vs formatted content...');
    let combinedDiff = '';
    let totalChanges = 0;
    
    for (const file of filesToFormat) {
      try {
        console.log(`🔍 Processing ${file}...`);
        
        // Read original content
        const originalContent = fs.readFileSync(file, 'utf8');
        
        // Get formatted content
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
                .replace(`--- ${tempOriginal}`, `--- a/${file}`)
                .replace(`+++ ${tempFormatted}`, `+++ b/${file}`);
              
              // Add git diff header
              combinedDiff += `diff --git a/${file} b/${file}\n`;
              combinedDiff += `index 0000000..1111111 100644\n`;
              combinedDiff += gitStyleDiff;
              if (!gitStyleDiff.endsWith('\n')) combinedDiff += '\n';
              
              const addedLines = (gitStyleDiff.match(/^\+(?!\+)/gm) || []).length;
              const removedLines = (gitStyleDiff.match(/^-(?!-)/gm) || []).length;
              totalChanges += addedLines + removedLines;
              
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
    
    // Instead of limiting, let's try sending the full diff first
    console.log(`📊 Sending full diff: ${totalChanges} total changes`);
    
    // Ensure artifacts directory exists
    try {
      fs.mkdirSync('artifacts', { recursive: true });
      console.log('📁 Artifacts directory ready');
    } catch (dirError) {
      console.log('⚠️  Could not create artifacts directory (non-critical):', dirError.message);
    }
    
    // Save the diff for debugging
    try {
      fs.writeFileSync('artifacts/prettier-diff-full.txt', combinedDiff);
      fs.writeFileSync('artifacts/prettier-files.json', JSON.stringify(filesToFormat, null, 2));
      console.log('💾 Saved diff to artifacts/');
    } catch (writeError) {
      console.log('⚠️  Could not save artifacts (non-critical):', writeError.message);
    }
    
    // Show sample of the diff
    const sampleDiff = combinedDiff.split('\n').slice(0, 50).join('\n');
    console.log('📋 Sample of diff (first 50 lines):');
    console.log(sampleDiff);
    
    // Send to reviewdog with enhanced debugging
    console.log('\n🔍 Sending diff to reviewdog with debugging...');
    runReviewdog(combinedDiff, 'diff', 'prettier');
    
    return {
      filesWithIssues: filesToFormat.length,
      totalChanges: totalChanges,
      files: filesToFormat,
      sample: sampleDiff,
      hunks: (combinedDiff.match(/^@@/gm) || []).length
    };
    
  } catch (error) {
    console.error('❌ Prettier failed:', error.message);
    console.error('📝 This might be caused by:', error.message.includes('prettier') ? 
      'Prettier not being installed. Try running: npm install --save-dev prettier' : 
      'Unknown error - please check the logs above'
    );
    
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
      // ESLint exits with code 1 when there are lint errors, but still outputs JSON
      raw = e.stdout?.toString() || '';
      if (!raw && e.stderr) {
        console.error('❌ ESLint error:', e.stderr.toString());
        console.error('📝 This might be a configuration issue. Check your .eslintrc file.');
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

    if (!raw) {
      console.log('✅ No ESLint output');
      return { files: 0, errors: 0, warnings: 0 };
    }

    let results = [];
    try {
      results = JSON.parse(raw);
    } catch (parseError) {
      console.error('❌ Failed to parse ESLint JSON:', parseError.message);
      console.error('📝 ESLint output might be corrupted. Try running ESLint manually to debug.');
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
        console.log(`📁 ${f.filePath}: ${f.messages.length} issues`);
      }
      if (f.messages) {
        f.messages.forEach(m => {
          if (m.severity === 2) {
            errors++;
            if (m.fix) fixErr++;
            if (!first) first = `${m.ruleId || 'unknown-rule'} in ${f.filePath}:${m.line}`;
            console.log(`  ├─ ERROR: ${m.ruleId} at line ${m.line}: ${m.message}`);
          } else if (m.severity === 1) {
            warnings++;
            if (m.fix) fixWarn++;
            console.log(`  ├─ WARN: ${m.ruleId} at line ${m.line}: ${m.message}`);
          }
        });
      }
    });

    console.log(`📊 ESLint: ${errors} errors, ${warnings} warnings in ${files.size} files`);
    
    // Add quick fix suggestions
    if (fixErr > 0 || fixWarn > 0) {
      console.log(`
💡 **Quick Fix Available!**
Run this command locally to auto-fix ${fixErr + fixWarn} issues:
\`\`\`bash
npx eslint . --fix
\`\`\`
      `);
      console.log(`🔧 This will automatically fix:`);
      if (fixErr > 0) console.log(`  - ${fixErr} error${fixErr > 1 ? 's' : ''}`);
      if (fixWarn > 0) console.log(`  - ${fixWarn} warning${fixWarn > 1 ? 's' : ''}`);
    }

    if (raw && (errors > 0 || warnings > 0)) {
      try {
        fs.mkdirSync('artifacts', { recursive: true });
        fs.writeFileSync('artifacts/eslint-results.json', raw);
        console.log(`📁 Saved ${results.length} file results to artifacts/eslint-results.json`);
      } catch (writeError) {
        console.log(`⚠️  Could not save ESLint results (non-critical):`, writeError.message);
      }
      
      console.log('🔍 Sending to reviewdog with debugging...');
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
    
  } catch (error) {
    console.error('❌ ESLint failed:', error.message);
    console.error('📝 This might be a bug in the action. Please report: https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/issues');
    return { files: 0, errors: 0, warnings: 0, error: error.message };
  }
}

// Main execution with enhanced debugging
console.log('🚀 Starting lint checks with enhanced debugging...');

// Environment info
console.log('🔍 Environment:');
console.log(`  ├─ Event: ${process.env.GITHUB_EVENT_NAME}`);
console.log(`  ├─ Repository: ${process.env.GITHUB_REPOSITORY}`);
console.log(`  ├─ SHA: ${process.env.GITHUB_SHA?.slice(0, 8)}`);
console.log(`  ├─ Ref: ${process.env.GITHUB_REF}`);
console.log(`  ├─ Is PR: ${IS_PR}`);
console.log(`  ├─ Has Token: ${!!HAS_REVIEWDOG_TOKEN}`);
console.log(`  └─ Working Dir: ${process.cwd()}`);

// Check if reviewdog is available and get verbose version info
if (IS_PR && HAS_REVIEWDOG_TOKEN) {
  try {
    const reviewdogVersion = execSync('reviewdog -version', { encoding: 'utf8' });
    console.log('🐕 Reviewdog version:', reviewdogVersion.trim());
    
    // Test GitHub API access
    console.log('🔍 Testing GitHub API access...');
    try {
      const apiTest = execSync(`curl -s -H "Authorization: token ${process.env.GITHUB_TOKEN}" https://api.github.com/user`, { encoding: 'utf8' });
      const userData = JSON.parse(apiTest);
      console.log(`✅ GitHub API accessible as user: ${userData.login || 'unknown'}`);
    } catch (apiError) {
      console.log('❌ GitHub API test failed:', apiError.message);
    }
  } catch (error) {
    console.error('❌ Reviewdog not found or not working:', error.message);
    console.error('📝 Make sure reviewdog is installed. The action should handle this automatically.');
  }
} else {
  console.log('📝 Reviewdog will be skipped (not a PR or no token)');
}

// Run linters with guaranteed non-failing behavior
let prettier, eslint;

try {
  prettier = runPrettier();
} catch (error) {
  console.error('❌ Prettier function failed (non-critical):', error.message);
  prettier = { filesWithIssues: 0, totalChanges: 0, files: [], error: error.message };
}

try {
  eslint = runESLint();
} catch (error) {
  console.error('❌ ESLint function failed (non-critical):', error.message);
  eslint = { files: 0, errors: 0, warnings: 0, error: error.message };
}

// Save summary with error handling
try {
  const summary = { prettier, eslint };
  fs.mkdirSync('artifacts', { recursive: true });
  fs.writeFileSync('artifacts/lint-summary.json', JSON.stringify(summary, null, 2));
  console.log('📁 Summary saved to artifacts/lint-summary.json');
} catch (error) {
  console.error('⚠️  Failed to save summary (non-critical):', error.message);
}

console.log('\n📋 Summary:');
console.log(`├─ Prettier: ${prettier.filesWithIssues} files, ${prettier.totalChanges} changes, ${prettier.hunks || 0} hunks`);
console.log(`├─ ESLint: ${eslint.files} files, ${eslint.errors} errors, ${eslint.warnings} warnings`);
console.log('└─ 📁 Check artifacts/ folder for debugging files');

// IMPORTANT: Always exit with success code
console.log('\n✅ Lint check completed - check GitHub Actions logs and artifacts for reviewdog debugging info');
process.exit(0);