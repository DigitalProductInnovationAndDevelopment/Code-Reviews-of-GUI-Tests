#!/usr/bin/env node
/**
 * generate-test-city-3d.js 
 * Creates an interactive 3D city visualization from Playwright test results.
 * Each building represents a test, grouped by test suite.
 * FIXED: Proper Three.js loading and data handling
 */

const fs   = require('fs');
const path = require('path');

// Constants
const ART = 'artifacts';
const HISTORY_FILE = path.join(ART, 'test-history-insights.json');

// Safe JSON reader
function readJSON (filepath, def = null) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`⚠️  Could not parse ${filepath}:`, err.message);
    }
    return def;
  }
}

// Extract all test data
function extractTestData () {
  // Try multiple locations for metrics
  const candidatePaths = [
    path.join(ART, 'playwright-metrics-pr.json'),
    path.join(ART, 'playwright-metrics.json'),
    'playwright-metrics.json',
    path.join(ART, 'playwright-summary-pr.json'),
    path.join(ART, 'playwright-summary.json')
  ];

  let metrics = null;
  let summaryMetrics = null;

  for (const p of candidatePaths) {
    if (!fs.existsSync(p)) continue;

    const data = readJSON(p);
    if (!data) continue;

    console.log(`📁 Checking ${p}...`);
    
    if (data.suites) {
      metrics = data;
      console.log(`✅ Found detailed metrics at: ${p}`);
      console.log(`   - Total suites: ${data.suites.length}`);
      console.log(`   - Stats:`, data.stats);
      break;
    }

    if (!summaryMetrics && data.total) {
      summaryMetrics = data;
      console.log(`📊 Found summary metrics at: ${p}`);
    }
  }

  if (!metrics) metrics = summaryMetrics;

  // Fallback if only summary exists
  if (!metrics || !metrics.suites) {
    console.log('⚠️  No detailed metrics found, using summary fallback');
    const summary = summaryMetrics || readJSON(path.join(ART, 'playwright-summary-pr.json'));
    if (summary && summary.total) {
      console.log('📊 Using summary data for visualization:', summary);
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
    return [];
  }

  // Load history
  const historyData = readJSON(HISTORY_FILE, { tests: {} });
  const historyMap  = historyData.tests || {};

  const testData = [];

  // Process detailed test data
  metrics.suites.forEach((suite, sIdx) => {
    const suiteName = path.basename(suite.file || `suite-${sIdx}`)
                      .replace(/\.(spec|test)\.(jsx?|tsx?)$/, '');

    console.log(`Processing suite: ${suiteName}`);

    suite.suites.forEach((describe, dIdx) => {
      describe.specs.forEach((spec, tIdx) => {
        const fullName = `${suiteName} > ${describe.title} > ${spec.title}`;
        const attempts = spec.tests || [];

        let durationTotal = 0;
        let passed = 0, failed = 0, skipped = 0, lastStatus = 'unknown';
        const errors = [];

        attempts.forEach(attempt => {
          (attempt.results || []).forEach(r => {
            durationTotal += r.duration || 0;
            if (r.status === 'passed' || r.status === 'expected') {
              passed++;
              lastStatus = 'passed';
            } else if (r.status === 'failed' || r.status === 'unexpected') {
              failed++;
              lastStatus = 'failed';
            } else if (r.status === 'skipped') {
              skipped++;
              lastStatus = 'skipped';
            }
            if (r.error) errors.push({ message: r.error.message, stack: r.error.stack });
          });
        });

        const runs = passed + failed + skipped;
        const avgDur = runs ? durationTotal / runs : 0;
        const passRate = runs ? (passed / runs) * 100 : 0;

        // Flakiness calculation
        let flakiness = 0;
        if (historyMap[fullName]) {
          flakiness = historyMap[fullName].flakiness || 0;
        } else if (runs > 1 && passed > 0 && failed > 0) {
          flakiness = 50;
        }

        // Category detection
        let category = 'standard';
        const loTitle = spec.title.toLowerCase();
        const loDesc = describe.title.toLowerCase();
        if (loTitle.includes('critical') || loDesc.includes('critical')) category = 'critical';
        else if (loTitle.includes('smoke') || loDesc.includes('smoke')) category = 'smoke';
        else if (loTitle.includes('regression')) category = 'regression';

        testData.push({
          id: `${suiteName}-${dIdx}-${tIdx}`,
          suite: suiteName,
          describe: describe.title,
          name: spec.title,
          fullName,
          duration: avgDur,
          totalDuration: durationTotal,
          passRate,
          runs,
          passed,
          failed,
          skipped,
          lastStatus,
          flakiness,
          category,
          line: spec.line || suite.line || 0,
          column: spec.column || suite.column || 0,
          errors,
          priority: calcPriority(avgDur, passRate, flakiness, category)
        });
      });
    });
  });

  console.log(`📊 Extracted ${testData.length} tests`);
  if (testData.length > 0) {
    console.log('📊 Sample test:', JSON.stringify(testData[0], null, 2));
  }

  return testData;
}

function calcPriority (duration, passRate, flakiness, category) {
  let p = 1;
  if (category === 'critical') p *= 2;
  else if (category === 'smoke') p *= 1.5;

  p *= 1 + duration / 5000;
  p *= 2 - passRate / 100;
  if (flakiness > 30) p *= 1.5;
  return p;
}

// Generate the 3D city HTML with fixed Three.js loading
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
    avgDuration: testData.length > 0 ? testData.reduce((sum, t) => sum + t.duration, 0) / testData.length : 0,
    totalDuration: testData.reduce((sum, t) => sum + t.totalDuration, 0)
  };
  
  console.log('📊 Stats for visualization:', stats);
  
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
  z-index: 100;
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
  z-index: 100;
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
  z-index: 100;
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
  z-index: 200;
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

