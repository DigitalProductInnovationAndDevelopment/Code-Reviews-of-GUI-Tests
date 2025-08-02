#!/usr/bin/env node
/**
 * generate-test-city-3d.js
 * Creates an interactive 3D city visualization from actual Playwright test results
 * Each building represents a test, grouped by test suite
 */

const fs = require('fs');
const path = require('path');

const ART = 'artifacts';

// Helper to read JSON safely
const readJSON = (filepath, defaultValue = null) => {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    console.warn(`Could not read ${filepath}:`, e.message);
    return defaultValue;
  }
};

// Extract comprehensive test data from Playwright metrics
function extractTestData() {
  const possiblePaths = [
    'playwright-metrics.json',
    path.join(ART, 'playwright-metrics.json'),
    path.join(ART, 'playwright-summary-pr.json'), 
    path.join(ART, 'playwright-summary.json')   
  ];
  
  let metrics = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      metrics = readJSON(p);
      if (metrics && (metrics.suites || metrics.total)) {
        console.log(`Found metrics at: ${p}`);
        break;
      }
    }
  }
  
  // If no detailed metrics found, try to use summary
  if (!metrics || !metrics.suites) {
    const summary = readJSON(path.join(ART, 'playwright-summary-pr.json'));
    if (summary && summary.total) {
      // Create a minimal structure from summary
      console.log('Using summary data for visualization');
      return [{
        id: 'summary-tests',
        suite: 'All Tests',
        describe: 'Summary',
        name: `${summary.passed} passed, ${summary.failed} failed`,
        duration: summary.duration || 0,
        passRate: summary.pass_rate || 0,
        passed: summary.passed || 0,
        failed: summary.failed || 0,
        total: summary.total || 0,
        lastStatus: summary.failed > 0 ? 'failed' : 'passed',
        priority: 1
      }];
    }
  }
  
  const testData = [];
  const testHistoryMap = {};
  
  // Build history map for flakiness calculation
  if (history && history.tests) {
    Object.entries(history.tests).forEach(([testName, data]) => {
      testHistoryMap[testName] = data;
    });
  }
  
  // Process each test suite
  metrics.suites.forEach((suite, suiteIdx) => {
    const suiteName = path.basename(suite.file || `suite-${suiteIdx}`)
      .replace(/\.(spec|test)\.(js|ts|jsx|tsx)$/, '');
    
    // Get suite location info
    const line = suite.line || 0;
    const column = suite.column || 0;
    
    suite.suites.forEach((describe, describeIdx) => {
      describe.specs.forEach((spec, specIdx) => {
        const fullTestName = `${suiteName} > ${describe.title} > ${spec.title}`;
        
        // Get all test attempts
        const attempts = spec.tests || [];
        let totalDuration = 0;
        let passCount = 0;
        let failCount = 0;
        let skipCount = 0;
        let lastStatus = 'unknown';
        let errors = [];
        
        attempts.forEach(test => {
          test.results.forEach(result => {
            totalDuration += result.duration || 0;
            
            if (result.status === 'passed' || result.status === 'expected') {
              passCount++;
              lastStatus = 'passed';
            } else if (result.status === 'failed' || result.status === 'unexpected') {
              failCount++;
              lastStatus = 'failed';
              if (result.error) {
                errors.push({
                  message: result.error.message,
                  stack: result.error.stack
                });
              }
            } else if (result.status === 'skipped') {
              skipCount++;
              lastStatus = 'skipped';
            }
          });
        });
        
        const totalRuns = passCount + failCount + skipCount;
        const avgDuration = totalRuns > 0 ? totalDuration / totalRuns : 0;
        const passRate = totalRuns > 0 ? (passCount / totalRuns) * 100 : 0;
        
        // Calculate flakiness from history or current runs
        let flakiness = 0;
        const historyData = testHistoryMap[fullTestName];
        if (historyData) {
          flakiness = historyData.flakiness || 0;
        } else if (totalRuns > 1 && passCount > 0 && failCount > 0) {
          // Test both passed and failed in current run = flaky
          flakiness = 50;
        }
        
        // Determine test category
        let category = 'standard';
        if (spec.title.toLowerCase().includes('critical') || 
            describe.title.toLowerCase().includes('critical')) {
          category = 'critical';
        } else if (spec.title.toLowerCase().includes('smoke') ||
                   describe.title.toLowerCase().includes('smoke')) {
          category = 'smoke';
        } else if (spec.title.toLowerCase().includes('regression')) {
          category = 'regression';
        }
        
        testData.push({
          id: `${suiteName}-${describeIdx}-${specIdx}`,
          suite: suiteName,
          describe: describe.title,
          name: spec.title,
          fullName: fullTestName,
          duration: avgDuration,
          totalDuration: totalDuration,
          passRate: passRate,
          runs: totalRuns,
          passed: passCount,
          failed: failCount,
          skipped: skipCount,
          lastStatus: lastStatus,
          flakiness: flakiness,
          category: category,
          line: spec.line || line,
          column: spec.column || column,
          errors: errors,
          // Calculate priority for height
          priority: calculateTestPriority(avgDuration, passRate, flakiness, category)
        });
      });
    });
  });
  
  return testData;
}

