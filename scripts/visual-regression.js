#!/usr/bin/env node
/**
 * visual-regression.js
 * Compares screenshots from PR and main branches
 * FIXED: Better screenshot discovery without report.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ART = 'artifacts';

/* ────────────────────────────────────────────────────────── *
 *  Find all screenshots in Playwright HTML report
 * ────────────────────────────────────────────────────────── */
function findScreenshots(reportPath) {
  const screenshots = [];
  
  if (!fs.existsSync(reportPath)) {
    console.log(`❌ Report path not found: ${reportPath}`);
    return screenshots;
  }

  // Search in all possible locations where Playwright stores screenshots
  const searchPaths = [
    reportPath,
    path.join(reportPath, 'data'),
    path.join(reportPath, 'trace'),
    path.join(reportPath, 'test-results')
  ];

  // Also check for index.html to find screenshot references
  const indexPath = path.join(reportPath, 'index.html');
  let screenshotRefs = [];
  
  if (fs.existsSync(indexPath)) {
    try {
      const html = fs.readFileSync(indexPath, 'utf8');
      // Extract screenshot references from HTML
      const matches = html.match(/data\/[a-f0-9\-]+\.(png|jpe?g)/gi) || [];
      screenshotRefs = matches.map(m => path.basename(m));
      console.log(`Found ${screenshotRefs.length} screenshot references in index.html`);
    } catch (e) {
      console.warn('Could not parse index.html:', e.message);
    }
  }

  searchPaths.forEach(searchPath => {
    if (!fs.existsSync(searchPath)) return;
    
    const stats = fs.statSync(searchPath);
    if (!stats.isDirectory()) return;
    
    try {
      const files = fs.readdirSync(searchPath);
      
      files.forEach(file => {
        // Match screenshot files
        if (file.match(/\.(png|jpe?g)$/i)) {
          const filePath = path.join(searchPath, file);
          
          // Skip diff and expected files for now
          const isActual = !file.includes('-diff') && !file.includes('-expected');
          const isDiff = file.includes('-diff');
          const isExpected = file.includes('-expected');
          
          // Extract test information from filename
          const testInfo = extractTestInfoFromFilename(file);
          
          screenshots.push({
            filename: file,
            path: filePath,
            testName: testInfo.testName,
            testId: testInfo.testId,
            isActual,
            isDiff,
            isExpected,
            browser: testInfo.browser,
            isFailure: file.includes('-actual') || searchPath.includes('test-results')
          });
        }
      });
    } catch (e) {
      console.warn(`Error reading directory ${searchPath}:`, e.message);
    }
  });

  console.log(`📸 Found ${screenshots.length} total files in ${reportPath}`);
  console.log(`   - Actual: ${screenshots.filter(s => s.isActual).length}`);
  console.log(`   - Expected: ${screenshots.filter(s => s.isExpected).length}`);
  console.log(`   - Diff: ${screenshots.filter(s => s.isDiff).length}`);
  
  return screenshots;
}

/* ────────────────────────────────────────────────────────── *
 *  Extract test information from screenshot filename
 * ────────────────────────────────────────────────────────── */
function extractTestInfoFromFilename(filename) {
  // Remove extension
  let name = filename.replace(/\.(png|jpe?g)$/i, '');
  
  // Extract browser if present
  let browser = 'chromium';
  const browserMatch = name.match(/-(chromium|firefox|webkit)/);
  if (browserMatch) {
    browser = browserMatch[1];
    name = name.replace(/-(chromium|firefox|webkit)/, '');
  }
  
  // Remove SHA prefix if present (40 hex chars)
  name = name.replace(/^[a-f0-9]{40}-?/, '');
  
  // Remove suffixes
  name = name.replace(/-(actual|expected|diff|previous)$/, '');
  name = name.replace(/-(darwin|linux|win32)$/, '');
  name = name.replace(/-attempt\d+$/, '');
  
  // Create a normalized test name
  const testName = name
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Create a normalized test ID for matching
  const testId = testName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  return { testName, testId, browser };
}

/* ────────────────────────────────────────────────────────── *
 *  Create normalized key for matching screenshots
 * ────────────────────────────────────────────────────────── */
function createMatchKey(screenshot) {
  // Only match actual screenshots (not diff or expected)
  if (!screenshot.isActual) return null;
  
  // Create a key that should match between PR and main
  return `${screenshot.testId}-${screenshot.browser}`;
}

