#!/usr/bin/env node
/**
 * track-test-history.js
 * Tracks test results over time to identify flaky tests and trends
 * Maintains a rolling history of test runs
 */

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = '.test-history.json';
const MAX_HISTORY_ENTRIES = 50;
const ART = 'artifacts';

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return { 
      tests: {}, 
      runs: [],
      version: '1.0'
    };
  }
}

function analyzeCurrentRun() {
  // Try multiple locations for metrics file
  const possiblePaths = [
    'playwright-metrics.json',
    path.join(ART, 'playwright-metrics.json'),
    'metrics.json'
  ];
  
  let metricsPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      metricsPath = p;
      break;
    }
  }
  
  if (!metricsPath) {
    console.log('No test metrics found, skipping history update');
    return null;
  }
  
  const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  const timestamp = new Date().toISOString();
  const sha = process.env.GITHUB_SHA?.slice(0, 8) || 'local';
  const branch = process.env.GITHUB_REF?.replace('refs/heads/', '') || 'unknown';
  
  const runData = {
    timestamp,
    sha,
    branch,
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: metrics.stats?.duration || 0
  };
  
  const testResults = {};
  
  // Process test results
  if (metrics.suites) {
    metrics.suites.forEach(suite => {
      const suiteName = path.basename(suite.file || 'unknown').replace(/\.(spec|test)\.(js|ts)$/, '');
      
      suite.suites.forEach(s => {
        s.specs.forEach(spec => {
          const testName = `${suiteName} > ${s.title} > ${spec.title}`;
          const test = spec.tests[0];
          
          if (test && test.results && test.results.length > 0) {
            runData.total++;
            
            // Get the final result (after retries)
            const finalResult = test.results[test.results.length - 1];
            const status = finalResult.status === 'passed' || finalResult.status === 'expected' ? 'passed' : 
                          finalResult.status === 'failed' || finalResult.status === 'unexpected' ? 'failed' : 
                          'skipped';
            
            if (status === 'passed') runData.passed++;
            else if (status === 'failed') runData.failed++;
            else runData.skipped++;
            
            // Check if test was retried (flaky indicator)
            const wasRetried = test.results.length > 1;
            const hadMixedResults = test.results.some(r => r.status === 'passed' || r.status === 'expected') &&
                                  test.results.some(r => r.status === 'failed' || r.status === 'unexpected');
            
            testResults[testName] = {
              status,
              duration: finalResult.duration || 0,
              retries: test.results.length - 1,
              wasFlaky: wasRetried && hadMixedResults,
              error: status === 'failed' ? (finalResult.error?.message || 'Unknown error') : null
            };
          }
        });
      });
    });
  }
  
  runData.passRate = runData.total > 0 ? Math.round((runData.passed / runData.total) * 100) : 0;
  
  return { runData, testResults };
}

function updateHistory(history, currentRun) {
  // Add current run to history
  history.runs.push(currentRun.runData);
  
  // Keep only recent runs
  if (history.runs.length > MAX_HISTORY_ENTRIES) {
    history.runs = history.runs.slice(-MAX_HISTORY_ENTRIES);
  }
  
  // Update per-test statistics
  Object.entries(currentRun.testResults).forEach(([testName, result]) => {
    if (!history.tests[testName]) {
      history.tests[testName] = {
        firstSeen: new Date().toISOString(),
        runs: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        totalDuration: 0,
        flakiness: 0,
        lastStatus: null,
        statusChanges: 0,
        recentStatuses: [],
        flakyRuns: 0,
        lastError: null,
        averageDuration: 0,
        maxDuration: 0,
        minDuration: Infinity
      };
    }
    
    const testHistory = history.tests[testName];
    testHistory.runs++;
    
    // Update counts
    if (result.status === 'passed') testHistory.passed++;
    else if (result.status === 'failed') {
      testHistory.failed++;
      testHistory.lastError = result.error;
    }
    else testHistory.skipped++;
    
    // Update duration stats
    testHistory.totalDuration += result.duration;
    testHistory.averageDuration = Math.round(testHistory.totalDuration / testHistory.runs);
    testHistory.maxDuration = Math.max(testHistory.maxDuration, result.duration);
    testHistory.minDuration = Math.min(testHistory.minDuration, result.duration);
    
    // Track flaky runs
    if (result.wasFlaky) {
      testHistory.flakyRuns++;
    }
    
    // Track status changes for flakiness calculation
    if (testHistory.lastStatus && testHistory.lastStatus !== result.status) {
      testHistory.statusChanges++;
    }
    testHistory.lastStatus = result.status;
    
    // Keep recent status history (last 10 runs)
    testHistory.recentStatuses.push(result.status);
    if (testHistory.recentStatuses.length > 10) {
      testHistory.recentStatuses.shift();
    }
    
    // Calculate flakiness score (0-100)
    // Based on: status changes, flaky runs, and recent inconsistency
    if (testHistory.runs > 1) {
      const changeRate = testHistory.statusChanges / (testHistory.runs - 1);
      const flakyRate = testHistory.flakyRuns / testHistory.runs;
      const recentInconsistency = calculateRecentInconsistency(testHistory.recentStatuses);
      
      // Weighted average of factors
      testHistory.flakiness = Math.round(
        (changeRate * 40 + flakyRate * 40 + recentInconsistency * 20) * 100
      );
    }
    
    // Calculate success rate
    testHistory.successRate = Math.round((testHistory.passed / testHistory.runs) * 100);
  });
  
  // Clean up old tests that haven't run in a while
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30); // 30 days
  
  Object.entries(history.tests).forEach(([testName, data]) => {
    if (new Date(data.firstSeen) < cutoffDate && !currentRun.testResults[testName]) {
      // Test hasn't run in 30 days, consider removing
      if (data.runs < 5) {
        // Remove if it had very few runs
        delete history.tests[testName];
      }
    }
  });
  
  return history;
}

