#!/usr/bin/env node
/**
 * generate-quick-actions.js
 * Generates a functional quick actions panel with real GitHub integration
 */

const fs = require('fs');
const path = require('path');

const ART = 'artifacts';

// Read all necessary data
const readJSON = (file, defaultValue = {}) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ART, file), 'utf8'));
  } catch {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return defaultValue;
    }
  }
};

// Gather all data
const playwrightSummary = readJSON('playwright-summary-pr.json');
const lintSummary = readJSON('lint-summary.json');
const failureAnalysis = readJSON('test-failure-analysis.json');
const testHistory = readJSON('test-history-insights.json');
const visualRegression = readJSON('visual-regression-report.json');

// Extract failed test names from metrics
const getFailedTests = () => {
  const metrics = readJSON('playwright-metrics.json');
  const failedTests = [];
  
  if (metrics && metrics.suites) {
    metrics.suites.forEach(suite => {
      suite.suites.forEach(s => {
        s.specs.forEach(spec => {
          spec.tests.forEach(test => {
            const failed = test.results.some(r => r.status === 'failed' || r.status === 'unexpected');
            if (failed) {
              failedTests.push({
                name: spec.title,
                suite: s.title,
                file: path.basename(suite.file || 'unknown'),
                error: test.results.find(r => r.status === 'failed')?.error?.message
              });
            }
          });
        });
      });
    });
  }
  
  return failedTests;
};

const failedTests = getFailedTests();

// GitHub context
const context = {
  repo: process.env.GITHUB_REPOSITORY || 'owner/repo',
  runId: process.env.GITHUB_RUN_ID || '',
  sha: process.env.GITHUB_SHA || '',
  ref: process.env.GITHUB_REF || '',
  prNumber: process.env.GITHUB_EVENT_NAME === 'pull_request' ? 
    (process.env.GITHUB_REF?.match(/pull\/(\d+)/) || [])[1] : '',
  actor: process.env.GITHUB_ACTOR || '',
  workflow: process.env.GITHUB_WORKFLOW || ''
};

