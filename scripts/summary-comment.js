#!/usr/bin/env node
/**
 * summary-comment.js
 * - Upserts a sticky PR comment.
 * - Shows Playwright (PR vs. Main), Prettier & ESLint (PR only).
 * - Links to the HTML Playwright reports on GitHub Pages via WEB_REPORT_URL.
 */

const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/core');

const ART = process.env.ARTIFACTS_DIR || 'artifacts';

/* ---------- helpers ---------- */
const readJSON = (f, d = {}) => {
  try { return JSON.parse(fs.readFileSync(path.join(ART, f), 'utf8')); }
  catch { return d; }
};

/* ---------- load artefacts ---------- */
const playPR   = readJSON('playwright-summary-pr.json');
const playMain = readJSON('playwright-summary-main.json');
const hasMainPlay = fs.existsSync(path.join(ART, 'playwright-summary-main.json'));

const lintPR = readJSON('lint-summary-pr.json', readJSON('lint-summary.json'));

const checklist = (() => {
  try { return fs.readFileSync(path.join(ART, 'checklist.md'), 'utf8'); }
  catch { return ''; }
})();

/* ---------- build absolute Playwright links ---------- */
const baseURL = (process.env.WEB_REPORT_URL || '').replace(/\/+$/, '') + '/';

const prExists   = fs.existsSync(path.join(ART, 'pr-report/index.html'));
const mainExists = fs.existsSync(path.join(ART, 'main-report/index.html'));

const linkParts = [];
if (prExists)   linkParts.push(`[PR&nbsp;report&nbsp;↗](${baseURL}pr-report/index.html)`);
if (mainExists) linkParts.push(`[Main&nbsp;report&nbsp;↗](${baseURL}main-report/index.html)`);
else if (prExists) linkParts.push('_No report for Main branch in this action run_');

const playLinks = linkParts.length ? linkParts.join(' • ') : '_No HTML reports_';

/* ---------- GitHub context ---------- */
const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const prNumber =
  event.pull_request?.number ??
  (event.issue?.pull_request && event.issue.number);
if (!prNumber) { console.error('Not a PR event'); process.exit(0); }

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

/* ---------- markdown blocks ---------- */
const mdChecklist = checklist || '_No checklist found_';

const mdPlaywright = `
| Run | Total | Passed | Failed | Skipped | Pass-rate | Duration |
|-----|------:|-------:|-------:|--------:|-----------|---------:|
| **PR**   | ${playPR.total ?? 0} | ${playPR.passed ?? 0} | ${playPR.failed ?? 0} | ${playPR.skipped ?? 0} | ${playPR.pass_rate ?? 0}% | ${playPR.duration ?? 0} ms |
${hasMainPlay ? `| **Main** | ${playMain.total ?? 0} | ${playMain.passed ?? 0} | ${playMain.failed ?? 0} | ${playMain.skipped ?? 0} | ${playMain.pass_rate ?? 0}% | ${playMain.duration ?? 0} ms |` : ''}`;

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

/* ---------- dashboard root URL ---------- */
const dashboardURL = process.env.WEB_REPORT_URL || 'index.html';

/* ---------- final comment body ---------- */
const body = `
# 🔍 **GUI Test Review**

<details open><summary><b>Checklist</b></summary>

${mdChecklist}
</details>

---

### ▶️ Playwright

${mdPlaywright}

${playLinks}

---

### 🎨 Prettier (PR)

${mdPrettier}

${lintPR.prettier?.files?.length
  ? '**Files:** ' + lintPR.prettier.files.join(', ')
  : '_No Prettier issues_'}

---

### 📋 ESLint (PR)

${mdESLint}

${lintPR.eslint?.first
  ? 'First error: `' + lintPR.eslint.first + '`'
  : '_No ESLint errors_'}

---

👉 **[Open full dashboard ↗](${dashboardURL})**

_Automated comment — updates on every push._
`;

/* ---------- upsert sticky comment ---------- */
(async () => {
  const { data: comments } = await octokit.request(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    { owner, repo, issue_number: prNumber }
  );
  const existing = comments.find(
    c => c.user.type === 'Bot' && c.body.startsWith('# 🔍 **GUI Test Review**')
  );

  const endpoint = existing
    ? 'PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}'
    : 'POST  /repos/{owner}/{repo}/issues/{issue_number}/comments';
  const params = existing
    ? { owner, repo, comment_id: existing.id, body }
    : { owner, repo, issue_number: prNumber, body };

  await octokit.request(endpoint, params);
  console.log(existing ? '🔄 Updated comment.' : '💬 Created comment.');
})().catch(err => { console.error(err); process.exit(1); });
