#!/usr/bin/env node
/**
 * Modular flowchart generator that handles missing artifacts gracefully
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'artifacts';
const METRICS_FILE = path.join(ARTIFACTS_DIR, 'playwright-metrics.json');
const TEST_DETAILS_FILE = path.join(ARTIFACTS_DIR, 'test-details.json');

// Ensure artifacts directory exists
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

// Helper functions
const safe = s => (s.replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'id')
  .replace(/^[^A-Za-z]/, 'id_$&');
const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * Generate flowchart from available data
 */
function generateFlowchart() {
  console.log('📊 Generating test execution flowchart...');
  
  // Check what data is available
  let metrics = null;
  let testDetails = null;
  let summary = null;
  
  // Try to load playwright metrics
  if (fs.existsSync(METRICS_FILE)) {
    try {
      metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf8'));
      console.log('✅ Loaded playwright-metrics.json');
    } catch (e) {
      console.log('⚠️  Failed to parse playwright-metrics.json:', e.message);
    }
  }
  
  // Try to load test details
  if (fs.existsSync(TEST_DETAILS_FILE)) {
    try {
      testDetails = JSON.parse(fs.readFileSync(TEST_DETAILS_FILE, 'utf8'));
      console.log('✅ Loaded test-details.json');
    } catch (e) {
      console.log('⚠️  Failed to parse test-details.json:', e.message);
    }
  }
  
  // Try to load summary
  const summaryFile = path.join(ARTIFACTS_DIR, 'playwright-summary.json');
  if (fs.existsSync(summaryFile)) {
    try {
      summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
      console.log('✅ Loaded playwright-summary.json');
    } catch (e) {
      console.log('⚠️  Failed to parse playwright-summary.json:', e.message);
    }
  }
  
  // Build flowchart
  const m = [];
  
  // Add header
  m.push(`%%{init:{ "theme":"base","themeVariables":{
    "primaryColor":"#1976D2","primaryTextColor":"#fff","primaryBorderColor":"#0D47A1",
    "lineColor":"#5E35B1","tertiaryColor":"#E8F5E9"} }}%%`);
  m.push('flowchart LR');
  
  // Add styles
  m.push('  classDef fileStyle  fill:#E3F2FD,stroke:#1976D2,stroke-width:2px,color:#0D47A1,font-weight:bold');
  m.push('  classDef suiteStyle fill:#F3E5F5,stroke:#7B1FA2,stroke-width:1px,color:#4A148C,font-weight:bold');
  m.push('  classDef passStyle  fill:#C8E6C9,stroke:#43A047,stroke-width:2px,color:#1B5E20');
  m.push('  classDef failStyle  fill:#FFCDD2,stroke:#E53935,stroke-width:2px,color:#B71C1C,font-weight:bold');
  m.push('  classDef skipStyle  fill:#FFF9C4,stroke:#FBC02D,stroke-width:2px,color:#F57F17');
  m.push('  classDef rootStyle  fill:#1976D2,stroke:#0D47A1,stroke-width:4px,color:#FFF,font-weight:bold');
  
  // Add legend
  m.push('  LEGEND_ANCHOR[" "]:::rootStyle');
  m.push('  subgraph legendBox["📋 Legend"]');
  m.push('    direction TB');
  m.push('    P["✅ Passed"]:::passStyle');
  m.push('    F["❌ Failed"]:::failStyle');
  m.push('    S["⏭️ Skipped"]:::skipStyle');
  m.push('  end');
  m.push('  LEGEND_ANCHOR -.-> legendBox');
  
  // Add root
  m.push('  ROOT["🧪 Test Execution Flow"]:::rootStyle');
  
  // Prepare test data
  const tests = [];
  
  if (testDetails && Array.isArray(testDetails)) {
    // Use test details if available
    testDetails.forEach(test => {
      tests.push({
        file: test.file || 'Unknown',
        suite: test.suite || 'Default',
        spec: test.test || test.spec || 'Unknown',
        status: test.status || 'unknown',
        dur: test.duration || 0
      });
    });
  } else if (metrics && metrics.suites) {
    // Fall back to metrics
    metrics.suites.forEach(f => {
      const fileTitle = f.title || path.basename(f.file || 'unknown');
      f.suites?.forEach(s => {
        s.specs?.forEach(sp => {
          tests.push({
            file: fileTitle,
            suite: s.title || 'Default',
            spec: sp.title || 'Unknown',
            status: sp.tests?.[0]?.results?.[0]?.status || 'unknown',
            dur: sp.tests?.[0]?.results?.[0]?.duration || 0
          });
        });
      });
    });
  } else if (summary) {
    // Generate simple diagram from summary
    m.push(`  SUMMARY["📊 ${summary.total || 0} tests • ✅ ${summary.passed || 0} • ❌ ${summary.failed || 0} • ⏭️ ${summary.skipped || 0}"]`);
    m.push('  ROOT --> SUMMARY');
    
    if (summary.passed > 0) {
      m.push(`  SUMMARY --> PASS["✅ ${summary.passed} Passed Tests"]:::passStyle`);
    }
    if (summary.failed > 0) {
      m.push(`  SUMMARY --> FAIL["❌ ${summary.failed} Failed Tests"]:::failStyle`);
    }
    if (summary.skipped > 0) {
      m.push(`  SUMMARY --> SKIP["⏭️ ${summary.skipped} Skipped Tests"]:::skipStyle`);
    }
  } else {
    // No data available
    m.push('  NO_DATA["No test data available"]');
    m.push('  ROOT --> NO_DATA');
  }
  
  // Build detailed flowchart if we have test data
  if (tests.length > 0) {
    // Calculate summary
    const testSummary = {
      total: tests.length,
      passed: tests.filter(t => ['expected', 'passed'].includes(t.status)).length,
      failed: tests.filter(t => t.status === 'failed').length,
      skipped: tests.filter(t => t.status === 'skipped').length,
      dur: tests.reduce((sum, t) => sum + (t.dur || 0), 0)
    };
    
    // Add banner
    m.push(`  BANNER["📊 ${testSummary.total} • ✅ ${testSummary.passed} • ❌ ${testSummary.failed} • ⏭️ ${testSummary.skipped} • ⏱️ ${(testSummary.dur / 1000).toFixed(1)}s"]`);
    m.push('  ROOT --> BANNER');
    
    // Group by file
    const files = [...new Set(tests.map(t => t.file))];
    let prev = 'BANNER';
    
    files.forEach(file => {
      const fid = safe(file);
      m.push(`  ${fid}["📁 ${esc(file)}"]:::fileStyle`);
      m.push(`  ${prev} --> ${fid}`);
      prev = fid;
      
      // Add subgraph for suites
      m.push(`  subgraph ${fid}_grp[ ]`);
      m.push('    direction TB');
      
      const suites = [...new Set(tests.filter(t => t.file === file).map(t => t.suite))];
      suites.forEach(suite => {
        const sid = safe(`${fid}_${suite}`);
        m.push(`    ${sid}["📦 ${esc(suite)}"]:::suiteStyle`);
        m.push(`    ${fid} --> ${sid}`);
        
        // Add tests
        tests.filter(t => t.file === file && t.suite === suite).forEach(t => {
          const spid = safe(`${sid}_${t.spec}`);
          const cls = t.status === 'failed' ? 'failStyle'
                    : t.status === 'skipped' ? 'skipStyle'
                    : 'passStyle';
          const icon = t.status === 'failed' ? '❌'
                     : t.status === 'skipped' ? '⏭️'
                     : '✅';
          m.push(`    ${sid} --> ${spid}["${icon} ${esc(t.spec)}<br/><small>${t.dur}ms</small>"]:::${cls}`);
        });
      });
      
      m.push('  end');
    });
  }
  
  return m.join('\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 Starting flowchart generation...');
    console.log(`📁 Artifacts directory: ${ARTIFACTS_DIR}`);
    
    // Generate mermaid diagram
    const mermaidContent = generateFlowchart();
    const mmdFile = path.join(ARTIFACTS_DIR, 'flowchart.mmd');
    fs.writeFileSync(mmdFile, mermaidContent);
    console.log('✅ Mermaid diagram created');
    
    // Check if mermaid-cli is available
    try {
      execSync('npx -y @mermaid-js/mermaid-cli@10.6.1 --version', { stdio: 'ignore' });
    } catch (e) {
      console.log('📦 Installing mermaid-cli...');
    }
    
    // Create puppeteer config for mermaid
    const puppeteerConfig = {
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    fs.writeFileSync('puppeteer.json', JSON.stringify(puppeteerConfig));
    
    // Convert to PNG
    console.log('🎨 Converting to PNG...');
    try {
      execSync(
        `npx -y @mermaid-js/mermaid-cli@10.6.1 ` +
        `-p puppeteer.json -i "${mmdFile}" -o "${path.join(ARTIFACTS_DIR, 'flowchart.png')}" ` +
        `-w 8000 -H 2600 -b white`,
        { stdio: 'inherit' }
      );
      console.log('✅ Flowchart PNG generated successfully');
    } catch (e) {
      console.error('❌ Failed to generate PNG:', e.message);
      console.log('📝 Mermaid diagram saved as .mmd file for manual conversion');
    }
    
    // Clean up
    try {
      fs.unlinkSync('puppeteer.json');
    } catch (e) {
      // Ignore cleanup errors
    }
    
  } catch (error) {
    console.error('❌ Error generating flowchart:', error.message);
    
    // Create a simple error diagram
    const errorDiagram = `graph LR
      ERROR[Flowchart Generation Failed]
      ERROR --> MSG[${error.message}]
    `;
    fs.writeFileSync(
      path.join(ARTIFACTS_DIR, 'flowchart.mmd'),
      errorDiagram
    );
    
    process.exit(0); // Don't fail the workflow
  }
}

// Run the script
main();