// Generate commands based on actual failures and issues
const generateCommands = () => {
  const commands = [];
  let priority = 1;
  
  // 1. Run specific failed tests
  if (failedTests.length > 0) {
    // Group by suite for better organization
    const failedBySuite = {};
    failedTests.forEach(test => {
      if (!failedBySuite[test.suite]) {
        failedBySuite[test.suite] = [];
      }
      failedBySuite[test.suite].push(test);
    });
    
    commands.push({
      id: 'run-all-failed',
      category: 'testing',
      name: 'Run All Failed Tests',
      description: `Run the ${failedTests.length} test(s) that failed in CI`,
      command: `npx playwright test --grep "${failedTests.map(t => t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}"`,
      icon: '🔴',
      priority: priority++,
      metadata: {
        testCount: failedTests.length,
        suites: Object.keys(failedBySuite).length
      }
    });
    
    // Add suite-specific commands if multiple suites
    if (Object.keys(failedBySuite).length > 1) {
      Object.entries(failedBySuite).forEach(([suite, tests]) => {
        commands.push({
          id: `run-suite-${suite.toLowerCase().replace(/\s+/g, '-')}`,
          category: 'testing',
          name: `Run Failed in "${suite}"`,
          description: `Run ${tests.length} failed test(s) from ${suite} suite`,
          command: `npx playwright test --grep "${tests.map(t => t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}"`,
          icon: '🧪',
          priority: priority++
        });
      });
    }
  }
  
  // 2. Debug specific test with headed mode
  if (failedTests.length > 0) {
    const firstFailed = failedTests[0];
    commands.push({
      id: 'debug-headed',
      category: 'debugging',
      name: 'Debug in Browser',
      description: `Open "${firstFailed.name}" in headed mode`,
      command: `npx playwright test --headed --grep "${firstFailed.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
      icon: '🖥️',
      priority: priority++
    });
    
    commands.push({
      id: 'debug-inspector',
      category: 'debugging',
      name: 'Debug with Inspector',
      description: 'Step through the first failed test',
      command: `PWDEBUG=1 npx playwright test --grep "${firstFailed.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
      icon: '🐛',
      priority: priority++
    });
  }
  
  // 3. Fix linting issues
  if (lintSummary?.eslint?.fixableErrors > 0 || lintSummary?.eslint?.fixableWarnings > 0) {
    const total = (lintSummary.eslint.fixableErrors || 0) + (lintSummary.eslint.fixableWarnings || 0);
    commands.push({
      id: 'fix-eslint',
      category: 'linting',
      name: 'Auto-fix ESLint Issues',
      description: `Automatically fix ${total} ESLint issue(s)`,
      command: 'npx eslint . --fix',
      icon: '🔧',
      priority: priority++,
      metadata: {
        errors: lintSummary.eslint.fixableErrors || 0,
        warnings: lintSummary.eslint.fixableWarnings || 0
      }
    });
  }
  
  // 4. Fix prettier issues
  if (lintSummary?.prettier?.filesWithIssues > 0) {
    commands.push({
      id: 'fix-prettier',
      category: 'formatting',
      name: 'Format with Prettier',
      description: `Format ${lintSummary.prettier.filesWithIssues} file(s) with ${lintSummary.prettier.totalChanges} changes`,
      command: 'npx prettier --write .',
      icon: '✨',
      priority: priority++
    });
  }
  
  // 5. Combined fix command if both exist
  if ((lintSummary?.eslint?.fixableErrors > 0 || lintSummary?.prettier?.filesWithIssues > 0)) {
    commands.push({
      id: 'fix-all',
      category: 'quick-fix',
      name: 'Fix All Code Issues',
      description: 'Run ESLint fix and Prettier in one command',
      command: 'npx eslint . --fix && npx prettier --write .',
      icon: '⚡',
      priority: 3 // High priority
    });
  }
  
  // 6. Update snapshots if visual regression detected
  if (visualRegression?.major > 0 || visualRegression?.minor > 0) {
    commands.push({
      id: 'update-snapshots',
      category: 'visual',
      name: 'Update Visual Snapshots',
      description: `Accept ${visualRegression.major + visualRegression.minor} visual changes as new baselines`,
      command: 'npx playwright test --update-snapshots',
      icon: '📸',
      priority: priority++
    });
  }
  
  // 7. Run flaky tests with extra retries
  if (testHistory?.flakyTests?.length > 0) {
    const flakyNames = testHistory.flakyTests.slice(0, 5).map(t => t.name);
    commands.push({
      id: 'test-flaky',
      category: 'testing',
      name: 'Test Flaky Tests',
      description: `Run ${testHistory.flakyTests.length} flaky test(s) with extra retries`,
      command: `npx playwright test --retries=3 --grep "${flakyNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}"`,
      icon: '🎲',
      priority: priority++
    });
  }
  
  // 8. Performance profiling for slow tests
  if (testHistory?.slowTests?.length > 0) {
    commands.push({
      id: 'profile-slow',
      category: 'performance',
      name: 'Profile Slow Tests',
      description: 'Run slow tests with performance tracing',
      command: `npx playwright test --trace=on --grep "${testHistory.slowTests[0].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
      icon: '⏱️',
      priority: priority++
    });
  }
  
  // 9. Test recommendations from failure analysis
  if (failureAnalysis?.recommendations?.length > 0) {
    failureAnalysis.recommendations.slice(0, 3).forEach((rec, idx) => {
      if (rec.command) {
        commands.push({
          id: `recommendation-${idx}`,
          category: 'recommended',
          name: rec.title || 'Recommended Fix',
          description: rec.description,
          command: rec.command,
          icon: '💡',
          priority: 5 + idx
        });
      }
    });
  }
  
  // 10. Standard utility commands
  commands.push({
    id: 'test-chrome',
    category: 'testing',
    name: 'Test Chrome Only',
    description: 'Run all tests in Chromium browser',
    command: 'npx playwright test --project=chromium',
    icon: '🌐',
    priority: 20
  });
  
  commands.push({
    id: 'test-parallel',
    category: 'performance',
    name: 'Run Tests in Parallel',
    description: 'Speed up test execution with parallelization',
    command: 'npx playwright test --workers=4',
    icon: '🚀',
    priority: 21
  });
  
  commands.push({
    id: 'coverage',
    category: 'reporting',
    name: 'Generate Coverage Report',
    description: 'Create detailed HTML test report',
    command: 'npx playwright test --reporter=html && npx playwright show-report',
    icon: '📊',
    priority: 25
  });
  
  commands.push({
    id: 'ui-mode',
    category: 'debugging',
    name: 'Open UI Mode',
    description: 'Run tests interactively with Playwright UI',
    command: 'npx playwright test --ui',
    icon: '🖥️',
    priority: 26
  });
  
  commands.push({
    id: 'install-browsers',
    category: 'setup',
    name: 'Update Browsers',
    description: 'Install or update Playwright browser binaries',
    command: 'npx playwright install',
    icon: '📥',
    priority: 30
  });
  
  // Sort by priority and return
  return commands.sort((a, b) => a.priority - b.priority);
};

// Generate GitHub Actions
const generateActions = () => {
  const actions = [];
  
  // 1. Re-run failed jobs
  if (context.runId) {
    actions.push({
      id: 'rerun-failed',
      name: 'Re-run Failed Jobs',
      description: 'Trigger a re-run of only the failed jobs',
      type: 'github-cli',
      command: `gh run rerun ${context.runId} --failed`,
      icon: '🔄',
      requires: ['GitHub CLI', 'Authentication']
    });
    
    actions.push({
      id: 'rerun-all',
      name: 'Re-run All Jobs',
      description: 'Trigger a complete re-run of the workflow',
      type: 'github-cli',
      command: `gh run rerun ${context.runId}`,
      icon: '🔁',
      requires: ['GitHub CLI']
    });
  }
  
  // 2. Download artifacts
  if (context.runId) {
    actions.push({
      id: 'download-artifacts',
      name: 'Download Test Artifacts',
      description: 'Download all artifacts including screenshots and reports',
      type: 'link',
      url: `https://github.com/${context.repo}/actions/runs/${context.runId}`,
      icon: '📦'
    });
  }
  
  // 3. View workflow logs
  if (context.runId) {
    actions.push({
      id: 'view-logs',
      name: 'View Full Logs',
      description: 'Open the complete workflow logs in GitHub',
      type: 'link',
      url: `https://github.com/${context.repo}/actions/runs/${context.runId}`,
      icon: '📜'
    });
  }
  
  // 4. PR-specific actions
  if (context.prNumber) {
    actions.push({
      id: 'compare-branches',
      name: 'Compare Changes',
      description: 'View the full diff between PR and base branch',
      type: 'link',
      url: `https://github.com/${context.repo}/pull/${context.prNumber}/files`,
      icon: '🔍'
    });
    
    // Only show approve/merge if tests are passing
    if (playwrightSummary.failed === 0) {
      actions.push({
        id: 'approve-merge',
        name: 'Approve & Merge',
        description: 'Approve the PR and enable auto-merge',
        type: 'github-cli',
        command: `gh pr review ${context.prNumber} --approve && gh pr merge ${context.prNumber} --auto --squash`,
        icon: '✅',
        requires: ['GitHub CLI', 'Write permissions']
      });
    } else {
      actions.push({
        id: 'request-changes',
        name: 'Request Changes',
        description: `Request changes due to ${playwrightSummary.failed} failing test(s)`,
        type: 'github-cli',
        command: `gh pr review ${context.prNumber} --request-changes --body "Tests are failing. Please fix the ${playwrightSummary.failed} failing test(s) before merging."`,
        icon: '❌',
        requires: ['GitHub CLI']
      });
    }
    
    // Add comment with test summary
    actions.push({
      id: 'add-comment',
      name: 'Add Test Summary Comment',
      description: 'Post a comment with detailed test results',
      type: 'github-cli',
      command: `gh pr comment ${context.prNumber} --body "Test Results: ${playwrightSummary.passed} passed, ${playwrightSummary.failed} failed"`,
      icon: '💬',
      requires: ['GitHub CLI']
    });
  }
  
  // 5. Label management
  if (context.prNumber) {
    const labels = [];
    if (playwrightSummary.failed > 0) {
      labels.push('failing-tests', 'needs-work');
    } else {
      labels.push('tests-passing');
    }
    
    if (testHistory?.flakyTests?.length > 3) {
      labels.push('flaky-tests');
    }
    
    if (visualRegression?.major > 0) {
      labels.push('visual-changes');
    }
    
    actions.push({
      id: 'add-labels',
      name: 'Update PR Labels',
      description: `Add labels: ${labels.join(', ')}`,
      type: 'github-cli',
      command: `gh pr edit ${context.prNumber} --add-label "${labels.join(',')}"`,
      icon: '🏷️',
      requires: ['GitHub CLI']
    });
  }
  
  // 6. Create issue for flaky tests
  if (testHistory?.flakyTests?.length > 5) {
    const flakyList = testHistory.flakyTests.slice(0, 5).map(t => `- ${t.name} (${t.flakiness}% flaky)`).join('\n');
    actions.push({
      id: 'create-flaky-issue',
      name: 'Create Flaky Test Issue',
      description: `Track ${testHistory.flakyTests.length} flaky tests in an issue`,
      type: 'github-cli',
      command: `gh issue create --title "Fix flaky tests" --body "The following tests are flaky and need attention:\n\n${flakyList}\n\nSee the test dashboard for details."`,
      icon: '📝',
      requires: ['GitHub CLI']
    });
  }
  
  return actions;
};

