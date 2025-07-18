#!/usr/bin/env node
/**
 * Modular Playwright test runner that generates artifacts for dashboard
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'artifacts';
const METRICS_FILE = 'playwright-metrics.json';

// Ensure artifacts directory exists
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

console.log('🎭 Running Playwright tests...');
console.log(`📁 Artifacts directory: ${ARTIFACTS_DIR}`);

try {
  // Install Playwright browsers if needed
  if (!fs.existsSync(path.join(process.env.HOME || '', '.cache', 'ms-playwright'))) {
    console.log('📦 Installing Playwright browsers...');
    execSync('npx playwright install --with-deps', { stdio: 'inherit' });
  }
  
  // Run Playwright tests with JSON reporter
  console.log('🧪 Executing tests...');
  try {
    execSync('npx playwright test --reporter=json', { stdio: 'inherit' });
  } catch (testError) {
    // Tests might fail but we still want to process results
    console.log('⚠️  Some tests failed (this is OK, continuing...)');
  }
  
  // Check if metrics file exists
  if (!fs.existsSync(METRICS_FILE)) {
    console.error('❌ No playwright-metrics.json found');
    // Create empty summary
    const emptySummary = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      pass_rate: 0
    };
    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'playwright-summary.json'),
      JSON.stringify(emptySummary, null, 2)
    );
    process.exit(0);
  }
  
  // Parse the metrics
  console.log('📊 Processing test results...');
  const metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
  
  // Copy the full metrics for detailed analysis
  fs.copyFileSync(METRICS_FILE, path.join(ARTIFACTS_DIR, METRICS_FILE));
  
  // Extract summary statistics
  const stats = metrics.stats || {};
  const passed = stats.expected || stats.passed || 0;
  const failed = stats.unexpected || stats.failed || 0;
  const skipped = stats.skipped || 0;
  const total = stats.total || (passed + failed + skipped);
  const duration = stats.duration || 0;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  
  // Create summary for dashboard
  const summary = {
    total,
    passed,
    failed,
    skipped,
    duration,
    pass_rate: passRate
  };
  
  // Save summary
  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'playwright-summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log('📈 Test Summary:');
  console.log(`   Total: ${total}`);
  console.log(`   Passed: ${passed} (${passRate}%)`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
  
  // Copy HTML report if it exists
  if (fs.existsSync('playwright-report')) {
    console.log('📋 Copying HTML report...');
    const reportDest = path.join(ARTIFACTS_DIR, 'playwright-report');
    fs.mkdirSync(reportDest, { recursive: true });
    
    // Simple recursive copy
    const copyRecursive = (src, dest) => {
      const stats = fs.statSync(src);
      if (stats.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(child => {
          copyRecursive(path.join(src, child), path.join(dest, child));
        });
      } else {
        fs.copyFileSync(src, dest);
      }
    };
    
    copyRecursive('playwright-report', reportDest);
    console.log('✅ HTML report copied to artifacts');
  }
  
  // Save test details for flowchart generation
  if (metrics.suites && metrics.suites.length > 0) {
    console.log('📊 Saving detailed test information...');
    const testDetails = [];
    
    metrics.suites.forEach(suite => {
      const file = suite.file || 'unknown';
      suite.suites?.forEach(subSuite => {
        subSuite.specs?.forEach(spec => {
          spec.tests?.forEach(test => {
            test.results?.forEach(result => {
              testDetails.push({
                file: path.basename(file),
                suite: subSuite.title || 'Default',
                test: spec.title || 'Unknown',
                status: result.status || 'unknown',
                duration: result.duration || 0,
                error: result.error?.message || null
              });
            });
          });
        });
      });
    });
    
    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'test-details.json'),
      JSON.stringify(testDetails, null, 2)
    );
  }
  
  console.log(`\n✅ Playwright test artifacts saved to ${ARTIFACTS_DIR}/`);
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
  
} catch (error) {
  console.error('❌ Fatal error:', error.message);
  
  // Create error summary
  const errorSummary = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    pass_rate: 0,
    error: error.message
  };
  
  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, 'playwright-summary.json'),
    JSON.stringify(errorSummary, null, 2)
  );
  
  process.exit(0); // Don't fail the workflow
}