#!/usr/bin/env node
/**
 * Modular dashboard generator that creates a web report from available artifacts
 */
const fs = require('fs');
const path = require('path');
const marked = require('marked');

// Configuration
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'artifacts';
const WEB_REPORT_DIR = path.join(ARTIFACTS_DIR, 'web-report');
const MODE = process.env.MODE || 'full';

// Ensure directories exist
fs.mkdirSync(WEB_REPORT_DIR, { recursive: true });

// Helper functions
const readJSON = (filename, defaultValue = {}) => {
  try {
    const filepath = path.join(ARTIFACTS_DIR, filename);
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }
  } catch (e) {
    console.log(`⚠️  Could not read ${filename}: ${e.message}`);
  }
  return defaultValue;
};

const fileExists = (filename) => {
  return fs.existsSync(path.join(ARTIFACTS_DIR, filename));
};

const copyFile = (src, dest) => {
  try {
    const srcPath = path.join(ARTIFACTS_DIR, src);
    const destPath = path.join(WEB_REPORT_DIR, dest);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      return true;
    }
  } catch (e) {
    console.log(`⚠️  Could not copy ${src}: ${e.message}`);
  }
  return false;
};

const copyDirectory = (src, dest) => {
  try {
    const srcPath = path.join(ARTIFACTS_DIR, src);
    const destPath = path.join(WEB_REPORT_DIR, dest);
    if (fs.existsSync(srcPath) && fs.statSync(srcPath).isDirectory()) {
      fs.cpSync(srcPath, destPath, { recursive: true });
      return true;
    }
  } catch (e) {
    console.log(`⚠️  Could not copy directory ${src}: ${e.message}`);
  }
  return false;
};

// UI Components
const pill = (text, color) => `<span class="pill" style="background:${color}">${text}</span>`;
const card = (title, content, icon = '') => `
  <div class="card">
    <h2>${icon} ${title}</h2>
    ${content}
  </div>
`;

/**
 * Generate test results card
 */
function generateTestResultsCard() {
  const playwrightSummary = readJSON('playwright-summary.json');
  const prSummary = readJSON('playwright-summary-pr.json');
  const mainSummary = readJSON('playwright-summary-main.json');
  
  const hasComparison = fileExists('playwright-summary-pr.json') && fileExists('playwright-summary-main.json');
  const summary = prSummary.total > 0 ? prSummary : playwrightSummary;
  
  if (summary.total === 0 && !hasComparison) {
    return '';
  }
  
  let content = '';
  
  if (hasComparison) {
    // Comparison table
    content = `
      <table>
        <thead>
          <tr>
            <th>Branch</th>
            <th>Total</th>
            <th>Passed</th>
            <th>Failed</th>
            <th>Skipped</th>
            <th>Pass Rate</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>PR</strong></td>
            <td>${prSummary.total || 0}</td>
            <td>${prSummary.passed || 0}</td>
            <td>${prSummary.failed || 0}</td>
            <td>${prSummary.skipped || 0}</td>
            <td>${prSummary.pass_rate || 0}%</td>
            <td>${((prSummary.duration || 0) / 1000).toFixed(2)}s</td>
          </tr>
          <tr>
            <td><strong>Main</strong></td>
            <td>${mainSummary.total || 0}</td>
            <td>${mainSummary.passed || 0}</td>
            <td>${mainSummary.failed || 0}</td>
            <td>${mainSummary.skipped || 0}</td>
            <td>${mainSummary.pass_rate || 0}%</td>
            <td>${((mainSummary.duration || 0) / 1000).toFixed(2)}s</td>
          </tr>
        </tbody>
      </table>
    `;
    
    // Add regression warning
    if (prSummary.failed > mainSummary.failed || prSummary.pass_rate < mainSummary.pass_rate) {
      content += `
        <div class="warning-box">
          <strong>⚠️ Regression Detected:</strong> PR has more failures than main branch
        </div>
      `;
    }
  } else {
    // Single summary
    content = `
      <div class="stats-grid">
        <div class="stat">
          <div class="stat-value">${summary.total || 0}</div>
          <div class="stat-label">Total Tests</div>
        </div>
        <div class="stat">
          <div class="stat-value">${summary.passed || 0}</div>
          <div class="stat-label">Passed</div>
        </div>
        <div class="stat">
          <div class="stat-value">${summary.failed || 0}</div>
          <div class="stat-label">Failed</div>
        </div>
        <div class="stat">
          <div class="stat-value">${summary.pass_rate || 0}%</div>
          <div class="stat-label">Pass Rate</div>
        </div>
      </div>
    `;
  }
  
  // Add links to reports
  const links = [];
  if (fileExists('pr-report/index.html') || fileExists('playwright-report/index.html')) {
    links.push('<a href="pr-report/index.html" class="button">View PR Report ↗</a>');
  }
  if (fileExists('main-report/index.html')) {
    links.push('<a href="main-report/index.html" class="button">View Main Report ↗</a>');
  }
  
  if (links.length > 0) {
    content += `<div class="button-group">${links.join(' ')}</div>`;
  }
  
  return card('Test Results', content, '🧪');
}