function calculateRecentInconsistency(statuses) {
  if (statuses.length < 2) return 0;
  
  let changes = 0;
  for (let i = 1; i < statuses.length; i++) {
    if (statuses[i] !== statuses[i - 1]) {
      changes++;
    }
  }
  
  return changes / (statuses.length - 1);
}

function generateInsights(history) {
  const insights = {
    flakyTests: [],
    slowTests: [],
    failingTests: [],
    improvedTests: [],
    degradedTests: [],
    trends: {},
    summary: {}
  };
  
  // Analyze individual tests
  Object.entries(history.tests).forEach(([testName, stats]) => {
    // Skip tests with too few runs
    if (stats.runs < 3) return;
    
    // Flaky tests (high flakiness score)
    if (stats.flakiness > 20) {
      insights.flakyTests.push({
        name: testName,
        flakiness: stats.flakiness,
        successRate: stats.successRate,
        runs: stats.runs,
        flakyRuns: stats.flakyRuns,
        lastError: stats.lastError
      });
    }
    
    // Consistently failing tests
    if (stats.successRate < 50) {
      insights.failingTests.push({
        name: testName,
        successRate: stats.successRate,
        runs: stats.runs,
        lastError: stats.lastError
      });
    }
    
    // Slow tests (average duration > 5 seconds)
    if (stats.averageDuration > 5000) {
      insights.slowTests.push({
        name: testName,
        avgDuration: stats.averageDuration,
        maxDuration: stats.maxDuration,
        runs: stats.runs
      });
    }
    
    // Check for improvement/degradation in recent runs
    if (stats.recentStatuses.length >= 5) {
      const recentPassRate = stats.recentStatuses.filter(s => s === 'passed').length / stats.recentStatuses.length;
      const overallPassRate = stats.successRate / 100;
      
      if (recentPassRate > overallPassRate + 0.2) {
        insights.improvedTests.push({
          name: testName,
          improvement: Math.round((recentPassRate - overallPassRate) * 100),
          currentRate: Math.round(recentPassRate * 100)
        });
      } else if (recentPassRate < overallPassRate - 0.2) {
        insights.degradedTests.push({
          name: testName,
          degradation: Math.round((overallPassRate - recentPassRate) * 100),
          currentRate: Math.round(recentPassRate * 100)
        });
      }
    }
  });
  
  // Sort by severity
  insights.flakyTests.sort((a, b) => b.flakiness - a.flakiness);
  insights.slowTests.sort((a, b) => b.avgDuration - a.avgDuration);
  insights.failingTests.sort((a, b) => a.successRate - b.successRate);
  
  // Calculate trends (last 10 runs)
  const recentRuns = history.runs.slice(-10);
  if (recentRuns.length > 0) {
    insights.trends = {
      runs: recentRuns.length,
      avgPassRate: Math.round(
        recentRuns.reduce((sum, run) => sum + (run.passRate || 0), 0) / recentRuns.length
      ),
      avgDuration: Math.round(
        recentRuns.reduce((sum, run) => sum + run.duration, 0) / recentRuns.length
      ),
      avgTestCount: Math.round(
        recentRuns.reduce((sum, run) => sum + run.total, 0) / recentRuns.length
      ),
      improving: false,
      degrading: false
    };
    
    // Check trend direction
    if (recentRuns.length >= 3) {
      const firstHalf = recentRuns.slice(0, Math.floor(recentRuns.length / 2));
      const secondHalf = recentRuns.slice(Math.floor(recentRuns.length / 2));
      
      const firstAvg = firstHalf.reduce((sum, run) => sum + (run.passRate || 0), 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, run) => sum + (run.passRate || 0), 0) / secondHalf.length;
      
      if (secondAvg > firstAvg + 5) {
        insights.trends.improving = true;
      } else if (secondAvg < firstAvg - 5) {
        insights.trends.degrading = true;
      }
    }
  }
  
  // Summary statistics
  insights.summary = {
    totalTests: Object.keys(history.tests).length,
    totalRuns: history.runs.length,
    flakyTestCount: insights.flakyTests.length,
    failingTestCount: insights.failingTests.length,
    slowTestCount: insights.slowTests.length
  };
  
  return insights;
}