#error-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid #ef4444;
  color: #ef4444;
  padding: 20px;
  border-radius: 8px;
  display: none;
  z-index: 200;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
<!-- Fixed Three.js CDN loading -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>

<div id="container">
  <div id="loading">
    <div class="spinner"></div>
    <div>Loading Test City...</div>
  </div>
  
  <div id="error-message">
    <h3>Error Loading 3D Visualization</h3>
    <p id="error-details"></p>
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

// OrbitControls implementation (fallback if CDN fails)
class SimpleOrbitControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.enabled = true;
    this.target = new THREE.Vector3();
    this.enableDamping = true;
    this.dampingFactor = 0.05;
    this.autoRotate = false;
    this.autoRotateSpeed = 2.0;
    
    this.rotateSpeed = 1.0;
    this.zoomSpeed = 1.0;
    
    this.spherical = new THREE.Spherical();
    this.sphericalDelta = new THREE.Spherical();
    
    this.mouseStart = new THREE.Vector2();
    this.mouseEnd = new THREE.Vector2();
    this.mouseDelta = new THREE.Vector2();
    
    this.isMouseDown = false;
    
    // Event listeners
    this.domElement.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.domElement.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.domElement.addEventListener('wheel', this.onMouseWheel.bind(this));
    
    this.update();
  }
  
  onMouseDown(event) {
    if (!this.enabled) return;
    this.isMouseDown = true;
    this.mouseStart.set(event.clientX, event.clientY);
    if (this.onStart) this.onStart();
  }
  
  onMouseMove(event) {
    if (!this.enabled || !this.isMouseDown) return;
    
    this.mouseEnd.set(event.clientX, event.clientY);
    this.mouseDelta.subVectors(this.mouseEnd, this.mouseStart);
    
    const element = this.domElement;
    this.sphericalDelta.theta -= 2 * Math.PI * this.mouseDelta.x / element.clientHeight * this.rotateSpeed;
    this.sphericalDelta.phi -= 2 * Math.PI * this.mouseDelta.y / element.clientHeight * this.rotateSpeed;
    
    this.mouseStart.copy(this.mouseEnd);
  }
  
  onMouseUp() {
    this.isMouseDown = false;
  }
  
  onMouseWheel(event) {
    if (!this.enabled) return;
    
    if (event.deltaY < 0) {
      this.sphericalDelta.radius *= 0.95;
    } else {
      this.sphericalDelta.radius *= 1.05;
    }
  }
  
  update() {
    const offset = new THREE.Vector3();
    const position = this.camera.position;
    
    offset.copy(position).sub(this.target);
    this.spherical.setFromVector3(offset);
    
    if (this.autoRotate && !this.isMouseDown) {
      this.sphericalDelta.theta -= 2 * Math.PI / 60 / 60 * this.autoRotateSpeed;
    }
    
    this.spherical.theta += this.sphericalDelta.theta * this.dampingFactor;
    this.spherical.phi += this.sphericalDelta.phi * this.dampingFactor;
    this.spherical.radius += this.sphericalDelta.radius * this.dampingFactor;
    
    this.spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, this.spherical.phi));
    this.spherical.radius = Math.max(10, Math.min(200, this.spherical.radius));
    
    this.sphericalDelta.theta *= 1 - this.dampingFactor;
    this.sphericalDelta.phi *= 1 - this.dampingFactor;
    this.sphericalDelta.radius *= 1 - this.dampingFactor;
    
    offset.setFromSpherical(this.spherical);
    position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }
  
  addEventListener(type, listener) {
    if (type === 'start') {
      this.onStart = listener;
    }
  }
}

