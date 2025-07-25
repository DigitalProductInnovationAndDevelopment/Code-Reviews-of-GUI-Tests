#!/usr/bin/env node
/**
 * generate-webpage.js - Enhanced with modern, fancy dashboard design
 *
 * Builds a beautiful static dashboard at artifacts/web-report/index.html
 *   · Playwright card with visual progress bars
 *   · Prettier card with interactive elements
 *   · ESLint card with severity indicators
 *   · Flow-chart image with zoom capability
 *   · Checklist card with animations
 *   · Dark mode support
 *   · Glassmorphism effects
 *   · Smooth animations and transitions
 */

const fs   = require('fs');
const path = require('path');

// Dynamic require for marked module
let marked;
try {
  marked = require('marked');
} catch (e1) {
  try {
    marked = require(path.join(process.cwd(), '.gui-test-review-action/node_modules/marked'));
  } catch (e2) {
    try {
      marked = require(path.join(__dirname, '../node_modules/marked'));
    } catch (e3) {
      console.error('Could not load marked module. Please ensure marked is installed.');
      console.error('You can install it with: npm install marked@15.0.12');
      process.exit(1);
    }
  }
}

/* ─── paths ───────────────────────────────────────────── */
const ART = 'artifacts';
const OUT = path.join(ART, 'web-report');
fs.mkdirSync(OUT, { recursive: true });

/* ─── helpers ─────────────────────────────────────────── */
const readJSON = (f,d={})=>{
  try{return JSON.parse(fs.readFileSync(path.join(ART,f),'utf8'));}catch{return d;}
};

/* ─── load artefacts ─────────────────────────────────── */
const lint   = readJSON('lint-summary.json');
const p      = lint.prettier || {};
const e      = lint.eslint || {};

const playPR   = readJSON('playwright-summary-pr.json');
const playMain = readJSON('playwright-summary-main.json');
const hasMainPlay = fs.existsSync(path.join(ART,'playwright-summary-main.json'));

let checklistMD = '';
try {
  checklistMD = fs.readFileSync(path.join(ART,'checklist.md'),'utf8');
} catch (e) {
  console.warn('Checklist not found, continuing without it');
}

/* ─── copy assets ────────────────────────────────────── */
for(const dir of ['pr-report','main-report']){
  const src=path.join(ART,dir);
  if(fs.existsSync(src)) {
    try {
      fs.cpSync(src,path.join(OUT,dir),{recursive:true});
    } catch (e) {
      console.warn(`Could not copy ${dir}:`, e.message);
    }
  }
}
if(fs.existsSync(path.join(ART,'flowchart.png'))) {
  try {
    fs.copyFileSync(path.join(ART,'flowchart.png'),path.join(OUT,'flowchart.png'));
  } catch (e) {
    console.warn('Could not copy flowchart:', e.message);
  }
}

/* ─── Enhanced UI Components ─────────────────────────── */
const progressBar = (value, max, color) => {
  const percentage = max > 0 ? (value / max * 100).toFixed(1) : 0;
  return `
    <div class="progress-container">
      <div class="progress-bar" style="--progress: ${percentage}%; --color: ${color};">
        <span class="progress-text">${value}/${max} (${percentage}%)</span>
      </div>
    </div>
  `;
};

const statCard = (icon, label, value, color) => `
  <div class="stat-card" style="--accent: ${color};">
    <div class="stat-icon">${icon}</div>
    <div class="stat-content">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
    </div>
  </div>
`;

const pill = (txt, type) => {
  const types = {
    success: { bg: '#10b981', icon: '✓' },
    error: { bg: '#ef4444', icon: '✕' },
    warning: { bg: '#f59e0b', icon: '⚠' },
    info: { bg: '#3b82f6', icon: 'ℹ' }
  };
  const style = types[type] || types.info;
  return `<span class="pill" style="--bg: ${style.bg};">${style.icon} ${txt}</span>`;
};