// Calculate test priority (affects building height)
function calculateTestPriority(duration, passRate, flakiness, category) {
  let priority = 1;
  
  // Category weight
  if (category === 'critical') priority *= 2;
  else if (category === 'smoke') priority *= 1.5;
  
  // Duration weight (longer = higher priority)
  priority *= (1 + duration / 5000);
  
  // Failure weight (lower pass rate = higher priority)
  priority *= (2 - passRate / 100);
  
  // Flakiness weight
  if (flakiness > 30) priority *= 1.5;
  
  return priority;
}

// Generate the 3D city HTML
function generate3DCityHTML(testData) {
  // Group tests by suite
  const suites = {};
  testData.forEach(test => {
    if (!suites[test.suite]) {
      suites[test.suite] = [];
    }
    suites[test.suite].push(test);
  });
  
  // Calculate statistics
  const stats = {
    total: testData.length,
    passed: testData.filter(t => t.lastStatus === 'passed').length,
    failed: testData.filter(t => t.lastStatus === 'failed').length,
    skipped: testData.filter(t => t.lastStatus === 'skipped').length,
    flaky: testData.filter(t => t.flakiness > 30).length,
    avgDuration: testData.reduce((sum, t) => sum + t.duration, 0) / testData.length,
    totalDuration: testData.reduce((sum, t) => sum + t.totalDuration, 0)
  };
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test City - 3D Visualization</title>
<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0f172a;
  color: #f1f5f9;
  overflow: hidden;
}

#container {
  width: 100vw;
  height: 100vh;
  position: relative;
}

#info {
  position: absolute;
  top: 20px;
  left: 20px;
  background: rgba(15, 23, 42, 0.9);
  backdrop-filter: blur(10px);
  padding: 20px;
  border-radius: 12px;
  border: 1px solid #334155;
  max-width: 350px;
}

#info h1 {
  margin: 0 0 10px 0;
  font-size: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
}

#stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin: 15px 0;
}

.stat {
  background: rgba(255, 255, 255, 0.05);
  padding: 10px;
  border-radius: 8px;
  text-align: center;
}

.stat-value {
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: #94a3b8;
}

#legend {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #334155;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  font-size: 14px;
}

.legend-color {
  width: 20px;
  height: 20px;
  border-radius: 4px;
}

#hover-info {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(10px);
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #334155;
  display: none;
  max-width: 400px;
}

#hover-info.visible {
  display: block;
}

.test-name {
  font-weight: bold;
  margin-bottom: 8px;
  color: #3b82f6;
}

.test-details {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  font-size: 14px;
}

.test-details label {
  color: #94a3b8;
}

#controls {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(15, 23, 42, 0.9);
  backdrop-filter: blur(10px);
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #334155;
}

.control-btn {
  background: #334155;
  border: none;
  color: #f1f5f9;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  margin: 2px;
  transition: all 0.2s;
}

.control-btn:hover {
  background: #475569;
}

.control-btn.active {
  background: #3b82f6;
}

#loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.spinner {
  border: 3px solid #334155;
  border-top: 3px solid #3b82f6;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 0 auto 10px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>

<div id="container">
  <div id="loading">
    <div class="spinner"></div>
    <div>Loading Test City...</div>
  </div>
</div>

