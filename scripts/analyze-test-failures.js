#!/usr/bin/env node
/**
 * analyze-test-failures.js
 * Analyzes test failures to identify patterns and provide actionable insights
 * Helps reviewers quickly understand and fix common issues
 */

const fs = require('fs');
const path = require('path');

const ART = 'artifacts';

// Read test metrics
const metricsPath = fs.existsSync('playwright-metrics.json') 
  ? 'playwright-metrics.json' 
  : path.join(ART, 'playwright-metrics.json');

if (!fs.existsSync(metricsPath)) {
  console.log('No test metrics found, skipping analysis');
  process.exit(0);
}

const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));

// Common failure patterns with solutions
const failurePatterns = [
  {
    pattern: /timeout.*waiting for/i,
    type: 'timeout',
    category: 'Timing Issues',
    solution: 'Increase timeout values or wait for specific conditions instead of fixed delays',
    severity: 'medium'
  },
  {
    pattern: /element.*not found|cannot find element/i,
    type: 'element-not-found',
    category: 'Selector Issues',
    solution: 'Check if selectors have changed or use more robust locators (data-testid)',
    severity: 'high'
  },
  {
    pattern: /network|fetch|xhr|api/i,
    type: 'network',
    category: 'Network Issues',
    solution: 'Mock API responses or add proper network wait conditions',
    severity: 'medium'
  },
  {
    pattern: /navigation|page.*load|navigate/i,
    type: 'navigation',
    category: 'Navigation Issues',
    solution: 'Add proper page load wait conditions or check navigation flow',
    severity: 'medium'
  },
  {
    pattern: /click|tap|press/i,
    type: 'interaction',
    category: 'Interaction Issues',
    solution: 'Ensure element is visible and enabled before interaction',
    severity: 'low'
  },
  {
    pattern: /assertion.*failed|expect.*to/i,
    type: 'assertion',
    category: 'Assertion Failures',
    solution: 'Review expected values and ensure test data is consistent',
    severity: 'low'
  },
  {
    pattern: /permission|access.*denied|forbidden/i,
    type: 'permission',
    category: 'Permission Issues',
    solution: 'Check authentication/authorization setup in tests',
    severity: 'high'
  },
  {
    pattern: /memory|heap|oom/i,
    type: 'memory',
    category: 'Performance Issues',
    solution: 'Optimize test cleanup or split large test suites',
    severity: 'critical'
  }
];

// Analyze failures
const failures = [];
const failuresByPattern = {};
const failuresByFile = {};

// Extract all failed tests
metrics.suites.forEach(suite => {
  const fileName = path.basename(suite.file);
  
  suite.suites.forEach(s => {
    s.specs.forEach(spec => {
      spec.tests.forEach(test => {
        test.results.forEach(result => {
          if (result.status === 'failed' || result.status === 'unexpected') {
            const failure = {
              file: fileName,
              suite: s.title,
              test: spec.title,
              error: result.error?.message || 'Unknown error',
              stack: result.error?.stack || '',
              duration: result.duration,
              retry: result.retry || 0
            };
            
            // Match against patterns
            failure.patterns = [];
            failurePatterns.forEach(pattern => {
              if (pattern.pattern.test(failure.error) || pattern.pattern.test(failure.stack)) {
                failure.patterns.push(pattern);
                
                if (!failuresByPattern[pattern.type]) {
                  failuresByPattern[pattern.type] = [];
                }
                failuresByPattern[pattern.type].push(failure);
              }
            });
            
            // Group by file
            if (!failuresByFile[fileName]) {
              failuresByFile[fileName] = [];
            }
            failuresByFile[fileName].push(failure);
            
            failures.push(failure);
          }
        });
      });
    });
  });
});

// Analyze flaky tests (failed but passed on retry)
const flakyTests = [];
metrics.suites.forEach(suite => {
  suite.suites.forEach(s => {
    s.specs.forEach(spec => {
      spec.tests.forEach(test => {
        const results = test.results || [];
        const hasFailure = results.some(r => r.status === 'failed');
        const hasSuccess = results.some(r => r.status === 'passed' || r.status === 'expected');
        
        if (hasFailure && hasSuccess && results.length > 1) {
          flakyTests.push({
            file: path.basename(suite.file),
            suite: s.title,
            test: spec.title,
            attempts: results.length,
            finalStatus: results[results.length - 1].status
          });
        }
      });
    });
  });
});

// Generate insights
const insights = {
  summary: {
    totalFailures: failures.length,
    uniqueFailurePatterns: Object.keys(failuresByPattern).length,
    affectedFiles: Object.keys(failuresByFile).length,
    flakyTests: flakyTests.length
  },
  
  topIssues: Object.entries(failuresByPattern)
    .map(([type, failures]) => {
      const pattern = failurePatterns.find(p => p.type === type);
      return {
        type,
        category: pattern.category,
        count: failures.length,
        severity: pattern.severity,
        solution: pattern.solution,
        examples: failures.slice(0, 3).map(f => ({
          test: `${f.file} > ${f.test}`,
          error: f.error.substring(0, 100) + '...'
        }))
      };
    })
    .sort((a, b) => b.count - a.count),
  
  fileAnalysis: Object.entries(failuresByFile)
    .map(([file, failures]) => ({
      file,
      failureCount: failures.length,
      patterns: [...new Set(failures.flatMap(f => f.patterns.map(p => p.category)))],
      mostCommonIssue: failures[0]?.patterns[0]?.category || 'Unknown'
    }))
    .sort((a, b) => b.failureCount - a.failureCount),
  
  flakyTests: flakyTests.map(test => ({
    ...test,
    recommendation: 'Add retry logic or stabilize test conditions'
  })),
  
  recommendations: generateRecommendations(failures, failuresByPattern, flakyTests)
};