/* ─── Generate fancy cards ────────────────────────────── */
const playwrightStats = [
  statCard('🎯', 'Total Tests', playPR.total || 0, '#3b82f6'),
  statCard('✅', 'Passed', playPR.passed || 0, '#10b981'),
  statCard('❌', 'Failed', playPR.failed || 0, '#ef4444'),
  statCard('⏭️', 'Skipped', playPR.skipped || 0, '#f59e0b')
];

const playwrightCard = `
  <div class="card card-playwright">
    <div class="card-header">
      <h2><span class="icon">🎭</span> Playwright Test Results</h2>
      ${playPR.pass_rate >= 90 ? '<span class="badge badge-success">Excellent</span>' : 
        playPR.pass_rate >= 70 ? '<span class="badge badge-warning">Good</span>' : 
        '<span class="badge badge-error">Needs Attention</span>'}
    </div>
    
    <div class="stats-grid">
      ${playwrightStats.join('')}
    </div>
    
    <div class="comparison-section">
      <h3>Branch Comparison</h3>
      <div class="comparison-table">
        <div class="comparison-row header">
          <div>Branch</div>
          <div>Total</div>
          <div>Passed</div>
          <div>Failed</div>
          <div>Pass Rate</div>
          <div>Duration</div>
        </div>
        <div class="comparison-row ${playPR.failed > 0 ? 'has-failures' : ''}">
          <div><span class="branch-badge pr">PR</span></div>
          <div>${playPR.total || 0}</div>
          <div class="success">${playPR.passed || 0}</div>
          <div class="error">${playPR.failed || 0}</div>
          <div>
            ${progressBar(playPR.passed || 0, playPR.total || 1, '#10b981')}
          </div>
          <div>${((playPR.duration || 0) / 1000).toFixed(2)}s</div>
        </div>
        ${hasMainPlay ? `
        <div class="comparison-row">
          <div><span class="branch-badge main">Main</span></div>
          <div>${playMain.total || 0}</div>
          <div class="success">${playMain.passed || 0}</div>
          <div class="error">${playMain.failed || 0}</div>
          <div>
            ${progressBar(playMain.passed || 0, playMain.total || 1, '#10b981')}
          </div>
          <div>${((playMain.duration || 0) / 1000).toFixed(2)}s</div>
        </div>
        ` : ''}
      </div>
    </div>
    
    <div class="report-links">
      ${fs.existsSync(path.join(OUT,'pr-report/index.html')) ? 
        '<a href="pr-report/index.html" class="report-link pr-link"><span>📊</span> View PR Report</a>' : ''}
      ${fs.existsSync(path.join(OUT,'main-report/index.html')) ? 
        '<a href="main-report/index.html" class="report-link main-link"><span>📈</span> View Main Report</a>' : ''}
    </div>
  </div>
`;

