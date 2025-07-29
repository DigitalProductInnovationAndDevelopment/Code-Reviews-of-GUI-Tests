#!/usr/bin/env node
/**
 * generate-flowchart.js - Enhanced with test categorization
 * Creates a visual flowchart showing:
 * - Test organization by category
 * - Pass/fail status with visual indicators
 * - Performance metrics per test
 * - Test distribution statistics
 */
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/* locate metrics JSON no matter where it is */
const locate = () => {
  if (fs.existsSync('playwright-metrics.json'))                return 'playwright-metrics.json';
  const inArt = path.join('artifacts', 'playwright-metrics.json');
  if (fs.existsSync(inArt)) return inArt;
  console.error('❌ playwright-metrics.json not found'); process.exit(1);
};
const METRICS = JSON.parse(fs.readFileSync(locate(), 'utf8'));

const ART = 'artifacts';
fs.mkdirSync(ART, { recursive: true });

/* helper fns */
const safe = s => (s.replace(/[^A-Za-z0-9_]/g,'_').replace(/^_+|_+$/g,'')||'id').replace(/^[^A-Za-z]/,'id_$&');
const esc  = s => s.replace(/\\/g,'\\\\').replace(/"/g,'\\"');

/* Categorize tests based on file path and name */
const categorizeTest = (filePath, testName) => {
  const lowerPath = filePath.toLowerCase();
  const lowerName = testName.toLowerCase();
  
  // Check for common test categories
  if (lowerPath.includes('smoke') || lowerName.includes('smoke')) return 'smoke';
  if (lowerPath.includes('e2e') || lowerName.includes('e2e')) return 'e2e';
  if (lowerPath.includes('unit') || lowerName.includes('unit')) return 'unit';
  if (lowerPath.includes('integration') || lowerName.includes('integration')) return 'integration';
  if (lowerPath.includes('api') || lowerName.includes('api')) return 'api';
  if (lowerPath.includes('performance') || lowerName.includes('performance')) return 'performance';
  
  // Default category based on file location
  if (lowerPath.includes('component')) return 'component';
  return 'general';
};

/* build mermaid source with enhanced visualization */
const m=[];
m.push(`%%{init:{ "theme":"base","themeVariables":{
  "primaryColor":"#1976D2","primaryTextColor":"#fff","primaryBorderColor":"#0D47A1",
  "lineColor":"#5E35B1","tertiaryColor":"#E8F5E9",
  "mainBkg":"#263238","darkMode":true} }}%%`);
m.push('flowchart TB');

// Enhanced style definitions
m.push('  classDef fileStyle  fill:#E3F2FD,stroke:#1976D2,stroke-width:2px,color:#0D47A1,font-weight:bold');
m.push('  classDef suiteStyle fill:#F3E5F5,stroke:#7B1FA2,stroke-width:1px,color:#4A148C,font-weight:bold');
m.push('  classDef passStyle  fill:#C8E6C9,stroke:#43A047,stroke-width:2px,color:#1B5E20');
m.push('  classDef failStyle  fill:#FFCDD2,stroke:#E53935,stroke-width:2px,color:#B71C1C,font-weight:bold');
m.push('  classDef skipStyle  fill:#FFF9C4,stroke:#FBC02D,stroke-width:2px,color:#F57F17');
m.push('  classDef rootStyle  fill:#1976D2,stroke:#0D47A1,stroke-width:4px,color:#FFF,font-weight:bold');
m.push('  classDef categoryStyle fill:#37474F,stroke:#263238,stroke-width:2px,color:#ECEFF1,font-weight:bold');
m.push('  classDef perfWarn   fill:#FF8A65,stroke:#D84315,stroke-width:2px,color:#FFF');
m.push('  classDef perfGood   fill:#81C784,stroke:#388E3C,stroke-width:2px,color:#FFF');

// Collect and categorize all tests
const tests=[];
const categories = {};
const fileTestCounts = {};

METRICS.suites.forEach(f=>{
  const fileTitle=f.title||path.basename(f.file);
  fileTestCounts[fileTitle] = { total: 0, passed: 0, failed: 0, skipped: 0 };
  
  f.suites.forEach(s=>{
    s.specs.forEach(sp=>{
      const test = {
        file:fileTitle,
        suite:s.title||'NO_SUITE',
        spec:sp.title||'NO_SPEC',
        status:sp.tests[0]?.results[0]?.status??'unknown',
        dur:sp.tests[0]?.results[0]?.duration??0,
        error:sp.tests[0]?.results[0]?.error?.message
      };
      test.category = categorizeTest(f.file, test.spec);
      
      tests.push(test);
      fileTestCounts[fileTitle].total++;
      
      // Count by status
      if (['expected','passed'].includes(test.status)) {
        fileTestCounts[fileTitle].passed++;
      } else if (test.status === 'failed') {
        fileTestCounts[fileTitle].failed++;
      } else if (test.status === 'skipped') {
        fileTestCounts[fileTitle].skipped++;
      }
      
      // Group by category
      if (!categories[test.category]) {
        categories[test.category] = [];
      }
      categories[test.category].push(test);
    });
  });
});

// Calculate summary statistics
const summary={
  total:tests.length,
  passed:tests.filter(t=>['expected','passed'].includes(t.status)).length,
  failed:tests.filter(t=>t.status==='failed').length,
  skipped:tests.filter(t=>t.status==='skipped').length,
  dur:METRICS.stats?.duration??0
};

// Performance analysis
const avgDuration = summary.total > 0 ? Math.round(summary.dur / summary.total) : 0;
const slowTests = tests.filter(t => t.dur > avgDuration * 2);

// Root node
m.push(`  ROOT["🧪 Playwright Test Suite<br/><small>${new Date().toLocaleDateString()}</small>"]:::rootStyle`);

// Summary banner
m.push(`  BANNER["📊 Total: ${summary.total} | ✅ ${summary.passed} | ❌ ${summary.failed} | ⏭️ ${summary.skipped}<br/>⏱️ ${(summary.dur/1000).toFixed(1)}s | Avg: ${avgDuration}ms/test"]`);
m.push('  ROOT --> BANNER');

// Category distribution subgraph
m.push('  subgraph CATEGORIES["📂 Test Categories"]');
m.push('    direction LR');
Object.entries(categories).forEach(([cat, catTests]) => {
  const catId = safe(`CAT_${cat}`);
  const catPassed = catTests.filter(t => ['expected','passed'].includes(t.status)).length;
  const catFailed = catTests.filter(t => t.status === 'failed').length;
  const catIcon = {
    'smoke': '🔥',
    'e2e': '🌐',
    'unit': '🧩',
    'integration': '🔗',
    'api': '📡',
    'performance': '⚡',
    'component': '🧱',
    'general': '📝'
  }[cat] || '📁';
  
  m.push(`    ${catId}["${catIcon} ${cat.toUpperCase()}<br/>${catTests.length} tests<br/>✅ ${catPassed} ❌ ${catFailed}"]:::categoryStyle`);
});
m.push('  end');
m.push('  BANNER --> CATEGORIES');

// Performance warnings if any
if (slowTests.length > 0) {
  m.push(`  PERF_WARN["⚠️ ${slowTests.length} Slow Test${slowTests.length > 1 ? 's' : ''}<br/><small>>2x avg duration</small>"]:::perfWarn`);
  m.push('  BANNER --> PERF_WARN');
}

// Legend
m.push('  subgraph LEGEND["📋 Legend"]');
m.push('    direction TB');
m.push('    L1["✅ Passed Test"]:::passStyle');
m.push('    L2["❌ Failed Test"]:::failStyle');
m.push('    L3["⏭️ Skipped Test"]:::skipStyle');
m.push('    L4["⚡ Performance Issue"]:::perfWarn');
m.push('  end');
m.push('  ROOT --> LEGEND');

// Main test flow
const files=[...new Set(tests.map(t=>t.file))];
files.forEach((file, fileIndex)=>{
  const fid=safe(file);
  const counts = fileTestCounts[file];
  const fileStatus = counts.failed > 0 ? '❌' : counts.skipped === counts.total ? '⏭️' : '✅';
  
  m.push(`  ${fid}["📁 ${esc(file)}<br/>${fileStatus} ${counts.passed}/${counts.total} passed"]:::fileStyle`);
  m.push(`  CATEGORIES --> ${fid}`);

  m.push(`  subgraph ${fid}_tests["${esc(file)} Tests"]`);
  m.push('    direction TB');
  
  // Group tests by suite within file
  const suites=[...new Set(tests.filter(t=>t.file===file).map(t=>t.suite))];
  suites.forEach((suite, suiteIndex)=>{
    const sid=safe(`${fid}_${suite}`);
    const suiteTests = tests.filter(t=>t.file===file && t.suite===suite);
    const suitePassed = suiteTests.filter(t=>['expected','passed'].includes(t.status)).length;
    const suiteFailed = suiteTests.filter(t=>t.status==='failed').length;
    
    m.push(`    ${sid}["📦 ${esc(suite)}<br/><small>${suitePassed}/${suiteTests.length} passed</small>"]:::suiteStyle`);
    
    // Individual tests
    suiteTests.forEach((t, testIndex)=>{
      const spid=safe(`${sid}_${t.spec}_${testIndex}`);
      const cls=t.status==='failed'?'failStyle':t.status==='skipped'?'skipStyle':'passStyle';
      const icon=t.status==='failed'?'❌':t.status==='skipped'?'⏭️':'✅';
      const perfIcon = t.dur > avgDuration * 2 ? ' 🐌' : t.dur < avgDuration / 2 ? ' 🚀' : '';
      
      let testLabel = `${icon} ${esc(t.spec)}${perfIcon}<br/><small>${t.dur}ms`;
      if (t.category !== 'general') {
        testLabel += ` | ${t.category}`;
      }
      testLabel += '</small>';
      
      // Add error message for failed tests
      if (t.status === 'failed' && t.error) {
        const shortError = t.error.split('\n')[0].substring(0, 50);
        testLabel += `<br/><small style="color:red">${esc(shortError)}...</small>`;
      }
      
      m.push(`    ${sid} --> ${spid}["${testLabel}"]:::${cls}`);
      
      // Link slow tests to performance warning
      if (t.dur > avgDuration * 2 && slowTests.length > 0) {
        m.push(`    ${spid} -.-> PERF_WARN`);
      }
    });
  });
  m.push('  end');
});

// Add test distribution pie chart data as comment
m.push(`
%% Test Distribution Data
%% Categories: ${Object.entries(categories).map(([k,v]) => `${k}:${v.length}`).join(', ')}
%% Status: Passed:${summary.passed}, Failed:${summary.failed}, Skipped:${summary.skipped}
%% Performance: Slow:${slowTests.length}, Normal:${tests.length - slowTests.length}
`);

/* write & render PNG with larger dimensions for better readability */
fs.writeFileSync(`${ART}/flowchart.mmd`, m.join('\n'));
fs.writeFileSync('puppeteer.json','{ "args":["--no-sandbox","--disable-setuid-sandbox"] }');

console.log('📊 Generating enhanced flowchart...');
execSync(
  'npx -y @mermaid-js/mermaid-cli@10.6.1 ' +
  '-p puppeteer.json -i artifacts/flowchart.mmd -o artifacts/flowchart.png ' +
  '-w 10000 -H 3000 -b white',
  { stdio:'inherit' }
);

// Also generate a test categorization summary
const categorySummary = {
  totalTests: tests.length,
  categories: Object.entries(categories).map(([name, tests]) => ({
    name,
    count: tests.length,
    passed: tests.filter(t => ['expected','passed'].includes(t.status)).length,
    failed: tests.filter(t => t.status === 'failed').length,
    skipped: tests.filter(t => t.status === 'skipped').length,
    avgDuration: tests.reduce((sum, t) => sum + t.dur, 0) / tests.length
  })),
  slowTests: slowTests.map(t => ({
    name: `${t.file} > ${t.suite} > ${t.spec}`,
    duration: t.dur,
    category: t.category
  })),
  failedTests: tests.filter(t => t.status === 'failed').map(t => ({
    name: `${t.file} > ${t.suite} > ${t.spec}`,
    category: t.category,
    error: t.error
  }))
};

fs.writeFileSync(`${ART}/test-categorization.json`, JSON.stringify(categorySummary, null, 2));

console.log('✅ Enhanced flow-chart with categorization → artifacts/flowchart.png');
console.log('📊 Test categorization summary → artifacts/test-categorization.json');