/* ────────────────────────────────────────────────────────── *
 *  Image comparison
 * ────────────────────────────────────────────────────────── */
async function compareImages(img1Path, img2Path, diffPath) {
  try {
    if (!fs.existsSync(img1Path) || !fs.existsSync(img2Path)) {
      console.log(`❌ Missing image for comparison: ${!fs.existsSync(img1Path) ? img1Path : img2Path}`);
      return null;
    }

    // Quick binary comparison
    const buf1 = fs.readFileSync(img1Path);
    const buf2 = fs.readFileSync(img2Path);
    
    if (buf1.length === buf2.length && buf1.equals(buf2)) {
      return { hasDiff: false, diffPercent: 0, identical: true };
    }

    // Try ImageMagick
    try {
      execSync('which compare', { stdio: 'ignore' });
    } catch {
      console.warn('⚠️  ImageMagick not found, using binary comparison only');
      return { hasDiff: true, diffPercent: 50, method: 'binary' };
    }

    fs.mkdirSync(path.dirname(diffPath), { recursive: true });

    try {
      // Use ImageMagick compare
      const result = execSync(
        `compare -metric AE -fuzz 5% "${img1Path}" "${img2Path}" "${diffPath}" 2>&1`,
        { encoding: 'utf8', stdio: 'pipe' }
      );

      const pixels = parseInt(result) || 0;
      
      // Get dimensions
      const identify = execSync(`identify -format "%w %h" "${img1Path}"`, { encoding: 'utf8' });
      const [width, height] = identify.trim().split(' ').map(Number);
      const totalPixels = width * height;
      const diffPercent = totalPixels > 0 ? (pixels / totalPixels) * 100 : 0;

      return {
        hasDiff: pixels > 0,
        diffPercent: Math.round(diffPercent * 100) / 100,
        diffImage: diffPath,
        pixelDiff: pixels,
        totalPixels,
        dimensions: { width, height },
        method: 'imagemagick'
      };
    } catch (err) {
      // ImageMagick returns non-zero when images differ
      const pixels = parseInt(err.stdout || err.stderr || '1') || 1;
      return {
        hasDiff: true,
        diffPercent: 50, // Assume significant difference
        diffImage: diffPath,
        pixelDiff: pixels,
        method: 'imagemagick-error'
      };
    }
  } catch (err) {
    console.error('Error comparing images:', err.message);
    return null;
  }
}

/* ────────────────────────────────────────────────────────── *
 *  Main visual regression analysis
 * ────────────────────────────────────────────────────────── */