<div id="info" style="display: none;">
  <h1><span>🏙️</span> Test City</h1>
  <p style="margin: 0 0 15px 0; color: #94a3b8; font-size: 14px;">
    Interactive 3D visualization of your test suite
  </p>
  
  <div id="stats">
    <div class="stat">
      <div class="stat-value" style="color: #3b82f6;">${stats.total}</div>
      <div class="stat-label">Total Tests</div>
    </div>
    <div class="stat">
      <div class="stat-value" style="color: #10b981;">${stats.passed}</div>
      <div class="stat-label">Passed</div>
    </div>
    <div class="stat">
      <div class="stat-value" style="color: #ef4444;">${stats.failed}</div>
      <div class="stat-label">Failed</div>
    </div>
    <div class="stat">
      <div class="stat-value" style="color: #f59e0b;">${stats.flaky}</div>
      <div class="stat-label">Flaky</div>
    </div>
  </div>
  
  <div id="legend">
    <div style="font-weight: bold; margin-bottom: 8px;">Legend</div>
    <div class="legend-item">
      <div class="legend-color" style="background: #10b981;"></div>
      <span>Passing Tests (>90%)</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #f59e0b;"></div>
      <span>Unstable Tests (50-90%)</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #ef4444;"></div>
      <span>Failing Tests (<50%)</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #8b5cf6;"></div>
      <span>Skipped Tests</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #f59e0b; animation: pulse 2s infinite;"></div>
      <span>Flaky Tests (glowing)</span>
    </div>
  </div>
</div>

<div id="controls" style="display: none;">
  <button class="control-btn active" onclick="toggleRotation()">🔄 Auto-Rotate</button>
  <button class="control-btn" onclick="resetCamera()">📷 Reset View</button>
  <button class="control-btn" onclick="toggleStats()">📊 Toggle Stats</button>
  <button class="control-btn" onclick="focusFailed()">❌ Show Failed</button>
</div>

<div id="hover-info">
  <div class="test-name"></div>
  <div class="test-details"></div>
</div>

<style>
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>

<script>
// Test data from Playwright
const testData = ${JSON.stringify(testData)};
const suites = ${JSON.stringify(suites)};

// Three.js variables
let scene, camera, renderer, controls;
let buildings = [];
let districts = [];
let autoRotate = true;
let raycaster, mouse;
let hoveredBuilding = null;
let selectedBuilding = null;

// Initialize the scene
function init() {
  // Hide loading
  document.getElementById('loading').style.display = 'none';
  document.getElementById('info').style.display = 'block';
  document.getElementById('controls').style.display = 'block';
  
  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);
  scene.fog = new THREE.Fog(0x0f172a, 20, 100);
  
  // Camera
  camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(30, 30, 30);
  
  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('container').appendChild(renderer.domElement);
  
  // Lights
  const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(20, 40, 20);
  directionalLight.castShadow = true;
  directionalLight.shadow.camera.near = 0.1;
  directionalLight.shadow.camera.far = 100;
  directionalLight.shadow.camera.left = -50;
  directionalLight.shadow.camera.right = 50;
  directionalLight.shadow.camera.top = 50;
  directionalLight.shadow.camera.bottom = -50;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  scene.add(directionalLight);
  
  // Add point light for glow effect
  const pointLight = new THREE.PointLight(0x3b82f6, 0.5, 100);
  pointLight.position.set(0, 20, 0);
  scene.add(pointLight);
  
  // Ground
  const groundSize = 100;
  const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
  const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x1e293b,
    roughness: 0.8,
    metalness: 0.2
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  
  // Grid
  const gridHelper = new THREE.GridHelper(groundSize, 50, 0x334155, 0x1e293b);
  scene.add(gridHelper);
  
  // Build the city
  buildCity();
  
  // Mouse interaction
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  
  // Event listeners
  window.addEventListener('resize', onWindowResize);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('click', onClick);
  
  // Start animation
  animate();
}

