#!/usr/bin/env node
/**
 * Builds artifacts/checklist.md + checklist.json.
 * A box is checked when the corresponding artefact exists
 * (regardless of whether the tool reported issues).
 */

const fs = require('fs');
const path = require('path');

const ART = 'artifacts';
fs.mkdirSync(ART, { recursive: true });

const exists = f => fs.existsSync(path.join(ART, f));

const hasPlay  = exists('playwright-summary.json');
const hasLint  = exists('lint-summary.json');
const hasFlow  = exists('flowchart.png');
const hasBadge = exists('test-summary.txt');        // created by badge step

const lines = [
  '- [x] GitHub Action triggered',
  `- [${hasPlay ? 'x' : ' '}] Playwright tests completed`,
  `- [${hasLint ? 'x' : ' '}] ESLint executed`,
  `- [${hasLint ? 'x' : ' '}] Prettier check completed`,
  `- [${hasBadge || hasPlay ? 'x' : ' '}] Test summary generated`,
  `- [${hasFlow ? 'x' : ' '}] Flowchart created`
];

const md = lines.join('\n') + '\n';
fs.writeFileSync(path.join(ART, 'checklist.md'), md);
fs.writeFileSync(path.join(ART, 'checklist.json'), JSON.stringify({ md }, null, 2));

console.log(md);
