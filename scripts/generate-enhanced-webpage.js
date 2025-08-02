#!/usr/bin/env node
/**
 * generate-enhanced-webpage.js
 * Integrates all enhanced features into a cohesive dashboard
 */

const fs = require('fs');
const path = require('path');

// Import existing generate-webpage functionality
const originalGenerateWebpage = path.join(__dirname, 'generate-webpage.js');
let baseHTML = '';

// First run the original webpage generator if it exists
if (fs.existsSync(originalGenerateWebpage)) {
  require(originalGenerateWebpage);
  const webReportPath = path.join('artifacts', 'web-report', 'index.html');
  if (fs.existsSync(webReportPath)) {
    baseHTML = fs.readFileSync(webReportPath, 'utf8');
  }
}

const ART = 'artifacts';
const OUT = path.join(ART, 'web-report');

// Ensure output directory exists
fs.mkdirSync(OUT, { recursive: true });

// Helper to read files
const readFile = (filepath, defaultContent = '') => {
  try {
    return fs.readFileSync(filepath, 'utf8');
  } catch {
    return defaultContent;
  }
};

// Read all enhanced components
const visualRegressionHTML = readFile(path.join(ART, 'visual-regression.html'));
const quickActionsHTML = readFile(path.join(ART, 'quick-actions-panel.html'));
const testCityExists = fs.existsSync(path.join(OUT, 'test-city-3d.html'));

// Read data for summary stats
const testCityData = JSON.parse(readFile(path.join(ART, 'test-city-data.json'), '{}'));
const quickActionsData = JSON.parse(readFile(path.join(ART, 'quick-actions-data.json'), '{}'));
const visualRegressionData = JSON.parse(readFile(path.join(ART, 'visual-regression-report.json'), '{}'));
const testHistoryData = JSON.parse(readFile(path.join(ART, 'test-history-insights.json'), '{}'));

// Extract original content sections if base HTML exists
let originalContent = '';
if (baseHTML) {
  // Extract body content
  const bodyMatch = baseHTML.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    originalContent = bodyMatch[1];
  }
}

// Enhanced HTML template
const enhancedHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GUI Test Review Dashboard - Enhanced Edition</title>

<!-- Favicon -->
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔍</text></svg>">

<!-- Original styles preserved -->
${baseHTML ? baseHTML.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)?.join('\n') || '' : ''}

<!-- Enhanced styles -->
<style>
/* CSS Variables for consistent theming */
:root {
  --primary: #3b82f6;
  --primary-dark: #2563eb;
  --success: #10b981;
  --error: #ef4444;
  --warning: #f59e0b;
  --info: #06b6d4;
  --bg-primary: #0f172a;
  --bg-secondary: #1e293b;
  --bg-card: rgba(255, 255, 255, 0.05);
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --border: #334155;
  --shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
  --glow: 0 0 20px rgba(59, 130, 246, 0.3);
  --gradient: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
}

/* Enhanced base styles */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  min-height: 100vh;
  position: relative;
}

/* Background animation */
body::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: 
    radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 40% 20%, rgba(16, 185, 129, 0.1) 0%, transparent 50%);
  z-index: -1;
  animation: bgAnimation 30s ease infinite;
  pointer-events: none;
}

@keyframes bgAnimation {
  0%, 100% { transform: scale(1) rotate(0deg); }
  33% { transform: scale(1.1) rotate(120deg); }
  66% { transform: scale(0.9) rotate(240deg); }
}

/* Enhanced navigation */
.enhanced-nav {
  position: sticky;
  top: 0;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
  z-index: 1000;
  padding: 1rem 2rem;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

.nav-container {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
}

.nav-links {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.nav-link {
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}

.nav-link::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  width: 0;
  height: 2px;
  background: var(--primary);
  transform: translateX(-50%);
  transition: width 0.3s;
}

.nav-link:hover {
  color: var(--primary);
  background: rgba(59, 130, 246, 0.1);
}

.nav-link:hover::before {
  width: 80%;
}

.nav-link.active {
  color: var(--primary);
  background: rgba(59, 130, 246, 0.15);
}

.nav-link.active::before {
  width: 80%;
}

.nav-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: 0.5rem;
  animation: pulse 2s ease infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}

.nav-indicator.success { background: var(--success); }
.nav-indicator.warning { background: var(--warning); animation: pulse 1s ease infinite; }
.nav-indicator.error { background: var(--error); animation: pulse 0.5s ease infinite; }

/* Enhanced content sections */
.enhanced-content {
  min-height: calc(100vh - 80px);
  position: relative;
}