const prettierCard = `
  <div class="card card-prettier">
    <div class="card-header">
      <h2><span class="icon">🎨</span> Prettier Formatting</h2>
      ${p.filesWithIssues ? pill(`${p.filesWithIssues} files need formatting`, 'warning') : 
        pill('All files formatted', 'success')}
    </div>
    
    ${p.filesWithIssues ? `
      <div class="issue-summary">
        <div class="issue-stat">
          <span class="issue-count">${p.filesWithIssues}</span>
          <span class="issue-label">File${p.filesWithIssues !== 1 ? 's' : ''}</span>
        </div>
        <div class="issue-stat">
          <span class="issue-count">${p.totalChanges}</span>
          <span class="issue-label">Change${p.totalChanges !== 1 ? 's' : ''}</span>
        </div>
      </div>
      
      ${p.files && p.files.length ? `
        <div class="file-list">
          <h4>Affected Files:</h4>
          <ul>
            ${p.files.map(f => `<li><code>${f}</code></li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${p.totalChanges > 50 ? `
        <div class="alert alert-warning">
          <div class="alert-icon">⚠️</div>
          <div class="alert-content">
            <strong>Many formatting changes detected</strong>
            <p>Too many changes for inline comments. Run the following command to fix:</p>
            <pre class="command">npx prettier "tests/**/*.{js,jsx,ts,tsx}" --write</pre>
          </div>
        </div>
      ` : ''}
      
      ${p.sample ? `
        <details class="fancy-details">
          <summary>View diff sample</summary>
          <pre class="diff-preview">${p.sample}</pre>
        </details>
      ` : ''}
    ` : `
      <div class="success-message">
        <div class="success-icon">✨</div>
        <p>All files are properly formatted!</p>
      </div>
    `}
  </div>
`;

const eslintCard = `
  <div class="card card-eslint">
    <div class="card-header">
      <h2><span class="icon">📋</span> ESLint Analysis</h2>
      ${e.errors || e.warnings ? 
        `<div class="severity-badges">
          ${e.errors > 0 ? pill(`${e.errors} errors`, 'error') : ''}
          ${e.warnings > 0 ? pill(`${e.warnings} warnings`, 'warning') : ''}
        </div>` : 
        pill('No issues found', 'success')}
    </div>
    
    ${e.errors || e.warnings ? `
      <div class="issue-grid">
        <div class="issue-item error">
          <div class="issue-icon">❌</div>
          <div class="issue-details">
            <div class="issue-count">${e.errors || 0}</div>
            <div class="issue-type">Errors</div>
            ${e.fixableErrors ? `<div class="fixable">${e.fixableErrors} fixable</div>` : ''}
          </div>
        </div>
        <div class="issue-item warning">
          <div class="issue-icon">⚠️</div>
          <div class="issue-details">
            <div class="issue-count">${e.warnings || 0}</div>
            <div class="issue-type">Warnings</div>
            ${e.fixableWarnings ? `<div class="fixable">${e.fixableWarnings} fixable</div>` : ''}
          </div>
        </div>
      </div>
      
      ${e.first ? `
        <div class="first-error">
          <h4>First error:</h4>
          <code>${e.first}</code>
        </div>
      ` : ''}
      
      ${(e.fixableErrors > 0 || e.fixableWarnings > 0) ? `
        <div class="alert alert-info">
          <div class="alert-icon">💡</div>
          <div class="alert-content">
            <strong>Auto-fixable issues detected</strong>
            <p>Run the following command to automatically fix ${e.fixableErrors + e.fixableWarnings} issues:</p>
            <pre class="command">npx eslint . --fix</pre>
          </div>
        </div>
      ` : ''}
    ` : `
      <div class="success-message">
        <div class="success-icon">🎉</div>
        <p>Code quality check passed!</p>
      </div>
    `}
  </div>
`;

const flowCard = fs.existsSync(path.join(OUT,'flowchart.png')) ? `
  <div class="card card-flowchart">
    <div class="card-header">
      <h2><span class="icon">🔄</span> Test Flow Visualization</h2>
    </div>
    <div class="flowchart-container">
      <img src="flowchart.png" alt="Test execution flowchart" class="flowchart-image" onclick="openImageModal(this.src)">
      <div class="flowchart-overlay">
        <button class="zoom-btn" onclick="openImageModal('flowchart.png')">
          <span>🔍</span> Click to zoom
        </button>
      </div>
    </div>
  </div>
` : '';

const checklistCard = checklistMD ? `
  <div class="card card-checklist">
    <div class="card-header">
      <h2><span class="icon">✅</span> Review Checklist</h2>
      <span class="checklist-progress">${
        (checklistMD.match(/\[x\]/g) || []).length
      }/${
        (checklistMD.match(/\[[ x]\]/g) || []).length
      } completed</span>
    </div>
    <div class="checklist-content">
      ${marked.parse(checklistMD).replace(/<li>/g, '<li class="checklist-item">')}
    </div>
  </div>
` : '';

/* ─── HTML with enhanced styling ─────────────────────── */
const html = /*html*/`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GUI Test Review Dashboard</title>
<style>
/* Modern CSS Variables */
:root {
  --primary: #6366f1;
  --primary-dark: #4f46e5;
  --success: #10b981;
  --error: #ef4444;
  --warning: #f59e0b;
  --info: #3b82f6;
  --bg-primary: #0f172a;
  --bg-secondary: #1e293b;
  --bg-card: #1e293b;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --border: #334155;
  --shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
  --glow: 0 0 20px rgba(99, 102, 241, 0.3);
  --gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --glass: rgba(255, 255, 255, 0.05);
}

/* Base Styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
  min-height: 100vh;
  position: relative;
  overflow-x: hidden;
}

/* Animated Background */
body::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: 
    radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.2) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(255, 119, 198, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 40% 20%, rgba(119, 198, 255, 0.1) 0%, transparent 50%);
  z-index: -1;
  animation: bgAnimation 20s ease infinite;
}

@keyframes bgAnimation {
  0%, 100% { transform: rotate(0deg) scale(1); }
  50% { transform: rotate(180deg) scale(1.1); }
}

/* Container */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
  position: relative;
  z-index: 1;
}

/* Header */
.header {
  text-align: center;
  margin-bottom: 3rem;
  animation: fadeInDown 0.8s ease;
}

.header h1 {
  font-size: 3rem;
  font-weight: 800;
  background: var(--gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 0.5rem;
  letter-spacing: -0.02em;
}

.header .subtitle {
  color: var(--text-secondary);
  font-size: 1.2rem;
}

/* Cards */
.card {
  background: var(--glass);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 2rem;
  margin-bottom: 2rem;
  box-shadow: var(--shadow);
  transition: all 0.3s ease;
  animation: fadeInUp 0.8s ease;
  position: relative;
  overflow: hidden;
}

.card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--gradient);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow), var(--glow);
}

.card:hover::before {
  opacity: 1;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.card-header h2 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.card-header .icon {
  font-size: 1.8rem;
  animation: bounce 2s ease infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

/* Badges */
.badge {
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
  animation: pulse 2s ease infinite;
}

.badge-success {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.badge-warning {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.badge-error {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

/* Pills */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.8rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
  background: var(--bg);
  color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: var(--glass);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--accent);
  opacity: 0.6;
}

.stat-card:hover {
  transform: translateX(4px);
  border-color: var(--accent);
}

.stat-icon {
  font-size: 2rem;
  opacity: 0.8;
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 0.875rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

/* Progress Bar */
.progress-container {
  position: relative;
  width: 100%;
  height: 24px;
  background: var(--bg-secondary);
  border-radius: 12px;
  overflow: hidden;
}

.progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: var(--progress);
  background: linear-gradient(90deg, var(--color) 0%, var(--color) 100%);
  border-radius: 12px;
  transition: width 1s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: progressGlow 2s ease infinite;
}

@keyframes progressGlow {
  0%, 100% { box-shadow: 0 0 10px rgba(16, 185, 129, 0.5); }
  50% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.8); }
}

.progress-text {
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* Comparison Table */
.comparison-section {
  margin-top: 2rem;
}

.comparison-section h3 {
  font-size: 1.2rem;
  margin-bottom: 1rem;
  color: var(--text-primary);
}

.comparison-table {
  background: var(--glass);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.comparison-row {
  display: grid;
  grid-template-columns: 100px 80px 80px 80px 1fr 100px;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--border);
  transition: background 0.3s ease;
}

.comparison-row:last-child {
  border-bottom: none;
}

.comparison-row.header {
  background: var(--bg-secondary);
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.comparison-row:hover:not(.header) {
  background: rgba(99, 102, 241, 0.05);
}

.comparison-row.has-failures {
  background: rgba(239, 68, 68, 0.05);
}

.branch-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.branch-badge.pr {
  background: rgba(99, 102, 241, 0.2);
  color: #6366f1;
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.branch-badge.main {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.success { color: #10b981; font-weight: 600; }
.error { color: #ef4444; font-weight: 600; }

/* Report Links */
.report-links {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
  flex-wrap: wrap;
}

.report-link {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.3s ease;
  background: var(--glass);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.report-link:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.report-link.pr-link:hover {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
}

.report-link.main-link:hover {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

/* Alerts */
.alert {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border-radius: 8px;
  margin-top: 1rem;
  border: 1px solid;
}

.alert-warning {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.3);
  color: #f59e0b;
}

.alert-info {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
  color: #3b82f6;
}

.alert-icon {
  font-size: 1.5rem;
}

.alert-content {
  flex: 1;
}

.alert-content strong {
  display: block;
  margin-bottom: 0.5rem;
}

.command {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.75rem;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.875rem;
  color: var(--text-primary);
  margin-top: 0.5rem;
  overflow-x: auto;
}

/* Issue Summary */
.issue-summary {
  display: flex;
  gap: 2rem;
  margin-bottom: 1.5rem;
}

.issue-stat {
  text-align: center;
}

.issue-count {
  display: block;
  font-size: 2rem;
  font-weight: 700;
  color: var(--warning);
}

.issue-label {
  font-size: 0.875rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Issue Grid */
.issue-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.issue-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--glass);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: all 0.3s ease;
}

.issue-item.error {
  border-color: rgba(239, 68, 68, 0.3);
}

.issue-item.error:hover {
  background: rgba(239, 68, 68, 0.05);
  border-color: rgba(239, 68, 68, 0.5);
}

.issue-item.warning {
  border-color: rgba(245, 158, 11, 0.3);
}

.issue-item.warning:hover {
  background: rgba(245, 158, 11, 0.05);
  border-color: rgba(245, 158, 11, 0.5);
}

.issue-icon {
  font-size: 2rem;
}

.issue-details {
  flex: 1;
}

.issue-type {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.fixable {
  font-size: 0.75rem;
  color: var(--info);
  margin-top: 0.25rem;
}

/* Success Message */
.success-message {
  text-align: center;
  padding: 2rem;
}

.success-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  animation: successPulse 2s ease infinite;
}

@keyframes successPulse {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.1); opacity: 1; }
}

/* File List */
.file-list {
  margin-top: 1rem;
}

.file-list h4 {
  font-size: 1rem;
  margin-bottom: 0.5rem;
  color: var(--text-secondary);
}

.file-list ul {
  list-style: none;
}

.file-list li {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border);
}

.file-list li:last-child {
  border-bottom: none;
}

.file-list code {
  background: var(--bg-primary);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
  color: var(--text-primary);
}

/* Details */
.fancy-details {
  margin-top: 1rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.fancy-details summary {
  padding: 0.75rem 1rem;
  background: var(--glass);
  cursor: pointer;
  font-weight: 500;
  transition: all 0.3s ease;
}

.fancy-details summary:hover {
  background: rgba(99, 102, 241, 0.1);
}

.fancy-details[open] summary {
  border-bottom: 1px solid var(--border);
}

.diff-preview {
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 1rem;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.875rem;
  overflow-x: auto;
  margin: 0;
}

/* First Error */
.first-error {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--glass);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
}

.first-error h4 {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.first-error code {
  display: block;
  background: var(--bg-primary);
  padding: 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
  color: #ef4444;
}

/* Flowchart */
.flowchart-container {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: var(--glass);
  border: 1px solid var(--border);
}

.flowchart-image {
  width: 100%;
  height: auto;
  display: block;
  cursor: zoom-in;
  transition: transform 0.3s ease;
}

.flowchart-container:hover .flowchart-image {
  transform: scale(1.02);
}

.flowchart-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.flowchart-container:hover .flowchart-overlay {
  opacity: 1;
  pointer-events: all;
}

.zoom-btn {
  background: var(--gradient);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.zoom-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
}

/* Checklist */
.checklist-progress {
  background: var(--glass);
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.checklist-content ul {
  list-style: none;
}

.checklist-item {
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
  font-size: 1rem;
  transition: all 0.3s ease;
  position: relative;
  padding-left: 2rem;
}

.checklist-item:last-child {
  border-bottom: none;
}

.checklist-item:hover {
  background: var(--glass);
  margin: 0 -1rem;
  padding-left: 3rem;
  padding-right: 1rem;
}

.checklist-item input[type="checkbox"] {
  position: absolute;
  left: 0.5rem;
  top: 0.9rem;
  width: 18px;
  height: 18px;
  cursor: pointer;
}

/* Footer */
.footer {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
  border-top: 1px solid var(--border);
  margin-top: 3rem;
}

/* Modal */
.modal {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 1000;
  cursor: zoom-out;
  animation: fadeIn 0.3s ease;
}

.modal img {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

/* Animations */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

/* Responsive */
@media (max-width: 768px) {
  .container {
    padding: 1rem;
  }
  
  .header h1 {
    font-size: 2rem;
  }
  
  .stats-grid {
    grid-template-columns: 1fr 1fr;
  }
  
  .comparison-row {
    font-size: 0.875rem;
    grid-template-columns: 80px repeat(5, 1fr);
  }
  
  .issue-grid {
    grid-template-columns: 1fr;
  }
  
  .card {
    padding: 1.5rem;
  }
}

/* Print Styles */
@media print {
  body {
    background: white;
    color: black;
  }
  
  .card {
    break-inside: avoid;
    box-shadow: none;
    border: 1px solid #ddd;
  }
}
</style>
</head>
<body>
<div class="container">
  <header class="header">
    <h1>🔍 GUI Test Review Dashboard</h1>
    <p class="subtitle">Automated test results and code quality analysis</p>
  </header>

  ${playwrightCard}
  ${prettierCard}
  ${eslintCard}
  ${flowCard}
  ${checklistCard}

  <footer class="footer">
    <p>Generated on ${new Date().toLocaleString()} • Powered by GUI-Based Testing Code Review Action</p>
  </footer>
</div>

<!-- Image Modal -->
<div id="imageModal" class="modal" onclick="closeImageModal()">
  <img id="modalImage" src="" alt="Zoomed view">
</div>

<script>
// Modal functionality
function openImageModal(src) {
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImage');
  modal.style.display = 'block';
  modalImg.src = src;
  document.body.style.overflow = 'hidden';
}

function closeImageModal() {
  document.getElementById('imageModal').style.display = 'none';
  document.body.style.overflow = 'auto';
}

// Keyboard navigation
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeImageModal();
  }
});

// Add stagger animation to cards
document.addEventListener('DOMContentLoaded', function() {
  const cards = document.querySelectorAll('.card');
  cards.forEach((card, index) => {
    card.style.animationDelay = \`\${index * 0.1}s\`;
  });
  
  // Animate progress bars
  setTimeout(() => {
    document.querySelectorAll('.progress-bar').forEach(bar => {
      bar.style.width = bar.style.getPropertyValue('--progress');
    });
  }, 500);
});

// Theme toggle (future enhancement)
function toggleTheme() {
  document.body.classList.toggle('light-theme');
  localStorage.setItem('theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
}

// Check for saved theme preference
if (localStorage.getItem('theme') === 'light') {
  document.body.classList.add('light-theme');
}
</script>
</body>
</html>`;

/* ─── write page ─────────────────────────────────────── */
fs.writeFileSync(path.join(OUT,'index.html'),html,'utf8');
console.log('✨ Enhanced dashboard written → web-report/index.html');
