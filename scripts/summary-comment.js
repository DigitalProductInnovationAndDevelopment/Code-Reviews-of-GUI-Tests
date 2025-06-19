#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/core');

const json = (p,d={}) => { try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return d; } };

const token = process.env.GITHUB_TOKEN;
const evt   = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
if (!evt.pull_request) { console.log('Not a PR event'); process.exit(0); }

const owner = evt.repository.owner.login;
const repo  = evt.repository.name;
const pr    = evt.pull_request.number;

const ART = process.env.ARTIFACTS_DIR || 'artifacts';
const URL = process.env.WEB_REPORT_URL || '';

const play  = json(path.join(ART,'playwright-summary.json'));
const lint  = json(path.join(ART,'lint-summary.json'));
const checklist = fs.existsSync(path.join(ART,'checklist.md'))
  ? fs.readFileSync(path.join(ART,'checklist.md'),'utf8')
  : '*Checklist not generated*';

const prett = lint.prettier ?? { filesWithIssues:0 };
const esl   = lint.eslint   ?? { errors:0, warnings:0 };

const body = `
# 🔍 GUI Test Review

| Tool      | Result |
|-----------|--------|
| **Playwright** | ${play.passed}/${play.total} passed (${play.pass_rate}%)
| **Prettier**   | ${prett.filesWithIssues} file(s) need formatting
| **ESLint**     | ${esl.errors} error(s), ${esl.warnings} warning(s)

${URL && `👉 [Open full dashboard to see detailed report↗](${URL})`}

<details><summary>Checklist</summary>

${checklist}

</details>

_Formatting and lint errors are shown inline via reviewdog._`;

const octokit = new Octokit({ auth: token });
(async () => {
  const { data: comments } = await octokit.request(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    { owner, repo, issue_number: pr }
  );
  const existing = comments.find(c => c.user.type === 'Bot' && c.body.startsWith('# 🔍 GUI Test Review'));
  if (existing)
    await octokit.request('PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}',
      { owner, repo, comment_id: existing.id, body });
  else
    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      { owner, repo, issue_number: pr, body });
})();
