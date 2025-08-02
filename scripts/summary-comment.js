#!/usr/bin/env node
/**
 * summary-comment.js - Enhanced with all new features
 * - Includes 3D Test City link
 * - Visual regression summary
 * - Quick actions integration
 * - Test history insights
 * - Improved formatting and insights
 */

const fs = require('fs');
const path = require('path');

// Dynamic require for @octokit/core
let Octokit;
try {
  Octokit = require('@octokit/core').Octokit;
} catch (e1) {
  try {
    Octokit = require(path.join(process.cwd(), '.gui-test-review-action/node_modules/@octokit/core')).Octokit;
  } catch (e2) {
    try {
      Octokit = require(path.join(__dirname, '../node_modules/@octokit/core')).Octokit;
    } catch (e3) {
      console.error('Could not load @octokit/core module. Please ensure @octokit/core is installed.');
      console.error('You can install it with: npm install @octokit/core@^5.0.0');
      process.exit(1);
    }
  }
}

const ART = process.env.ARTIFACTS_DIR || 'artifacts';

/* helper to read JSON safely */
const readJSON = (f, d = {}) => {
  try { return JSON.parse(fs.readFileSync(path.join(ART, f), 'utf8')); }
  catch { return d; }
};

/* summaries */
const playPR   = readJSON('playwright-summary-pr.json');
const playMain = readJSON('playwright-summary-main.json');
const hasMain  = fs.existsSync(path.join(ART, 'playwright-summary-main.json'));

const lintPR   = readJSON('lint-summary-pr.json', readJSON('lint-summary.json'));
const perfMetrics = readJSON('performance-metrics.json');
const dashboardPerf = readJSON('dashboard-performance.json');

// Enhanced features data
const testHistory = readJSON('test-history-insights.json');
const visualRegression = readJSON('visual-regression-report.json');
const quickActionsData = readJSON('quick-actions-data.json');
const failureAnalysis = readJSON('test-failure-analysis.json');
const testCityData = readJSON('test-city-data.json');

const checklist = (() => {
  try { return fs.readFileSync(path.join(ART, 'checklist.md'), 'utf8'); }
  catch { return ''; }
})();

// Calculate insights
const checklistCompleted = checklist ? (checklist.match(/\[x\]/g) || []).length : 0;
const checklistTotal = checklist ? (checklist.match(/\[[ x]\]/g) || []).length : 0;
const checklistPercent = checklistTotal > 0 ? Math.round((checklistCompleted / checklistTotal) * 100) : 0;

// Regression detection
const hasRegression = hasMain && playPR.failed > playMain.failed;
const improvementDetected = hasMain && playPR.failed < playMain.failed;
const performanceRegression = hasMain && playPR.duration > playMain.duration * 1.2; // 20% slower

// Visual regression insights
const hasVisualChanges = visualRegression && (visualRegression.major > 0 || visualRegression.minor > 0);
const visualChangeCount = visualRegression ? (visualRegression.major + visualRegression.minor + visualRegression.new) : 0;

// Code quality score
const codeQualityIssues = (lintPR.eslint?.errors || 0) + (lintPR.eslint?.warnings || 0) + (lintPR.prettier?.filesWithIssues || 0);
const codeQualityScore = codeQualityIssues === 0 ? 100 : Math.max(0, 100 - (codeQualityIssues * 5));

/* GitHub context */
let event;
try {
  event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
} catch (e) {
  console.error('Could not read GitHub event file:', e.message);
  process.exit(1);
}

const prNumber =
  event.pull_request?.number ??
  (event.issue?.pull_request && event.issue.number);
  
if (!prNumber) { 
  console.error('Not a PR event'); 
  process.exit(0); 
}

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

/* Helper functions for formatting */
const formatDuration = (ms) => {
  if (!ms) return 'N/A';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
};

const getStatusEmoji = (passed, failed) => {
  if (failed === 0) return '✅';
  if (failed > 0 && passed > 0) return '⚠️';
  return '❌';
};

