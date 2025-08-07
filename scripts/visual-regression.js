#!/usr/bin/env node
/**
 * visual-regression.js
 * FIXED: Properly extracts test names from Playwright HTML reports
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ART = 'artifacts';

/* ────────────────────────────────────────────────────────── *
 * Parse Playwright HTML report to extract test metadata
 * ────────────────────────────────────────────────────────── */
function parsePlaywrightReport(reportPath) {
  const screenshots = new Map();
  const indexPath = path.join(reportPath, 'index.html');
  
  if (!fs.existsSync(indexPath)) {
    console.log(`❌ No index.html found at ${indexPath}`);
    return screenshots;
  }

  try {
    const html = fs.readFileSync(indexPath, 'utf8');
    
    // Modern Playwright reports embed data in a script tag.
    // This is the most reliable method.
    const reportRegex = /<script type="application\/json" id="playwright-report-data">([\s\S]*?)<\/script>/;
    const reportMatch = html.match(reportRegex);
    
    if (reportMatch) {
      try {
        console.log('Found embedded JSON report data, parsing...');
        const reportData = JSON.parse(reportMatch[1]);
        
        if (reportData && reportData.files) {
          console.log(`Found ${reportData.files.length} test files in JSON.`);
          processReportData(reportData, reportPath, screenshots);
          console.log(`📋 Extracted ${screenshots.size} screenshots from embedded JSON.`);
          return screenshots;
        }
      } catch (e) {
        console.log('Failed to parse embedded JSON report data:', e.message);
      }
    }
    
    // Fallback for older report formats if the above fails
    console.log('Could not find embedded JSON. Trying older fallback methods...');
    const dataRegex = /window\.playwrightReport\s*=\s*({[\s\S]*?});/;
    const dataMatch = html.match(dataRegex);
    
    if (dataMatch) {
      try {
        const reportData = new Function('return ' + dataMatch[1])();
        processReportData(reportData, reportPath, screenshots);
        console.log(`📋 Extracted ${screenshots.size} screenshots from window.playwrightReport object.`);
        return screenshots;
      } catch (e) {
        console.log('Failed to parse window.playwrightReport object.');
      }
    }

  } catch (error) {
    console.error('Error reading or parsing report:', error.message);
  }
  
  console.log('⚠️ Could not extract structured test data. Test names will be "Unknown Test".');
  // Fallback: Just find image files if all parsing fails
  const dataPath = path.join(reportPath, 'data');
  if (fs.existsSync(dataPath)) {
    const files = fs.readdirSync(dataPath);
    files.forEach(file => {
      if (file.endsWith('.png') && !screenshots.has(file)) {
        screenshots.set(file, {
          filename: file,
          path: path.join(dataPath, file),
          testName: 'Unknown Test',
          displayTitle: 'Unknown Test',
          type: file.includes('-diff') ? 'diff' : 
                file.includes('-expected') ? 'expected' : 'actual'
        });
      }
    });
  }
  
  return screenshots;
}

/* ────────────────────────────────────────────────────────── *
 * Process report data structure
 * ────────────────────────────────────────────────────────── */
function processReportData(data, reportPath, screenshots) {
  if (!data.files || !Array.isArray(data.files)) return;

  data.files.forEach((file) => {
    const fileName = file.fileName || 'unknown_file';
    if (file.tests && Array.isArray(file.tests)) {
      file.tests.forEach((test) => {
        processTest(test, [fileName], reportPath, screenshots);
      });
    }
    if (file.suites && Array.isArray(file.suites)) {
        processSuites(file.suites, [fileName], reportPath, screenshots);
    }
  });
}

/* ────────────────────────────────────────────────────────── *
 *  Process test with context to extract proper title
 * ────────────────────────────────────────────────────────── */
