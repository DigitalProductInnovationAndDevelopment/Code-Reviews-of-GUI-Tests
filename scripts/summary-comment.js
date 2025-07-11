#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/core');

const ART = process.env.ARTIFACTS_DIR || 'artifacts';

const readJSON = (f,d={})=>{
  try{return JSON.parse(fs.readFileSync(path.join(ART,f),'utf8'));}catch{return d;}
};

/* summaries */
const playPR   = readJSON('playwright-summary-pr.json');
const playMain = readJSON('playwright-summary-main.json');
const hasMain  = fs.existsSync(path.join(ART,'playwright-summary-main.json'));

const lintPR   = readJSON('lint-summary-pr.json', readJSON('lint-summary.json'));
const checklist = (()=>{try{return fs.readFileSync(path.join(ART,'checklist.md'),'utf8');}catch{return '';}})();

/* links */
const prLinkExists   = fs.existsSync(path.join(ART,'pr-report/index.html'));
const mainLinkExists = fs.existsSync(path.join(ART,'main-report/index.html'));
const linkParts=[];
if(prLinkExists) linkParts.push('[PR&nbsp;report&nbsp;↗](pr-report/index.html)');
if(mainLinkExists) linkParts.push('[Main&nbsp;report&nbsp;↗](main-report/index.html)');
else if(prLinkExists) linkParts.push('_No report for Main branch in this action run_');
const playLinks = linkParts.length?linkParts.join(' • '):'_No HTML reports_';

/* github context */
const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
const prNum = event.pull_request?.number ?? (event.issue?.pull_request && event.issue.number);
if(!prNum){console.error('Not a PR event');process.exit(0);}
const [owner,repo]=process.env.GITHUB_REPOSITORY.split('/');
const octokit = new Octokit({auth:process.env.GITHUB_TOKEN});

/* markdown blocks */
const mdPlay = `
| Run | Total | Passed | Failed | Skipped | Pass-rate | Duration |
|-----|------:|-------:|-------:|--------:|-----------|---------:|
| **PR**   | ${playPR.total??0} | ${playPR.passed??0} | ${playPR.failed??0} | ${playPR.skipped??0} | ${playPR.pass_rate??0}% | ${playPR.duration??0} ms |
${hasMain?`| **Main** | ${playMain.total??0} | ${playMain.passed??0} | ${playMain.failed??0} | ${playMain.skipped??0} | ${playMain.pass_rate??0}% | ${playMain.duration??0} ms |`:''}`;

const body = `
# 🔍 **GUI Test Review**

<details open><summary><b>Checklist</b></summary>

${checklist||'_No checklist found_'}
</details>

---

### ▶️ Playwright

${mdPlay}

${playLinks}

---

### 🎨 Prettier (PR)

| Metric | PR |
|--------|---:|
| **Files needing format** | ${lintPR.prettier?.filesWithIssues ?? 0} |
| **Places to fix**        | ${lintPR.prettier?.totalChanges   ?? 0} |

${lintPR.prettier?.files?.length?`**Files:** ${lintPR.prettier.files.join(', ')}`:'_No Prettier issues_'}

---

### 📋 ESLint (PR)

| Metric | PR |
|--------|---:|
| **Errors**         | ${lintPR.eslint?.errors ?? 0} |
| **Warnings**       | ${lintPR.eslint?.warnings ?? 0} |
| **Fixable Errors** | ${lintPR.eslint?.fixableErrors ?? 0} |
| **Fixable Warns**  | ${lintPR.eslint?.fixableWarnings ?? 0} |

${lintPR.eslint?.first?`First error: \`${lintPR.eslint.first}\``:'_No ESLint errors_'}

---

👉 **[Open full dashboard ↗](${process.env.WEB_REPORT_URL || 'index.html'})**

_Automated comment — updates on every push._
`;

/* upsert comment */
(async()=>{
  const {data:comments}=await octokit.request(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    {owner,repo,issue_number:prNum});
  const existing=comments.find(c=>c.user.type==='Bot'&&c.body.startsWith('# 🔍 **GUI Test Review**'));
  if(existing){
    await octokit.request('PATCH /repos/{owner}/{repo}/issues/comments/{id}',
      {owner,repo,id:existing.id,body});
    console.log('🔄 updated comment');
  }else{
    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      {owner,repo,issue_number:prNum,body});
    console.log('💬 created comment');
  }
})().catch(err=>{console.error(err);process.exit(1);});
