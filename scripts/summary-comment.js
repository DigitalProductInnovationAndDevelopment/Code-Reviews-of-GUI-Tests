#!/usr/bin/env node
/**
 * summary-comment.js - Enhanced with reviewer insights
 * - Upserts a sticky PR comment that shows:
 *     • Checklist with completion percentage
 *     • Playwright results with regression detection
 *     • Code quality insights
 *     • Performance comparison
 *     • Actionable recommendations
 */

const fs = require('fs');
const path = require('path');

// Dynamic require for @octokit/core
let Octokit;
try {
  // Try local node_modules first
  Octokit = require('@octokit/core').Octokit;
} catch (e1) {
  try {
    // Try action's node_modules
    Octokit = require(path.join(process.cwd(), '.gui-test-review-action/node_modules/@octokit/core')).Octokit;
  } catch (e2) {
    try {
      // Try parent directory
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
  
  if (checklistPercent < 100) {
    recommendations.push(`📋 Complete the remaining ${checklistTotal - checklistCompleted} checklist item(s)`);
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

/* Generate insights and recommendations */
const insights = generateInsights();
const recommendations = generateRecommendations();

/* dashboard root (absolute if workflow provided it) */
const dashboardURL = process.env.WEB_REPORT_URL || 'index.html';

/* Status summary line */
const overallStatus = playPR.failed === 0 && codeQualityIssues === 0 ? 
  '✅ **All checks passed!**' : 
  `⚠️ **${playPR.failed} test failure(s), ${codeQualityIssues} code quality issue(s)**`;

/* final comment body */
const body = `
# 🔍 GUI Test Review Summary

${overallStatus} • [📊 View Full Dashboard](${dashboardURL})

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

## 🎨 Code Quality

${mdCodeQuality}

${recommendations.length > 0 ? `
## 🎯 Recommended Actions

${recommendations.map(r => `- ${r}`).join('\n')}
` : ''}

## ⚡ Performance

<details>
<summary>Execution times</summary>

| Metric | Duration |
|--------|----------|
| Total Action | ${formatDuration((perfMetrics.executionTime || 0) * 1000)} |
| Test Execution | ${formatDuration(playPR.duration)} |
| Dashboard Generation | ${formatDuration(dashboardPerf?.dashboardGenerationMs)} |
| Artifact Size | ${perfMetrics.artifactSizeMB?.toFixed(2) || 'N/A'} MB |

</details>

---

<sub>🤖 This comment updates automatically with each push • [View Documentation](https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/wiki)</sub>
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
    console.log(existing ? '🔄 Updated comment with insights.' : '💬 Created comment with insights.');
  } catch (error) {
    console.error('Failed to post/update comment:', error.message);
    process.exit(1);
  }
})();