/**
 * Generate code quality card
 */
function generateCodeQualityCard() {
  const lintSummary = readJSON('lint-summary.json');
  const eslintSummary = readJSON('eslint-summary.json');
  const prettierSummary = readJSON('prettier-summary.json');
  
  const eslint = lintSummary.eslint || eslintSummary;
  const prettier = lintSummary.prettier || prettierSummary;
  
  if (!eslint.files && !prettier.filesWithIssues) {
    return '';
  }
  
  let content = '<div class="quality-grid">';
  
  // ESLint section
  if (eslint.files !== undefined || eslint.errors !== undefined) {
    content += '<div class="quality-section">';
    content += '<h3>ESLint</h3>';
    
    if (eslint.errors === 0 && eslint.warnings === 0) {
      content += pill('Clean', '#388e3c');
    } else {
      if (eslint.errors > 0) content += pill(`${eslint.errors} errors`, '#d32f2f');
      if (eslint.warnings > 0) content += pill(`${eslint.warnings} warnings`, '#f57f17');
      if (eslint.fixableErrors > 0 || eslint.fixableWarnings > 0) {
        content += pill(`${eslint.fixableErrors + eslint.fixableWarnings} auto-fixable`, '#1976d2');
      }
    }
    
    if (eslint.first) {
      content += `<div class="code-snippet">First issue: <code>${eslint.first}</code></div>`;
    }
    content += '</div>';
  }
  
  // Prettier section
  if (prettier.filesWithIssues !== undefined) {
    content += '<div class="quality-section">';
    content += '<h3>Prettier</h3>';
    
    if (prettier.filesWithIssues === 0) {
      content += pill('No issues', '#388e3c');
    } else {
      content += pill(`${prettier.filesWithIssues} files`, '#d32f2f');
      content += pill(`${prettier.totalChanges || 0} changes needed`, '#f57f17');
      
      if (prettier.files && prettier.files.length > 0) {
        content += '<div class="file-list">';
        content += '<strong>Files needing formatting:</strong><ul>';
        prettier.files.slice(0, 5).forEach(file => {
          content += `<li><code>${path.basename(file)}</code></li>`;
        });
        if (prettier.files.length > 5) {
          content += `<li><em>...and ${prettier.files.length - 5} more</em></li>`;
        }
        content += '</ul></div>';
      }
    }
    content += '</div>';
  }
  
  content += '</div>';
  
  return card('Code Quality', content, '📋');
}

/**
 * Generate flowchart card
 */
function generateFlowchartCard() {
  if (!fileExists('flowchart.png') && !fileExists('flowchart.mmd')) {
    return '';
  }
  
  let content = '';
  
  if (copyFile('flowchart.png', 'flowchart.png')) {
    content = '<a href="flowchart.png"><img src="flowchart.png" alt="Test Execution Flow" style="max-width:100%"></a>';
  } else if (fileExists('flowchart.mmd')) {
    const mmdContent = fs.readFileSync(path.join(ARTIFACTS_DIR, 'flowchart.mmd'), 'utf8');
    content = `
      <div class="mermaid-container">
        <p>Mermaid diagram available - view source for diagram code</p>
        <details>
          <summary>Show diagram code</summary>
          <pre><code>${mmdContent}</code></pre>
        </details>
      </div>
    `;
  }
  
  return card('Test Execution Flow', content, '📊');
}

/**
 * Generate checklist card
 */
function generateChecklistCard() {
  try {
    const checklistPath = path.join(ARTIFACTS_DIR, 'checklist.md');
    if (fs.existsSync(checklistPath)) {
      const checklistMd = fs.readFileSync(checklistPath, 'utf8');
      const checklistHtml = marked.parse(checklistMd);
      return card('Review Checklist', checklistHtml, '✅');
    }
  } catch (e) {
    console.log('⚠️  Could not read checklist');
  }
  return '';
}

/**
 * Generate the complete HTML dashboard
 */
