#!/usr/bin/env node
/**
 * Fancy static dashboard – cards + pill badges, no JS.
 */

const fs   = require('fs');
const path = require('path');
const marked = require('marked');

const ART = 'artifacts';
const OUT = path.join(ART,'web-report');
fs.mkdirSync(OUT,{recursive:true});

/* load artefacts ---------------------------------------------- */
const lint = JSON.parse(fs.readFileSync(path.join(ART,'lint-summary.json'),'utf8'));
const prett = lint.prettier;
const esl   = lint.eslint;
const play  = JSON.parse(fs.readFileSync(path.join(ART,'playwright-summary.json'),'utf8'));
const checklist = fs.readFileSync(path.join(ART,'checklist.md'),'utf8');

/* copy assets -------------------------------------------------- */
if (fs.existsSync(path.join(ART,'playwright-report')))
  fs.cpSync(path.join(ART,'playwright-report'), path.join(OUT,'playwright-report'), { recursive:true });
if (fs.existsSync(path.join(ART,'flowchart.png')))
  fs.copyFileSync(path.join(ART,'flowchart.png'), path.join(OUT,'flowchart.png'));

/* helpers ------------------------------------------------------ */
const pill = (text,color) => `<span class="pill" style="background:${color}">${text}</span>`;
const card = (title,inner) => `<div class="card"><h2>${title}</h2>${inner}</div>`;

/* cards -------------------------------------------------------- */
/* --- Prettier card --- */
const prettierCard = card('Prettier',
  p.filesWithIssues
    ? pill(`${p.filesWithIssues} file${p.filesWithIssues!==1?'s':''}`,'#d32f2f')+
      pill(`${p.totalChanges} place${p.totalChanges!==1?'s':''}`,'#f57f17')+
      `<ul>${p.files.map(f=>`<li>${f}</li>`).join('')}</ul>`+
      `<details><summary>Diff sample (first 20 lines)</summary>${pre(p.sample)}</details>`
    : pill('No issues','#388e3c'));

/* --- ESLint card --- */
const eslintCard = card('ESLint',
  (e.errors||e.warnings)
    ? pill(`${e.errors} ✖`,'#d32f2f')+pill(`${e.warnings} ⚠`,'#f57f17')+
      pill(`${e.fixableErrors} fixable`,'#1976d2')+
      pill(`${e.fixableWarnings} autofix`,'#1976d2')+
      (e.first?`<pre>${e.first}</pre>`:'')
    : pill('Clean','#388e3c'));

const playCard = card('Playwright',
  pill(`${play.passed}/${play.total} passed`,'#388e3c') +
  (play.failed ? pill(`${play.failed} failed`,'#d32f2f') : '') +
  (play.skipped ? pill(`${play.skipped} skipped`,'#fbc02d') : '') +
  `<p style="margin:.6em 0 0">Pass-rate <b>${play.pass_rate}%</b> • <b>${play.duration} ms</b></p>
   <p><a href="playwright-report/index.html">Open full HTML report ↗</a></p>`);

const flowCard = fs.existsSync(path.join(OUT,'flowchart.png'))
  ? card('Flow-chart', `<a href="flowchart.png"><img src="flowchart.png" style="max-width:100%"></a>`)
  : '';

const checklistCard = card('Checklist', marked.parse(checklist));

/* HTML --------------------------------------------------------- */
const html = `<!DOCTYPE html><meta charset="utf-8"><title>GUI-Test Dashboard</title>
<style>
body{font:15px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#fafafa;margin:0;padding:2rem}
h1{font-size:2rem;margin-bottom:1.2rem}
.card{background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.07);padding:1.2rem;margin-bottom:1.2rem}
.pill{display:inline-block;border-radius:9999px;padding:.17em .65em;font-size:12px;color:#fff;margin-right:.4em}
ul{margin:.6em 0 0 1.2em}
</style>
<h1>🔍 GUI-Test Dashboard</h1>
${playCard}
${prettierCard}
${eslintCard}
${flowCard}
${checklistCard}
<footer style="font-size:.8rem;color:#666;margin-top:2rem">Generated ${new Date().toLocaleString()}</footer>`;

fs.writeFileSync(path.join(OUT,'index.html'), html,'utf8');
console.log('✨ Fancy dashboard written → web-report/index.html');
