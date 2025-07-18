#!/usr/bin/env node
/**
 * Modular lint script that respects user's existing configurations
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const USE_PROJECT_CONFIG = process.env.USE_PROJECT_CONFIG !== 'false';
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'artifacts';
const IS_PR = process.env.GITHUB_EVENT_NAME === 'pull_request';

// Ensure artifacts directory exists
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

/**
 * Check if a config file exists in the project
 */
function hasProjectConfig(configFiles) {
  return configFiles.some(file => fs.existsSync(path.join(process.cwd(), file)));
}

/**
 * Get ESLint config to use
 */
function getESLintConfig() {
  const projectConfigs = [
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.mjs',
    '.eslintrc.json',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs'
  ];
  
  if (USE_PROJECT_CONFIG && hasProjectConfig(projectConfigs)) {
    console.log('✅ Using project ESLint configuration');
    return null; // Use project's config
  }
  
  console.log('📦 Using action\'s default ESLint configuration');
  return path.join(__dirname, '..', '.eslintrc.json');
}

/**
 * Get Prettier config to use
 */
function getPrettierConfig() {
  const projectConfigs = [
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.yml',
    '.prettierrc.yaml',
    '.prettierrc.json5',
    '.prettierrc.js',
    '.prettierrc.cjs',
    '.prettierrc.mjs',
    'prettier.config.js',
    'prettier.config.cjs',
    'prettier.config.mjs'
  ];
  
  if (USE_PROJECT_CONFIG && hasProjectConfig(projectConfigs)) {
    console.log('✅ Using project Prettier configuration');
    return null; // Use project's config
  }
  
  console.log('📦 Using action\'s default Prettier configuration');
  return path.join(__dirname, '..', '.prettierrc.json');
}

/**
 * Run reviewdog for PR comments
 */
function runReviewdog(input, format, name) {
  if (!IS_PR || !process.env.GITHUB_TOKEN) {
    console.log(`📝 Skipping reviewdog (not a PR or no token)`);
    return;
  }
  
  try {
    const result = spawnSync('reviewdog', [
      `-f=${format}`,
      `-name=${name}`,
      '-reporter=github-pr-review',
      '-filter-mode=diff_context',
      '-level=info',
      '-fail-on-error=false'
    ], {
      input: input,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
      env: {
        ...process.env,
        REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN
      }
    });
    
    if (result.status === 0) {
      console.log(`✅ Reviewdog comments posted for ${name}`);
    } else {
      console.log(`⚠️  Reviewdog failed with exit code ${result.status}`);
    }
  } catch (error) {
    console.error(`❌ Reviewdog error: ${error.message}`);
  }
}

/**
 * Run Prettier checks
 */
function runPrettier() {
  console.log('\n▶ Running Prettier checks...');
  
  const config = getPrettierConfig();
  const configArg = config ? `--config "${config}"` : '';
  
  try {
    // Get list of files that need formatting
    let filesToFormat = '';
    try {
      filesToFormat = execSync(
        `npx prettier ${configArg} --list-different "tests/**/*.{js,ts,tsx,json}" 2>/dev/null`,
        { encoding: 'utf8' }
      );
    } catch (e) {
      // Prettier exits with 1 if files need formatting
      filesToFormat = e.stdout || '';
    }
    
    const files = filesToFormat.split('\n').filter(Boolean);
    
    if (files.length === 0) {
      console.log('✅ All files are properly formatted');
      return {
        filesWithIssues: 0,
        totalChanges: 0,
        files: [],
        sample: ''
      };
    }
    
    console.log(`📝 Found ${files.length} files needing formatting`);
    
    // Generate diff for reviewdog
    let combinedDiff = '';
    let totalChanges = 0;
    
    for (const file of files) {
      try {
        const original = fs.readFileSync(file, 'utf8');
        const formatted = execSync(`npx prettier ${configArg} "${file}"`, { encoding: 'utf8' });
        
        if (original !== formatted) {
          // Create simple diff
          const lines = original.split('\n');
          const formattedLines = formatted.split('\n');
          let diff = `diff --git a/${file} b/${file}\n`;
          diff += `index 0000000..1111111 100644\n`;
          diff += `--- a/${file}\n`;
          diff += `+++ b/${file}\n`;
          
          // Simple line-by-line diff
          const maxLines = Math.max(lines.length, formattedLines.length);
          for (let i = 0; i < maxLines; i++) {
            if (lines[i] !== formattedLines[i]) {
              if (lines[i] !== undefined) diff += `-${lines[i]}\n`;
              if (formattedLines[i] !== undefined) diff += `+${formattedLines[i]}\n`;
              totalChanges++;
            }
          }
          
          combinedDiff += diff;
        }
      } catch (error) {
        console.log(`⚠️  Error processing ${file}: ${error.message}`);
      }
    }
    
    // Save results
    const result = {
      filesWithIssues: files.length,
      totalChanges: totalChanges,
      files: files,
      sample: combinedDiff.split('\n').slice(0, 20).join('\n')
    };
    
    // Send to reviewdog if we have a diff
    if (combinedDiff && IS_PR) {
      runReviewdog(combinedDiff, 'diff', 'prettier');
    }
    
    return result;
    
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

/**
 * Run ESLint checks
 */
function runESLint() {
  console.log('\n▶ Running ESLint checks...');
  
  const config = getESLintConfig();
  const configArg = config ? `--config "${config}"` : '';
  
  try {
    let jsonOutput = '';
    try {
      jsonOutput = execSync(
        `npx eslint ${configArg} "tests/**/*.{js,ts,tsx}" --format json`,
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );
    } catch (e) {
      // ESLint exits with 1 if there are lint errors
      jsonOutput = e.stdout || '';
    }
    
    if (!jsonOutput) {
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
              firstError = `${msg.ruleId} in ${path.basename(file.filePath)}:${msg.line}`;
            }
          } else if (msg.severity === 1) {
            warnings++;
            if (msg.fix) fixableWarnings++;
          }
        });
      }
    });
    
    console.log(`📊 ESLint found: ${errors} errors, ${warnings} warnings in ${filesWithIssues.size} files`);
    
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
async function main() {
  console.log('🚀 Starting code quality checks...');
  console.log(`📁 Artifacts directory: ${ARTIFACTS_DIR}`);
  console.log(`🔧 Use project configs: ${USE_PROJECT_CONFIG}`);
  
  const results = {
    prettier: runPrettier(),
    eslint: runESLint()
  };
  
  // Save summary
  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'lint-summary.json'),
    JSON.stringify(results, null, 2)
  );
  
  // Also save individual results for modular workflows
  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'prettier-summary.json'),
    JSON.stringify(results.prettier, null, 2)
  );
  
  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'eslint-summary.json'),
    JSON.stringify(results.eslint, null, 2)
  );
  
  console.log('\n✅ Code quality checks completed');
  console.log(`📊 Results saved to ${ARTIFACTS_DIR}/`);
  
  // Always exit successfully - linting should not fail the workflow
  process.exit(0);
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(0); // Still exit successfully
});