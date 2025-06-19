#!/usr/bin/env node
/**
 * summary-comment.js
 *
 * Creates or refreshes a single sticky “GUI Test Review” comment on a PR.
 * It shows:
 *   · Playwright overall result
 *   · Counts for Prettier & ESLint (details stay in inline reviewdog comments)
 *   · Collapsible checklist
 *   · Link to the static dashboard
 *
 * Relies on these artefacts in ARTIFACTS_DIR (default: artifacts):
 *   - playwright-summary.json
 *   - lint-summary.json
 *   - checklist.md
 *
 * Environment variables expected (set by the workflow):
 *   · GITHUB_TOKEN
 *   · GITHUB_EVENT_PATH
 *   · ARTIFACTS_DIR        (e.g. gui-artifacts)
 *   · WEB_REPORT_URL       (dashboard URL)
 */

const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/core');

/* ── helpers ─────────────────────────────────────────────── */
const j = (p, d = {}) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; }
};
const badge = (txt, ok) =>
  ok
    ? `![✓](https://img.shields.io/badge/${encodeURIComponent(txt)}-brightgreen?style=flat-square)`
    : `![✗](https://img.shields.io/badge/${encodeURIComponent(txt)}-red?style=flat-square)`;

/* ── env & GitHub context ───────────────────────────────── */
const token = process.env.GITHUB_TOKEN;
if (!token) { console.error('GITHUB_TOKEN missing'); process.exit(1); }

const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
if (!event.pull_request) { console.log('Not a PR event – skipping comment.'); process.exit(0); }

const owner = event.repository.owner.login;
const repo  = event.repository.name;
const prNum = event.pull_request.number;

/* ── artefacts ──────────────────────────────────────────── */
const ART = process.env.ARTIFACTS_DIR || 'artifacts';
const play  = j(path.join(ART, 'playwright-summary.json'));
const lint  = j(path.join(ART, 'lint-summary.json'));
const checklist = fs.readFileSync(path.join(ART, 'checklist.md'), 'utf8');
const url   = process.env.WEB_REPORT_URL || '';

const prett = lint.prettier ?? { filesWithIssues: 0 };
const esl   = lint.eslint   ?? { errors: 0, warnings: 0 };

/* ── comment body ───────────────────────────────────────── */
const body = `
# 🔍 GUI Test Review

${badge(`Playwright ${play.passed}/${play.total}`, play.failed === 0)}
${badge(`Prettier ${prett.filesWithIssues} file${prett.filesWithIssues !== 1 ? 's' : ''}`, prett.filesWithIssues === 0)}
${badge(`ESLint ${esl.errors} error${esl.errors !== 1 ? 's' : ''}`, esl.errors === 0)}

<details>
<summary>▶ Show details</summary>

| | Count |
|---|---|
| **Passed** | ${play.passed} |
| **Failed** | ${play.failed} |
| **Skipped** | ${play.skipped} |
| **Duration** | ${play.duration} ms |

</details>

${url && `👉 **[Open the full dashboard ↗](${url})**`}

<details>
<summary>Checklist</summary>

${checklist}
</details>

_This comment is updated automatically on every push._
`;

/* ── create / update sticky comment ─────────────────────── */
const octokit = new Octokit({ auth: token });

(async () => {
  /* list comments on the PR */
  const { data: comments } = await octokit.request(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    { owner, repo, issue_number: prNum }
  );

  const sticky = comments.find(
    c => c.user.type === 'Bot' && c.body.startsWith('# 🔍 GUI Test Review')
  );

  if (sticky) {
    await octokit.request(
      'PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}',
      { owner, repo, comment_id: sticky.id, body }
    );
    console.log('🔄  Updated GUI-test summary comment.');
  } else {
    await octokit.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      { owner, repo, issue_number: prNum, body }
    );
    console.log('💬  Created GUI-test summary comment.');
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
