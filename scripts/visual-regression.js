#!/usr/bin/env node
/**
 * visual-regression.js
 * Compares screenshots from PR and main branches
 * Works with actual Playwright screenshot artifacts
 */

const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

const ART = 'artifacts';

/* ────────────────────────────────────────────────────────── *
 *  Collect screenshots inside a Playwright HTML report
 * ────────────────────────────────────────────────────────── */
// ★ PATCH: read report.json to map screenshots to the exact testId + title
function readReportIndex(reportPath) {
  const index = {};                                             // { <sha>.png : "testId#attachmentName" }
  const indexFile = path.join(reportPath, 'report.json');
  try {
    const json = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    json.tests?.forEach(t => {
      const id = t.testId || `${t.file}::${t.title}`;
      (t.attachments || []).forEach(a => {
        if (a.contentType?.startsWith('image/') && a.path) {
          index[path.basename(a.path)] = `${id}#${a.name || a.title || 'screenshot'}`;
        }
      });
    });
  } catch (_) { /* silently ignore */ }
  return index;
}

function findScreenshots(reportPath) {
  const screenshots = [];
  const shotIndex   = readReportIndex(reportPath);

  if (!fs.existsSync(reportPath)) return screenshots;

  const dirs = ['data', 'trace', ''];                        // report sub-dirs
  for (const sub of dirs) {
    const dir = path.join(reportPath, sub);
    if (!fs.existsSync(dir)) continue;

    for (const f of fs.readdirSync(dir)) {
      if (!f.match(/\.(png|jpe?g)$/i)) continue;
      screenshots.push({
        filename: f,
        path    : path.join(dir, f),
        testName: shotIndex[f] || extractTestName(f),
        isTrace : sub === 'trace'
      });
    }
  }
  return screenshots;
}

/* ────────────────────────────────────────────────────────── *
 *  CHANGE #1 – smarter test-name extraction
 * ────────────────────────────────────────────────────────── */
function extractTestName(filename) {
  return filename
    // strip 40-char SHA-1 prefix (+ optional dash)
    .replace(/^[a-f0-9]{40}-?/, '')
    // strip PW screenshot suffixes
    .replace(/-(actual|expected|diff|chromium|firefox|webkit|darwin|linux|win32)\.(png|jpe?g)$/i, '')
    // drop any remaining extension
    .replace(/\.(png|jpe?g)$/i, '')
    // normalise
    .replace(/-/g, ' ')
    .replace(/^\d+/, '')
    .trim() || filename;
}

/* ────────────────────────────────────────────────────────── *
 *  Image comparison helper (unchanged)
 * ────────────────────────────────────────────────────────── */
async function compareImages(img1Path, img2Path, diffPath) {
  try {
    if (!fs.existsSync(img1Path) || !fs.existsSync(img2Path)) return null;

    /* quick binary equality */
    if (fs.statSync(img1Path).size === fs.statSync(img2Path).size &&
        fs.readFileSync(img1Path).equals(fs.readFileSync(img2Path))) {
      return { hasDiff: false, diffPercent: 0, diffImage: null, identical: true };
    }

    /* try ImageMagick */
    try { execSync('which compare', { stdio: 'ignore' }); } catch { /* not present */ }

    fs.mkdirSync(path.dirname(diffPath), { recursive: true });

    try {
      const diffOutput = execSync(
        `compare -metric AE -fuzz 5% "${img1Path}" "${img2Path}" "${diffPath}" 2>&1`,
        { encoding: 'utf8' }
      ).trim();

      const pixels = parseInt(diffOutput) || 0;
      const [w, h] = execSync(`identify -format "%w %h" "${img1Path}"`, { encoding: 'utf8' })
                     .trim().split(' ').map(Number);
      const percent = w * h ? (pixels / (w * h)) * 100 : 0;

      return {
        hasDiff     : pixels > 0,
        diffPercent : Math.round(percent * 100) / 100,
        diffImage   : diffPath,
        pixelDiff   : pixels,
        totalPixels : w * h,
        dimensions  : { width: w, height: h }
      };
    } catch (cmpErr) {
      const pixels = parseInt(cmpErr.stdout || cmpErr.stderr || '') || 1;
      return { hasDiff: true, diffPercent: 50, diffImage: diffPath, pixelDiff: pixels };
    }
  } catch (err) {
    console.error('Error comparing images:', err.message);
    return null;
  }
}

