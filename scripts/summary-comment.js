#!/usr/bin/env node
/**
 * summary-comment.js
 * - Posts / updates a sticky PR comment with:
 *     • Checklist
 *     • Playwright (PR row always, Main row only if data exists)
 *     • Prettier & ESLint (PR only)
 * - Links to the HTML reports; if the main report is missing, shows a placeholder
 */

const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/core');

const ART = process.env.ARTIFACTS_DIR || 'artifacts';

/* ── helpers ─────────────────────────────────────────── */
const readJSON = (f, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(path.join(ART, f), 'utf8')); }
  catch { return fallback; }
};

/* ── load artefacts ──────────────────────────────────── */
const playPR   = readJSON('playwright-summary-pr.json');
const playMain = readJSON('playwright-summary-main.json');
const hasMainPlay = fs.existsSync(path.join(ART, 'playwright-summary-main.json'));

const lintPR = readJSON('lint-summary-pr.json', readJSON('lint-summary.json'));

const checklist = (() => {
  try { return fs.readFileSync(path.join(ART, 'checklist.md'), 'utf8'); }
  catch { return ''; }
})();

/* ── build Playwright report links ───────────────────── */
const prExists   = fs.existsSync(path.join(ART, 'pr-report/index.html'));
const mainExists = fs.existsSync(path.join(ART, 'main-report/index.html'));

const linkParts = [];
if (prExists)   linkParts.push('[PR&nbsp;report&nbsp;↗](pr-report/index.html)');
if (mainExists) linkParts.push('[Main&nbsp;report&nbsp;↗](main-report/index.html)');
else if (prExists) linkParts.push('_No report for Main branch in this action run_');

const playLinks = linkParts.length ? linkParts.join(' • ') : '_No HTML reports_';

/* ── GitHub context ─────────────────────────────────── */
const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const prNumber =
  event.pull_request?.number ??
  (event.issue?.pull_request && event.issue.number);
if (!prNumber) { console.error('Not a PR event'); process.exit(0); }

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

/* ── markdown sections ──────────────────────────────── */
const mdChecklist = checklist || '_No checklist found_';

const mdPlaywright = `
| Run | Total | Passed | Failed | Skipped | Pass-rate | Duration |
|-----|------:|-------:|-------:|--------:|-----------|---------:|
| **PR**   | ${playPR.total??0} | ${playPR.passed??0} | ${playPR.failed??0} | ${playPR.skipped??0} | ${playPR.pass_rate??0}% | ${playPR.duration??0} ms |
${hasMainPlay ? `| **Main** | ${playMain.total??0} | ${playMain.passed??0} | ${playMain.failed??0} | ${playMain.skipped??0} | ${playMain.pass_rate??0}% | ${playMain.duration??0} ms |` : ''}`;

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

/* ── final comment body ─────────────────────────────── */
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
  ? `**Files:** ${lintPR.prettier.files.join(', ')}`
  : '_No Prettier issues_'}

${lintPR.prettier?.sample
  ? `<details><summary>Diff sample (first 20 lines)</summary>

\`\`\`diff
${lintPR.prettier.sample}
\`\`\`
</details>`
  : ''}

---

### 📋 ESLint (PR)

${mdESLint}

${lintPR.eslint?.first
  ? `First error: \`${lintPR.eslint.first}\``
  : '_No ESLint errors_'}

---

👉 **[Open full dashboard ↗](index.html)**

_Automated comment — updates on every push._
`;

/* ── upsert sticky comment ───────────────────────────── */
(async () => {
  const { data } = await octokit.request(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    { owner, repo, issue_number: prNumber }
  );
  const existing = data.find(c =>
    c.user.type === 'Bot' &&
    c.body.startsWith('# 🔍 **GUI Test Review**')
  );

  if (existing) {
    await octokit.request(
      'PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}',
      { owner, repo, comment_id: existing.id, body }
    );
    console.log('🔄 Updated GUI-test summary comment.');
  } else {
    await octokit.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      { owner, repo, issue_number: prNumber, body }
    );
    console.log('💬 Created GUI-test summary comment.');
  }
})().catch(err => { console.error(err); process.exit(1); });