function processTestWithContext(test, fileName, reportPath, screenshots) {
  // Extract all title parts from the test path
  const titleParts = [];
  
  // Get file name without extension
  const fileBaseName = path.basename(fileName).replace(/\.(spec|test)\.(js|ts|jsx|tsx)$/, '');
  
  // Add parent titles if available
  if (test.parent) {
    let current = test.parent;
    const parentTitles = [];
    while (current && current.title) {
      parentTitles.unshift(current.title);
      current = current.parent;
    }
    titleParts.push(...parentTitles);
  }
  
  // Add test title
  const testTitle = test.title || test.name || test.fullTitle || 'Unknown Test';
  titleParts.push(testTitle);
  
  // Join all parts for display
  const displayTitle = titleParts.length > 1 ? titleParts.join(' › ') : testTitle;
  
  console.log(`    Processing test: "${displayTitle}"`);
  
  // Process test results
  const results = test.results || test.runs || [];
  
  if (Array.isArray(results)) {
    results.forEach((result, resultIdx) => {
      const attachments = result.attachments || [];
      
      if (Array.isArray(attachments)) {
        attachments.forEach(attachment => {
          if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            const attachmentPath = attachment.path || attachment.name || '';
            const filename = path.basename(attachmentPath);
            
            if (filename && filename.match(/\.(png|jpe?g)$/i)) {
              const fullPath = path.join(reportPath, attachmentPath);
              
              // Determine screenshot type
              let type = 'actual';
              const attachmentName = (attachment.name || '').toLowerCase();
              if (attachmentName.includes('expected') || filename.includes('-expected')) {
                type = 'expected';
              } else if (attachmentName.includes('diff') || filename.includes('-diff')) {
                type = 'diff';
              } else if (attachmentName.includes('actual') || filename.includes('-actual')) {
                type = 'actual';
              }
              
              screenshots.set(filename, {
                filename,
                path: fs.existsSync(fullPath) ? fullPath : path.join(reportPath, 'data', filename),
                testName: testTitle,  // Use the clean test title
                displayTitle: displayTitle,  // Full display title with context
                fullTestName: `${fileBaseName} > ${displayTitle}`,
                testLocation: test.location?.file || fileName || '',
                status: result.status || 'unknown',
                type,
                attachmentName: attachment.name
              });
              
              console.log(`      Found ${type} screenshot: ${filename} for test: "${testTitle}"`);
            }
          }
        });
      }
    });
  }
  
  // Also check if test has direct attachments
  if (test.attachments && Array.isArray(test.attachments)) {
    test.attachments.forEach(attachment => {
      if (attachment.contentType && attachment.contentType.startsWith('image/')) {
        const filename = path.basename(attachment.path || attachment.name || '');
        if (filename) {
          screenshots.set(filename, {
            filename,
            path: path.join(reportPath, attachment.path || `data/${filename}`),
            testName: testTitle,
            displayTitle: displayTitle,
            fullTestName: `${fileBaseName} > ${displayTitle}`,
            type: attachment.name || 'screenshot'
          });
        }
      }
    });
  }
}

/* ────────────────────────────────────────────────────────── *
 * Process test suites recursively
 * ────────────────────────────────────────────────────────── */
function processSuites(suites, parentTitles, reportPath, screenshots) {
  if (!Array.isArray(suites)) return;
  suites.forEach(suite => {
      const currentTitles = [...parentTitles, suite.title];
      if (suite.tests && Array.isArray(suite.tests)) {
          suite.tests.forEach(test => {
              processTest(test, currentTitles, reportPath, screenshots);
          });
      }
      if (suite.suites && Array.isArray(suite.suites)) {
          processSuites(suite.suites, currentTitles, reportPath, screenshots);
      }
  });
}

/* ────────────────────────────────────────────────────────── *
 * Process individual test
 * ────────────────────────────────────────────────────────── */