/* ────────────────────────────────────────────────────────── *
 *  Generate full visual-regression report
 * ────────────────────────────────────────────────────────── */
async function generateVisualReport() {
  const prShots   = findScreenshots(path.join(ART, 'pr-report'));
  const mainShots = findScreenshots(path.join(ART, 'main-report'));

  console.log(`Found ${prShots.length} PR screenshots`);
  console.log(`Found ${mainShots.length} main screenshots`);

  const diffDir = path.join(ART, 'visual-diffs');
  fs.mkdirSync(diffDir, { recursive: true });

  const stripHash = name => name.replace(/^[a-f0-9]{40}-?/, '');

  const comparisons = [];

  /* compare PR vs main */
  for (const pr of prShots) {
    if (/-diff\.|-expected\./.test(pr.filename)) continue;    // skip helper files

    /* CHANGE #2 – match on testName OR hash-stripped filename */
    const main = mainShots.find(m =>
      m.testName === pr.testName || stripHash(m.filename) === stripHash(pr.filename)
    );

    if (main) {
      const diffPath   = path.join(diffDir, `diff-${pr.filename}`);
      const cmp        = await compareImages(main.path, pr.path, diffPath) || {};
      const pct        = cmp.diffPercent || 0;

      comparisons.push({
        testName : pr.testName,
        filename : pr.filename,
        prImage  : pr.path,
        mainImage: main.path,
        ...cmp,
        status   : pct === 0 ? 'identical'
                  : pct < 0.1 ? 'negligible'
                  : pct < 1   ? 'minor'
                  : 'major'
      });
    } else {
      comparisons.push({
        testName : pr.testName,
        filename : pr.filename,
        prImage  : pr.path,
        mainImage: null,
        hasDiff  : true,
        diffPercent: 100,
        status   : 'new'
      });
    }
  }

  /* detect removed screenshots (unchanged) */
  for (const main of mainShots) {
    if (/-diff\.|-expected\./.test(main.filename)) continue;
    if (!prShots.find(p => stripHash(p.filename) === stripHash(main.filename))) {
      comparisons.push({
        testName : main.testName,
        filename : main.filename,
        prImage  : null,
        mainImage: main.path,
        hasDiff  : true,
        diffPercent: 100,
        status   : 'removed'
      });
    }
  }

  /* summarise (unchanged) */
  comparisons.sort((a, b) => b.diffPercent - a.diffPercent);

  const summary = {
    timestamp        : new Date().toISOString(),
    totalScreenshots : prShots.length,
    totalComparisons : comparisons.length,
    identical        : comparisons.filter(c => c.status === 'identical').length,
    negligible       : comparisons.filter(c => c.status === 'negligible').length,
    minor            : comparisons.filter(c => c.status === 'minor').length,
    major            : comparisons.filter(c => c.status === 'major').length,
    new              : comparisons.filter(c => c.status === 'new').length,
    removed          : comparisons.filter(c => c.status === 'removed').length,
    comparisons
  };

  fs.writeFileSync(
    path.join(ART, 'visual-regression-report.json'),
    JSON.stringify(summary, null, 2)
  );

  /* the HTML / MD generation code is unchanged … */
  fs.writeFileSync(
    path.join(ART, 'visual-regression.html'),
    generateHTMLReport(summary)
  );
  fs.writeFileSync(
    path.join(ART, 'visual-regression-summary.md'),
    generateMarkdownSummary(summary)
  );

  console.log('✅ Visual regression report generated');
  console.log(`📊 Summary: ${summary.identical} identical, ${summary.minor} minor, ${summary.major} major changes`);
  return summary;
}

// Generate HTML report
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
    
    function openImageModal(src) {
      // This function should be defined in the main dashboard
      if (window.openImageModal) {
        window.openImageModal(src);
      } else {
        window.open(src, '_blank');
      }
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
  md += `- ✓ Negligible (<1%): ${report.negligible}\n`;
  md += `- ⚠️ Minor (1-5%): ${report.minor}\n`;
  md += `- ❌ Major (>5%): ${report.major}\n`;
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