const getPerformanceEmoji = (current, previous) => {
  if (!previous) return '';
  const ratio = current / previous;
  if (ratio < 0.8) return '🚀'; // 20% faster
  if (ratio > 1.2) return '🐌'; // 20% slower
  return '';
};

const getPriorityEmoji = (priority) => {
  switch(priority) {
    case 'critical': return '🚨';
    case 'high': return '⚠️';
    case 'medium': return '📋';
    case 'low': return '✅';
    default: return '📌';
  }
};

/* Generate insights and recommendations */
const generateInsights = () => {
  const insights = [];
  
  // Test insights
  if (hasRegression) {
    insights.push(`🔴 **Regression detected**: ${playPR.failed - playMain.failed} more test(s) failing compared to main branch`);
  } else if (improvementDetected) {
    insights.push(`🟢 **Improvement**: ${playMain.failed - playPR.failed} fewer test(s) failing compared to main branch`);
  }
  
  if (performanceRegression) {
    insights.push(`🐌 **Performance regression**: Tests are ${((playPR.duration / playMain.duration - 1) * 100).toFixed(0)}% slower than main branch`);
  }
  
  // Visual regression insights
  if (hasVisualChanges) {
    insights.push(`🖼️ **Visual changes detected**: ${visualRegression.major} major, ${visualRegression.minor} minor changes`);
  }
  
  // Flaky test insights
  if (testHistory?.flakyTests?.length > 0) {
    insights.push(`🎲 **${testHistory.flakyTests.length} flaky test(s)** detected with >20% failure rate`);
  }
  
  // Code quality insights
  if (lintPR.eslint?.errors > 0) {
    insights.push(`❌ **${lintPR.eslint.errors} ESLint error(s)** need to be fixed`);
  }
  
  if (lintPR.prettier?.filesWithIssues > 0) {
    insights.push(`🎨 **${lintPR.prettier.filesWithIssues} file(s)** need formatting`);
  }
  
  // Performance insights
  if (perfMetrics.executionTime > 180) {
    insights.push(`⏱️ **Slow execution**: Action took ${formatDuration(perfMetrics.executionTime * 1000)} to complete`);
  }
  
  return insights;
};

const generateRecommendations = () => {
  const recommendations = [];
  
  // Priority recommendations from failure analysis
  if (failureAnalysis?.recommendations?.length > 0) {
    const topRec = failureAnalysis.recommendations[0];
    recommendations.push(`${getPriorityEmoji(topRec.priority)} ${topRec.action}`);
  }
  
  if (playPR.failed > 0) {
    recommendations.push('🔧 Fix failing tests before merging');
  }
  
  if (lintPR.eslint?.fixableErrors > 0 || lintPR.eslint?.fixableWarnings > 0) {
    const total = (lintPR.eslint.fixableErrors || 0) + (lintPR.eslint.fixableWarnings || 0);
    recommendations.push(`💡 Run \`npx eslint . --fix\` to automatically fix ${total} issue(s)`);
  }
  
  if (lintPR.prettier?.filesWithIssues > 0) {
    recommendations.push('✨ Run `npx prettier --write .` to fix formatting');
  }
  
  if (hasVisualChanges && visualRegression.major > 0) {
    recommendations.push('🖼️ Review visual changes carefully - major UI differences detected');
  }
  
  if (checklistPercent < 100) {
    recommendations.push(`📋 Complete the remaining ${checklistTotal - checklistCompleted} checklist item(s)`);
  }
  
  if (testHistory?.flakyTests?.length > 3) {
    recommendations.push('🎯 Stabilize flaky tests to improve reliability');
  }
  
  if (performanceRegression && hasMain) {
    recommendations.push('🚀 Investigate performance regression in tests');
  }
  
  return recommendations;
};

/* Enhanced markdown blocks */
const mdChecklist = checklist ? `
${checklist}

**Completion: ${checklistCompleted}/${checklistTotal} (${checklistPercent}%)**
` : '_No checklist found_';

