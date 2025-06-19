#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const marked = require('marked');           // add to devDependencies

const ART = 'artifacts';
const OUT = path.join(ART, 'web-report');
fs.mkdirSync(OUT, { recursive: true });

/* ── helpers ───────────────────────────────────────────────────────── */
const r = (fp, d = {}) => {
  try { return JSON.parse(fs.readFileSync(path.join(ART, fp), 'utf8')); }
  catch { return d; }
};
const htmlEscape = (s) => s.replace(/[&<>"']/g,(c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/* ── data ──────────────────────────────────────────────────────────── */
const play   = r('playwright-summary.json');
const eslint = r('eslint-tests.json', []);
const prettierPatch = fs.existsSync(path.join(ART,'prettier.patch'))
  ? fs.readFileSync(path.join(ART,'prettier.patch'),'utf8')
  : '';
const checklistMD = fs.existsSync(path.join(ART,'checklist.md'))
  ? fs.readFileSync(path.join(ART,'checklist.md'),'utf8')
  : '';

/* ── ESLint → rows ─────────────────────────────────────────────────── */
const eslintRows = eslint.flatMap(file =>
  file.messages.map(m => ({
    file: path.basename(file.filePath),
    line: m.line,
    rule: m.ruleId,
    sev : m.severity === 2 ? 'error' : 'warn',
    msg : m.message
  }))
);

/* ── copy assets ───────────────────────────────────────────────────── */
for (const f of ['flowchart.png']) {
  const src = path.join(ART, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, f));
}
if (fs.existsSync(path.join(ART,'playwright-report')))
  fs.cpSync(path.join(ART,'playwright-report'), path.join(OUT,'playwright-report'), { recursive:true });

/* ── build HTML ────────────────────────────────────────────────────── */
const html = /*html*/`
<!DOCTYPE html><html lang="en"><meta charset="UTF-8">
<title>GUI-Test Dashboard</title>
<style>
 body{font:15px/1.6 system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:1.8rem;max-width:1200px}
 h1,h2{color:#1976D2}
 table{border-collapse:collapse;width:100%;margin:1rem 0;font-size:0.95rem}
 th,td{border:1px solid #ccc;padding:.5rem .6rem;text-align:left}
 th{background:#E3F2FD}
 code{background:#f3f3f3;padding:2px 4px;font-size:90%}
 pre{background:#f7f7f7;padding:1rem;overflow:auto;border:1px solid #ddd}
 .error{color:#c62828;font-weight:bold}.warn{color:#ef6c00}
 img{border:1px solid #ccc;border-radius:6px;margin:1rem 0}
</style>
<body>
<h1>🔍 GUI-Test Dashboard</h1>

<h2>Test Summary</h2>
<table>
<tr><th>Total</th><td>${play.total??0}</td><th>Passed</th><td>${play.passed??0}</td>
    <th>Failed</th><td>${play.failed??0}</td><th>Skipped</th><td>${play.skipped??0}</td></tr>
<tr><th>Pass&nbsp;Rate</th><td>${play.pass_rate??0}%</td>
    <th>Duration</th><td colspan="5">${play.duration??0}&nbsp;ms</td></tr>
</table>
<p>📄 Full HTML runner report: <a href="playwright-report/index.html">open&nbsp;↗</a></p>

<h2>Prettier Suggestions</h2>
${prettierPatch ? `<pre>${htmlEscape(prettierPatch)}</pre>` : '<p>No issues 🎉</p>'}

<h2>ESLint Findings</h2>
${eslintRows.length
  ? `<table><tr><th>sev</th><th>rule</th><th>file</th><th>line</th><th>message</th></tr>${
      eslintRows.map(r=>`<tr><td class="${r.sev}">${r.sev}</td><td>${r.rule}</td><td>${r.file}</td><td>${r.line}</td><td>${htmlEscape(r.msg)}</td></tr>`).join('')
    }</table>`
  : '<p>No issues 🎉</p>'}

<h2>Flowchart</h2>
<img src="flowchart.png" style="width:100%" alt="Playwright flowchart">

<h2>Checklist</h2>
${marked.parse(checklistMD)}

<hr><p style="font-size:90%;color:#555">Generated ${new Date().toISOString()}</p>
`;
fs.writeFileSync(path.join(OUT,'index.html'),html,'utf8');
console.log('📝 Dashboard rebuilt at web-report/index.html');