function generateDashboard() {
  console.log('🎨 Generating dashboard HTML...');
  
  // Copy assets
  console.log('📁 Copying report assets...');
  copyDirectory('pr-report', 'pr-report');
  copyDirectory('main-report', 'main-report');
  copyDirectory('playwright-report', 'pr-report'); // Fallback if no pr-report
  
  // Generate cards
  const cards = [
    generateTestResultsCard(),
    generateCodeQualityCard(),
    generateFlowchartCard(),
    generateChecklistCard()
  ].filter(Boolean); // Remove empty cards
  
  // Build HTML
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GUI Test Review Dashboard</title>
  <style>
    :root {
      --primary: #1976D2;
      --primary-light: #E3F2FD;
      --success: #388e3c;
      --warning: #f57f17;
      --error: #d32f2f;
      --bg: #fafafa;
      --card-bg: #fff;
      --text: #212121;
      --text-secondary: #666;
      --border: #e0e0e0;
    }
    
    * { box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      line-height: 1.6;
      color: var(--text);
      background: var(--bg);
      margin: 0;
      padding: 20px;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    h1 {
      color: var(--primary);
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }
    
    .subtitle {
      color: var(--text-secondary);
      margin-bottom: 2rem;
    }
    
    .card {
      background: var(--card-bg);
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    
    .card h2 {
      margin-top: 0;
      color: var(--primary);
      font-size: 1.5rem;
    }
    
    .pill {
      display: inline-block;
      padding: 0.25em 0.75em;
      border-radius: 999px;
      font-size: 0.875rem;
      color: white;
      margin-right: 0.5rem;
      margin-bottom: 0.5rem;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }
    
    th, td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    
    th {
      background: var(--primary-light);
      font-weight: 600;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin: 1rem 0;
    }
    
    .stat {
      text-align: center;
      padding: 1rem;
      background: var(--primary-light);
      border-radius: 8px;
    }
    
    .stat-value {
      font-size: 2rem;
      font-weight: bold;
      color: var(--primary);
    }
    
    .stat-label {
      color: var(--text-secondary);
      font-size: 0.875rem;
    }
    
    .quality-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
    }
    
    .quality-section {
      padding: 1rem;
      background: var(--bg);
      border-radius: 8px;
    }
    
    .quality-section h3 {
      margin-top: 0;
      margin-bottom: 0.75rem;
    }
    
    .button {
      display: inline-block;
      padding: 0.5rem 1rem;
      background: var(--primary);
      color: white;
      text-decoration: none;
      border-radius: 6px;
      transition: opacity 0.2s;
    }
    
    .button:hover {
      opacity: 0.9;
    }
    
    .button-group {
      margin-top: 1rem;
      display: flex;
      gap: 0.5rem;
    }
    
    .warning-box {
      background: #fff3cd;
      border: 1px solid #ffeaa7;
      border-radius: 8px;
      padding: 1rem;
      margin: 1rem 0;
      color: #856404;
    }
    
    .code-snippet {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: #f5f5f5;
      border-radius: 4px;
      font-family: monospace;
      font-size: 0.875rem;
    }
    
    .file-list {
      margin-top: 0.5rem;
    }
    
    .file-list ul {
      margin: 0.25rem 0 0 1.5rem;
    }
    
    code {
      background: #f5f5f5;
      padding: 0.125rem 0.25rem;
      border-radius: 3px;
      font-size: 0.875rem;
    }
    
    pre {
      background: #2d2d2d;
      color: #f8f8f2;
      padding: 1rem;
      border-radius: 8px;
      overflow-x: auto;
    }
    
    details {
      margin: 1rem 0;
    }
    
    summary {
      cursor: pointer;
      color: var(--primary);
    }
    
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
    }
    
    footer {
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid var(--border);
      text-align: center;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }
    
    @media (max-width: 768px) {
      body { padding: 10px; }
      h1 { font-size: 2rem; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
    }
    
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #121212;
        --card-bg: #1e1e1e;
        --text: #e0e0e0;
        --text-secondary: #999;
        --border: #333;
      }
      
      .stat, .quality-section {
        background: #2a2a2a;
      }
      
      code, .code-snippet {
        background: #2a2a2a;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 GUI Test Review Dashboard</h1>
    <p class="subtitle">Generated on ${new Date().toLocaleString()}</p>
    
    ${cards.length > 0 ? cards.join('\n') : '<div class="card"><p>No data available to display.</p></div>'}
    
    <footer>
      <p>Generated by GUI Test Review Dashboard Action</p>
      <p>Mode: ${MODE} | <a href="https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests">View on GitHub</a></p>
    </footer>
  </div>
</body>
</html>`;
  
  return html;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 Starting dashboard generation...');
    console.log(`📁 Artifacts directory: ${ARTIFACTS_DIR}`);
    console.log(`🔧 Mode: ${MODE}`);
    
    // Generate dashboard HTML
    const html = generateDashboard();
    
    // Save dashboard
    const indexPath = path.join(WEB_REPORT_DIR, 'index.html');
    fs.writeFileSync(indexPath, html);
    console.log(`✅ Dashboard generated: ${indexPath}`);
    
    // List generated files
    console.log('\n📁 Generated files:');
    const files = fs.readdirSync(WEB_REPORT_DIR);
    files.forEach(file => {
      const stat = fs.statSync(path.join(WEB_REPORT_DIR, file));
      if (stat.isDirectory()) {
        console.log(`  📁 ${file}/`);
      } else {
        console.log(`  📄 ${file} (${(stat.size / 1024).toFixed(1)}KB)`);
      }
    });
    
    console.log('\n✨ Dashboard generation completed successfully!');
    
  } catch (error) {
    console.error('❌ Error generating dashboard:', error.message);
    
    // Create error page
    const errorHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Dashboard Error</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; text-align: center; }
    .error { color: #d32f2f; }
  </style>
</head>
<body>
  <h1>Dashboard Generation Error</h1>
  <p class="error">${error.message}</p>
  <p>Please check the workflow logs for more details.</p>
</body>
</html>`;
    
    fs.writeFileSync(path.join(WEB_REPORT_DIR, 'index.html'), errorHtml);
    
    process.exit(0); // Don't fail the workflow
  }
}

// Run the script
main();