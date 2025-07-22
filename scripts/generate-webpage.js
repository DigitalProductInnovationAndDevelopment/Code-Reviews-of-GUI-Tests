#!/usr/bin/env node
/**
 * generate-webpage.js
 *
 * Builds a static dashboard at artifacts/web-report/index.html
 *   · Playwright card  (markdown table identical to PR comment)
 *   · Prettier card
 *   · ESLint card
 *   · Flow-chart image (optional)
 *   · Checklist card
 */

const fs   = require('fs');
const path = require('path');
const marked = require('marked');

/* ─── paths ───────────────────────────────────────────── */
const ART = 'artifacts';
const OUT = path.join(ART, 'web-report');
fs.mkdirSync(OUT, { recursive: true });

/* ─── helpers ─────────────────────────────────────────── */
const readJSON = (f,d={})=>{
  try{return JSON.parse(fs.readFileSync(path.join(ART,f),'utf8'));}catch{return d;}
};
const pill = (txt,c)=>`<span class="pill" style="background:${c}">${txt}</span>`;
const card=(title,inner)=>`<div class="card"><h2>${title}</h2>${inner}</div>`;
const pre = txt=>`<pre>${txt}</pre>`;

/* ─── load artefacts ─────────────────────────────────── */
const lint   = readJSON('lint-summary.json');
const p      = lint.prettier;
const e      = lint.eslint;

const playPR   = readJSON('playwright-summary-pr.json');
const playMain = readJSON('playwright-summary-main.json');
const hasMainPlay = fs.existsSync(path.join(ART,'playwright-summary-main.json'));

const checklistMD = fs.readFileSync(path.join(ART,'checklist.md'),'utf8');

/* ─── copy assets ────────────────────────────────────── */
for(const dir of ['pr-report','main-report']){
  const src=path.join(ART,dir);
  if(fs.existsSync(src)) fs.cpSync(src,path.join(OUT,dir),{recursive:true});
}
if(fs.existsSync(path.join(ART,'flowchart.png')))
  fs.copyFileSync(path.join(ART,'flowchart.png'),path.join(OUT,'flowchart.png'));

/* ─── Prettier card with samples ─────────────────────── */
let prettierContent = '';
if (p.filesWithIssues) {
  prettierContent = pill(`${p.filesWithIssues} file${p.filesWithIssues!==1?'s':''}`,'#d32f2f')+
    pill(`${p.totalChanges} place${p.totalChanges!==1?'s':''}`,'#f57f17')+
    `<ul>${p.files.map(f=>`<li>${f}</li>`).join('')}</ul>`;
  
  if (p.exceedsLimit) {
    prettierContent += `<div class="warning-box">
      <strong>⚠️ Warning:</strong> Too many changes for inline comments (${p.totalChanges} changes exceed GitHub limit)<br>
      <strong>Fix locally:</strong> <code>npx prettier --write "tests/**/*.{js,ts,tsx,json}"</code>
    </div>`;
  } else if (p.totalChanges > 50) {
    prettierContent += `<div class="warning-box">
      <strong>⚠️ Warning:</strong> Too many changes for inline comments.<br>
      <strong>Fix locally:</strong> <code>npx prettier --write "tests/**/*.{js,ts,tsx,json}"</code>
    </div>`;
  } else {
    prettierContent += `<div class="fix-command">
      <strong>Fix locally:</strong> <code>npx prettier --write "tests/**/*.{js,ts,tsx,json}"</code>
    </div>`;
  }
  
  if (p.sample) {
    prettierContent += `<details><summary>Sample changes (first 20 lines)</summary>${pre(p.sample)}</details>`;
  }
} else {
  prettierContent = pill('No issues','#388e3c');
}

const prettierCard = card('Prettier', prettierContent);

/* ─── ESLint card with fix command ──────────────────── */
let eslintContent = '';
if (e.errors || e.warnings) {
  eslintContent = pill(`${e.errors} ✖`,'#d32f2f')+
    pill(`${e.warnings} ⚠`,'#f57f17')+
    pill(`${e.fixableErrors} fixable`,'#1976d2')+
    pill(`${e.fixableWarnings} autofix`,'#1976d2');
  
  if (e.first) {
    eslintContent += `<div class="first-error">First error: <code>${e.first}</code></div>`;
  }
  
  if (e.exceedsLimit) {
    eslintContent += `<div class="warning-box">
      <strong>⚠️ Warning:</strong> Too many issues for inline comments (${e.errors + e.warnings} issues exceed GitHub limit)<br>
      <strong>Fix locally:</strong> <code>npx eslint --fix "tests/**/*.{js,ts,tsx}"</code>
    </div>`;
  } else if (e.fixableErrors > 0 || e.fixableWarnings > 0) {
    eslintContent += `<div class="fix-command">
      <strong>Fix locally:</strong> <code>npx eslint --fix "tests/**/*.{js,ts,tsx}"</code>
    </div>`;
  }
} else {
  eslintContent = pill('Clean','#388e3c');
}

