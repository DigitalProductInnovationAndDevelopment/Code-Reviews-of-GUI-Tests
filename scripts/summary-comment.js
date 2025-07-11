#!/usr/bin/env node
/**
 * summary-comment.js  – posts / updates a sticky “GUI Test Review” comment.
 * Shows PR-branch vs. main-branch metrics for:
 *   • Playwright
 *   • Prettier
 *   • ESLint
 * Plus the checklist and a link to the live dashboard.
 */

const fs   = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/core');

const ART = process.env.ARTIFACTS_DIR || 'artifacts';

/* ---------- helpers ---------- */
const readJSON = (file, fallback={}) => {
  try { return JSON.parse(fs.readFileSync(path.join(ART,file),'utf8')); }
  catch { return fallback; }
};
const icon = (ok,warn=false)=> ok ? '✅' : warn ? '⚠️' : '❌';

/* ---------- load artefacts ---------- */
const playPR   = readJSON('playwright-summary-pr.json');
const playMain = readJSON('playwright-summary-main.json');

const lintPR   = readJSON('lint-summary-pr.json', readJSON('lint-summary.json'));  // fall back
const lintMain = readJSON('lint-summary-main.json', { prettier:{}, eslint:{} });

const checklistMD = (()=>{
  try { return fs.readFileSync(path.join(ART,'checklist.md'),'utf8'); }
  catch { return ''; }
})();

/* link root to Pages site */
const rootUrl = process.env.WEB_REPORT_URL || '';
const prLink   = '[PR&nbsp;report&nbsp;↗](pr-report/index.html)';
const mainLink = '[Main&nbsp;report&nbsp;↗](main-report/index.html)';

/* ---------- GitHub context ---------- */
const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
const prNumber = event.pull_request?.number ??
                 (event.issue?.pull_request && event.issue.number);
if (!prNumber) { console.error('Not a PR event'); process.exit(0); }

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const token = process.env.GITHUB_TOKEN;
if (!token) { console.error('GITHUB_TOKEN missing'); process.exit(1); }

const octokit = new Octokit({ auth: token });

/* ---------- Compose comment body ---------- */
const body = `
# 🔍 **GUI Test Review**

<details open><summary><b>Checklist</b></summary>

${checklistMD || '_No checklist found_'}
</details>

---

### ▶️ Playwright

| Run | Total | Passed | Failed | Skipped | Pass-rate | Duration |
|-----|------:|-------:|-------:|--------:|-----------|---------:|
| **PR**   | ${playPR.total??0} | ${playPR.passed??0} | ${playPR.failed??0} | ${playPR.skipped??0} | ${playPR.pass_rate??0}% | ${playPR.duration??0} ms |
| **Main** | ${playMain.total??0} | ${playMain.passed??0} | ${playMain.failed??0} | ${playMain.skipped??0} | ${playMain.pass_rate??0}% | ${playMain.duration??0} ms |

${prLink} • ${mainLink}

---

### 🎨 Prettier

| Run | Affected files | Places to fix |
|-----|--------------:|--------------:|
| **PR**   | ${lintPR.prettier?.filesWithIssues ?? 0} | ${lintPR.prettier?.totalChanges ?? 0} |
| **Main** | ${lintMain.prettier?.filesWithIssues ?? 0} | ${lintMain.prettier?.totalChanges ?? 0} |

${lintPR.prettier?.files?.length ? `**Files (PR):** ${lintPR.prettier.files.join(', ')}` : '_No Prettier issues in PR_'}
${lintPR.prettier?.sample ? `\n<details><summary>PR diff sample (first 20 lines)</summary>\n\n\`\`\`diff\n${lintPR.prettier.sample}\n\`\`\`\n</details>` : ''}

---

### 📋 ESLint

| Run | Errors | Warnings | Fixable Err | Fixable Warn |
|-----|-------:|---------:|------------:|-------------:|
| **PR**   | ${lintPR.eslint?.errors ?? 0} | ${lintPR.eslint?.warnings ?? 0} | ${lintPR.eslint?.fixableErrors ?? 0} | ${lintPR.eslint?.fixableWarnings ?? 0} |
| **Main** | ${lintMain.eslint?.errors ?? 0} | ${lintMain.eslint?.warnings ?? 0} | ${lintMain.eslint?.fixableErrors ?? 0} | ${lintMain.eslint?.fixableWarnings ?? 0} |

${lintPR.eslint?.first ? `First PR error: \`${lintPR.eslint.first}\`` : '_No ESLint errors in PR_'}

---

👉 **[Open full dashboard ↗](${rootUrl || 'index.html'})**

_Automated comment — updates on every push._
`;

/* ---------- upsert sticky comment ---------- */
(async()=>{
  const {data:comments}=await octokit.request(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    { owner, repo, issue_number: prNumber }
  );
  const existing = comments.find(c=>c.user.type==='Bot' && c.body.startsWith('# 🔍 **GUI Test Review**'));
  if (existing){
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
})().catch(err=>{ console.error(err); process.exit(1); });