// Generate code snippets
const generateSnippets = () => {
  const snippets = [];
  
  // Add snippets based on failure patterns
  if (failureAnalysis?.topIssues?.length > 0) {
    failureAnalysis.topIssues.forEach(issue => {
      if (issue.example) {
        snippets.push({
          id: `fix-${issue.type}`,
          name: `Fix for ${issue.category}`,
          description: issue.solution,
          code: issue.example,
          language: 'javascript'
        });
      }
    });
  }
  
  // Standard helpful snippets
  snippets.push({
    id: 'wait-for-element',
    name: 'Wait for Element Pattern',
    description: 'Properly wait for elements before interaction',
    code: `// Wait for element to be visible and stable
await page.waitForSelector('.my-element', { state: 'visible' });
await page.waitForLoadState('networkidle');

// Or use auto-waiting locators
const button = page.locator('button.submit');
await button.click(); // Automatically waits`,
    language: 'javascript'
  });
  
  snippets.push({
    id: 'retry-pattern',
    name: 'Retry Pattern for Flaky Tests',
    description: 'Add retry logic to stabilize flaky tests',
    code: `test.describe('Feature', { retries: 2 }, () => {
  test('should work', async ({ page }) => {
    // Test will retry up to 2 times on failure
  });
});`,
    language: 'javascript'
  });
  
  snippets.push({
    id: 'screenshot-on-failure',
    name: 'Screenshot on Failure',
    description: 'Capture screenshots for debugging',
    code: `test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await page.screenshot({ 
      path: \`screenshots/\${testInfo.title}-failure.png\`,
      fullPage: true 
    });
  }
});`,
    language: 'javascript'
  });
  
  snippets.push({
    id: 'custom-timeout',
    name: 'Custom Timeout',
    description: 'Increase timeout for slow operations',
    code: `// For specific test
test('slow test', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
  // ... test code
});

// For specific action
await page.click('.button', { timeout: 30000 });`,
    language: 'javascript'
  });
  
  snippets.push({
    id: 'mock-api',
    name: 'Mock API Response',
    description: 'Mock network requests for stable tests',
    code: `await page.route('**/api/data', async route => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ 
      success: true,
      data: { /* mock data */ }
    })
  });
});`,
    language: 'javascript'
  });
  
  return snippets;
};

