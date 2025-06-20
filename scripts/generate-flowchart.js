#!/usr/bin/env node
/**
 * Re-implements the long bash snippet that built the Mermaid
 * flow-chart.  The PNG & .mmd go to /artifacts.
 */
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const metrics = JSON.parse(fs.readFileSync('playwright-metrics.json', 'utf8'));
const ART = 'artifacts';
fs.mkdirSync(ART, { recursive: true });

const safeId = s =>
  (s.replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'id').replace(/^[^A-Za-z]/, 'id_$&');
const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const mmd = [];
mmd.push(`%%{init: { "theme":"base","themeVariables":{
  "primaryColor":"#1976D2","primaryTextColor":"#fff","primaryBorderColor":"#0D47A1",
  "lineColor":"#5E35B1","tertiaryColor":"#E8F5E9"} }}%%`);
mmd.push('flowchart TD');
mmd.push('  classDef fileStyle  fill:#E3F2FD,stroke:#1976D2,stroke-width:2px,color:#0D47A1,font-weight:bold');
mmd.push('  classDef suiteStyle fill:#F3E5F5,stroke:#7B1FA2,stroke-width:1px,color:#4A148C,font-weight:bold');
mmd.push('  classDef passStyle  fill:#C8E6C9,stroke:#43A047,stroke-width:2px,color:#1B5E20');
mmd.push('  classDef failStyle  fill:#FFCDD2,stroke:#E53935,stroke-width:2px,color:#B71C1C,font-weight:bold');
mmd.push('  classDef skipStyle  fill:#FFF9C4,stroke:#FBC02D,stroke-width:2px,color:#F57F17');
mmd.push('  classDef rootStyle  fill:#1976D2,stroke:#0D47A1,stroke-width:4px,color:#FFF,font-weight:bold');
mmd.push('  ROOT["🧪 Playwright Test Run"]:::rootStyle');

const allTests = [];
metrics.suites.forEach(fileSuite => {
  const fileTitle = fileSuite.title || path.basename(fileSuite.file);
  fileSuite.suites.forEach(suite => {
    suite.specs.forEach(spec => {
      allTests.push({
        fileTitle,
        suiteTitle: suite.title || 'NO_SUITE',
        specTitle : spec.title || 'NO_SPEC',
        status    : spec.tests[0]?.results[0]?.status ?? 'unknown',
        duration  : spec.tests[0]?.results[0]?.duration ?? 0
      });
    });
  });
});

const summary = {
  total   : allTests.length,
  passed  : allTests.filter(t => ['expected','passed'].includes(t.status)).length,
  failed  : allTests.filter(t => t.status === 'failed').length,
  skipped : allTests.filter(t => t.status === 'skipped').length,
  duration: metrics.stats?.duration ?? 0
};

mmd.push(
  `  BANNER["📊 ${summary.total} • ✅ ${summary.passed} • ❌ ${summary.failed} • ⏭️ ${summary.skipped} • ⏱️ ${summary.duration}s"]`
);
mmd.push('  ROOT --> BANNER');

const seenFiles = new Set(), seenSuites = new Set();
allTests.forEach(t => {
  const fileId  = safeId(t.fileTitle);
  const suiteId = safeId(`${fileId}_${t.suiteTitle}`);
  const specId  = safeId(`${suiteId}_${t.specTitle}`);

  if (!seenFiles.has(fileId)) {
    mmd.push(`  ${fileId}["📁 ${esc(t.fileTitle)}"]:::fileStyle`);
    mmd.push(`  ROOT --> ${fileId}`);
    seenFiles.add(fileId);
  }
  if (!seenSuites.has(suiteId)) {
    mmd.push(`  ${suiteId}["📦 ${esc(t.suiteTitle)}"]:::suiteStyle`);
    mmd.push(`  ${fileId} --> ${suiteId}`);
    seenSuites.add(suiteId);
  }

  const cls  = t.status === 'failed'  ? 'failStyle'
             : t.status === 'skipped' ? 'skipStyle'
             : 'passStyle';
  const icon = t.status === 'failed'  ? '❌'
             : t.status === 'skipped' ? '⏭️'
             : '✅';

  mmd.push(
    `  ${suiteId} --> ${specId}["${icon} ${esc(t.specTitle)}<br/><small>${t.duration}ms</small>"]:::${cls}`
  );
});

mmd.push('  LEGEND["📋 Legend"]');
mmd.push('  LEGEND --> P["✅ Passed"]:::passStyle');
mmd.push('  LEGEND --> F["❌ Failed"]:::failStyle');
mmd.push('  LEGEND --> S["⏭️ Skipped"]:::skipStyle');
mmd.push('  ROOT -.-> LEGEND');

fs.writeFileSync(`${ART}/flowchart.mmd`, mmd.join('\n'));
fs.writeFileSync('puppeteer.json', '{ "args": ["--no-sandbox","--disable-setuid-sandbox"] }');
execSync(
  'npx -y @mermaid-js/mermaid-cli@10.6.1 -p puppeteer.json -i artifacts/flowchart.mmd -o artifacts/flowchart.png -w 5600 -H 4000 -b white',
  { stdio: 'inherit' }
);
console.log('✅ Flow-chart generated → artifacts/flowchart.png');