function processTest(test, suiteTitles, reportPath, screenshots) {
  const displayTitle = [...suiteTitles, test.title].join(' › ');

  const results = test.results || [];
  if (!Array.isArray(results)) return;

  results.forEach(result => {
    const attachments = result.attachments || [];
    if (!Array.isArray(attachments)) return;

    attachments.forEach(attachment => {
      if (attachment.contentType && attachment.contentType.startsWith('image/')) {
        const attachmentPath = attachment.path || attachment.name || '';
        const filename = path.basename(attachmentPath);
        
        if (filename.match(/\.(png|jpe?g)$/i)) {
          const fullPath = path.join(reportPath, attachmentPath);
          
          let type = 'actual';
          const attachmentName = (attachment.name || '').toLowerCase();
          if (attachmentName.includes('expected') || filename.includes('-expected')) {
            type = 'expected';
          } else if (attachmentName.includes('diff') || filename.includes('-diff')) {
            type = 'diff';
          }
          
          screenshots.set(filename, {
            filename,
            path: fs.existsSync(fullPath) ? fullPath : path.join(reportPath, 'data', filename),
            testName: test.title,
            displayTitle: displayTitle,
            status: result.status || 'unknown',
            type,
          });
        }
      }
    });
  });
}

/* ────────────────────────────────────────────────────────── *
 *  Enhanced screenshot discovery with test name extraction
 * ────────────────────────────────────────────────────────── */
function findAllScreenshots(reportPath) {
  console.log(`\n🔍 Searching for screenshots in: ${reportPath}`);
  
  // First try to parse from HTML report
  const screenshots = parsePlaywrightReport(reportPath);
  
  // If we found screenshots with proper test names, return them
  if (screenshots.size > 0) {
    const knownTests = Array.from(screenshots.values()).filter(s => s.testName !== 'Unknown Test');
    console.log(`   Found ${screenshots.size} screenshots (${knownTests.length} with test names)`);
    return screenshots;
  }
  
  // Fallback: scan directory and try to match with trace files
  const dataPath = path.join(reportPath, 'data');
  if (fs.existsSync(dataPath)) {
    const files = fs.readdirSync(dataPath);
    
    // Look for trace files which might contain test information
    const traceFiles = files.filter(f => f.endsWith('.zip'));
    console.log(`   Found ${traceFiles.length} trace files`);
    
    // Process PNG files
    files.forEach(file => {
      if (file.endsWith('.png') && !screenshots.has(file)) {
        screenshots.set(file, {
          filename: file,
          path: path.join(dataPath, file),
          testName: 'Unknown Test',
          type: file.includes('-diff') ? 'diff' : 
                file.includes('-expected') ? 'expected' : 'actual'
        });
      }
    });
  }
  
  return screenshots;
}

/* ────────────────────────────────────────────────────────── *
 *  Image comparison function (unchanged)
 * ────────────────────────────────────────────────────────── */