function generateReport(insights) {
  let report = '# 📈 Test History Analysis\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;
  
  // Summary
  report += '## Summary\n\n';
  report += `- **Total Tests Tracked**: ${insights.summary.totalTests}\n`;
  report += `- **Total Runs Analyzed**: ${insights.summary.totalRuns}\n`;
  report += `- **Flaky Tests**: ${insights.summary.flakyTestCount}\n`;
  report += `- **Consistently Failing**: ${insights.summary.failingTestCount}\n`;
  report += `- **Slow Tests**: ${insights.summary.slowTestCount}\n\n`;
  
  // Trends
  if (insights.trends.runs > 0) {
    report += '## Recent Trends\n\n';
    report += `Based on the last ${insights.trends.runs} runs:\n`;
    report += `- **Average Pass Rate**: ${insights.trends.avgPassRate}%\n`;
    report += `- **Average Duration**: ${(insights.trends.avgDuration / 1000).toFixed(1)}s\n`;
    report += `- **Average Test Count**: ${insights.trends.avgTestCount}\n`;
    report += `- **Trend**: ${
      insights.trends.improving ? '📈 Improving' : 
      insights.trends.degrading ? '📉 Degrading' : 
      '➡️ Stable'
    }\n\n`;
  }
  
  // Flaky tests
  if (insights.flakyTests.length > 0) {
    report += '## 🎲 Flaky Tests (Top 10)\n\n';
    report += '| Test | Flakiness | Success Rate | Runs |\n';
    report += '|------|-----------|--------------|------|\n';
    insights.flakyTests.slice(0, 10).forEach(test => {
      report += `| ${test.name} | ${test.flakiness}% | ${test.successRate}% | ${test.runs} |\n`;
    });
    report += '\n';
  }
  
  // Slow tests
  if (insights.slowTests.length > 0) {
    report += '## 🐌 Slowest Tests (Top 5)\n\n';
    report += '| Test | Avg Duration | Max Duration | Runs |\n';
    report += '|------|--------------|--------------|------|\n';
    insights.slowTests.slice(0, 5).forEach(test => {
      report += `| ${test.name} | ${(test.avgDuration / 1000).toFixed(1)}s | ${(test.maxDuration / 1000).toFixed(1)}s | ${test.runs} |\n`;
    });
    report += '\n';
  }
  
  // Improvements and degradations
  if (insights.improvedTests.length > 0) {
    report += '## 📈 Recently Improved Tests\n\n';
    insights.improvedTests.forEach(test => {
      report += `- **${test.name}**: +${test.improvement}% improvement (now ${test.currentRate}% pass rate)\n`;
    });
    report += '\n';
  }
  
  if (insights.degradedTests.length > 0) {
    report += '## 📉 Recently Degraded Tests\n\n';
    insights.degradedTests.forEach(test => {
      report += `- **${test.name}**: -${test.degradation}% degradation (now ${test.currentRate}% pass rate)\n`;
    });
    report += '\n';
  }
  
  return report;
}

// Main execution
console.log('📊 Tracking test history...');

const history = loadHistory();
const currentRun = analyzeCurrentRun();

if (currentRun) {
  const updatedHistory = updateHistory(history, currentRun);
  const insights = generateInsights(updatedHistory);
  
  // Save updated history
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(updatedHistory, null, 2));
  console.log(`✅ Test history updated (${updatedHistory.runs.length} runs, ${Object.keys(updatedHistory.tests).length} tests)`);
  
  // Save insights for dashboard
  fs.mkdirSync(ART, { recursive: true });
  fs.writeFileSync(
    path.join(ART, 'test-history-insights.json'),
    JSON.stringify(insights, null, 2)
  );
  
  // Generate markdown report
  const report = generateReport(insights);
  fs.writeFileSync(path.join(ART, 'test-history-report.md'), report);
  
  // Console summary
  console.log(`📊 Found ${insights.flakyTests.length} flaky tests`);
  console.log(`🐌 Found ${insights.slowTests.length} slow tests`);
  console.log(`📈 Trend: ${
    insights.trends.improving ? 'Improving' : 
    insights.trends.degrading ? 'Degrading' : 
    'Stable'
  }`);
  
  // Exit with appropriate code
  if (insights.summary.failingTestCount > 5 || insights.summary.flakyTestCount > 10) {
    console.warn('⚠️  High number of problematic tests detected');
  }
} else {
  console.log('⏭️  No test run data found, skipping history update');
}