const eslintCard = card('ESLint', eslintContent);

/* ─── Playwright markdown table & links ─────────────── */
const mdPlaywright = `
| Run | Total | Passed | Failed | Skipped | Pass-rate | Duration |
|-----|------:|-------:|-------:|--------:|-----------|---------:|
| **PR**   | ${playPR.total??0} | ${playPR.passed??0} | ${playPR.failed??0} | ${playPR.skipped??0} | ${playPR.pass_rate??0}% | ${playPR.duration??0} ms |
${hasMainPlay?`| **Main** | ${playMain.total??0} | ${playMain.passed??0} | ${playMain.failed??0} | ${playMain.skipped??0} | ${playMain.pass_rate??0}% | ${playMain.duration??0} ms |`:''}`;

const linkParts=[];
if(fs.existsSync(path.join(OUT,'pr-report/index.html')))
  linkParts.push('<a href="pr-report/index.html">PR report&nbsp;↗</a>');
if(fs.existsSync(path.join(OUT,'main-report/index.html')))
  linkParts.push('<a href="main-report/index.html">Main report&nbsp;↗</a>');
else if(linkParts.length)
  linkParts.push('<em>No report for Main branch in this action run</em>');
const playLinks = linkParts.length?linkParts.join(' • '):'No HTML reports';

const playCard = card(
  'Playwright',
  marked.parse(mdPlaywright) + `<p style="margin-top:.8em">${playLinks}</p>`
);

/* ─── Flow-chart & Checklist cards ──────────────────── */
const flowCard = fs.existsSync(path.join(OUT,'flowchart.png'))
  ? card('Flow-chart',`<a href="flowchart.png"><img src="flowchart.png" style="max-width:100%"></a>`)
  : '';
const checklistCard = card('Checklist', marked.parse(checklistMD));

/* ─── HTML shell ─────────────────────────────────────── */
const html = /*html*/`
<!DOCTYPE html><meta charset="utf-8">
<title>GUI-Test Dashboard</title>
<style>
body{font:15px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#fafafa;margin:0;padding:2rem}
h1{font-size:2rem;margin-bottom:1.2rem}
.card{background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);padding:1.3rem;margin-bottom:1.3rem}
.pill{display:inline-block;border-radius:9999px;padding:.18em .68em;font-size:12px;color:#fff;margin-right:.4em}
.warning-box{background:#fff3cd;border:1px solid #ffeaa7;border-radius:8px;padding:1rem;margin-top:.8em;color:#856404}
.fix-command{background:#e8f5e9;border:1px solid #c8e6c9;border-radius:8px;padding:1rem;margin-top:.8em;color:#2e7d32}
.first-error{margin-top:.8em;padding:.5em;background:#f5f5f5;border-radius:4px}
pre{background:#2d2d2d;color:#f8f8f2;padding:1rem;border-radius:8px;overflow:auto;font-size:13px;margin-top:.6em}
ul{margin:.6em 0 0 1.1em}
details{margin-top:.6em}
summary{cursor:pointer;color:#1976d2;font-weight:600}
table{border-collapse:collapse;width:100%}
table th,table td{border:1px solid #ccc;padding:.4em .5em;text-align:center}
table th{background:#E3F2FD;font-weight:600}
code{background:#f5f5f5;padding:.125em .375em;border-radius:3px;font-family:monospace;font-size:.875em}
</style>

<h1>🔍 GUI-Test Dashboard</h1>

${playCard}
${prettierCard}
${eslintCard}
${flowCard}
${checklistCard}

<footer style="font-size:.8rem;color:#666;margin-top:2rem">
  Generated ${new Date().toLocaleString()}
</footer>`;

/* ─── write page ─────────────────────────────────────── */
fs.writeFileSync(path.join(OUT,'index.html'),html,'utf8');
console.log('✨ Dashboard written → web-report/index.html');