const mdPlay = `
| Branch | Tests | ✅ Passed | ❌ Failed | ⏭️ Skipped | Pass Rate | ⏱️ Duration |
|--------|------:|----------:|----------:|-----------:|----------:|------------:|
| **PR** ${getStatusEmoji(playPR.passed, playPR.failed)} | ${playPR.total??0} | ${playPR.passed??0} | ${playPR.failed??0} | ${playPR.skipped??0} | ${playPR.pass_rate??0}% | ${formatDuration(playPR.duration)} ${getPerformanceEmoji(playPR.duration, playMain.duration)} |
${hasMain ? `| **Main** ${getStatusEmoji(playMain.passed, playMain.failed)} | ${playMain.total??0} | ${playMain.passed??0} | ${playMain.failed??0} | ${playMain.skipped??0} | ${playMain.pass_rate??0}% | ${formatDuration(playMain.duration)} |` : ''}

${hasRegression ? '> ⚠️ **Regression**: More tests are failing compared to main branch!' : ''}
${improvementDetected ? '> ✅ **Improvement**: Fewer tests are failing compared to main branch!' : ''}
`;

const mdCodeQuality = `
<table>
<tr>
<td align="center">

### 🎨 Prettier
${lintPR.prettier?.filesWithIssues > 0 ? `
**${lintPR.prettier.filesWithIssues}** files need formatting  
**${lintPR.prettier.totalChanges}** total changes
` : '✅ All files formatted'}

</td>
<td align="center">

### 📋 ESLint
${lintPR.eslint?.errors || lintPR.eslint?.warnings ? `
**${lintPR.eslint.errors || 0}** errors  
**${lintPR.eslint.warnings || 0}** warnings  
${lintPR.eslint.fixableErrors || lintPR.eslint.fixableWarnings ? `*${(lintPR.eslint.fixableErrors || 0) + (lintPR.eslint.fixableWarnings || 0)} auto-fixable*` : ''}
` : '✅ No issues found'}

</td>
<td align="center">

### 📊 Quality Score
# ${codeQualityScore}%
${codeQualityScore >= 90 ? '🟢 Excellent' : 
  codeQualityScore >= 70 ? '🟡 Good' : 
  '🔴 Needs work'}

</td>
</tr>
</table>
`;

// Visual regression section (new)
const mdVisualRegression = visualRegression && hasVisualChanges ? `
## 🖼️ Visual Regression

<details ${visualRegression.major > 0 ? 'open' : ''}>
<summary><strong>${visualChangeCount} visual change(s) detected</strong></summary>

| Type | Count | Action Required |
|------|------:|-----------------|
| 🔴 Major Changes | ${visualRegression.major || 0} | Review carefully |
| 🟡 Minor Changes | ${visualRegression.minor || 0} | Quick check |
| 🆕 New Screenshots | ${visualRegression.new || 0} | Verify expected |
| 🗑️ Removed | ${visualRegression.removed || 0} | Confirm deletion |

${visualRegression.major > 0 ? '> ⚠️ Major visual changes detected. Please review screenshots in the dashboard.' : ''}

</details>
` : '';

// Flaky tests section (new)
const mdFlakyTests = testHistory?.flakyTests?.length > 0 ? `
## 🎲 Test Stability

<details>
<summary><strong>${testHistory.flakyTests.length} flaky test(s) need attention</strong></summary>

| Test | Flakiness | Success Rate | Priority |
|------|----------:|-------------:|----------|
${testHistory.flakyTests.slice(0, 5).map(test => 
  `| \`${test.name.length > 40 ? test.name.substring(0, 40) + '...' : test.name}\` | ${test.flakiness}% | ${test.successRate}% | ${test.flakiness > 40 ? '🔴 High' : '🟡 Medium'} |`
).join('\n')}

${testHistory.flakyTests.length > 5 ? `\n_...and ${testHistory.flakyTests.length - 5} more_` : ''}

