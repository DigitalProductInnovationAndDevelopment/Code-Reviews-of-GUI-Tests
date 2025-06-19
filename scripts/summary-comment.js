#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const { Octokit } = require('@octokit/core');

/* context */
const token = process.env.GITHUB_TOKEN;
const evt   = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
if (!evt.pull_request) process.exit(0);

const { login:owner } = evt.repository.owner;
const { name:repo }   = evt.repository;
const pr = evt.pull_request.number;

/* artefacts */
const ART = process.env.ARTIFACTS_DIR || 'artifacts';
const URL = process.env.WEB_REPORT_URL  || '';
const play = JSON.parse(fs.readFileSync(path.join(ART,'playwright-summary.json')));
const lint = JSON.parse(fs.readFileSync(path.join(ART,'lint-summary.json')));
const checklist = fs.readFileSync(path.join(ART,'checklist.md'),'utf8');

const p = lint.prettier, e = lint.eslint;

/* markdown */
const md = `
## ✅ Test Checklist
${checklist}

---

## 🧪 Playwright Test Metrics
| Total | Passed | Failed | Skipped | Duration (ms) | Pass Rate |
|------:|-------:|-------:|--------:|--------------:|----------:|
| ${play.total} | ${play.passed} | ${play.failed} | ${play.skipped} | ${play.duration} | ${play.pass_rate}% |

---

## 🎨 Prettier Metrics
| Files with Issues | Places to Fix |
|------------------:|--------------:|
| ${p.filesWithIssues} | ${p.totalChanges} |

---

## 📋 ESLint Test Metrics
| Files Checked | Errors | Warnings | Fixable Errors | Fixable Warnings |
|--------------:|-------:|---------:|---------------:|-----------------:|
| ${e.files} | ${e.errors} | ${e.warnings} | ${e.fixableErrors} | ${e.fixableWarnings} |

${URL && `**[Open Full Dashboard to see full report ↗](${URL})**`}

_Automated comment – updates on every push_
`;

/* create / update */
const octokit = new Octokit({ auth:token });
(async()=>{
  const { data:comments } = await octokit.request(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    { owner, repo, issue_number:pr });
  const bot = comments.find(c=>c.user.type==='Bot'&&c.body.includes('## ✅ Test Checklist'));
  if (bot)
    await octokit.request('PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}',
      { owner, repo, comment_id:bot.id, body:md });
  else
    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      { owner, repo, issue_number:pr, body:md });
})();