// Generate HTML component
const generateHTML = () => {
  const commands = generateCommands();
  const actions = generateActions();
  const snippets = generateSnippets();
  
  // Group commands by category
  const commandsByCategory = {};
  commands.forEach(cmd => {
    if (!commandsByCategory[cmd.category]) {
      commandsByCategory[cmd.category] = [];
    }
    commandsByCategory[cmd.category].push(cmd);
  });
  
  const categoryIcons = {
    'testing': '🧪',
    'debugging': '🐛',
    'linting': '📋',
    'formatting': '🎨',
    'quick-fix': '⚡',
    'visual': '📸',
    'performance': '🚀',
    'recommended': '💡',
    'reporting': '📊',
    'setup': '🔧'
  };
  
  const categoryOrder = [
    'quick-fix',
    'testing',
    'debugging',
    'recommended',
    'linting',
    'formatting',
    'visual',
    'performance',
    'reporting',
    'setup'
  ];
  
  return `
<div id="quick-actions-panel" class="quick-actions-container">
  <style>
    .quick-actions-container {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1e293b;
      color: #f1f5f9;
      padding: 2rem;
      border-radius: 12px;
    }
    
    .qa-header {
      margin-bottom: 2rem;
    }
    
    .qa-header h2 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .qa-header p {
      color: #94a3b8;
      margin: 0;
    }
    
    .qa-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 2rem;
      border-bottom: 1px solid #334155;
      overflow-x: auto;
      padding-bottom: 1px;
    }
    
    .qa-tab {
      padding: 0.75rem 1.5rem;
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 1rem;
      font-weight: 500;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
      white-space: nowrap;
    }
    
    .qa-tab:hover {
      color: #f1f5f9;
    }
    
    .qa-tab.active {
      color: #f1f5f9;
      border-bottom-color: #3b82f6;
    }
    
    .qa-content {
      display: none;
    }
    
    .qa-content.active {
      display: block;
    }
    
    .qa-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .qa-stat {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 1rem;
      text-align: center;
    }
    
    .qa-stat-value {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }
    
    .qa-stat-label {
      font-size: 0.875rem;
      color: #94a3b8;
    }
    
    .qa-category {
      margin-bottom: 2rem;
    }
    
    .qa-category-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      font-size: 1.25rem;
      font-weight: 600;
      color: #f1f5f9;
    }
    
    .qa-grid {
      display: grid;
      gap: 1rem;
    }
    
    .qa-item {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 1.5rem;
      transition: all 0.2s;
    }
    
    .qa-item:hover {
      border-color: #3b82f6;
      background: rgba(59, 130, 246, 0.05);
    }
    
    .qa-item-header {
      display: flex;
      align-items: start;
      gap: 1rem;
      margin-bottom: 0.75rem;
    }
    
    .qa-item-icon {
      font-size: 1.5rem;
      line-height: 1;
    }
    
    .qa-item-content {
      flex: 1;
    }
    
    .qa-item-title {
      font-weight: 600;
      font-size: 1.125rem;
      margin-bottom: 0.25rem;
      color: #f1f5f9;
    }
    
    .qa-item-desc {
      color: #94a3b8;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    
    .qa-command {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 0.75rem 1rem;
      font-family: 'Monaco', 'Consolas', monospace;
      font-size: 0.875rem;
      color: #10b981;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    
    .qa-command code {
      flex: 1;
      overflow-x: auto;
      white-space: nowrap;
    }
    
    .qa-copy-btn {
      background: #334155;
      border: none;
      color: #f1f5f9;
      padding: 0.5rem 1rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.75rem;
      transition: all 0.2s;
      white-space: nowrap;
      font-family: inherit;
    }
    
    .qa-copy-btn:hover {
      background: #475569;
    }
    
    .qa-copy-btn.copied {
      background: #10b981;
      color: white;
    }
    
    .qa-action-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: #3b82f6;
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      text-decoration: none;
      font-weight: 500;
      transition: all 0.2s;
      cursor: pointer;
      border: none;
      font-size: 0.875rem;
    }
    
    .qa-action-btn:hover {
      background: #2563eb;
      transform: translateY(-1px);
    }
    
    .qa-requirements {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: #f59e0b;
    }
    
    .qa-snippet {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    
    .qa-snippet-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.5rem;
    }
    
    .qa-snippet-title {
      font-weight: 600;
      color: #f1f5f9;
    }
    
    .qa-snippet-desc {
      font-size: 0.875rem;
      color: #94a3b8;
      margin-bottom: 0.75rem;
    }
    
    .qa-snippet-code {
      font-family: 'Monaco', 'Consolas', monospace;
      font-size: 0.875rem;
      color: #e2e8f0;
      overflow-x: auto;
      white-space: pre;
    }
    
    .qa-empty {
      text-align: center;
      padding: 3rem;
      color: #94a3b8;
    }
  </style>
  
  <div class="qa-header">
    <h2><span>⚡</span> Quick Actions Panel</h2>
    <p>Context-aware commands and actions based on your test results</p>
  </div>
  
  <!-- Stats Summary -->
  <div class="qa-stats">
    <div class="qa-stat">
      <div class="qa-stat-value" style="color: ${playwrightSummary.failed > 0 ? '#ef4444' : '#10b981'};">
        ${playwrightSummary.failed || 0}
      </div>
      <div class="qa-stat-label">Failed Tests</div>
    </div>
    <div class="qa-stat">
      <div class="qa-stat-value" style="color: #f59e0b;">
        ${(lintSummary?.eslint?.errors || 0) + (lintSummary?.eslint?.warnings || 0)}
      </div>
      <div class="qa-stat-label">Lint Issues</div>
    </div>
    <div class="qa-stat">
      <div class="qa-stat-value" style="color: #3b82f6;">
        ${commands.length}
      </div>
      <div class="qa-stat-label">Quick Commands</div>
    </div>
    <div class="qa-stat">
      <div class="qa-stat-value" style="color: #8b5cf6;">
        ${actions.length}
      </div>
      <div class="qa-stat-label">GitHub Actions</div>
    </div>
  </div>
  
  <!-- Tabs -->
  <div class="qa-tabs">
    <button class="qa-tab active" onclick="showQuickActionsTab('commands')">
      💻 Local Commands
    </button>
    <button class="qa-tab" onclick="showQuickActionsTab('actions')">
      🚀 GitHub Actions
    </button>
    <button class="qa-tab" onclick="showQuickActionsTab('snippets')">
      📝 Code Snippets
    </button>
  </div>
  
  <!-- Commands Tab -->
  <div id="qa-commands-tab" class="qa-content active">
    ${Object.keys(commandsByCategory).length === 0 ? `
      <div class="qa-empty">
        <p>No commands available. Run tests first to see context-aware commands.</p>
      </div>
    ` : categoryOrder.filter(cat => commandsByCategory[cat]).map(category => `
      <div class="qa-category">
        <div class="qa-category-header">
          <span>${categoryIcons[category] || '📌'}</span>
          <span>${category.charAt(0).toUpperCase() + category.slice(1).replace('-', ' ')}</span>
        </div>
        <div class="qa-grid">
          ${commandsByCategory[category].map(cmd => `
            <div class="qa-item">
              <div class="qa-item-header">
                <div class="qa-item-icon">${cmd.icon}</div>
                <div class="qa-item-content">
                  <div class="qa-item-title">${cmd.name}</div>
                  <div class="qa-item-desc">${cmd.description}</div>
                </div>
              </div>
              <div class="qa-command">
                <code>${cmd.command}</code>
                <button class="qa-copy-btn" onclick="copyQuickCommand('${cmd.id}', this)" data-command="${cmd.command.replace(/"/g, '&quot;')}">
                  Copy
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  </div>
  
  <!-- Actions Tab -->
  <div id="qa-actions-tab" class="qa-content">
    ${actions.length === 0 ? `
      <div class="qa-empty">
        <p>No GitHub actions available. Make sure you're running in a GitHub Actions context.</p>
      </div>
    ` : `
      <div class="qa-grid">
        ${actions.map(action => `
          <div class="qa-item">
            <div class="qa-item-header">
              <div class="qa-item-icon">${action.icon}</div>
              <div class="qa-item-content">
                <div class="qa-item-title">${action.name}</div>
                <div class="qa-item-desc">${action.description}</div>
                ${action.requires ? `
                  <div class="qa-requirements">
                    Requires: ${action.requires.join(', ')}
                  </div>
                ` : ''}
              </div>
            </div>
            ${action.type === 'link' ? `
              <a href="${action.url}" target="_blank" class="qa-action-btn">
                Open in GitHub →
              </a>
            ` : action.command ? `
              <div class="qa-command">
                <code>${action.command}</code>
                <button class="qa-copy-btn" onclick="copyQuickCommand('${action.id}', this)" data-command="${action.command.replace(/"/g, '&quot;')}">
                  Copy
                </button>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `}
  </div>
  
  <!-- Snippets Tab -->
  <div id="qa-snippets-tab" class="qa-content">
    ${snippets.length === 0 ? `
      <div class="qa-empty">
        <p>No code snippets available.</p>
      </div>
    ` : `
      <div class="qa-grid">
        ${snippets.map(snippet => `
          <div class="qa-item">
            <div class="qa-snippet">
              <div class="qa-snippet-header">
                <div class="qa-snippet-title">${snippet.name}</div>
                <button class="qa-copy-btn" onclick="copyQuickCommand('${snippet.id}', this)" data-command="${snippet.code.replace(/"/g, '&quot;').replace(/\n/g, '\\n')}">
                  Copy
                </button>
              </div>
              <div class="qa-snippet-desc">${snippet.description}</div>
              <pre class="qa-snippet-code">${snippet.code}</pre>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  </div>
  
  <script>
    function showQuickActionsTab(tabName) {
      // Hide all tabs
      document.querySelectorAll('#quick-actions-panel .qa-content').forEach(tab => {
        tab.classList.remove('active');
      });
      document.querySelectorAll('#quick-actions-panel .qa-tab').forEach(tab => {
        tab.classList.remove('active');
      });
      
      // Show selected tab
      document.getElementById('qa-' + tabName + '-tab').classList.add('active');
      event.target.classList.add('active');
    }
    
    function copyQuickCommand(id, button) {
      const command = button.getAttribute('data-command').replace(/&quot;/g, '"').replace(/\\\\n/g, '\\n');
      
      // Create textarea to copy from
      const textArea = document.createElement('textarea');
      textArea.value = command;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      
      try {
        document.execCommand('copy');
        
        // Update button state
        const originalText = button.textContent;
        button.textContent = '✓ Copied!';
        button.classList.add('copied');
        
        setTimeout(() => {
          button.textContent = originalText;
          button.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
        alert('Failed to copy command. Please copy manually.');
      }
      
      document.body.removeChild(textArea);
    }
  </script>
</div>
  `;
};

// Generate the quick actions panel
console.log('⚡ Generating Quick Actions Panel...');

const html = generateHTML();

// Save to artifacts
fs.mkdirSync(ART, { recursive: true });
fs.writeFileSync(path.join(ART, 'quick-actions-panel.html'), html);

// Also generate a JSON version for other tools
const panelData = {
  generated: new Date().toISOString(),
  commands: generateCommands(),
  actions: generateActions(),
  snippets: generateSnippets(),
  context: context,
  stats: {
    failedTests: failedTests.length,
    lintIssues: (lintSummary?.eslint?.errors || 0) + (lintSummary?.eslint?.warnings || 0),
    fixableIssues: (lintSummary?.eslint?.fixableErrors || 0) + (lintSummary?.eslint?.fixableWarnings || 0),
    visualChanges: (visualRegression?.major || 0) + (visualRegression?.minor || 0),
    flakyTests: testHistory?.flakyTests?.length || 0
  }
};

fs.writeFileSync(
  path.join(ART, 'quick-actions-data.json'),
  JSON.stringify(panelData, null, 2)
);

console.log('✅ Quick Actions Panel generated');
console.log(`📋 ${panelData.commands.length} commands available`);
console.log(`🚀 ${panelData.actions.length} GitHub actions available`);
console.log(`📝 ${panelData.snippets.length} code snippets included`);