</details>
` : '';

// Quick commands section (enhanced)
const mdQuickCommands = quickActionsData?.commands?.length > 0 ? `
## ⚡ Quick Actions

<details>
<summary><strong>${quickActionsData.commands.length} context-aware commands available</strong></summary>

${quickActionsData.commands.slice(0, 5).map(cmd => `
### ${cmd.icon} ${cmd.name}
${cmd.description}
\`\`\`bash
${cmd.command}
\`\`\`
`).join('\n')}

[View all commands in dashboard →](${dashboardURL}#quick-actions)

</details>
` : '';

/* Generate insights and recommendations */
const insights = generateInsights();
const recommendations = generateRecommendations();

/* dashboard root (absolute if workflow provided it) */
const dashboardURL = process.env.WEB_REPORT_URL || 'index.html';

/* Status summary line */
const overallStatus = playPR.failed === 0 && codeQualityIssues === 0 ? 
  '✅ **All checks passed!**' : 
  `⚠️ **${playPR.failed} test failure(s), ${codeQualityIssues} code quality issue(s)${hasVisualChanges ? `, ${visualChangeCount} visual change(s)` : ''}**`;

/* final comment body */
const body = `
# 🔍 GUI Test Review Summary

${overallStatus}

<div align="center">

[📊 **Dashboard**](${dashboardURL}) • [🏙️ **3D Test City**](${dashboardURL}/test-city-3d.html) • [🖼️ **Visual Regression**](${dashboardURL}#visual-regression) • [⚡ **Quick Actions**](${dashboardURL}#quick-actions)

</div>

${insights.length > 0 ? `
## 💡 Key Insights

${insights.join('\n')}
` : ''}

## 📋 Review Checklist

<details ${checklistPercent < 100 ? 'open' : ''}>
<summary><strong>${checklistPercent}% Complete</strong> (${checklistCompleted}/${checklistTotal} items)</summary>

${mdChecklist}
</details>

## 🎭 Test Results

${mdPlay}

${mdVisualRegression}

${mdFlakyTests}

## 🎨 Code Quality

${mdCodeQuality}

${mdQuickCommands}

${recommendations.length > 0 ? `
## 🎯 Recommended Actions

${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}
` : ''}

## ⚡ Performance

<details>
<summary>Execution times and metrics</summary>

| Metric | Value |
|--------|-------|
| Total Action | ${formatDuration((perfMetrics.executionTime || 0) * 1000)} |
| Test Execution | ${formatDuration(playPR.duration)} |
| Dashboard Generation | ${formatDuration(dashboardPerf?.dashboardGenerationMs)} |
| Artifact Size | ${perfMetrics.artifactSizeMB?.toFixed(2) || 'N/A'} MB |
${testHistory?.trends ? `| Avg Pass Rate (5 runs) | ${testHistory.trends.avgPassRate}% |` : ''}
${testCityData ? `| Total Tests Visualized | ${testCityData.stats?.total || 0} |` : ''}

</details>

---

<sub>
🤖 Enhanced with: 3D visualization • Visual regression • Test history • Quick actions  
📚 [Documentation](https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/wiki) • 
🐛 [Report Issue](https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/issues) • 
⭐ [Star Project](https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests)
</sub>
`;

/* upsert sticky comment */
(async () => {
  try {
    const { data: comments } = await octokit.request(
      'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
      { owner, repo, issue_number: prNumber }
    );
    
    const existing = comments.find(
      c => c.user.type === 'Bot' && c.body.includes('GUI Test Review Summary')
    );

    const endpoint = existing
      ? 'PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}'
      : 'POST /repos/{owner}/{repo}/issues/{issue_number}/comments';
    const params = existing
      ? { owner, repo, comment_id: existing.id, body }
      : { owner, repo, issue_number: prNumber, body };

    await octokit.request(endpoint, params);
    console.log(existing ? '🔄 Updated enhanced comment.' : '💬 Created enhanced comment.');
  } catch (error) {
    console.error('Failed to post/update comment:', error.message);
    process.exit(1);
  }
})();