.section {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
  animation: fadeIn 0.5s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.section-hidden {
  display: none;
}

/* Summary hero section */
.summary-hero {
  background: var(--gradient);
  border-radius: 16px;
  padding: 3rem;
  margin-bottom: 2rem;
  position: relative;
  overflow: hidden;
}

.summary-hero::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
  animation: rotate 20s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.summary-hero-content {
  position: relative;
  z-index: 1;
}

.summary-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
}

.summary-stat {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  transition: all 0.3s;
}

.summary-stat:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.summary-stat-value {
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.summary-stat-label {
  font-size: 0.875rem;
  opacity: 0.9;
}

/* Feature cards */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  margin: 2rem 0;
}

.feature-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
  transition: all 0.3s;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.feature-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: var(--gradient);
  transform: translateY(-100%);
  transition: transform 0.3s;
}

.feature-card:hover {
  border-color: var(--primary);
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}

.feature-card:hover::before {
  transform: translateY(0);
}

.feature-card-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.feature-icon {
  font-size: 2rem;
}

.feature-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.feature-description {
  color: var(--text-secondary);
  line-height: 1.6;
}

.feature-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  font-size: 0.875rem;
}

/* Quick access sidebar */
.quick-access {
  position: fixed;
  right: 2rem;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(30, 41, 59, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 900;
  box-shadow: var(--shadow);
}

.quick-btn {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid var(--border);
  color: var(--primary);
  font-size: 1.5rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.quick-btn:hover {
  background: rgba(59, 130, 246, 0.2);
  transform: scale(1.1);
  border-color: var(--primary);
}

.quick-btn.active {
  background: var(--primary);
  color: white;
}

.quick-btn::after {
  content: attr(data-tooltip);
  position: absolute;
  right: 100%;
  margin-right: 0.5rem;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}

.quick-btn:hover::after {
  opacity: 1;
}

/* Footer */
.enhanced-footer {
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  padding: 2rem;
  margin-top: 4rem;
}

.footer-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 2rem;
}

.footer-links {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
}

.footer-link {
  color: var(--text-secondary);
  text-decoration: none;
  transition: color 0.2s;
}

.footer-link:hover {
  color: var(--primary);
}

/* Loading animation */
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Responsive design */
@media (max-width: 1024px) {
  .quick-access {
    display: none;
  }
}

@media (max-width: 768px) {
  .nav-container {
    flex-direction: column;
    gap: 1rem;
  }
  
  .nav-links {
    width: 100%;
    justify-content: center;
  }
  
  .nav-link {
    font-size: 0.875rem;
    padding: 0.375rem 0.75rem;
  }
  
  .summary-hero {
    padding: 2rem 1.5rem;
  }
  
  .summary-stat-value {
    font-size: 2rem;
  }
  
  .feature-grid {
    grid-template-columns: 1fr;
  }
}

/* Print styles */
@media print {
  .enhanced-nav,
  .quick-access {
    display: none;
  }
  
  body {
    background: white;
    color: black;
  }
  
  .section {
    break-inside: avoid;
  }
}
</style>

</head>
<body>

<!-- Enhanced Navigation -->
<nav class="enhanced-nav">
  <div class="nav-container">
    <div class="nav-brand">
      <span style="font-size: 1.5rem;">🔍</span>
      <span>GUI Test Review</span>
    </div>
    <div class="nav-links">
      <a href="#overview" class="nav-link active" onclick="showSection('overview')">
        <span>📊</span> Overview
      </a>
      <a href="#tests" class="nav-link" onclick="showSection('tests')">
        <span>🎭</span> Tests
        ${testCityData.stats?.failed > 0 ? '<span class="nav-indicator error"></span>' : ''}
      </a>
      <a href="#visual" class="nav-link" onclick="showSection('visual')">
        <span>🖼️</span> Visual
        ${visualRegressionData.major > 0 ? '<span class="nav-indicator warning"></span>' : ''}
      </a>
      <a href="#city" class="nav-link" onclick="showSection('city')">
        <span>🏙️</span> 3D View
      </a>
      <a href="#actions" class="nav-link" onclick="showSection('actions')">
        <span>⚡</span> Actions
        ${quickActionsData.stats?.failedTests > 0 ? '<span class="nav-indicator error"></span>' : ''}
      </a>
      <a href="#history" class="nav-link" onclick="showSection('history')">
        <span>📈</span> History
        ${testHistoryData.summary?.flakyTestCount > 5 ? '<span class="nav-indicator warning"></span>' : ''}
      </a>
    </div>
  </div>
</nav>

<!-- Quick Access Sidebar -->
<div class="quick-access">
  <button class="quick-btn" onclick="showSection('overview')" data-tooltip="Overview">
    📊
  </button>
  <button class="quick-btn" onclick="showSection('tests')" data-tooltip="Test Results">
    🎭
  </button>
  <button class="quick-btn" onclick="showSection('visual')" data-tooltip="Visual Regression">
    🖼️
  </button>
  <button class="quick-btn" onclick="showSection('city')" data-tooltip="3D Test City">
    🏙️
  </button>
  <button class="quick-btn" onclick="showSection('actions')" data-tooltip="Quick Actions">
    ⚡
  </button>
  <button class="quick-btn" onclick="downloadReport()" data-tooltip="Download Report">
    📥
  </button>
</div>

<!-- Enhanced Content -->
<div class="enhanced-content">
  
  <!-- Overview Section -->
  <div id="overview-section" class="section">
    <div class="summary-hero">
      <div class="summary-hero-content">
        <h1 style="margin: 0 0 1rem 0; font-size: 2.5rem;">Test Review Dashboard</h1>
        <p style="margin: 0; font-size: 1.125rem; opacity: 0.9;">
          Comprehensive analysis of your GUI tests with visual regression, 3D visualization, and actionable insights
        </p>
        
        <div class="summary-stats">
          <div class="summary-stat">
            <div class="summary-stat-value" style="color: ${testCityData.stats?.failed > 0 ? '#ef4444' : '#10b981'};">
              ${testCityData.stats?.total || 0}
            </div>
            <div class="summary-stat-label">Total Tests</div>
          </div>
          <div class="summary-stat">
            <div class="summary-stat-value" style="color: #10b981;">
              ${testCityData.stats?.passed || 0}
            </div>
            <div class="summary-stat-label">Passed</div>
          </div>
          <div class="summary-stat">
            <div class="summary-stat-value" style="color: #ef4444;">
              ${testCityData.stats?.failed || 0}
            </div>
            <div class="summary-stat-label">Failed</div>
          </div>
          <div class="summary-stat">
            <div class="summary-stat-value" style="color: #f59e0b;">
              ${testHistoryData.summary?.flakyTestCount || 0}
            </div>
            <div class="summary-stat-label">Flaky</div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="feature-grid">
      <div class="feature-card" onclick="showSection('tests')">
        <div class="feature-card-header">
          <span class="feature-icon">🎭</span>
          <h3 class="feature-title">Test Results</h3>
        </div>
        <p class="feature-description">
          Detailed Playwright test results with failure analysis and performance metrics
        </p>
        <div class="feature-status">
          ${testCityData.stats?.failed > 0 ? 
            `<span style="color: var(--error);">⚠️ ${testCityData.stats.failed} tests failing</span>` :
            '<span style="color: var(--success);">✅ All tests passing</span>'
          }
        </div>
      </div>
      
      <div class="feature-card" onclick="showSection('visual')">
        <div class="feature-card-header">
          <span class="feature-icon">🖼️</span>
          <h3 class="feature-title">Visual Regression</h3>
        </div>
        <p class="feature-description">
          Screenshot comparisons between PR and main branch with diff visualization
        </p>
        <div class="feature-status">
          ${visualRegressionData.major > 0 ? 
            `<span style="color: var(--warning);">🔍 ${visualRegressionData.major} major changes</span>` :
            '<span style="color: var(--success);">✅ No major visual changes</span>'
          }
        </div>
      </div>
      
      <div class="feature-card" onclick="showSection('city')">
        <div class="feature-card-header">
          <span class="feature-icon">🏙️</span>
          <h3 class="feature-title">3D Test City</h3>
        </div>
        <p class="feature-description">
          Interactive 3D visualization of your test suite with performance insights
        </p>
        <div class="feature-status">
          <span style="color: var(--info);">🎮 Interactive experience</span>
        </div>
      </div>
      
      <div class="feature-card" onclick="showSection('actions')">
        <div class="feature-card-header">
          <span class="feature-icon">⚡</span>
          <h3 class="feature-title">Quick Actions</h3>
        </div>
        <p class="feature-description">
          Context-aware commands and GitHub actions to speed up your workflow
        </p>
        <div class="feature-status">
          <span style="color: var(--primary);">🚀 ${quickActionsData.commands?.length || 0} commands ready</span>
        </div>
      </div>
      
      <div class="feature-card" onclick="showSection('history')">
        <div class="feature-card-header">
          <span class="feature-icon">📈</span>
          <h3 class="feature-title">Test History</h3>
        </div>
        <p class="feature-description">
          Track test stability over time and identify patterns in failures
        </p>
        <div class="feature-status">
          ${testHistoryData.trends?.improving ? 
            '<span style="color: var(--success);">📈 Improving trend</span>' :
            '<span style="color: var(--warning);">📊 Monitoring stability</span>'
          }
        </div>
      </div>
      
      <div class="feature-card" onclick="window.open('https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/wiki', '_blank')">
        <div class="feature-card-header">
          <span class="feature-icon">📚</span>
          <h3 class="feature-title">Documentation</h3>
        </div>
        <p class="feature-description">
          Learn how to use all features and customize the action for your needs
        </p>
        <div class="feature-status">
          <span style="color: var(--text-secondary);">🔗 Open in new tab</span>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Test Results Section (Original content) -->
  <div id="tests-section" class="section section-hidden">
    ${originalContent || '<div class="loading"><div class="loading-spinner"></div></div>'}
  </div>
  
  <!-- Visual Regression Section -->
  <div id="visual-section" class="section section-hidden">
    ${visualRegressionHTML || '<p>Visual regression analysis not available. Enable visual comparison in your workflow.</p>'}
  </div>
  
  <!-- 3D Test City Section -->
  <div id="city-section" class="section section-hidden">
    ${testCityExists ? `
      <iframe 
        src="test-city-3d.html" 
        style="width: 100%; height: 80vh; border: none; border-radius: 12px; box-shadow: var(--shadow);"
        title="3D Test City Visualization"
      ></iframe>
    ` : '<p>3D Test City visualization not available. Check if the generation script ran successfully.</p>'}
  </div>
  
  <!-- Quick Actions Section -->
  <div id="actions-section" class="section section-hidden">
    ${quickActionsHTML || '<p>Quick actions panel not available. Check if test results were processed.</p>'}
  </div>
  
  <!-- History Section -->
  <div id="history-section" class="section section-hidden">
    <h2 style="margin-bottom: 2rem;">📈 Test History & Trends</h2>
    
    ${testHistoryData.summary ? `
      <div class="feature-grid">
        <div class="feature-card">
          <div class="feature-card-header">
            <span class="feature-icon">📊</span>
            <h3 class="feature-title">Overall Trends</h3>
          </div>
          <p class="feature-description">
            Average pass rate: <strong>${testHistoryData.trends?.avgPassRate || 0}%</strong><br>
            Average duration: <strong>${((testHistoryData.trends?.avgDuration || 0) / 1000).toFixed(1)}s</strong><br>
            Trend: <strong>${testHistoryData.trends?.improving ? '📈 Improving' : testHistoryData.trends?.degrading ? '📉 Degrading' : '➡️ Stable'}</strong>
          </p>
        </div>
        
        ${testHistoryData.flakyTests?.length > 0 ? `
          <div class="feature-card">
            <div class="feature-card-header">
              <span class="feature-icon">🎲</span>
              <h3 class="feature-title">Flaky Tests</h3>
            </div>
            <p class="feature-description">
              <strong>${testHistoryData.flakyTests.length}</strong> tests showing instability<br>
              Most flaky: <strong>${testHistoryData.flakyTests[0]?.flakiness || 0}%</strong> failure rate
            </p>
          </div>
        ` : ''}
        
        ${testHistoryData.slowTests?.length > 0 ? `
          <div class="feature-card">
            <div class="feature-card-header">
              <span class="feature-icon">🐌</span>
              <h3 class="feature-title">Performance</h3>
            </div>
            <p class="feature-description">
              <strong>${testHistoryData.slowTests.length}</strong> slow tests detected<br>
              Slowest: <strong>${(testHistoryData.slowTests[0]?.avgDuration / 1000).toFixed(1)}s</strong> average
            </p>
          </div>
        ` : ''}
      </div>
      
      ${fs.existsSync(path.join(ART, 'test-history-report.md')) ? `
        <div style="margin-top: 2rem;">
          <a href="test-history-report.md" class="qa-action-btn" style="display: inline-flex;" target="_blank">
            📄 View Detailed History Report
          </a>
        </div>
      ` : ''}
    ` : '<p>Test history tracking not enabled. Add test runs to see trends over time.</p>'}
  </div>
  
</div>

<!-- Enhanced Footer -->
<footer class="enhanced-footer">
  <div class="footer-content">
    <div>
      <strong>GUI Test Review</strong> v1.3.0 Enhanced
      <br>
      <span style="color: var(--text-secondary); font-size: 0.875rem;">
        Generated on ${new Date().toLocaleString()}
      </span>
    </div>
    <div class="footer-links">
      <a href="https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests" class="footer-link" target="_blank">
        GitHub
      </a>
      <a href="https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/wiki" class="footer-link" target="_blank">
        Documentation
      </a>
      <a href="https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/issues" class="footer-link" target="_blank">
        Report Issue
      </a>
    </div>
  </div>
</footer>

<!-- Image Modal (shared) -->
<div id="imageModal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); z-index: 2000; cursor: zoom-out;" onclick="closeImageModal()">
  <img id="modalImage" src="" alt="Zoomed view" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); max-width: 95vw; max-height: 95vh; border-radius: 8px;">
  <button onclick="closeImageModal()" style="position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.1); border: none; color: white; font-size: 2rem; width: 50px; height: 50px; border-radius: 50%; cursor: pointer;">×</button>
