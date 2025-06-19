#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/core');

/* helpers */
const json = (p,d={}) => { try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return d;} };
const clip = s => s.split('\n').slice(0,20).join('\n');

/* env / repo context */
const token = process.env.GITHUB_TOKEN;
const evt   = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
if (!evt.pull_request) { console.log('Not a PR event'); process.exit(0); }

const owner = evt.repository.owner.login;
const repo  = evt.repository.name;
const pr    = evt.pull_request.number;

const ART   = process.env.ARTIFACTS_DIR || 'artifacts';
const URL   = process.env.WEB_REPORT_URL || '';

/* artefacts */
const play  = json(path.join(ART,'playwright-summary.json'));
const lint  = json(path.join(ART,'lint-summary.json'));
const checklist = fs.existsSync(path.join(ART,'checklist.md'))
  ? fs.readFileSync(path.join(ART,'checklist.md'),'utf8')
  : '*Checklist not generated*';

const prett = lint.prettier ?? { filesWithIssues:0, files:[], sample:'' };
const esl   = lint.eslint   ?? { errors:0, warnings:0, first:'' };

/* body */
const body = `
# 🔍 GUI Test Review Report

**Playwright:** ${play.total} total ✅ ${play.passed} ❌ ${play.failed} ⏭️ ${play.skipped} (${play.pass_rate}%)

**Prettier:** ${prett.filesWithIssues} file(s) need formatting  
${prett.filesWithIssues ? `Files: ${prett.files.join(', ')}

\`\`\`diff
${clip(prett.sample)}
\`\`\`` : 'No issues 🎉'}

**ESLint:** ${esl.errors} error(s), ${esl.warnings} warning(s)  
${esl.first || 'No errors 🎉'}

**Checklist**  
${checklist}

${URL && `👉 [Open full dashboard](${URL})`}
`;

/* create / update sticky comment */
const octokit = new Octokit({ auth: token });
(async () => {
  const { data: comments } = await octokit.request(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    { owner, repo, issue_number: pr }
  );
  const prev = comments.find(c => c.user.type === 'Bot' && c.body.startsWith('# 🔍'));
  if (prev)
    await octokit.request('PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}',
      { owner, repo, comment_id: prev.id, body });
  else
    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      { owner, repo, issue_number: pr, body });
})();
