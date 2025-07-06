#!/usr/bin/env node
/**
 * Builds a vertical Mermaid flow-chart from Playwright metrics.
 * Outputs: artifacts/flowchart.mmd  +  artifacts/flowchart.png
 */
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const metrics = JSON.parse(fs.readFileSync('playwright-metrics.json', 'utf8'));
const ART = 'artifacts';
fs.mkdirSync(ART, { recursive: true });

/* helpers */
const safeId = s =>
  (s.replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'id')
    .replace(/^[^A-Za-z]/, 'id_$&');
const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/* ─── header & styles ─────────────────────────────────────────── */
const mmd = [];
mmd.push(`%%{init: { "theme":"base","themeVariables":{
  "primaryColor":"#1976D2","primaryTextColor":"#fff","primaryBorderColor":"#0D47A1",
  "lineColor":"#5E35B1","tertiaryColor":"#E8F5E9"} }}%%`);
mmd.push('flowchart TD');                                   // keep top-down
mmd.push('  classDef fileStyle  fill:#E3F2FD,stroke:#1976D2,stroke-width:2px,color:#0D47A1,font-weight:bold');
mmd.push('  classDef suiteStyle fill:#F3E5F5,stroke:#7B1FA2,stroke-width:1px,color:#4A148C,font-weight:bold');
mmd.push('  classDef passStyle  fill:#C8E6C9,stroke:#43A047,stroke-width:2px,color:#1B5E20');
mmd.push('  classDef failStyle  fill:#FFCDD2,stroke:#E53935,stroke-width:2px,color:#B71C1C,font-weight:bold');
mmd.push('  classDef skipStyle  fill:#FFF9C4,stroke:#FBC02D,stroke-width:2px,color:#F57F17');
mmd.push('  classDef rootStyle  fill:#1976D2,stroke:#0D47A1,stroke-width:4px,color:#FFF,font-weight:bold');
mmd.push('  ROOT["🧪 Playwright Test Run"]:::rootStyle');

/* ─── flatten Playwright JSON ─────────────────────────────────── */
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

/* ─── vertical banner ────────────────────────────────────────── */
const s = {
  total   : allTests.length,
  passed  : allTests.filter(t => ['expected','passed'].includes(t.status)).length,
  failed  : allTests.filter(t => t.status === 'failed').length,
  skipped : allTests.filter(t => t.status === 'skipped').length,
  duration: metrics.stats?.duration ?? 0
};
mmd.push(`  BANNER["📊 ${s.total} • ✅ ${s.passed} • ❌ ${s.failed} • ⏭️ ${s.skipped} • ⏱️ ${s.duration}s"]`);
mmd.push('  ROOT --> BANNER');

/* ─── build nodes ────────────────────────────────────────────── */
const seenFiles = new Set(), seenSuites = new Set();
let prevFileId = null;                        // ★ NEW: remember last file node

allTests.forEach(t => {
  const fileId  = safeId(t.fileTitle);
  const suiteId = safeId(`${fileId}_${t.suiteTitle}`);
  const specId  = safeId(`${suiteId}_${t.specTitle}`);

  /* file node */
  if (!seenFiles.has(fileId)) {
    mmd.push(`  ${fileId}["📁 ${esc(t.fileTitle)}"]:::fileStyle`);
    if (!prevFileId) {
      mmd.push(`  BANNER --> ${fileId}`);     // first file under banner
    } else {                                  // ★ NEW: chain vertically
      mmd.push(`  ${prevFileId} --> ${fileId}`);
    }
    prevFileId = fileId;                      // ★ NEW: update pointer
    seenFiles.add(fileId);
  }

  /* suite node */
  if (!seenSuites.has(suiteId)) {
    mmd.push(`  ${suiteId}["📦 ${esc(t.suiteTitle)}"]:::suiteStyle`);
    mmd.push(`  ${fileId} --> ${suiteId}`);
    seenSuites.add(suiteId);
  }

  /* spec node */
  const cls  = t.status === 'failed'  ? 'failStyle'
            : t.status === 'skipped' ? 'skipStyle'
            : 'passStyle';
  const icon = t.status === 'failed'  ? '❌'
            : t.status === 'skipped' ? '⏭️'
            : '✅';

  mmd.push(`  ${suiteId} --> ${specId}["${icon} ${esc(t.specTitle)}<br/><small>${t.duration}ms</small>"]:::${cls}`);
});

/* ─── legend ─────────────────────────────────────────────────── */
mmd.push('  LEGEND["📋 Legend"]');
mmd.push('  LEGEND --> P["✅ Passed"]:::passStyle');
mmd.push('  LEGEND --> F["❌ Failed"]:::failStyle');
mmd.push('  LEGEND --> S["⏭️ Skipped"]:::skipStyle');
mmd.push('  ROOT -.-> LEGEND');

/* ─── write .mmd & PNG ───────────────────────────────────────── */
fs.writeFileSync(`${ART}/flowchart.mmd`, mmd.join('\n'));
fs.writeFileSync('puppeteer.json', '{ "args": ["--no-sandbox","--disable-setuid-sandbox"] }');

execSync(
  'npx -y @mermaid-js/mermaid-cli@10.6.1 -p puppeteer.json ' +
  '-i artifacts/flowchart.mmd -o artifacts/flowchart.png -w 2600 -H 5000 -b white',
  // ↑ height now bigger than width (tall orientation)
  { stdio: 'inherit' }
);

console.log('✅ Vertical flow-chart generated → artifacts/flowchart.png');
