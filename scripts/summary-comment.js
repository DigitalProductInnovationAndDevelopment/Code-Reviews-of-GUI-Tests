#!/usr/bin/env node
/**
 * summary-comment.js
 *
 * Posts or updates one sticky “GUI Test Review” comment on a PR.
 * Content:
 *   • Playwright metrics
 *   • Prettier + ESLint summaries (with first-issue samples)
 *   • Checklist
 *   • Link to the full dashboard
 *
 * Requires:
 *   – GITHUB_TOKEN
 *   – GITHUB_EVENT_PATH   (set automatically in every job)
 *   – ARTIFACTS_DIR       (passed by workflow, e.g. "gui-artifacts")
 *   – WEB_REPORT_URL      (dashboard URL)
 */

const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/core');

/* helpers ------------------------------------------------------- */
const json = (p, d = {}) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; }
};
const icon = (ok, warn = false) => (ok ? '✅' : warn ? '⚠️' : '❌');
const clip = s => s.split('\n').slice(0, 20).join('\n');

/* env & GitHub context ----------------------------------------- */
const ART = process.env.ARTIFACTS_DIR || 'artifacts';
const token = process.env.GITHUB_TOKEN;
if (!token) { console.error('GITHUB_TOKEN missing'); process.exit(1); }

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
if (!event.pull_request) { console.log('Not a PR event – skipping comment.'); process.exit(0); }

const { owner, name: repo } = event.repository;
const prNumber = event.number;

/* artefacts ----------------------------------------------------- */
const play   = json(path.join(ART, 'playwright-summary.json'));
const lint   = json(path.join(ART, 'lint-summary.json'));
const checklistMD = fs.existsSync(path.join(ART, 'checklist.md'))
  ? fs.readFileSync(path.join(ART, 'checklist.md'), 'utf8')
  : '*Checklist not generated*';

const webURL = process.env.WEB_REPORT_URL || '';

/* Prettier & ESLint extracted ---------------------------------- */
const prettier = lint.prettier ?? { filesWithIssues: 0, files: [], sample: '' };
const eslint   = lint.eslint   ?? { errors: 0, warnings: 0, first: '' };

/* build comment body ------------------------------------------- */
const body = `
# 🔍 GUI Test Review Report

## ✅ Playwright
Total **${play.total ?? 0}** – Passed **${play.passed ?? 0}**, Failed **${play.failed ?? 0}**, Skipped **${play.skipped ?? 0}**  
Pass-rate: **${play.pass_rate ?? 0}%** • Duration: **${play.duration ?? 0} ms**

---

## 🎨 Prettier (${prettier.filesWithIssues} file${prettier.filesWithIssues === 1 ? '' : 's'} needs formatting)
${prettier.filesWithIssues
  ? `**Files:** ${prettier.files.map(f => `\`${f}\``).join(', ')}  

<details><summary>Diff snippet (first 20 lines)</summary>

\`\`\`diff
${clip(prettier.sample)}
\`\`\`
</details>`
  : 'No formatting issues 🎉'}

---

## 📋 ESLint (${eslint.errors} error${eslint.errors === 1 ? '' : 's'}, ${eslint.warnings} warning${eslint.warnings === 1 ? '' : 's'})
${eslint.first
  ? `**First error:** ${eslint.first}`
  : 'No ESLint errors 🎉'}

---

## ✅ Checklist
${checklistMD}

${webURL ? `👉 **[Open full dashboard ↗](${webURL})**` : ''}

---

_Automated comment – updated on every push._
`;

/* post / update sticky comment --------------------------------- */
const octokit = new Octokit({ auth: token });

(async () => {
  const { data: comments } = await octokit.request(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    { owner, repo, issue_number: prNumber }
  );

  const existing = comments.find(
    c => c.user.type === 'Bot' && c.body.startsWith('# 🔍 GUI Test Review Report')
  );

  if (existing) {
    await octokit.request(
      'PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}',
      { owner, repo, comment_id: existing.id, body }
    );
    console.log('🔄  Updated GUI-test summary comment.');
  } else {
    await octokit.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      { owner, repo, issue_number: prNumber, body }
    );
    console.log('💬  Created GUI-test summary comment.');
  }
})().catch(err => { console.error(err); process.exit(1); });
