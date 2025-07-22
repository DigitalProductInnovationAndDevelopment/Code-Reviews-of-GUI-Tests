#!/usr/bin/env node
/**
 * generate-flowchart.js
 * Generates a left-to-right flowchart with test execution visualization
 */
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const METRICS = JSON.parse(fs.readFileSync('playwright-metrics.json', 'utf8'));
const ART = 'artifacts';
fs.mkdirSync(ART, { recursive: true });

/* helpers */
const safe = s =>
  (s.replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '')||'id')
    .replace(/^[^A-Za-z]/,'id_$&');
const esc = s => s.replace(/\\/g,'\\\\').replace(/"/g,'\\"');

/* heading */
const m = [];
m.push(`%%{init:{ "theme":"base","themeVariables":{
  "primaryColor":"#1976D2","primaryTextColor":"#fff","primaryBorderColor":"#0D47A1",
  "lineColor":"#5E35B1","tertiaryColor":"#E8F5E9"} }}%%`);
m.push('flowchart LR');

/* style classes */
m.push('  classDef fileStyle  fill:#E3F2FD,stroke:#1976D2,stroke-width:2px,color:#0D47A1,font-weight:bold');
m.push('  classDef suiteStyle fill:#F3E5F5,stroke:#7B1FA2,stroke-width:1px,color:#4A148C,font-weight:bold');
m.push('  classDef passStyle  fill:#C8E6C9,stroke:#43A047,stroke-width:2px,color:#1B5E20');
m.push('  classDef failStyle  fill:#FFCDD2,stroke:#E53935,stroke-width:2px,color:#B71C1C,font-weight:bold');
m.push('  classDef skipStyle  fill:#FFF9C4,stroke:#FBC02D,stroke-width:2px,color:#F57F17');
m.push('  classDef rootStyle  fill:#1976D2,stroke:#0D47A1,stroke-width:4px,color:#FFF,font-weight:bold');

/* legend */
m.push('  LEGEND_ANCHOR[" "]:::rootStyle');
m.push('  subgraph legendBox["📋 Legend"]');
m.push('    direction TB');
m.push('    P["✅ Passed"]:::passStyle');
m.push('    F["❌ Failed"]:::failStyle');
m.push('    S["⏭️ Skipped"]:::skipStyle');
m.push('  end');
m.push('  LEGEND_ANCHOR -.-> legendBox');

/* root & banner */
m.push('  ROOT["🧪 Playwright Test Run"]:::rootStyle');

const tests = [];
METRICS.suites.forEach(f=>{
  const fileTitle = f.title || path.basename(f.file);
  f.suites.forEach(s=>{
    s.specs.forEach(sp=>{
      tests.push({
        file:fileTitle, suite:s.title||'NO_SUITE', spec:sp.title||'NO_SPEC',
        status:sp.tests[0]?.results[0]?.status??'unknown',
        dur:sp.tests[0]?.results[0]?.duration??0
      });
    });
  });
});

const summary = {
  total: tests.length,
  passed: tests.filter(t=>['expected','passed'].includes(t.status)).length,
  failed: tests.filter(t=>t.status==='failed').length,
  skipped: tests.filter(t=>t.status==='skipped').length,
  dur: METRICS.stats?.duration ?? 0
};

m.push(`  BANNER["📊 ${summary.total} tests • ✅ ${summary.passed} • ❌ ${summary.failed} • ⏭️ ${summary.skipped} • ⏱️ ${(summary.dur/1000).toFixed(1)}s"]`);
m.push('  ROOT --> BANNER');

/* chain files horizontally */
const files=[...new Set(tests.map(t=>t.file))];
let prev='BANNER';
files.forEach(file=>{
  const fid=safe(file);
  m.push(`  ${fid}["📁 ${esc(file)}"]:::fileStyle`);
  m.push(`  ${prev} --> ${fid}`);
  prev=fid;

  m.push(`  subgraph ${fid}_grp[ ]`);
  m.push('    direction TB');
  const suites=[...new Set(tests.filter(t=>t.file===file).map(t=>t.suite))];
  suites.forEach(suite=>{
    const sid=safe(`${fid}_${suite}`);
    m.push(`    ${sid}["📦 ${esc(suite)}"]:::suiteStyle`);
    m.push(`    ${fid} --> ${sid}`);

    tests.filter(t=>t.file===file && t.suite===suite).forEach(t=>{
      const spid=safe(`${sid}_${t.spec}`);
      const cls = t.status==='failed' ? 'failStyle'
                : t.status==='skipped'? 'skipStyle'
                : 'passStyle';
      const icon= t.status==='failed' ? '❌'
                : t.status==='skipped'? '⏭️'
                : '✅';
      m.push(`    ${sid} --> ${spid}["${icon} ${esc(t.spec)}<br/><small>${t.dur}ms</small>"]:::${cls}`);
    });
  });
  m.push('  end');
});

/* write & render */
fs.writeFileSync(`${ART}/flowchart.mmd`, m.join('\n'));
fs.writeFileSync('puppeteer.json','{ "args":["--no-sandbox","--disable-setuid-sandbox"] }');

execSync(
  'npx -y @mermaid-js/mermaid-cli@10.6.1 ' +
  '-p puppeteer.json -i artifacts/flowchart.mmd -o artifacts/flowchart.png ' +
  '-w 8000 -H 2600 -b white',
  { stdio:'inherit' }
);

console.log('✅ Flow-chart → artifacts/flowchart.png');