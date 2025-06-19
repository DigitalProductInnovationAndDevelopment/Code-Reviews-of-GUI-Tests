#!/usr/bin/env node
/**
 * Builds artifacts/web-report/index.html
 *  - Checklist
 *  - Prettier & ESLint metrics (from lint-summary.json)
 *  - Playwright summary
 *  - Flow-chart image + link to full Playwright HTML report
 */

const fs   = require('fs');
const path = require('path');
const marked = require('marked');

const ART = 'artifacts';
const OUT = path.join(ART, 'web-report');
fs.mkdirSync(OUT, { recursive: true });

/* helpers ------------------------------------------------------- */
const readJSON = (file, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(path.join(ART, file), 'utf8')); }
  catch { return fallback; }
};
const esc = s => s.replace(/[&<>"']/g, c => (
  { '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c]
));

/* load artefacts ------------------------------------------------ */
const checklistMD = fs.existsSync(path.join(ART, 'checklist.md'))
  ? fs.readFileSync(path.join(ART, 'checklist.md'), 'utf8')
  : '*No checklist generated*';

const lint   = readJSON('lint-summary.json');     // ← new single source
const playRaw = readJSON('playwright-summary.json');

/* -----  Prettier / ESLint metrics  ----- */
const prettier = lint.prettier ?? { filesWithIssues: 0 };
const eslint   = lint.eslint   ?? { files:0, errors:0, warnings:0 };

/* -----  Normalise Playwright numbers  ----- */
const play = (() => {
  const passed   = playRaw.passed      ?? playRaw.expected   ?? 0;
  const failed   = playRaw.failed      ?? playRaw.unexpected ?? 0;
  const skipped  = playRaw.skipped     ?? 0;
  const total    = playRaw.total       ?? passed + failed + skipped;
  const rate     = playRaw.pass_rate   ?? (total ? +(passed/total*100).toFixed(2) : 0);
  const duration = playRaw.duration    ?? 0;
  return { total, passed, failed, skipped, rate, duration };
})();

/* copy assets --------------------------------------------------- */
if (fs.existsSync(path.join(ART, 'flowchart.png')))
  fs.copyFileSync(path.join(ART, 'flowchart.png'), path.join(OUT, 'flowchart.png'));
if (fs.existsSync(path.join(ART, 'playwright-report')))
  fs.cpSync(path.join(ART, 'playwright-report'), path.join(OUT, 'playwright-report'), { recursive:true });

/* build HTML ---------------------------------------------------- */
const html = /*html*/`
<!DOCTYPE html><meta charset="UTF-8"><title>GUI-Test Dashboard</title>
<style>
 body{font:15px/1.6 system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:1.8rem;max-width:1150px}
 h1,h2{color:#1976D2}
 table{border-collapse:collapse;margin:1rem 0;width:100%}
 th,td{border:1px solid #ccc;padding:.5rem .6rem;text-align:left}
 th{background:#E3F2FD}
 pre{background:#f7f7f7;border:1px solid #ddd;padding:1rem;overflow:auto;font-size:90%}
 img{border:1px solid #ccc;border-radius:6px;margin:1rem 0;width:100%}
</style>
<h1>🔍 GUI-Test Dashboard</h1>

<h2>Checklist</h2>
${marked.parse(checklistMD)}

<h2>Prettier Overview (tests/**)</h2>
<table>
 <tr><th>Files with issues</th><td>${prettier.filesWithIssues}</td></tr>
</table>
${prettier.filesWithIssues === 0
  ? '<p>No formatting suggestions 🎉</p>'
  : '<p>See inline reviewdog comments for exact diffs.</p>'}

<h2>ESLint Overview (tests/**)</h2>
<table>
 <tr><th>Files</th><td>${eslint.files ?? '–'}</td>
     <th>Errors</th><td>${eslint.errors}</td>
     <th>Warnings</th><td>${eslint.warnings}</td></tr>
</table>

<h2>Playwright Summary</h2>
<table>
 <tr><th>Total</th><td>${play.total}</td>
     <th>Passed</th><td>${play.passed}</td>
     <th>Failed</th><td>${play.failed}</td>
     <th>Skipped</th><td>${play.skipped}</td></tr>
 <tr><th>Pass&nbsp;Rate</th><td>${play.rate}%</td>
     <th>Duration</th><td colspan="5">${play.duration}&nbsp;ms</td></tr>
</table>
<p>📄 <a href="playwright-report/index.html">Open the full Playwright HTML report ↗</a></p>

<h2>Flow-chart</h2>
<a href="flowchart.png" target="_blank"><img src="flowchart.png" alt="Flowchart"></a>

<hr><p style="font-size:90%;color:#555">Generated ${new Date().toISOString()}</p>
`;

fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');
console.log('📝 Dashboard regenerated → web-report/index.html');
