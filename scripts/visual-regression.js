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
 *  Parse Playwright HTML report to extract test metadata
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
    
    // Method 1: Try to extract from the embedded app data
    const appDataRegex = /window\.playwrightReportBase64\s*=\s*"([^"]+)"/;
    const appDataMatch = html.match(appDataRegex);
    
    if (appDataMatch) {
      try {
        const decodedData = Buffer.from(appDataMatch[1], 'base64').toString('utf8');
        const reportData = JSON.parse(decodedData);
        
        if (reportData.files) {
          reportData.files.forEach(file => {
            file.tests?.forEach(test => {
              test.results?.forEach(result => {
                result.attachments?.forEach(attachment => {
                  if (attachment.contentType?.startsWith('image/')) {
                    const filename = path.basename(attachment.path || '');
                    if (filename) {
                      screenshots.set(filename, {
                        filename,
                        path: path.join(reportPath, attachment.path || `data/${filename}`),
                        testName: test.title || 'Unknown Test',
                        testLocation: test.location?.file || file.fileName || '',
                        status: result.status,
                        type: attachment.name || 'screenshot'
                      });
                    }
                  }
                });
              });
            });
          });
        }
        
        console.log(`📋 Extracted ${screenshots.size} screenshots from base64 data`);
        return screenshots;
      } catch (e) {
        console.log('Failed to parse base64 data, trying alternative methods...');
      }
    }
    
    // Method 2: Try to find the bundled data object
    const dataRegex = /window\.playwrightReportData\s*=\s*({[\s\S]*?});/;
    const dataMatch = html.match(dataRegex);
    
    if (dataMatch) {
      try {
        // Use Function constructor to safely evaluate the JavaScript object
        const reportData = new Function('return ' + dataMatch[1])();
        processReportData(reportData, reportPath, screenshots);
        console.log(`📋 Extracted ${screenshots.size} screenshots from report data`);
        return screenshots;
      } catch (e) {
        console.log('Failed to parse report data object');
      }
    }
    
    // Method 3: Parse the bundled script content
    const scriptRegex = /<script[^>]*>[\s\S]*?const\s+(?:data|testData|report)\s*=\s*({[\s\S]*?});[\s\S]*?<\/script>/;
    const scriptMatch = html.match(scriptRegex);
    
    if (scriptMatch) {
      try {
        const cleanedData = scriptMatch[1]
          .replace(/(\w+):/g, '"$1":')
          .replace(/'/g, '"')
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');
        
        const reportData = JSON.parse(cleanedData);
        processReportData(reportData, reportPath, screenshots);
        console.log(`📋 Extracted ${screenshots.size} screenshots from script data`);
        return screenshots;
      } catch (e) {
        console.log('Failed to parse script data');
      }
    }
    
    // Method 4: Look for app.js file
    const appJsPath = path.join(reportPath, 'app.js');
    if (fs.existsSync(appJsPath)) {
      const appJs = fs.readFileSync(appJsPath, 'utf8');
      const testDataRegex = /tests:\s*\[([\s\S]*?)\]/;
      const testMatch = appJs.match(testDataRegex);
      
      if (testMatch) {
        // Extract test data from app.js
        console.log('Found test data in app.js');
      }
    }
    
    // Fallback: Just find image references without test names
    const imgRegex = /data\/([a-f0-9]{40})(-[a-z]+)?\.png/gi;
    let match;
    const imageRefs = new Map();
    
    while ((match = imgRegex.exec(html)) !== null) {
      const hash = match[1];
      const suffix = match[2] || '';
      const filename = `${hash}${suffix}.png`;
      imageRefs.set(filename, true);
    }
    
    // Try to extract test information from the HTML structure
    const testBlockRegex = /<div[^>]*class="[^"]*test[^"]*"[^>]*>[\s\S]*?<\/div>/gi;
    const testBlocks = html.match(testBlockRegex) || [];
    
    // For each image reference, try to find associated test name
    for (const [filename, _] of imageRefs) {
      const fullPath = path.join(reportPath, 'data', filename);
      
      if (fs.existsSync(fullPath)) {
        let testName = 'Unknown Test';
        
        // Try to find test name in nearby HTML
        const fileRegex = new RegExp(`${filename}[^>]*>([^<]+)<`, 'i');
        const nameMatch = html.match(fileRegex);
        if (nameMatch && nameMatch[1]) {
          testName = nameMatch[1].trim();
        }
        
        screenshots.set(filename, {
          filename,
          path: fullPath,
          testName,
          type: filename.includes('-diff') ? 'diff' : 
                filename.includes('-expected') ? 'expected' : 'actual'
        });
      }
    }
    
  } catch (error) {
    console.error('Error parsing report:', error.message);
  }
  
  // Final fallback: scan data directory
  const dataPath = path.join(reportPath, 'data');
  if (fs.existsSync(dataPath)) {
    const files = fs.readdirSync(dataPath);
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
 *  Process report data structure
 * ────────────────────────────────────────────────────────── */
function processReportData(data, reportPath, screenshots) {
  // Handle files array
  if (data.files && Array.isArray(data.files)) {
    data.files.forEach(file => {
      if (file.tests && Array.isArray(file.tests)) {
        file.tests.forEach(test => {
          processTest(test, file.fileName || '', reportPath, screenshots);
        });
      }
    });
  }
  
  // Handle tests array directly
  if (data.tests && Array.isArray(data.tests)) {
    data.tests.forEach(test => {
      processTest(test, '', reportPath, screenshots);
    });
  }
  
  // Handle suites structure
  if (data.suites && Array.isArray(data.suites)) {
    processSuites(data.suites, reportPath, screenshots);
  }
  
  // Handle projects structure (Playwright 1.20+)
  if (data.projects && Array.isArray(data.projects)) {
    data.projects.forEach(project => {
      if (project.suites) {
        processSuites(project.suites, reportPath, screenshots, project.name);
      }
    });
  }
}

/* ────────────────────────────────────────────────────────── *
 *  Process test suites recursively
 * ────────────────────────────────────────────────────────── */
function processSuites(suites, reportPath, screenshots, parentPath = '') {
  if (!Array.isArray(suites)) return;
  
  suites.forEach(suite => {
    const suitePath = parentPath ? `${parentPath} > ${suite.title}` : suite.title;
    
    // Process tests in this suite
    if (suite.tests && Array.isArray(suite.tests)) {
      suite.tests.forEach(test => {
        processTest(test, suitePath, reportPath, screenshots);
      });
    }
    
    // Process specs (another common structure)
    if (suite.specs && Array.isArray(suite.specs)) {
      suite.specs.forEach(spec => {
        processTest(spec, suitePath, reportPath, screenshots);
      });
    }
    
    // Recursively process nested suites
    if (suite.suites && Array.isArray(suite.suites)) {
      processSuites(suite.suites, reportPath, screenshots, suitePath);
    }
  });
}

/* ────────────────────────────────────────────────────────── *
 *  Process individual test
 * ────────────────────────────────────────────────────────── */
function processTest(test, suitePath, reportPath, screenshots) {
  // Get the test title - check multiple possible properties
  const testTitle = test.title || test.name || test.fullTitle || 'Unknown Test';
  const fullTestName = suitePath ? `${suitePath} > ${testTitle}` : testTitle;
  
  // Process test results
  const results = test.results || test.runs || [];
  
  if (Array.isArray(results)) {
    results.forEach(result => {
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
                testName: testTitle,  // Use just the test title, not the full path
                fullTestName: fullTestName,  // Keep full path for reference
                testLocation: test.location?.file || suitePath || '',
                status: result.status || 'unknown',
                type,
                attachmentName: attachment.name
              });
              
              console.log(`   Found screenshot for test: "${testTitle}"`);
            }
          }
        });
      }
    });
  }
  
  // Also check if test has direct attachments (some Playwright versions)
  if (test.attachments && Array.isArray(test.attachments)) {
    test.attachments.forEach(attachment => {
      if (attachment.contentType && attachment.contentType.startsWith('image/')) {
        const filename = path.basename(attachment.path || attachment.name || '');
        if (filename) {
          screenshots.set(filename, {
            filename,
            path: path.join(reportPath, attachment.path || `data/${filename}`),
            testName: testTitle,
            fullTestName: fullTestName,
            type: attachment.name || 'screenshot'
          });
        }
      }
    });
  }
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
 *  Match and compare screenshots (updated)
 * ────────────────────────────────────────────────────────── */