// Build the city from test data
function buildCity() {
  let districtX = -40;
  let maxHeight = 0;
  
  Object.entries(suites).forEach(([suiteName, tests], suiteIdx) => {
    // Calculate district size
    const gridSize = Math.ceil(Math.sqrt(tests.length));
    const districtSize = gridSize * 2 + 4;
    
    // Create district base
    const districtGeometry = new THREE.BoxGeometry(districtSize, 0.2, districtSize);
    const districtMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(suiteIdx * 0.15, 0.3, 0.15),
      roughness: 0.9
    });
    const district = new THREE.Mesh(districtGeometry, districtMaterial);
    district.position.set(districtX + districtSize / 2, 0.1, 0);
    district.receiveShadow = true;
    district.userData = { type: 'district', name: suiteName };
    scene.add(district);
    districts.push(district);
    
    // Add district label
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 64;
    context.fillStyle = '#f1f5f9';
    context.font = 'bold 48px Arial';
    context.textAlign = 'center';
    context.fillText(suiteName, 256, 48);
    
    const texture = new THREE.CanvasTexture(canvas);
    const labelMaterial = new THREE.SpriteMaterial({ map: texture });
    const label = new THREE.Sprite(labelMaterial);
    label.scale.set(districtSize * 0.8, districtSize * 0.1, 1);
    label.position.set(districtX + districtSize / 2, 0.5, -districtSize / 2 - 2);
    scene.add(label);
    
    // Create buildings for each test
    tests.forEach((test, idx) => {
      const row = Math.floor(idx / gridSize);
      const col = idx % gridSize;
      
      // Building dimensions
      const width = 1.5;
      const depth = 1.5;
      const height = Math.max(0.5, Math.min(15, test.priority * 3));
      maxHeight = Math.max(maxHeight, height);
      
      // Building color based on pass rate and status
      let color;
      if (test.lastStatus === 'skipped') {
        color = new THREE.Color(0x8b5cf6); // Purple for skipped
      } else if (test.passRate >= 90) {
        color = new THREE.Color(0x10b981); // Green
      } else if (test.passRate >= 50) {
        color = new THREE.Color(0xf59e0b); // Orange
      } else {
        color = new THREE.Color(0xef4444); // Red
      }
      
      // Create building
      const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
      const buildingMaterial = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: test.flakiness > 30 ? 0.3 : 0.05,
        roughness: 0.7,
        metalness: 0.3
      });
      
      const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
      building.position.set(
        districtX + col * 2 + 2,
        height / 2,
        row * 2 - districtSize / 2 + 2
      );
      building.castShadow = true;
      building.receiveShadow = true;
      building.userData = test;
      buildings.push(building);
      scene.add(building);
      
      // Add windows effect
      if (height > 2) {
        const windowsGeometry = new THREE.BoxGeometry(width + 0.02, height - 0.2, depth + 0.02);
        const windowsMaterial = new THREE.MeshBasicMaterial({
          color: 0x6366f1,
          opacity: 0.2,
          transparent: true
        });
        const windows = new THREE.Mesh(windowsGeometry, windowsMaterial);
        windows.position.copy(building.position);
        scene.add(windows);
      }
      
      // Add warning beacon for flaky tests
      if (test.flakiness > 30) {
        const beaconGeometry = new THREE.ConeGeometry(0.3, 0.6, 8);
        const beaconMaterial = new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          emissive: 0xf59e0b,
          emissiveIntensity: 1
        });
        const beacon = new THREE.Mesh(beaconGeometry, beaconMaterial);
        beacon.position.set(
          building.position.x,
          building.position.y + height / 2 + 0.5,
          building.position.z
        );
        beacon.userData = { type: 'beacon', parent: building };
        scene.add(beacon);
      }
      
      // Add critical test indicator
      if (test.category === 'critical') {
        const starGeometry = new THREE.OctahedronGeometry(0.3);
        const starMaterial = new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          emissive: 0xfbbf24,
          emissiveIntensity: 0.5
        });
        const star = new THREE.Mesh(starGeometry, starMaterial);
        star.position.set(
          building.position.x,
          building.position.y + height / 2 + 1,
          building.position.z
        );
        star.userData = { type: 'star', parent: building };
        scene.add(star);
      }
    });
    
    districtX += districtSize + 4;
  });
  
  // Center camera on city
  camera.position.set(districtX / 2, maxHeight * 2, districtX / 2);
  camera.lookAt(districtX / 2, 0, 0);
}

// Mouse interaction
function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(buildings);
  
  // Reset previous hover
  if (hoveredBuilding && hoveredBuilding !== selectedBuilding) {
    hoveredBuilding.material.emissiveIntensity = 
      hoveredBuilding.userData.flakiness > 30 ? 0.3 : 0.05;
  }
  
  if (intersects.length > 0) {
    hoveredBuilding = intersects[0].object;
    hoveredBuilding.material.emissiveIntensity = 0.5;
    showHoverInfo(hoveredBuilding.userData);
    renderer.domElement.style.cursor = 'pointer';
  } else {
    hoveredBuilding = null;
    hideHoverInfo();
    renderer.domElement.style.cursor = 'default';
  }
}

function onClick(event) {
  if (hoveredBuilding) {
    if (selectedBuilding) {
      selectedBuilding.material.emissiveIntensity = 
        selectedBuilding.userData.flakiness > 30 ? 0.3 : 0.05;
    }
    selectedBuilding = hoveredBuilding;
    selectedBuilding.material.emissiveIntensity = 0.8;
    
    // Focus camera on selected building
    const target = selectedBuilding.position.clone();
    target.y = 0;
    
    // Smooth camera transition would go here
    // For now, just look at the building
    camera.lookAt(target);
  }
}