// Generate actionable recommendations
function generateRecommendations(failures, patterns, flakyTests) {
  const recommendations = [];
  
  // High-level recommendations based on patterns
  if (patterns['timeout'] && patterns['timeout'].length > 3) {
    recommendations.push({
      priority: 'high',
      title: 'Widespread Timeout Issues',
      description: `${patterns['timeout'].length} tests are failing due to timeouts`,
      action: 'Consider increasing global timeout settings or optimizing test performance',
      command: 'playwright.config.js: use: { timeout: 60000 }'
    });
  }
  
  if (patterns['element-not-found'] && patterns['element-not-found'].length > 2) {
    recommendations.push({
      priority: 'high',
      title: 'Selector Stability Issues',
      description: `${patterns['element-not-found'].length} tests can't find elements`,
      action: 'Implement data-testid attributes for stable selectors',
      example: '<button data-testid="submit-button">Submit</button>'
    });
  }
  
  if (patterns['network'] && patterns['network'].length > 0) {
    recommendations.push({
      priority: 'medium',
      title: 'Network Dependency Issues',
      description: 'Tests are failing due to network/API issues',
      action: 'Implement API mocking to make tests more reliable',
      example: `await page.route('**/api/*', route => route.fulfill({ 
  status: 200, 
  body: JSON.stringify({ data: 'mocked' }) 
}))`
    });
  }
  
  if (flakyTests.length > 2) {
    recommendations.push({
      priority: 'medium',
      title: `${flakyTests.length} Flaky Tests Detected`,
      description: 'These tests pass on retry but fail initially',
      action: 'Stabilize tests by adding proper wait conditions',
      tests: flakyTests.slice(0, 5).map(t => t.test)
    });
  }
  
  // Specific fixes for common issues
  if (failures.some(f => f.error.includes('ERR_ABORTED'))) {
    recommendations.push({
      priority: 'low',
      title: 'Resource Loading Issues',
      description: 'Some resources are being aborted during tests',
      action: 'Add `ignoreHTTPSErrors: true` to playwright config'
    });
  }
  
  return recommendations;
}

// Write analysis results
fs.mkdirSync(ART, { recursive: true });
fs.writeFileSync(
  path.join(ART, 'test-failure-analysis.json'),
  JSON.stringify(insights, null, 2)
);

// Generate markdown report
const generateMarkdownReport = (insights) => {
  let md = '# Test Failure Analysis Report\n\n';
  
  md += `## Summary\n`;
  md += `- **Total Failures**: ${insights.summary.totalFailures}\n`;
  md += `- **Failure Patterns**: ${insights.summary.uniqueFailurePatterns}\n`;
  md += `- **Affected Files**: ${insights.summary.affectedFiles}\n`;
  md += `- **Flaky Tests**: ${insights.summary.flakyTests}\n\n`;
  
  if (insights.topIssues.length > 0) {
    md += `## Top Issues\n\n`;
    insights.topIssues.forEach((issue, index) => {
      const severityEmoji = {
        'critical': '🔴',
        'high': '🟠',
        'medium': '🟡',
        'low': '🟢'
      }[issue.severity] || '⚪';
      
      md += `### ${index + 1}. ${issue.category} ${severityEmoji}\n`;
      md += `- **Occurrences**: ${issue.count}\n`;
      md += `- **Solution**: ${issue.solution}\n`;
      if (issue.examples.length > 0) {
        md += `- **Examples**:\n`;
        issue.examples.forEach(ex => {
          md += `  - \`${ex.test}\`: ${ex.error}\n`;
        });
      }
      md += '\n';
    });
  }
  
  if (insights.recommendations.length > 0) {
    md += `## Recommended Actions\n\n`;
    insights.recommendations.forEach((rec, index) => {
      const priorityEmoji = {
        'high': '🚨',
        'medium': '⚠️',
        'low': 'ℹ️'
      }[rec.priority] || '📌';
      
      md += `### ${priorityEmoji} ${rec.title}\n`;
      md += `${rec.description}\n\n`;
      md += `**Action**: ${rec.action}\n`;
      if (rec.command) {
        md += `\n\`\`\`\n${rec.command}\n\`\`\`\n`;
      }
      if (rec.example) {
        md += `\n**Example**:\n\`\`\`javascript\n${rec.example}\n\`\`\`\n`;
      }
      md += '\n';
    });
  }
  
  if (insights.flakyTests.length > 0) {
    md += `## Flaky Tests\n\n`;
    md += `These tests are unstable and may need attention:\n\n`;
    insights.flakyTests.forEach(test => {
      md += `- \`${test.file}\` > \`${test.test}\` (${test.attempts} attempts)\n`;
    });
  }
  
  return md;
};

const markdownReport = generateMarkdownReport(insights);
fs.writeFileSync(
  path.join(ART, 'test-failure-analysis.md'),
  markdownReport
);

console.log('🔍 Test failure analysis complete');
console.log(`📊 Found ${insights.summary.totalFailures} failures with ${insights.summary.uniqueFailurePatterns} patterns`);
console.log(`💡 Generated ${insights.recommendations.length} recommendations`);
console.log('📄 Reports saved to:');
console.log('   - artifacts/test-failure-analysis.json');
console.log('   - artifacts/test-failure-analysis.md');