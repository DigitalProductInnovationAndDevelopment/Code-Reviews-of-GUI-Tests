#!/usr/bin/env node
/**
 * summary-comment.js
 * - Upserts a sticky PR comment that shows:
 *     • Checklist
 *     • Playwright (PR row always, Main row if available)
 *     • Prettier & ESLint (PR only)
 * - No Playwright-report links in the comment body.
 */

const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/core');

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

const lintPR   = readJSON('lint-summary.json');
const checklist = (() => {
  try { return fs.readFileSync(path.join(ART, 'checklist.md'), 'utf8'); }
  catch { return ''; }
})();

/* GitHub context */
const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const prNumber =
  event.pull_request?.number ??
  (event.issue?.pull_request && event.issue.number);
if (!prNumber) { console.error('Not a PR event'); process.exit(0); }

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

/* markdown blocks */
const mdChecklist = checklist || '_No checklist found_';
const mdPlay = `
| Run | Total | Passed | Failed | Skipped | Pass-rate | Duration |
|-----|------:|-------:|-------:|--------:|-----------|---------:|
| **PR**   | ${playPR.total??0} | ${playPR.passed??0} | ${playPR.failed??0} | ${playPR.skipped??0} | ${playPR.pass_rate??0}% | ${playPR.duration??0} ms |
${hasMain ? `| **Main** | ${playMain.total??0} | ${playMain.passed??0} | ${playMain.failed??0} | ${playMain.skipped??0} | ${playMain.pass_rate??0}% | ${playMain.duration??0} ms |` : ''}`;

const mdPrettier = `
| Metric | PR |
|--------|---:|
| **Files needing format** | ${lintPR.prettier?.filesWithIssues ?? 0} |
| **Places to fix**        | ${lintPR.prettier?.totalChanges   ?? 0} |`;

const mdESLint = `
| Metric | PR |
|--------|---:|
| **Errors**         | ${lintPR.eslint?.errors         ?? 0} |
| **Warnings**       | ${lintPR.eslint?.warnings       ?? 0} |
| **Fixable Errors** | ${lintPR.eslint?.fixableErrors  ?? 0} |
| **Fixable Warns**  | ${lintPR.eslint?.fixableWarnings?? 0} |`;

/* dashboard root (absolute if workflow provided it) */
const dashboardURL = process.env.WEB_REPORT_URL || '#';

/* prettier/eslint samples and commands */
let prettierSection = '';
if (lintPR.prettier?.filesWithIssues > 0) {
  const files = lintPR.prettier.files || [];
  prettierSection = '\n\n**Files:** ' + files.map(f => path.basename(f)).join(', ');
  
  if (lintPR.prettier.exceedsLimit) {
    prettierSection += `\n\n⚠️ **Too many changes for inline comments** (${lintPR.prettier.totalChanges} changes exceed GitHub limit)`;
  }
  
  prettierSection += '\n\n**Fix locally:** `npx prettier --write "tests/**/*.{js,ts,tsx,json}"`';
  
  if (lintPR.prettier.sample) {
    prettierSection += '\n\n<details><summary>Sample changes (first 20 lines)</summary>\n\n```diff\n' + lintPR.prettier.sample + '\n```\n\n</details>';
  }
} else {
  prettierSection = '\n\n_No Prettier issues_';
}

let eslintSection = '';
if (lintPR.eslint?.errors > 0 || lintPR.eslint?.warnings > 0) {
  if (lintPR.eslint.first) {
    eslintSection = '\n\nFirst error: `' + lintPR.eslint.first + '`';
  }
  
  if (lintPR.eslint.exceedsLimit) {
    eslintSection += `\n\n⚠️ **Too many issues for inline comments** (${lintPR.eslint.errors + lintPR.eslint.warnings} issues exceed GitHub limit)`;
  }
  
  eslintSection += '\n\n**Fix locally:** `npx eslint --fix "tests/**/*.{js,ts,tsx}"`';
} else {
  eslintSection = '\n\n_No ESLint errors_';
}

/* final comment body */
const body = `# 🔍 **GUI Test Review**

<details open><summary><b>▼ Checklist</b></summary>

${mdChecklist}
</details>

---

### ▶️ Playwright

${mdPlay}

---

### 🎨 Prettier (PR)

${mdPrettier}${prettierSection}

---

### 📋 ESLint (PR)

${mdESLint}${eslintSection}

---

👉 **[Open full dashboard ↗](${dashboardURL})**

_Automated comment — updates on every push._`;

/* upsert sticky comment */
(async () => {
  const { data: comments } = await octokit.request(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    { owner, repo, issue_number: prNumber }
  );
  const existing = comments.find(
    c => c.user.type === 'Bot' && c.body.includes('# 🔍 **GUI Test Review**')
  );

  const endpoint = existing
    ? 'PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}'
    : 'POST /repos/{owner}/{repo}/issues/{issue_number}/comments';
  const params = existing
    ? { owner, repo, comment_id: existing.id, body }
    : { owner, repo, issue_number: prNumber, body };

  await octokit.request(endpoint, params);
  console.log(existing ? '🔄 Updated comment.' : '💬 Created comment.');
})().catch(err => { console.error(err); process.exit(1); });