</div>

<script>
// Navigation functions
function showSection(sectionName) {
  // Hide all sections
  document.querySelectorAll('.section').forEach(section => {
    section.classList.add('section-hidden');
  });
  
  // Show selected section
  const section = document.getElementById(sectionName + '-section');
  if (section) {
    section.classList.remove('section-hidden');
  }
  
  // Update nav
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  
  // Find and activate the clicked link
  const clickedLink = event?.target?.closest('.nav-link');
  if (clickedLink) {
    clickedLink.classList.add('active');
  } else {
    // Fallback: find by href
    document.querySelector(\`.nav-link[href="#\${sectionName}"]\`)?.classList.add('active');
  }
  
  // Update quick access buttons
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Update URL hash
  window.location.hash = sectionName;
  
  // Scroll to top
  window.scrollTo(0, 0);
}

// Download report function
function downloadReport() {
  const reportData = {
    generated: new Date().toISOString(),
    testResults: ${JSON.stringify(testCityData.stats || {})},
    visualRegression: {
      total: ${visualRegressionData.totalComparisons || 0},
      changes: ${(visualRegressionData.major || 0) + (visualRegressionData.minor || 0)}
    },
    quickActions: {
      commands: ${quickActionsData.commands?.length || 0},
      actions: ${quickActionsData.actions?.length || 0}
    },
    testHistory: {
      flaky: ${testHistoryData.summary?.flakyTestCount || 0},
      trends: ${JSON.stringify(testHistoryData.trends || {})}
    }
  };
  
  const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'test-report-' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

// Image modal functions
function openImageModal(src) {
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImage');
  if (modal && modalImg) {
    modal.style.display = 'block';
    modalImg.src = src;
    document.body.style.overflow = 'hidden';
  }
}

function closeImageModal() {
  const modal = document.getElementById('imageModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
}

// Keyboard navigation
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeImageModal();
  }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
  // Check URL hash
  const hash = window.location.hash.slice(1);
  if (hash && ['overview', 'tests', 'visual', 'city', 'actions', 'history'].includes(hash)) {
    showSection(hash);
  } else {
    showSection('overview');
  }
  
  // Add smooth scrolling
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = this.getAttribute('href').slice(1);
      showSection(target);
    });
  });
});

// Handle browser back/forward
window.addEventListener('popstate', function() {
  const hash = window.location.hash.slice(1) || 'overview';
  showSection(hash);
});

// Add loading animation for iframe
const cityFrame = document.querySelector('#city-section iframe');
if (cityFrame) {
  cityFrame.addEventListener('load', function() {
    this.style.opacity = '0';
    setTimeout(() => {
      this.style.transition = 'opacity 0.5s';
      this.style.opacity = '1';
    }, 100);
  });
}
</script>

</body>
</html>`;

// Write the enhanced dashboard
fs.writeFileSync(path.join(OUT, 'index.html'), enhancedHTML);

// Copy any additional resources
const additionalFiles = [
  'test-history-report.md',
  'test-failure-analysis.md'
];

additionalFiles.forEach(file => {
  const srcPath = path.join(ART, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, path.join(OUT, file));
  }
});

console.log('✨ Enhanced dashboard generated successfully!');
console.log('📊 Features integrated:');
console.log('   - Original test results');
console.log('   - Visual regression testing');
console.log('   - 3D Test City visualization');
console.log('   - Quick actions panel');
console.log('   - Test history tracking');
console.log(`📍 Location: ${OUT}/index.html`);