async function matchAndCompareScreenshots(prScreenshots, mainScreenshots) {
  const comparisons = [];
  const unmatchedPR = new Set(prScreenshots.keys());
  const unmatchedMain = new Set(mainScreenshots.keys());
  
  // Filter to actual screenshots only
  const prActual = new Map();
  const mainActual = new Map();
  
  for (const [filename, info] of prScreenshots) {
    if (info.type === 'actual' || (!info.type && !filename.includes('-diff') && !filename.includes('-expected'))) {
      prActual.set(filename, info);
    }
  }
  
  for (const [filename, info] of mainScreenshots) {
    if (info.type === 'actual' || (!info.type && !filename.includes('-diff') && !filename.includes('-expected'))) {
      mainActual.set(filename, info);
    }
  }
  
  console.log(`\n📊 Actual screenshots to compare:`);
  console.log(`   PR: ${prActual.size}`);
  console.log(`   Main: ${mainActual.size}`);
  
  // Try content-based matching
  const matches = [];
  const prList = Array.from(prActual.values());
  const mainList = Array.from(mainActual.values());
  
  for (let i = 0; i < prList.length; i++) {
    const prShot = prList[i];
    let bestMatch = null;
    let bestScore = Infinity;
    
    for (let j = 0; j < mainList.length; j++) {
      const mainShot = mainList[j];
      
      // Skip if already matched
      if (matches.some(m => m.main === mainShot)) continue;
      
      // Quick size comparison
      try {
        const prStat = fs.statSync(prShot.path);
        const mainStat = fs.statSync(mainShot.path);
        const sizeDiff = Math.abs(prStat.size - mainStat.size) / Math.max(prStat.size, mainStat.size);
        
        // If size difference is too large, skip
        if (sizeDiff > 0.3) continue;
        
        // Use size difference as initial score
        if (sizeDiff < bestScore) {
          bestScore = sizeDiff;
          bestMatch = mainShot;
        }
      } catch (e) {
        // Skip if can't read file
      }
    }
    
    if (bestMatch && bestScore < 0.2) {
      matches.push({ pr: prShot, main: bestMatch });
      unmatchedPR.delete(prShot.filename);
      unmatchedMain.delete(bestMatch.filename);
    }
  }
  
  console.log(`\n🔗 Matched ${matches.length} screenshot pairs`);
  
  // Process matched screenshots
  const diffDir = path.join(ART, 'visual-diffs');
  fs.mkdirSync(diffDir, { recursive: true });
  
  for (const match of matches) {
    // Use the test name from PR screenshot (should be the actual test title now)
    const testName = match.pr.testName || match.main.testName || 'Unknown Test';
    const diffPath = path.join(diffDir, `diff-${path.basename(match.pr.filename)}`);
    
    console.log(`   Comparing: ${testName}`);
    const result = await compareImages(match.main.path, match.pr.path, diffPath);
    
    if (result) {
      const diffPercent = result.diffPercent || 0;
      comparisons.push({
        testName,  // This should now be the actual test name like "should allow me to add todo items"
        filename: match.pr.filename,
        prImage: match.pr.path,
        mainImage: match.main.path,
        ...result,
        status: diffPercent === 0 ? 'identical' :
                diffPercent < 0.1 ? 'negligible' :
                diffPercent < 1 ? 'minor' : 'major'
      });
      console.log(`     -> ${result.diffPercent}% difference`);
    }
  }
  
  // Handle unmatched screenshots
  for (const filename of unmatchedPR) {
    const info = prActual.get(filename);
    if (info) {
      comparisons.push({
        testName: info.testName || 'Unknown Test',
        filename: info.filename,
        prImage: info.path,
        mainImage: null,
        hasDiff: true,
        diffPercent: 100,
        status: 'new'
      });
    }
  }
  
  for (const filename of unmatchedMain) {
    const info = mainActual.get(filename);
    if (info) {
      comparisons.push({
        testName: info.testName || 'Unknown Test',
        filename: info.filename,
        prImage: null,
        mainImage: info.path,
        hasDiff: true,
        diffPercent: 100,
        status: 'removed'
      });
    }
  }
  
  return comparisons;
}

