#!/usr/bin/env node
/**
 * generate-webpage.js
 *
 * Builds a static dashboard at artifacts/web-report/index.html
 *   · Playwright card  (links to pr-report & main-report)
 *   · Prettier card
 *   · ESLint card
 *   · Flow-chart image (optional)
 *   · Checklist card
 */

const fs   = require('fs');
const path = require('path');
const marked = require('marked');

/* ─── paths ─────────────────────────────────────────────────── */
const ART = 'artifacts';
const OUT = path.join(ART, 'web-report');
fs.mkdirSync(OUT, { recursive: true });

/* ─── helpers ───────────────────────────────────────────────── */
const readJSON = file => JSON.parse(fs.readFileSync(path.join(ART, file), 'utf8'));
const pill = (txt,color)=>`<span class="pill" style="background:${color}">${txt}</span>`;
const card = (title,inner)=>`<div class="card"><h2>${title}</h2>${inner}</div>`;
const pre  = txt=>`<pre>${txt}</pre>`;

/* ─── load artefacts ───────────────────────────────────────── */
const lint        = readJSON('lint-summary.json');
const p           = lint.prettier;
const e           = lint.eslint;
const play        = readJSON('playwright-summary.json');
const checklistMD = fs.readFileSync(path.join(ART,'checklist.md'),'utf8');

/* ─── copy raw assets ──────────────────────────────────────── */
/* Copy PR & Main HTML reports (if they exist) */
for (const dir of ['pr-report', 'main-report']) {
  const src = path.join(ART, dir);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(OUT, dir), { recursive:true });
}

/* Copy flowchart PNG if present */
if (fs.existsSync(path.join(ART,'flowchart.png')))
  fs.copyFileSync(path.join(ART,'flowchart.png'), path.join(OUT,'flowchart.png'));

/* ─── build cards ──────────────────────────────────────────── */
const prettierCard = card(
  'Prettier',
  p.filesWithIssues
    ? pill(`${p.filesWithIssues} file${p.filesWithIssues!==1?'s':''}`,'#d32f2f') +
      pill(`${p.totalChanges} place${p.totalChanges!==1?'s':''}`,'#f57f17') +
      `<ul>${p.files.map(f=>`<li>${f}</li>`).join('')}</ul>` +
      (p.totalChanges>50
        ? `<div class="warning-box">
             <strong>⚠️ Warning:</strong> Too many changes for inline comments.<br>
             <pre style="margin-top:.5em;font-size:12px">npx prettier "tests/**/*.{js,jsx,ts,tsx}" --write</pre>
           </div>`
        : '') +
      `<details><summary>Diff sample (first 20 lines)</summary>${pre(p.sample)}</details>`
    : pill('No issues','#388e3c')
);

const eslintCard = card(
  'ESLint',
  e.errors||e.warnings
    ? pill(`${e.errors} ✖`,'#d32f2f')+
      pill(`${e.warnings} ⚠`,'#f57f17')+
      pill(`${e.fixableErrors} fixable`,'#1976d2')+
      pill(`${e.fixableWarnings} autofix`,'#1976d2')+
      (e.first ? `<details><summary>First error</summary>${pre(e.first)}</details>`:'')
    : pill('Clean','#388e3c')
);

/* Build Playwright links dynamically */
const links = [];
if (fs.existsSync(path.join(OUT,'pr-report/index.html')))
  links.push('<a href="pr-report/index.html">PR report&nbsp;↗</a>');
if (fs.existsSync(path.join(OUT,'main-report/index.html')))
  links.push('<a href="main-report/index.html">Main report&nbsp;↗</a>');
const playLinks = links.length ? links.join(' • ') : 'No HTML reports';

/* Playwright card */
const playCard = card(
  'Playwright',
  pill(`${play.passed}/${play.total} passed`,'#388e3c') +
    (play.failed  ? pill(`${play.failed} failed`,'#d32f2f')  : '') +
    (play.skipped ? pill(`${play.skipped} skipped`,'#fbc02d') : '') +
    `<p style="margin:.6em 0 0">Pass-rate <b>${play.pass_rate}%</b> • <b>${play.duration} ms</b></p>
     <p>${playLinks}</p>`
);

const flowCard = fs.existsSync(path.join(OUT,'flowchart.png'))
  ? card('Flow-chart',`<a href="flowchart.png"><img src="flowchart.png" style="max-width:100%"></a>`)
  : '';

const checklistCard = card('Checklist', marked.parse(checklistMD));

/* ─── HTML shell ───────────────────────────────────────────── */
const html = /* html */`
<!DOCTYPE html><meta charset="utf-8">
<title>GUI-Test Dashboard</title>
<style>
body{font:15px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#fafafa;margin:0;padding:2rem}
h1{font-size:2rem;margin-bottom:1.2rem}
.card{background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);padding:1.3rem;margin-bottom:1.3rem}
.pill{display:inline-block;border-radius:9999px;padding:.18em .68em;font-size:12px;color:#fff;margin-right:.4em}
.warning-box{background:#fff3cd;border:1px solid #ffeaa7;border-radius:8px;padding:1rem;margin-top:.8em;color:#856404}
pre{background:#2d2d2d;color:#f8f8f2;padding:1rem;border-radius:8px;overflow:auto;font-size:13px;margin-top:.6em}
ul{margin:.6em 0 0 1.1em}
details{margin-top:.6em}
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

/* ─── write page ───────────────────────────────────────────── */
fs.writeFileSync(path.join(OUT,'index.html'),html,'utf8');
console.log('✨ Dashboard written → web-report/index.html');