// Initialize the scene
function init() {
  try {
    console.log('Initializing 3D scene...');
    console.log('Test data available:', testData.length, 'tests');
    
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
    
    // Controls - try THREE.OrbitControls first, fallback to simple implementation
    try {
      if (typeof THREE.OrbitControls !== 'undefined') {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        console.log('Using THREE.OrbitControls');
      } else {
        controls = new SimpleOrbitControls(camera, renderer.domElement);
        console.log('Using fallback SimpleOrbitControls');
      }
    } catch (e) {
      console.log('OrbitControls error, using fallback:', e);
      controls = new SimpleOrbitControls(camera, renderer.domElement);
    }
    
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2.0;
    
    controls.addEventListener('start', () => {
      autoRotate = false;
      controls.autoRotate = false;
      document.querySelector('.control-btn.active')?.classList.remove('active');
    });
    
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
    
    console.log('3D scene initialized successfully');
  } catch (error) {
    console.error('Error initializing 3D scene:', error);
    showError('Failed to initialize 3D scene: ' + error.message);
  }
}

// Build the city from test data
function buildCity() {
  console.log('Building city from test data...');
  
  if (testData.length === 0) {
    console.warn('No test data available for visualization');
    // Create a placeholder
    const geometry = new THREE.BoxGeometry(5, 10, 5);
    const material = new THREE.MeshStandardMaterial({ color: 0x6366f1 });
    const placeholder = new THREE.Mesh(geometry, material);
    placeholder.position.set(0, 5, 0);
    scene.add(placeholder);
    return;
  }
  
  let districtX = 0;
  let maxHeight = 0;
  
  Object.entries(suites).forEach(([suiteName, tests], suiteIdx) => {
    console.log(\`Building district for suite: \${suiteName} with \${tests.length} tests\`);
    
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
  const cityWidth = districtX || 20;
  camera.position.set(cityWidth / 2, maxHeight * 2, cityWidth / 2);
  camera.lookAt(cityWidth / 2, 0, 0);
  if (controls && controls.target) {
    controls.target.set(cityWidth / 2, 0, 0);
  }
  
  console.log(\`City built successfully with \${buildings.length} buildings\`);
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
    if (controls && controls.target) {
      controls.target.copy(target);
    }
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
  controls.autoRotate = autoRotate;
  event.target.classList.toggle('active');
  }

  function resetCamera() {
  const cityWidth = districts.length > 0 ? 
    districts[districts.length - 1].position.x + 10 : 30;
  camera.position.set(cityWidth / 2, 30, cityWidth / 2);
  camera.lookAt(cityWidth / 2, 0, 0);
  if (controls && controls.target) {
    controls.target.set(cityWidth / 2, 0, 0);
  }
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
    if (controls && controls.target) {
      controls.target.copy(center);
    }
  }
  }

  function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Show error message
  function showError(message) {
  document.getElementById('loading').style.display = 'none';
  const errorEl = document.getElementById('error-message');
  document.getElementById('error-details').textContent = message;
  errorEl.style.display = 'block';
  }

  // Animation loop
  function animate() {
  try {
    requestAnimationFrame(animate);
    
    // Update controls
    if (controls) {
      controls.update();
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
  } catch (error) {
    console.error('Animation error:', error);
  }
  }

  // Check if Three.js loaded properly
  if (typeof THREE === 'undefined') {
  showError('Three.js library failed to load. Please refresh the page.');
  } else {
  console.log('Three.js loaded successfully, version:', THREE.REVISION);
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  }
  </script>

  </body>
  </html>
  `;
  }

  // Main execution
  console.log('🏙️  Generating 3D Test City visualization...');
  console.log('📁  Working directory:', process.cwd());
  console.log('📁  Artifacts directory:', ART);

  const testData = extractTestData();

  if (!testData.length) {
  console.error('❌ No test data found to visualize');
  console.log('📝 Please ensure test results are available in one of these locations:');
  console.log('   - artifacts/playwright-metrics-pr.json');
  console.log('   - artifacts/playwright-metrics.json');
  console.log('   - artifacts/playwright-summary-pr.json');
  process.exit(1);
  }

  console.log(`📊 Visualizing ${testData.length} tests`);

  // Generate HTML
  const html = generate3DCityHTML(testData);

  // Ensure output directories
  fs.mkdirSync(path.join(ART, 'web-report'), { recursive: true });

  // Write files
  fs.writeFileSync(path.join(ART, 'web-report', 'test-city-3d.html'), html);
  fs.writeFileSync(path.join(ART, 'test-city-data.json'), JSON.stringify({
  generated: new Date().toISOString(),
  stats: {
    total: testData.length,
    passed: testData.filter(t => t.lastStatus === 'passed').length,
    failed: testData.filter(t => t.lastStatus === 'failed').length,
    flaky: testData.filter(t => t.flakiness > 30).length
  },
  tests: testData
  }, null, 2));

  console.log('✅ 3D Test City generated successfully');
  console.log('📍 Location: artifacts/web-report/test-city-3d.html');
  console.log('📊 Stats:');
  console.log(`   - Total tests: ${testData.length}`);
  console.log(`   - Failed tests: ${testData.filter(t => t.lastStatus === 'failed').length}`);
  console.log(`   - Passed tests: ${testData.filter(t => t.lastStatus === 'passed').length}`);