async function generateVisualReport() {
  console.log('🔍 Starting visual regression analysis...');
  
  // Find all screenshots
  const prShots = findScreenshots(path.join(ART, 'pr-report'));
  const mainShots = findScreenshots(path.join(ART, 'main-report'));

  // Filter to only actual screenshots (not diff/expected)
  const prActual = prShots.filter(s => s.isActual);
  const mainActual = mainShots.filter(s => s.isActual);

  console.log(`\n📊 Actual screenshots to compare:`);
  console.log(`   PR: ${prActual.length}`);
  console.log(`   Main: ${mainActual.length}`);

  // Create maps for matching
  const prMap = new Map();
  const mainMap = new Map();
  
  // Debug: Show what we're mapping
  console.log('\n🔑 Creating match keys:');
  
  prActual.forEach(shot => {
    const key = createMatchKey(shot);
    if (key) {
      prMap.set(key, shot);
      console.log(`   PR: "${key}" <- ${shot.filename}`);
    }
  });

  mainActual.forEach(shot => {
    const key = createMatchKey(shot);
    if (key) {
      mainMap.set(key, shot);
      console.log(`   Main: "${key}" <- ${shot.filename}`);
    }
  });

  // Prepare diff directory
  const diffDir = path.join(ART, 'visual-diffs');
  fs.mkdirSync(diffDir, { recursive: true });

  const comparisons = [];
  const processedKeys = new Set();

  // Compare PR vs Main
  console.log('\n🔄 Comparing screenshots:');
  for (const [key, prShot] of prMap) {
    processedKeys.add(key);
    const mainShot = mainMap.get(key);
    
    if (mainShot) {
      console.log(`   Comparing: ${key}`);
      const diffPath = path.join(diffDir, `diff-${key}.png`);
      const result = await compareImages(mainShot.path, prShot.path, diffPath);
      
      if (result) {
        const diffPercent = result.diffPercent || 0;
        comparisons.push({
          testName: prShot.testName,
          testId: key,
          filename: prShot.filename,
          prImage: prShot.path,
          mainImage: mainShot.path,
          ...result,
          status: diffPercent === 0 ? 'identical' :
                  diffPercent < 0.1 ? 'negligible' :
                  diffPercent < 1 ? 'minor' : 'major'
        });
        console.log(`     -> ${result.diffPercent}% difference (${comparisons[comparisons.length-1].status})`);
      }
    } else {
      console.log(`   New in PR: ${key}`);
      comparisons.push({
        testName: prShot.testName,
        testId: key,
        filename: prShot.filename,
        prImage: prShot.path,
        mainImage: null,
        hasDiff: true,
        diffPercent: 100,
        status: 'new'
      });
    }
  }

  // Check for removed screenshots
  for (const [key, mainShot] of mainMap) {
    if (!processedKeys.has(key)) {
      console.log(`   Removed from PR: ${key}`);
      comparisons.push({
        testName: mainShot.testName,
        testId: key,
        filename: mainShot.filename,
        prImage: null,
        mainImage: mainShot.path,
        hasDiff: true,
        diffPercent: 100,
        status: 'removed'
      });
    }
  }

  // Sort by difference percentage
  comparisons.sort((a, b) => b.diffPercent - a.diffPercent);

  // Create summary
  const summary = {
    timestamp: new Date().toISOString(),
    totalScreenshots: prActual.length,
    totalComparisons: comparisons.length,
    identical: comparisons.filter(c => c.status === 'identical').length,
    negligible: comparisons.filter(c => c.status === 'negligible').length,
    minor: comparisons.filter(c => c.status === 'minor').length,
    major: comparisons.filter(c => c.status === 'major').length,
    new: comparisons.filter(c => c.status === 'new').length,
    removed: comparisons.filter(c => c.status === 'removed').length,
    comparisons
  };

  console.log('\n📊 Final summary:');
  console.log(`   Total comparisons: ${summary.totalComparisons}`);
  console.log(`   Identical: ${summary.identical}`);
  console.log(`   Major changes: ${summary.major}`);
  console.log(`   Minor changes: ${summary.minor}`);

  // Save results
  fs.writeFileSync(
    path.join(ART, 'visual-regression-report.json'),
    JSON.stringify(summary, null, 2)
  );

  // Generate HTML report
  fs.writeFileSync(
    path.join(ART, 'visual-regression.html'),
    generateHTMLReport(summary)
  );

  // Generate markdown summary
  fs.writeFileSync(
    path.join(ART, 'visual-regression-summary.md'),
    generateMarkdownSummary(summary)
  );

  console.log('\n✅ Visual regression report generated');
  
  return summary;
}