async function compareImages(img1Path, img2Path, diffPath) {
  try {
    if (!fs.existsSync(img1Path) || !fs.existsSync(img2Path)) {
      return null;
    }

    // Quick binary comparison
    const buf1 = fs.readFileSync(img1Path);
    const buf2 = fs.readFileSync(img2Path);
    
    if (buf1.length === buf2.length && buf1.equals(buf2)) {
      return { hasDiff: false, diffPercent: 0, identical: true };
    }

    // Check if ImageMagick is available
    try {
      execSync('which compare', { stdio: 'ignore' });
    } catch {
      console.warn('⚠️  ImageMagick not found, using size comparison only');
      const sizeDiff = Math.abs(buf1.length - buf2.length) / Math.max(buf1.length, buf2.length);
      return { 
        hasDiff: true, 
        diffPercent: sizeDiff * 100, 
        method: 'size-only' 
      };
    }

    // Use ImageMagick for detailed comparison
    fs.mkdirSync(path.dirname(diffPath), { recursive: true });

    try {
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
      // ImageMagick returns non-zero exit code when images differ
      const stderr = err.stderr || err.stdout || '';
      const pixels = parseInt(stderr) || 1;
      
      return {
        hasDiff: true,
        diffPercent: 50,
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
 * Match and compare screenshots (updated)
 * ────────────────────────────────────────────────────────── */
async function matchAndCompareScreenshots(prScreenshots, mainScreenshots) {
  const comparisons = [];
  const mainScreenshotsMap = new Map(Array.from(mainScreenshots.values()).map(s => [s.displayTitle, s]));

  const prActuals = Array.from(prScreenshots.values()).filter(s => s.type === 'actual');

  console.log(`\n📊 Actual screenshots to compare: ${prActuals.length}`);

  const diffDir = path.join(ART, 'visual-diffs');
  fs.mkdirSync(diffDir, { recursive: true });

  for (const prShot of prActuals) {
    const mainShot = mainScreenshotsMap.get(prShot.displayTitle);
    const testName = prShot.displayTitle || 'Unknown Test';

    if (mainShot) {
      // Found a match by test name
      const diffPath = path.join(diffDir, `diff-${prShot.filename}`);
      console.log(`   Comparing: ${testName}`);
      const result = await compareImages(mainShot.path, prShot.path, diffPath);
      
      if (result) {
        const diffPercent = result.diffPercent || 0;
        comparisons.push({
          testName,
          filename: prShot.filename,
          prImage: prShot.path,
          mainImage: mainShot.path,
          ...result,
          status: diffPercent === 0 ? 'identical' : diffPercent < 1 ? 'minor' : 'major'
        });
      }
      mainScreenshotsMap.delete(prShot.displayTitle); // Remove from map to find removed tests later
    } else {
      // No match found, this is a new screenshot
      comparisons.push({
        testName,
        filename: prShot.filename,
        prImage: prShot.path,
        mainImage: null,
        hasDiff: true,
        diffPercent: 100,
        status: 'new'
      });
    }
  }

  // Any remaining screenshots in the main map were removed in the PR
  for (const mainShot of mainScreenshotsMap.values()) {
    if (mainShot.type === 'actual') {
        comparisons.push({
            testName: mainShot.displayTitle || 'Unknown Test',
            filename: mainShot.filename,
            prImage: null,
            mainImage: mainShot.path,
            hasDiff: true,
            diffPercent: 100,
            status: 'removed'
        });
    }
  }

  return comparisons;
}

/* ────────────────────────────────────────────────────────── *
 * HTML report generation (with fixed script)
 * ────────────────────────────────────────────────────────── */
function generateHTMLReport(report) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'identical': return '#10b981';
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
      case 'minor': return `${diffPercent}% diff (minor)`;
      case 'major': return `${diffPercent}% diff (major)`;
      case 'new': return 'New screenshot';
      case 'removed': return 'Removed';
      default: return 'Unknown';
    }
  };
  
  // The HTML structure remains largely the same, but the <script> part is fixed.
  return `
<div class="visual-regression-container">
  <style>
    /* CSS styles remain the same as your original */
    .visual-regression-container { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1e293b; color: #f1f5f9; padding: 2rem; border-radius: 12px; }
    .vr-header h2 { font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; }
    .vr-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .vr-stat { background: rgba(255, 255, 255, 0.05); padding: 1rem; border-radius: 8px; text-align: center; border: 1px solid rgba(255, 255, 255, 0.1); }
    .vr-stat-value { font-size: 2rem; font-weight: bold; margin-bottom: 0.5rem; }
    .vr-stat-label { font-size: 0.875rem; color: #94a3b8; }
    .vr-filters { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
    .vr-filter { padding: 0.5rem 1rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; cursor: pointer; color: #f1f5f9; font-size: 0.875rem; }
    .vr-filter.active { background: #3b82f6; border-color: #3b82f6; }
    .vr-comparison { background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 1.5rem; border: 1px solid rgba(255, 255, 255, 0.1); }
    .vr-comparison-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem; }
    .vr-comparison-title { font-size: 1.1rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
    .vr-status-badge { padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 500; }
    .vr-images { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; margin-top: 1rem; }
    .vr-image-container { position: relative; background: #0f172a; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1); }
    .vr-image-label { position: absolute; top: 0.5rem; left: 0.5rem; background: rgba(0, 0, 0, 0.8); color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; z-index: 1; }
    .vr-image { width: 100%; height: auto; display: block; cursor: zoom-in; }
  </style>
  
  <div class="vr-header">
    <h2><span>🖼️</span> Visual Regression Report</h2>
    <p style="color: #94a3b8; margin: 0;">Screenshot comparison between PR and main branch</p>
  </div>
  
  <div class="vr-summary">
    <div class="vr-stat"><div class="vr-stat-value" style="color: #10b981;">${report.identical}</div><div class="vr-stat-label">Identical</div></div>
    <div class="vr-stat"><div class="vr-stat-value" style="color: #f59e0b;">${report.minor}</div><div class="vr-stat-label">Minor Changes</div></div>
    <div class="vr-stat"><div class="vr-stat-value" style="color: #ef4444;">${report.major}</div><div class="vr-stat-label">Major Changes</div></div>
    <div class="vr-stat"><div class="vr-stat-value" style="color: #3b82f6;">${report.new}</div><div class="vr-stat-label">New</div></div>
    <div class="vr-stat"><div class="vr-stat-value" style="color: #8b5cf6;">${report.removed}</div><div class="vr-stat-label">Removed</div></div>
  </div>
  
  <div class="vr-filters">
    <button class="vr-filter active" onclick="filterVisualRegression(this, 'all')">All (${report.totalComparisons})</button>
    <button class="vr-filter" onclick="filterVisualRegression(this, 'major')">Major (${report.major})</button>
    <button class="vr-filter" onclick="filterVisualRegression(this, 'minor')">Minor (${report.minor})</button>
    <button class="vr-filter" onclick="filterVisualRegression(this, 'identical')">Identical (${report.identical})</button>
    <button class="vr-filter" onclick="filterVisualRegression(this, 'new')">New (${report.new})</button>
    <button class="vr-filter" onclick="filterVisualRegression(this, 'removed')">Removed (${report.removed})</button>
  </div>
  
  <div class="vr-comparisons" id="vr-comparisons">
    ${report.comparisons.map((comp) => `
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
          ${comp.mainImage ? `<div class="vr-image-container"><div class="vr-image-label">Main Branch</div><img src="${path.relative(ART, comp.mainImage)}" class="vr-image" loading="lazy"></div>` : ''}
          ${comp.prImage ? `<div class="vr-image-container"><div class="vr-image-label">PR Branch</div><img src="${path.relative(ART, comp.prImage)}" class="vr-image" loading="lazy"></div>` : ''}
          ${comp.diffImage && fs.existsSync(comp.diffImage) ? `<div class="vr-image-container"><div class="vr-image-label">Difference</div><img src="${path.relative(ART, comp.diffImage)}" class="vr-image" loading="lazy"></div>` : ''}
        </div>
      </div>
    `).join('')}
  </div>
  
  <!-- ### START: SCRIPT FIX ### -->
  <script>
    function filterVisualRegression(buttonElement, status) {
      // Deactivate all filter buttons
      const filters = document.querySelectorAll('.vr-filter');
      filters.forEach(f => f.classList.remove('active'));
      
      // Activate the clicked button
      buttonElement.classList.add('active');
      
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
  <!-- ### END: SCRIPT FIX ### -->
</div>
  `;
}

/* ────────────────────────────────────────────────────────── *
 * Main visual regression analysis
 * ────────────────────────────────────────────────────────── */
async function generateVisualReport() {
  console.log('🔍 Starting visual regression analysis...');
  
  const prReportPath = path.join(ART, 'pr-report');
  const mainReportPath = path.join(ART, 'main-report');
  
  if (!fs.existsSync(prReportPath) || !fs.existsSync(mainReportPath)) {
    console.error('❌ One or both report directories not found. Cannot perform visual comparison.');
    return;
  }
  
  const prScreenshots = parsePlaywrightReport(prReportPath);
  const mainScreenshots = parsePlaywrightReport(mainReportPath);
  
  const comparisons = await matchAndCompareScreenshots(prScreenshots, mainScreenshots);
  comparisons.sort((a, b) => (b.diffPercent || 0) - (a.diffPercent || 0));
  
  const summary = {
    totalComparisons: comparisons.length,
    identical: comparisons.filter(c => c.status === 'identical').length,
    minor: comparisons.filter(c => c.status === 'minor').length,
    major: comparisons.filter(c => c.status === 'major').length,
    new: comparisons.filter(c => c.status === 'new').length,
    removed: comparisons.filter(c => c.status === 'removed').length,
    comparisons
  };
  
  fs.writeFileSync(path.join(ART, 'visual-regression-report.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(ART, 'visual-regression.html'), generateHTMLReport(summary));
  
  console.log('✅ Visual regression report generated successfully.');
}

if (require.main === module) {
  generateVisualReport().catch(error => {
    console.error('❌ Error during visual regression analysis:', error);
    process.exit(1);
  });
}

/* ────────────────────────────────────────────────────────── *
 *  Generate markdown summary
 * ────────────────────────────────────────────────────────── */
function generateMarkdownSummary(report) {
  let md = '# Visual Regression Summary\n\n';
  
  if (report.totalScreenshots === 0) {
    md += '⚠️ **No screenshots found.**\n\n';
    md += 'Make sure your Playwright tests are configured to capture screenshots:\n';
    md += '- Set `screenshot: "on"` in your Playwright config\n';
    md += '- Or use `await page.screenshot()` in your tests\n';
    return md;
  }
  
  if (report.totalComparisons === 0) {
    md += '⚠️ **No screenshots to compare.**\n\n';
    md += 'Screenshots were found but could not be matched between branches.\n';
    return md;
  }
  
  md += `**Total comparisons:** ${report.totalComparisons}\n\n`;
  
  // Summary table
  md += '## Summary\n\n';
  md += '| Status | Count | Description |\n';
  md += '|--------|-------|-------------|\n';
  md += `| ✅ Identical | ${report.identical} | No visual changes |\n`;
  md += `| ✓ Negligible | ${report.negligible} | Less than 0.1% difference |\n`;
  md += `| ⚠️ Minor | ${report.minor} | 0.1% to 1% difference |\n`;
  md += `| ❌ Major | ${report.major} | More than 1% difference |\n`;
  md += `| 🆕 New | ${report.new} | New screenshots in PR |\n`;
  md += `| 🗑️ Removed | ${report.removed} | Screenshots removed in PR |\n\n`;
  
  // Overall status
  if (report.major === 0 && report.minor === 0 && report.new === 0 && report.removed === 0) {
    md += '### ✅ No Visual Changes\n\n';
    md += 'All screenshots are identical between PR and main branch.\n\n';
  } else {
    md += '### 🔍 Visual Changes Detected\n\n';
    
    if (report.major > 0) {
      md += `**${report.major} major changes** detected (>1% pixel difference)\n\n`;
    }
    
    if (report.minor > 0) {
      md += `**${report.minor} minor changes** detected (0.1-1% pixel difference)\n\n`;
    }
    
    if (report.new > 0) {
      md += `**${report.new} new screenshots** in PR branch\n\n`;
    }
    
    if (report.removed > 0) {
      md += `**${report.removed} screenshots removed** from PR branch\n\n`;
    }
  }
  
  // Top changes
  const significantChanges = report.comparisons
    .filter(c => c.status === 'major' || c.status === 'minor')
    .slice(0, 5);
  
  if (significantChanges.length > 0) {
    md += '## Top Changes\n\n';
    significantChanges.forEach((comp, idx) => {
      md += `${idx + 1}. **${comp.testName}**\n`;
      md += `   - Status: ${comp.status}\n`;
      md += `   - Difference: ${comp.diffPercent?.toFixed(2)}%\n`;
      if (comp.pixelDiff !== undefined) {
        md += `   - Pixels changed: ${comp.pixelDiff.toLocaleString()}\n`;
      }
      md += '\n';
    });
  }
  
  return md;
}

/* ────────────────────────────────────────────────────────── *
 *  Debugging helper
 * ────────────────────────────────────────────────────────── */
function debugScreenshots() {
  console.log('\n🔍 DEBUG: Screenshot Analysis\n');
  
  const prReportPath = path.join(ART, 'pr-report');
  const mainReportPath = path.join(ART, 'main-report');
  
  // Check PR screenshots
  console.log('PR Report:');
  if (fs.existsSync(path.join(prReportPath, 'data'))) {
    const files = fs.readdirSync(path.join(prReportPath, 'data'))
      .filter(f => f.endsWith('.png'));
    console.log(`  Found ${files.length} PNG files`);
    console.log(`  Sample:`, files.slice(0, 3));
  } else {
    console.log('  No data directory found');
  }
  
  // Check Main screenshots
  console.log('\nMain Report:');
  if (fs.existsSync(path.join(mainReportPath, 'data'))) {
    const files = fs.readdirSync(path.join(mainReportPath, 'data'))
      .filter(f => f.endsWith('.png'));
    console.log(`  Found ${files.length} PNG files`);
    console.log(`  Sample:`, files.slice(0, 3));
    } else {
    console.log('  No data directory found');
  }

  // Try to inspect the HTML report structure
  console.log('\n📄 Inspecting HTML report structure:');
  const indexPath = path.join(prReportPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    const html = fs.readFileSync(indexPath, 'utf8');
    console.log(`  HTML file size: ${(html.length / 1024).toFixed(1)} KB`);

    // Check for various report data patterns
    console.log('  Checking for report data patterns:');
    console.log(`    - window.playwrightReport: ${html.includes('window.playwrightReport') ? '✓' : '✗'}`);
    console.log(`    - window.playwrightReportBase64: ${html.includes('window.playwrightReportBase64') ? '✓' : '✗'}`);
    console.log(`    - __playwright_report__: ${html.includes('__playwright_report__') ? '✓' : '✗'}`);
    console.log(`    - data-testid="test-case-title": ${html.includes('data-testid="test-case-title"') ? '✓' : '✗'}`);

    // Try to find test titles in HTML
    const testTitleRegex = /data-testid="test-case-title"[^>]*>([^<]+)</gi;
    const titles = [];
    let titleMatch;
    while ((titleMatch = testTitleRegex.exec(html)) !== null && titles.length < 5) {
      titles.push(titleMatch[1].trim());
    }

    if (titles.length > 0) {
      console.log(`  Found test titles in HTML:`);
      titles.forEach(title => console.log(`    - "${title}"`));
    }

    // Save a snippet of the HTML for manual inspection
    const snippet = html.substring(0, 2000);
    fs.writeFileSync(path.join(ART, 'html-snippet.txt'), snippet);
    console.log(`  Saved HTML snippet to artifacts/html-snippet.txt for inspection`);
  }

  console.log('\n');
}

/* ────────────────────────────────────────────────────────── *
 *  Run when called directly
 * ────────────────────────────────────────────────────────── */
if (require.main === module) {
  // Run debug info first
  debugScreenshots();
  
  // Run visual regression analysis
  generateVisualReport().catch(error => {
    console.error('❌ Error during visual regression analysis:', error);
    process.exit(1);
  });
}

module.exports = { generateVisualReport };
