#!/usr/bin/env node
/**
 * Modular checklist generator that adapts to available artifacts
 */
const fs = require('fs');
const path = require('path');

// Configuration
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'artifacts';
const MODE = process.env.MODE || 'full';

// Ensure artifacts directory exists
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

/**
 * Check if a file exists in artifacts directory
 */
function artifactExists(filename) {
  return fs.existsSync(path.join(ARTIFACTS_DIR, filename));
}

/**
 * Check if any file matching pattern exists
 */
function artifactPatternExists(pattern) {
  try {
    const files = fs.readdirSync(ARTIFACTS_DIR);
    return files.some(file => file.includes(pattern));
  } catch {
    return false;
  }
}

/**
 * Generate checklist based on available artifacts and mode
 */
function generateChecklist() {
  console.log('📋 Generating review checklist...');
  console.log(`📁 Artifacts directory: ${ARTIFACTS_DIR}`);
  console.log(`🔧 Mode: ${MODE}`);
  
  const items = [];
  
  // Always checked - action was triggered
  items.push({
    checked: true,
    text: 'GitHub Action triggered',
    category: 'setup'
  });
  
  // Mode-specific checks
  if (MODE === 'full' || MODE === 'test-only') {
    // Playwright test checks
    const hasPlaywrightSummary = artifactExists('playwright-summary.json');
    const hasPlaywrightMetrics = artifactExists('playwright-metrics.json');
    const hasPlaywrightReport = artifactExists('playwright-report') || 
                               artifactPatternExists('playwright-report');
    
    items.push({
      checked: hasPlaywrightSummary || hasPlaywrightMetrics,
      text: 'Playwright tests executed',
      category: 'tests'
    });
    
    if (hasPlaywrightSummary) {
      try {
        const summary = JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, 'playwright-summary.json'), 'utf8'));
        if (summary.total > 0) {
          items.push({
            checked: true,
            text: `${summary.total} tests run (${summary.passed} passed, ${summary.failed} failed)`,
            category: 'tests'
          });
        }
      } catch (e) {
        console.log('⚠️  Could not read test summary');
      }
    }
    
    items.push({
      checked: hasPlaywrightReport,
      text: 'Test report generated',
      category: 'tests'
    });
  }
  
  if (MODE === 'full' || MODE === 'lint-only') {
    // Linting checks
    const hasLintSummary = artifactExists('lint-summary.json');
    const hasEslintSummary = artifactExists('eslint-summary.json');
    const hasPrettierSummary = artifactExists('prettier-summary.json');
    
    items.push({
      checked: hasLintSummary || hasEslintSummary,
      text: 'ESLint analysis completed',
      category: 'quality'
    });
    
    items.push({
      checked: hasLintSummary || hasPrettierSummary,
      text: 'Prettier formatting checked',
      category: 'quality'
    });
    
    // Add specific lint results if available
    if (hasLintSummary) {
      try {
        const lint = JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, 'lint-summary.json'), 'utf8'));
        if (lint.eslint) {
          items.push({
            checked: lint.eslint.errors === 0,
            text: `ESLint: ${lint.eslint.errors} errors, ${lint.eslint.warnings} warnings`,
            category: 'quality'
          });
        }
        if (lint.prettier) {
          items.push({
            checked: lint.prettier.filesWithIssues === 0,
            text: `Prettier: ${lint.prettier.filesWithIssues} files need formatting`,
            category: 'quality'
          });
        }
      } catch (e) {
        console.log('⚠️  Could not read lint summary');
      }
    }
  }
  
  if (MODE === 'full' || MODE === 'dashboard-only') {
    // Dashboard generation checks
    const hasFlowchart = artifactExists('flowchart.png') || artifactExists('flowchart.mmd');
    const hasWebReport = artifactExists('web-report/index.html');
    
    items.push({
      checked: hasFlowchart,
      text: 'Test flow visualization created',
      category: 'dashboard'
    });
    
    items.push({
      checked: hasWebReport,
      text: 'Interactive dashboard generated',
      category: 'dashboard'
    });
  }
  
  // Visual comparison checks (if available)
  const hasVisualComparison = artifactExists('playwright-summary-pr.json') && 
                             artifactExists('playwright-summary-main.json');
  if (hasVisualComparison) {
    items.push({
      checked: true,
      text: 'Visual comparison completed (PR vs Main)',
      category: 'comparison'
    });
  }
  
  // Add custom checks based on environment variables
  if (process.env.CUSTOM_CHECKS) {
    try {
      const customChecks = JSON.parse(process.env.CUSTOM_CHECKS);
      customChecks.forEach(check => {
        items.push({
          checked: artifactExists(check.file),
          text: check.text,
          category: 'custom'
        });
      });
    } catch (e) {
      console.log('⚠️  Could not parse custom checks');
    }
  }
  
  return items;
}

/**
 * Format checklist as markdown
 */
function formatMarkdown(items) {
  const lines = [];
  
  // Simple checklist format matching the image
  const checklistItems = [
    { checked: true, text: 'GitHub Action triggered' },
    { checked: items.some(i => i.text.includes('Playwright tests') && i.checked), text: 'Playwright tests completed' },
    { checked: items.some(i => i.text.includes('ESLint') && i.checked), text: 'ESLint executed' },
    { checked: items.some(i => i.text.includes('Prettier') && i.checked), text: 'Prettier check completed' },
    { checked: items.some(i => i.text.includes('Test') && i.checked), text: 'Test summary generated' },
    { checked: items.some(i => i.text.includes('flowchart') && i.checked), text: 'Flowchart created' }
  ];
  
  checklistItems.forEach(item => {
    lines.push(`- [${item.checked ? 'x' : ' '}] ${item.text}`);
  });
  
  return lines.join('\n') + '\n';
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 Starting checklist generation...');
    
    // Generate checklist items
    const items = generateChecklist();
    console.log(`📝 Generated ${items.length} checklist items`);
    
    // Format as markdown
    const markdown = formatMarkdown(items);
    
    // Save checklist
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'checklist.md'), markdown);
    console.log('✅ Checklist saved to artifacts/checklist.md');
    
    // Also save as JSON for programmatic access
    const json = {
      total: items.length,
      checked: items.filter(i => i.checked).length,
      items: items,
      markdown: markdown
    };
    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'checklist.json'),
      JSON.stringify(json, null, 2)
    );
    console.log('✅ Checklist JSON saved');
    
    // Print summary
    console.log(`\n📊 Summary: ${json.checked}/${json.total} items checked`);
    
    // Show the checklist
    console.log('\n📋 Checklist:\n');
    console.log(markdown);
    
  } catch (error) {
    console.error('❌ Error generating checklist:', error.message);
    
    // Create minimal checklist
    const fallback = '### 🚀 Setup\n- [x] GitHub Action triggered\n- [ ] Checklist generation failed\n';
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'checklist.md'), fallback);
    
    process.exit(0); // Don't fail the workflow
  }
}

// Run the script
main();