// Generate HTML report (keeping the same as original)
function generateHTMLReport(report) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'identical': return '#10b981';
      case 'negligible': return '#06b6d4';
      case 'minor': return '#f59e0b';
      case 'major': return '#ef4444';
      case 'new': return '#3b82f6';
      case 'removed': return '#8b5cf6';
      default: return '#6b7280';
    }
  };
  
  const getStatusIcon = (status) => {
    switch (status) {
      case 'identical': return '✅';
      case 'negligible': return '✓';
      case 'minor': return '⚠️';
      case 'major': return '❌';
      case 'new': return '🆕';
      case 'removed': return '🗑️';
      default: return '❓';
    }
  };
  
  const getStatusLabel = (status, diffPercent) => {
    switch (status) {
      case 'identical': return 'No changes';
      case 'negligible': return `${diffPercent}% diff (negligible)`;
      case 'minor': return `${diffPercent}% diff (minor)`;
      case 'major': return `${diffPercent}% diff (major)`;
      case 'new': return 'New screenshot';
      case 'removed': return 'Removed';
      default: return 'Unknown';
    }
  };
  
  return `
<div class="visual-regression-container">
  <style>
    .visual-regression-container {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1e293b;
      color: #f1f5f9;
      padding: 2rem;
      border-radius: 12px;
    }
    
    .vr-header {
      margin-bottom: 2rem;
    }
    
    .vr-header h2 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .vr-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .vr-stat {
      background: rgba(255, 255, 255, 0.05);
      padding: 1rem;
      border-radius: 8px;
      text-align: center;
      border: 1px solid rgba(255, 255, 255, 0.1);
      transition: all 0.2s;
    }
    
    .vr-stat:hover {
      border-color: rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.08);
    }
    
    .vr-stat-value {
      font-size: 2rem;
      font-weight: bold;
      margin-bottom: 0.5rem;
    }
    
    .vr-stat-label {
      font-size: 0.875rem;
      color: #94a3b8;
    }
    
    .vr-filters {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }
    
    .vr-filter {
      padding: 0.5rem 1rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      color: #f1f5f9;
      font-size: 0.875rem;
    }
    
    .vr-filter:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    
    .vr-filter.active {
      background: #3b82f6;
      border-color: #3b82f6;
    }
    
    .vr-comparisons {
      display: grid;
      gap: 1.5rem;
    }
    
    .vr-comparison {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 1.5rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
      transition: all 0.2s;
    }
    
    .vr-comparison:hover {
      border-color: rgba(255, 255, 255, 0.2);
    }
    
    .vr-comparison-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }
    
    .vr-comparison-title {
      font-size: 1.1rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .vr-status-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      font-weight: 500;
    }
    
    .vr-images {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    
    .vr-image-container {
      position: relative;
      background: #0f172a;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .vr-image-label {
      position: absolute;
      top: 0.5rem;
      left: 0.5rem;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    
    .vr-image {
      width: 100%;
      height: auto;
      display: block;
      cursor: zoom-in;
    }
    
    .vr-image:hover {
      opacity: 0.9;
    }
    
    .vr-no-changes {
      text-align: center;
      padding: 3rem;
      color: #10b981;
    }
    
    .vr-details {
      margin-top: 1rem;
      font-size: 0.875rem;
      color: #94a3b8;
    }
    
    .vr-details-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
  </style>
  
  <div class="vr-header">
    <h2><span>🖼️</span> Visual Regression Report</h2>
    <p style="color: #94a3b8; margin: 0;">Screenshot comparison between PR and main branch</p>
  </div>
  
  <div class="vr-summary">
    <div class="vr-stat">
      <div class="vr-stat-value" style="color: #10b981;">${report.identical}</div>
      <div class="vr-stat-label">Identical</div>
    </div>
    <div class="vr-stat">
      <div class="vr-stat-value" style="color: #06b6d4;">${report.negligible}</div>
      <div class="vr-stat-label">Negligible</div>
    </div>
    <div class="vr-stat">
      <div class="vr-stat-value" style="color: #f59e0b;">${report.minor}</div>
      <div class="vr-stat-label">Minor Changes</div>
    </div>
    <div class="vr-stat">
      <div class="vr-stat-value" style="color: #ef4444;">${report.major}</div>
      <div class="vr-stat-label">Major Changes</div>
    </div>
    <div class="vr-stat">
      <div class="vr-stat-value" style="color: #3b82f6;">${report.new}</div>
      <div class="vr-stat-label">New</div>
    </div>
    <div class="vr-stat">
      <div class="vr-stat-value" style="color: #8b5cf6;">${report.removed}</div>
      <div class="vr-stat-label">Removed</div>
    </div>
  </div>
  
  ${report.comparisons.filter(c => c.hasDiff).length === 0 ? `
    <div class="vr-no-changes">
      <div style="font-size: 3rem; margin-bottom: 1rem;">✅</div>
      <h3 style="font-size: 1.5rem; margin-bottom: 0.5rem;">No Visual Changes Detected!</h3>
      <p>All screenshots are identical between PR and main branch.</p>
    </div>
  ` : `
    <div class="vr-filters">
      <button class="vr-filter active" onclick="filterVisualRegression('all')">All (${report.totalComparisons})</button>
      <button class="vr-filter" onclick="filterVisualRegression('major')">Major (${report.major})</button>
      <button class="vr-filter" onclick="filterVisualRegression('minor')">Minor (${report.minor})</button>
      <button class="vr-filter" onclick="filterVisualRegression('new')">New (${report.new})</button>
      <button class="vr-filter" onclick="filterVisualRegression('removed')">Removed (${report.removed})</button>
    </div>
    
    <div class="vr-comparisons" id="vr-comparisons">
      ${report.comparisons.filter(c => c.hasDiff).slice(0, 20).map((comp, idx) => `
        <div class="vr-comparison" data-status="${comp.status}">
          <div class="vr-comparison-header">
            <div class="vr-comparison-title">
              <span style="font-size: 1.5rem;">${getStatusIcon(comp.status)}</span>
              ${comp.testName}
            </div>
            <div class="vr-status-badge" style="background: ${getStatusColor(comp.status)}20; color: ${getStatusColor(comp.status)};">
              ${getStatusLabel(comp.status, comp.diffPercent?.toFixed(1))}
            </div>
          </div>
          
          <div class="vr-images">
            ${comp.mainImage ? `
              <div class="vr-image-container">
                <div class="vr-image-label">Main Branch</div>
                <img src="${path.relative(ART, comp.mainImage)}" class="vr-image" loading="lazy" onclick="openImageModal(this.src)">
              </div>
            ` : ''}
            ${comp.prImage ? `
              <div class="vr-image-container">
                <div class="vr-image-label">PR Branch</div>
                <img src="${path.relative(ART, comp.prImage)}" class="vr-image" loading="lazy" onclick="openImageModal(this.src)">
              </div>
            ` : ''}
            ${comp.diffImage && fs.existsSync(comp.diffImage) ? `
              <div class="vr-image-container">
                <div class="vr-image-label">Difference</div>
                <img src="${path.relative(ART, comp.diffImage)}" class="vr-image" loading="lazy" onclick="openImageModal(this.src)">
              </div>
            ` : ''}
          </div>
          
          ${comp.pixelDiff !== undefined ? `
            <div class="vr-details">
              <div class="vr-details-grid">
                <div><strong>Pixels Changed:</strong> ${comp.pixelDiff.toLocaleString()}</div>
                <div><strong>Total Pixels:</strong> ${comp.totalPixels?.toLocaleString() || 'Unknown'}</div>
                ${comp.dimensions ? `
                  <div><strong>Dimensions:</strong> ${comp.dimensions.width}×${comp.dimensions.height}</div>
                ` : ''}
                <div><strong>Method:</strong> ${comp.method || 'ImageMagick'}</div>
              </div>
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
    
    ${report.comparisons.filter(c => c.hasDiff).length > 20 ? `
      <div style="text-align: center; margin-top: 2rem; color: #94a3b8;">
        Showing 20 of ${report.comparisons.filter(c => c.hasDiff).length} comparisons
      </div>
    ` : ''}
  `}
  
  <script>
    function filterVisualRegression(status) {
      const filters = document.querySelectorAll('.vr-filter');
      filters.forEach(f => f.classList.remove('active'));
      event.target.classList.add('active');
      
      const comparisons = document.querySelectorAll('.vr-comparison');
      comparisons.forEach(comp => {
        if (status === 'all' || comp.dataset.status === status) {
          comp.style.display = 'block';
        } else {
          comp.style.display = 'none';
        }
      });
    }
  </script>
</div>
  `;
}

// Generate markdown summary
function generateMarkdownSummary(report) {
  let md = '# Visual Regression Summary\n\n';
  
  if (report.totalComparisons === 0) {
    md += '✅ No screenshots to compare.\n';
    return md;
  }
  
  md += `Total comparisons: ${report.totalComparisons}\n\n`;
  
  md += '## Summary\n\n';
  md += `- ✅ Identical: ${report.identical}\n`;
  md += `- ✓ Negligible (<0.1%): ${report.negligible}\n`;
  md += `- ⚠️ Minor (0.1-1%): ${report.minor}\n`;
  md += `- ❌ Major (>1%): ${report.major}\n`;
  md += `- 🆕 New: ${report.new}\n`;
  md += `- 🗑️ Removed: ${report.removed}\n\n`;
  
  if (report.major > 0) {
    md += '## Major Changes\n\n';
    report.comparisons
      .filter(c => c.status === 'major')
      .slice(0, 5)
      .forEach(c => {
        md += `- **${c.testName}**: ${c.diffPercent.toFixed(1)}% difference\n`;
      });
    md += '\n';
  }
  
  return md;
}

// Run the visual regression analysis
if (require.main === module) {
  generateVisualReport().catch(console.error);
}

module.exports = { generateVisualReport };
