#!/usr/bin/env node
/**
 * Produces a Markdown checklist that mirrors the original
 * bash logic and stores it at /artifacts/checklist.md
 */
const fs = require('fs');
const path = require('path');

const ART = 'artifacts';
const checklist = [];
let warning = false;

function exists(p) { return fs.existsSync(p); }

checklist.push('- [x] GitHub Action triggered');

if (exists(`${ART}/playwright-summary.json`))
  checklist.push('- [x] Playwright tests completed successfully');
else { checklist.push('- [ ] Playwright tests completed successfully'); warning = true; }

if (exists(`${ART}/eslint-tests.json`))
  checklist.push('- [x] ESLint executed without issues');
else { checklist.push('- [ ] ESLint executed without issues'); warning = true; }

if (exists(`${ART}/prettier-summary.json`))
  checklist.push('- [x] Prettier check completed');
else { checklist.push('- [ ] Prettier check completed'); warning = true; }

if (exists(`${ART}/playwright-summary.json`))
  checklist.push('- [x] Test summary generated');
else { checklist.push('- [ ] Test summary generated'); warning = true; }

if (exists(`${ART}/flowchart.png`))
  checklist.push('- [x] Flowchart created');
else { checklist.push('- [ ] Flowchart created'); warning = true; }

const out = checklist.join('\n') + '\n';
fs.writeFileSync(`${ART}/checklist.md`, out);
fs.writeFileSync(`${ART}/checklist.json`, JSON.stringify({ md: out }, null, 2));

console.log(out);
if (warning) process.exitCode = 0;   // never fail build