/* ────────────────────────────────────────────────────────── *
 *  HTML report generation (complete version)
 * ────────────────────────────────────────────────────────── */
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
      flex-wrap: wrap;
      gap: 1rem;
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
      z-index: 1;
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
    
    .vr-no-screenshots {
      text-align: center;
      padding: 3rem;
      color: #f59e0b;
    }
  </style>
  
  <div class="vr-header">
    <h2><span>🖼️</span> Visual Regression Report</h2>
    <p style="color: #94a3b8; margin: 0;">Screenshot comparison between PR and main branch</p>
  </div>
  
  ${report.totalScreenshots === 0 ? `
    <div class="vr-no-screenshots">
      <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
      <h3 style="font-size: 1.5rem; margin-bottom: 0.5rem;">No Screenshots Found</h3>
      <p>Make sure your tests are configured to capture screenshots.</p>
      <p style="margin-top: 1rem; font-size: 0.875rem;">
        Add <code>screenshot: 'on'</code> to your Playwright config or use <code>await page.screenshot()</code> in your tests.
      </p>
    </div>
  ` : `
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
    
    ${report.comparisons.filter(c => c.hasDiff).length === 0 && report.identical > 0 ? `
      <div class="vr-no-changes">
        <div style="font-size: 3rem; margin-bottom: 1rem;">✅</div>
        <h3 style="font-size: 1.5rem; margin-bottom: 0.5rem;">No Visual Changes Detected!</h3>
        <p>All ${report.identical} screenshots are identical between PR and main branch.</p>
      </div>
    ` : `
      <div class="vr-filters">
        <button class="vr-filter active" onclick="filterVisualRegression('all')">All (${report.totalComparisons})</button>
        ${report.major > 0 ? `<button class="vr-filter" onclick="filterVisualRegression('major')">Major (${report.major})</button>` : ''}
        ${report.minor > 0 ? `<button class="vr-filter" onclick="filterVisualRegression('minor')">Minor (${report.minor})</button>` : ''}
        ${report.identical > 0 ? `<button class="vr-filter" onclick="filterVisualRegression('identical')">Identical (${report.identical})</button>` : ''}
        ${report.new > 0 ? `<button class="vr-filter" onclick="filterVisualRegression('new')">New (${report.new})</button>` : ''}
        ${report.removed > 0 ? `<button class="vr-filter" onclick="filterVisualRegression('removed')">Removed (${report.removed})</button>` : ''}
      </div>
      
      <div class="vr-comparisons" id="vr-comparisons">
        ${report.comparisons.map((comp, idx) => `
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
            
            ${comp.pixelDiff !== undefined && comp.status !== 'new' && comp.status !== 'removed' ? `
              <div class="vr-details">
                <div class="vr-details-grid">
                  <div><strong>Pixels Changed:</strong> ${comp.pixelDiff.toLocaleString()}</div>
                  <div><strong>Total Pixels:</strong> ${comp.totalPixels?.toLocaleString() || 'Unknown'}</div>
                  ${comp.dimensions ? `
                    <div><strong>Dimensions:</strong> ${comp.dimensions.width}×${comp.dimensions.height}</div>
                  ` : ''}
                  ${comp.method ? `
                    <div><strong>Method:</strong> ${comp.method}</div>
                  ` : ''}
                </div>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `}
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
      // Try parent window first (if in iframe)
      if (window.parent && window.parent.openImageModal) {
        window.parent.openImageModal(src);
      } else if (window.openImageModal) {
        window.openImageModal(src);
      } else {
        // Fallback: open in new tab
        window.open(src, '_blank');
      }
    }
  </script>
</div>
  `;
}

/* ────────────────────────────────────────────────────────── *
 *  Main visual regression analysis
 * ────────────────────────────────────────────────────────── */
async function generateVisualReport() {
  console.log('🔍 Starting visual regression analysis...');
  console.log('📁 Working directory:', process.cwd());
  console.log('📁 Artifacts directory:', ART);
  
  // Find screenshots in both reports
  const prReportPath = path.join(ART, 'pr-report');
  const mainReportPath = path.join(ART, 'main-report');
  
  console.log('\n📊 Checking report paths:');
  console.log(`   PR Report: ${prReportPath} (exists: ${fs.existsSync(prReportPath)})`);
  console.log(`   Main Report: ${mainReportPath} (exists: ${fs.existsSync(mainReportPath)})`);
  
  if (!fs.existsSync(prReportPath) || !fs.existsSync(mainReportPath)) {
    console.error('❌ One or both report directories not found');
    return {
      timestamp: new Date().toISOString(),
      totalScreenshots: 0,
      totalComparisons: 0,
      identical: 0,
      negligible: 0,
      minor: 0,
      major: 0,
      new: 0,
      removed: 0,
      comparisons: []
    };
  }
  
  // Find all screenshots
  console.log('\n🔍 Finding screenshots...');
  const prScreenshots = findAllScreenshots(prReportPath);
  const mainScreenshots = findAllScreenshots(mainReportPath);
  
  console.log(`\n📸 Screenshots found:`);
  console.log(`   PR: ${prScreenshots.size} total`);
  console.log(`   Main: ${mainScreenshots.size} total`);
  
  if (prScreenshots.size === 0 && mainScreenshots.size === 0) {
    console.error('❌ No screenshots found in either report');
    console.log('\n💡 Tips:');
    console.log('   - Make sure your Playwright config has: screenshot: "on"');
    console.log('   - Or add explicit screenshots in your tests: await page.screenshot()');
    console.log('   - Check that tests are actually running and not skipped');
  }
  
  // Match and compare screenshots
  const comparisons = await matchAndCompareScreenshots(prScreenshots, mainScreenshots);
  
  // Sort by difference percentage (highest first)
  comparisons.sort((a, b) => b.diffPercent - a.diffPercent);
  
  // Create summary
  const summary = {
    timestamp: new Date().toISOString(),
    totalScreenshots: prScreenshots.size,
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
  console.log(`   Negligible: ${summary.negligible}`);
  console.log(`   Minor: ${summary.minor}`);
  console.log(`   Major: ${summary.major}`);
  console.log(`   New: ${summary.new}`);
  console.log(`   Removed: ${summary.removed}`);
  
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
  const markdownSummary = generateMarkdownSummary(summary);
  fs.writeFileSync(
    path.join(ART, 'visual-regression-summary.md'),
    markdownSummary
  );
  
  console.log('\n✅ Visual regression report generated');
  console.log('📄 Files created:');
  console.log('   - artifacts/visual-regression-report.json');
  console.log('   - artifacts/visual-regression.html');
  console.log('   - artifacts/visual-regression-summary.md');
  
  return summary;
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