function showHoverInfo(test) {
  const hoverEl = document.getElementById('hover-info');
  const nameEl = hoverEl.querySelector('.test-name');
  const detailsEl = hoverEl.querySelector('.test-details');
  
  nameEl.textContent = test.name;
  
  const statusColor = test.lastStatus === 'passed' ? '#10b981' : 
                     test.lastStatus === 'failed' ? '#ef4444' : '#8b5cf6';
  
  detailsEl.innerHTML = \`
    <label>Suite:</label><span>\${test.suite}</span>
    <label>Status:</label><span style="color: \${statusColor};">\${test.lastStatus}</span>
    <label>Pass Rate:</label><span>\${test.passRate.toFixed(1)}%</span>
    <label>Duration:</label><span>\${(test.duration / 1000).toFixed(2)}s</span>
    <label>Runs:</label><span>\${test.runs}</span>
    <label>Category:</label><span>\${test.category}</span>
    \${test.flakiness > 0 ? \`<label>Flakiness:</label><span style="color: #f59e0b;">\${test.flakiness.toFixed(0)}%</span>\` : ''}
  \`;
  
  hoverEl.classList.add('visible');
}

function hideHoverInfo() {
  document.getElementById('hover-info').classList.remove('visible');
}

// Controls
function toggleRotation() {
  autoRotate = !autoRotate;
  event.target.classList.toggle('active');
}

function resetCamera() {
  camera.position.set(30, 30, 30);
  camera.lookAt(0, 0, 0);
  selectedBuilding = null;
  buildings.forEach(b => {
    b.material.emissiveIntensity = b.userData.flakiness > 30 ? 0.3 : 0.05;
  });
}

function toggleStats() {
  const info = document.getElementById('info');
  info.style.display = info.style.display === 'none' ? 'block' : 'none';
}

function focusFailed() {
  const failedBuildings = buildings.filter(b => b.userData.lastStatus === 'failed');
  if (failedBuildings.length > 0) {
    const center = new THREE.Vector3();
    failedBuildings.forEach(b => center.add(b.position));
    center.divideScalar(failedBuildings.length);
    
    camera.position.set(center.x + 20, 20, center.z + 20);
    camera.lookAt(center);
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Auto-rotate camera
  if (autoRotate && !selectedBuilding) {
    const time = Date.now() * 0.0001;
    camera.position.x = Math.cos(time) * 40;
    camera.position.z = Math.sin(time) * 40;
    camera.position.y = 25 + Math.sin(time * 2) * 10;
    camera.lookAt(0, 0, 0);
  }
  
  // Animate beacons and stars
  scene.traverse((child) => {
    if (child.userData.type === 'beacon') {
      child.rotation.y += 0.02;
      child.position.y = child.userData.parent.position.y + 
        child.userData.parent.geometry.parameters.height / 2 + 0.5 + 
        Math.sin(Date.now() * 0.002) * 0.1;
    }
    if (child.userData.type === 'star') {
      child.rotation.y += 0.01;
      child.rotation.x += 0.01;
    }
  });
  
  renderer.render(scene, camera);
}

// Initialize
init();
</script>

</body>
</html>
  `;
}

// Main execution
console.log('🏙️  Generating 3D Test City visualization...');

const testData = extractTestData();
if (testData.length === 0) {
  console.error('❌ No test data found to visualize');
  process.exit(1);
}

console.log(`📊 Found ${testData.length} tests to visualize`);

// Generate HTML
const html = generate3DCityHTML(testData);

// Save files
fs.mkdirSync(path.join(ART, 'web-report'), { recursive: true });
fs.writeFileSync(path.join(ART, 'web-report', 'test-city-3d.html'), html);

// Also save the processed test data for other tools
fs.writeFileSync(
  path.join(ART, 'test-city-data.json'),
  JSON.stringify({
    generated: new Date().toISOString(),
    stats: {
      total: testData.length,
      passed: testData.filter(t => t.lastStatus === 'passed').length,
      failed: testData.filter(t => t.lastStatus === 'failed').length,
      flaky: testData.filter(t => t.flakiness > 30).length
    },
    tests: testData
  }, null, 2)
);

console.log('✅ Test City 3D visualization generated');
console.log('📍 Location: artifacts/web-report/test-city-3d.html');
console.log('🏢 Building colors: Green (passing) → Orange (unstable) → Red (failing)');
console.log('✨ Glowing buildings indicate flaky tests');
console.log('⭐ Stars indicate critical tests');