#!/usr/bin/env node
/**
 * Fancy sticky PR comment – no collapsible sections, immediate info.
 */
const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/core');

/* env & ctx ---------------------------------------------------- */
const token = process.env.GITHUB_TOKEN;
const evt   = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
if (!evt.pull_request) process.exit(0);

const owner = evt.repository.owner.login;
const repo  = evt.repository.name;
const pr    = evt.pull_request.number;

const ART   = process.env.ARTIFACTS_DIR || 'artifacts';
const URL   = process.env.WEB_REPORT_URL  || '';

/* data --------------------------------------------------------- */
const j     = f => JSON.parse(fs.readFileSync(path.join(ART,f),'utf8'));
const play  = j('playwright-summary.json');
const lint  = j('lint-summary.json');
const checklist = fs.readFileSync(path.join(ART,'checklist.md'),'utf8');

const p = lint.prettier;
const e = lint.eslint;

/* shields ------------------------------------------------------ */
const badge = (txt,color) =>
  `<img alt="${txt}" src="https://img.shields.io/badge/${encodeURIComponent(txt)}-${color}?style=for-the-badge">`;

const header = [
  badge(`Playwright ${play.passed}/${play.total}`, play.failed? 'd32f2f' : '4caf50'),
  badge(`Prettier ${p.filesWithIssues} file${p.filesWithIssues!==1?'s':''}`, p.filesWithIssues?'f57f17':'4caf50'),
  badge(`ESLint ${e.errors} error${e.errors!==1?'s':''}`, e.errors?'d32f2f':'4caf50')
].join(' ');

/* markdown body ------------------------------------------------ */
const body = `
${header}

### Test Metrics
| Total | Passed | Failed | Skipped | Pass-rate | Duration |
|-------|-------:|-------:|--------:|----------:|---------:|
| ${play.total} | ${play.passed} | ${play.failed} | ${play.skipped} | ${play.pass_rate}% | ${play.duration} ms |

### Prettier
* **Files:** ${p.filesWithIssues}
* **Fixes needed:** ${p.totalChanges}

### ESLint
* **Errors:** ${e.errors}
* **Warnings:** ${e.warnings}

${URL && `**[Open Full Dashboard ↗](${URL})**`}

---

${checklist}

_Automated comment – updates on every push._`;

/* octokit ------------------------------------------------------ */
const octokit = new Octokit({ auth: token });

(async () => {
  const { data: comments } = await octokit.request(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    { owner, repo, issue_number: pr }
  );

  const sticky = comments.find(c=>c.user.type==='Bot'&&c.body.includes('### Test Metrics'));
  if (sticky) {
    await octokit.request(
      'PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}',
      { owner, repo, comment_id: sticky.id, body }
    );
    console.log('🔄  Comment updated');
  } else {
    await octokit.request(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      { owner, repo, issue_number: pr, body }
    );
    console.log('💬  Comment created');
  }
})();
