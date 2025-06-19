#!/usr/bin/env node
/**
 * Pretty “GUI Test Review” sticky comment.
 * Relies on artifacts/{playwright-summary.json,lint-summary.json,checklist.md}
 */
const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/core');

const ART   = process.env.ARTIFACTS_DIR || 'artifacts';
const URL   = process.env.WEB_REPORT_URL || '';

/* ── GitHub context ─────────────── */
const token = process.env.GITHUB_TOKEN;
const evt   = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
if (!evt.pull_request) process.exit(0);

const owner = evt.repository.owner.login;
const repo  = evt.repository.name;
const prNum = evt.pull_request.number;

/* ── data helpers ───────────────── */
const j = f => JSON.parse(fs.readFileSync(path.join(ART,f),'utf8'));
const play  = j('playwright-summary.json');
const lint  = j('lint-summary.json');
const checklist = fs.readFileSync(path.join(ART,'checklist.md'),'utf8');

const prett = lint.prettier;
const esl   = lint.eslint;

/* ── coloured “badges” (text + emoji) ─ */
const badge = (txt, ok) =>
  ok ? `![✓](https://img.shields.io/badge/${encodeURIComponent(txt)}-brightgreen?style=flat-square)` :
       `![✗](https://img.shields.io/badge/${encodeURIComponent(txt)}-red?style=flat-square)`;

const body = `
# 🔍 GUI Test Review

${badge('Playwright '+play.passed+'/'+play.total, play.failed===0)}  
${badge('Prettier '+prett.filesWithIssues+' file'+(prett.filesWithIssues!==1?'s':''), prett.filesWithIssues===0)} 
${badge('ESLint '+esl.errors+' error'+(esl.errors!==1?'s':''), esl.errors===0)}

<details>
<summary>▶ Show details</summary>

| | Count |
|---|---|
| **Passed** | ${play.passed} |
| **Failed** | ${play.failed} |
| **Skipped** | ${play.skipped} |
| **Duration** | ${play.duration} ms |

### Prettier (${prett.filesWithIssues})
${prett.filesWithIssues ? `Files: ${prett.files.map(f=>` \`${f}\``).join(', ')}` : 'No issues 🎉'}

### ESLint (${esl.errors} ✖ / ${esl.warnings} ⚠)
${esl.first || 'No errors 🎉'}

</details>

${URL ? `👉 **[Open the full dashboard ↗](${URL})**` : ''}

<details>
<summary>Checklist</summary>

${checklist}
</details>

_This comment updates on every push._
`;

/* ── create / update sticky comment ── */
const octokit = new Octokit({ auth: token });
(async () => {
  const { data: comments } = await octokit.request(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    { owner, repo, issue_number: prNum }
  );
  const prev = comments.find(c => c.user.type==='Bot' && c.body.startsWith('# 🔍 GUI Test Review'));
  const route = prev ? 'PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}'
                     : 'POST  /repos/{owner}/{repo}/issues/{issue_number}/comments';
  await octokit.request(route, prev
    ? { owner, repo, comment_id: prev.id, body }
    : { owner, repo, issue_number: prNum, body }
  );
})();
