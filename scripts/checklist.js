#!/usr/bin/env node
/**
 * Generates a Markdown checklist and stores:
 *   • artifacts/checklist.md  (human-readable)
 *   • artifacts/checklist.json { md: … }  (for summary-comment.js)
 *
 * A box is checked when the corresponding tool RAN,
 * regardless of whether it found issues.
 */

const fs   = require('fs');
const path = require('path');

const ART  = 'artifacts';
fs.mkdirSync(ART, { recursive: true });

const have = p => fs.existsSync(path.join(ART, p));

/* artefact booleans ------------------------------------------- */
const hasPlay   = have('playwright-summary.json');
const hasLint   = have('lint-summary.json');          // contains both ESLint & Prettier
const hasFlow   = have('flowchart.png');
const hasBadge  = have('test-summary.txt');

/* checklist ---------------------------------------------------- */
const lines = [];
lines.push('- [x] GitHub Action triggered');
lines.push(`- [${hasPlay ? 'x' : ' '}] Playwright tests completed`);
lines.push(`- [${hasLint ? 'x' : ' '}] ESLint executed`);
lines.push(`- [${hasLint ? 'x' : ' '}] Prettier check completed`);
lines.push(`- [${hasBadge ? 'x' : ' '}] Test summary generated`);
lines.push(`- [${hasFlow  ? 'x' : ' '}] Flowchart created`);

const md = lines.join('\n') + '\n';

/* write artefacts --------------------------------------------- */
fs.writeFileSync(path.join(ART, 'checklist.md'),   md);
fs.writeFileSync(path.join(ART, 'checklist.json'), JSON.stringify({ md }, null, 2));

console.log(md);
