#!/usr/bin/env node
/**
 * Setup script to help users configure their project for modular GUI Test Review
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Templates
const templates = {
  'basic-workflow': `name: GUI Test Review
on:
  pull_request:
    branches: [main]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests@v1
        with:
          github-token: \${{ secrets.GITHUB_TOKEN }}
`,

  'modular-workflow': `name: Modular GUI Test Review
on:
  pull_request:
    branches: [main]

jobs:
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'npm'
      - run: npm ci
      - uses: DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests@v1
        with:
          github-token: \${{ secrets.GITHUB_TOKEN }}
          mode: 'test-only'
  
  lint:
    name: Code Quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'npm'
      - run: npm ci
      - uses: DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests@v1
        with:
          github-token: \${{ secrets.GITHUB_TOKEN }}
          mode: 'lint-only'
  
  dashboard:
    name: Generate Dashboard
    needs: [test, lint]
    if: always()
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
      - uses: DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests@v1
        with:
          github-token: \${{ secrets.GITHUB_TOKEN }}
          mode: 'dashboard-only'
`,

  'jest-converter': `// scripts/convert-jest-results.js
const fs = require('fs');

// Read Jest results
const jestResults = JSON.parse(fs.readFileSync(process.argv[2] || 'jest-results.json', 'utf8'));

// Convert to expected format
const summary = {
  total: jestResults.numTotalTests,
  passed: jestResults.numPassedTests,
  failed: jestResults.numFailedTests,
  skipped: jestResults.numPendingTests + (jestResults.numTodoTests || 0),
  duration: jestResults.testResults.reduce((sum, r) => sum + (r.perfStats?.runtime || 0), 0),
  pass_rate: Math.round((jestResults.numPassedTests / jestResults.numTotalTests) * 100)
};

// Output
console.log(JSON.stringify(summary, null, 2));
`,

  'cypress-converter': `// scripts/convert-cypress-results.js
const fs = require('fs');

// Read Cypress results
const cypressResults = JSON.parse(fs.readFileSync(process.argv[2] || 'cypress-results.json', 'utf8'));

// Convert to expected format
const summary = {
  total: cypressResults.totalTests || 0,
  passed: cypressResults.totalPassed || 0,
  failed: cypressResults.totalFailed || 0,
  skipped: (cypressResults.totalPending || 0) + (cypressResults.totalSkipped || 0),
  duration: cypressResults.totalDuration || 0,
  pass_rate: cypressResults.totalTests ? 
    Math.round((cypressResults.totalPassed / cypressResults.totalTests) * 100) : 0
};

// Output
console.log(JSON.stringify(summary, null, 2));
`,

  'merge-results': `// scripts/merge-test-results.js
const fs = require('fs');
const path = require('path');

// Read all test summaries from artifacts directory
const artifactsDir = process.argv[2] || 'artifacts';
const summaries = [];

fs.readdirSync(artifactsDir).forEach(file => {
  if (file.endsWith('-summary.json') && !file.includes('playwright-summary')) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(artifactsDir, file), 'utf8'));
      summaries.push(data);
    } catch (e) {
      console.error(\`Failed to read \${file}:\`, e.message);
    }
  }
});

// Merge summaries
const merged = summaries.reduce((acc, summary) => ({
  total: acc.total + (summary.total || 0),
  passed: acc.passed + (summary.passed || 0),
  failed: acc.failed + (summary.failed || 0),
  skipped: acc.skipped + (summary.skipped || 0),
  duration: acc.duration + (summary.duration || 0)
}), { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 });

// Calculate pass rate
merged.pass_rate = merged.total ? Math.round((merged.passed / merged.total) * 100) : 0;

// Output
console.log(JSON.stringify(merged, null, 2));
`
};

async function main() {
  console.log('🚀 GUI Test Review Dashboard - Setup Assistant\n');
  
  // Check if in a git repository
  if (!fs.existsSync('.git')) {
    console.log('⚠️  Warning: Not in a git repository root directory\n');
  }
  
  // Ask setup questions
  console.log('This assistant will help you set up the GUI Test Review Dashboard.\n');
  
  const mode = await question(
    'Which setup mode do you prefer?\n' +
    '1. Basic (all-in-one)\n' +
    '2. Modular (separate jobs)\n' +
    '3. Integration (add to existing CI)\n' +
    'Choice (1-3): '
  );
  
  const testFramework = await question(
    '\nWhich test framework are you using?\n' +
    '1. Playwright\n' +
    '2. Jest\n' +
    '3. Cypress\n' +
    '4. Other\n' +
    'Choice (1-4): '
  );
  
  const hasEslint = await question('\nDo you have ESLint configured? (y/n): ');
  const hasPrettier = await question('Do you have Prettier configured? (y/n): ');
  
  console.log('\n📝 Generating configuration...\n');
  
  // Create directories
  fs.mkdirSync('.github/workflows', { recursive: true });
  fs.mkdirSync('scripts', { recursive: true });
  
  // Generate workflow file
  let workflowFile = '.github/workflows/gui-test-review.yml';
  let workflowContent = mode === '1' ? templates['basic-workflow'] : templates['modular-workflow'];
  
  // Add framework-specific configuration
  if (testFramework === '2') {
    // Jest
    fs.writeFileSync('scripts/convert-jest-results.js', templates['jest-converter']);
    console.log('✅ Created scripts/convert-jest-results.js');
  } else if (testFramework === '3') {
    // Cypress
    fs.writeFileSync('scripts/convert-cypress-results.js', templates['cypress-converter']);
    console.log('✅ Created scripts/convert-cypress-results.js');
  }
  
  // Add merge script for modular setup
  if (mode !== '1') {
    fs.writeFileSync('scripts/merge-test-results.js', templates['merge-results']);
    console.log('✅ Created scripts/merge-test-results.js');
  }
  
  // Write workflow file
  fs.writeFileSync(workflowFile, workflowContent);
  console.log(`✅ Created ${workflowFile}`);
  
  // Create example configs if needed
  if (hasEslint.toLowerCase() !== 'y' && !fs.existsSync('.eslintrc.json')) {
    const eslintConfig = {
      "env": {
        "browser": true,
        "es2021": true,
        "node": true
      },
      "extends": "eslint:recommended",
      "parserOptions": {
        "ecmaVersion": "latest",
        "sourceType": "module"
      },
      "rules": {}
    };
    fs.writeFileSync('.eslintrc.json', JSON.stringify(eslintConfig, null, 2));
    console.log('✅ Created .eslintrc.json (example)');
  }
  
  if (hasPrettier.toLowerCase() !== 'y' && !fs.existsSync('.prettierrc.json')) {
    const prettierConfig = {
      "printWidth": 100,
      "singleQuote": true,
      "semi": true,
      "trailingComma": "es5"
    };
    fs.writeFileSync('.prettierrc.json', JSON.stringify(prettierConfig, null, 2));
    console.log('✅ Created .prettierrc.json (example)');
  }
  
  // Generate README section
  console.log('\n📚 Add this to your README.md:\n');
  console.log('```markdown');
  console.log('## 🔍 GUI Test Review Dashboard\n');
  console.log('This project uses the GUI Test Review Dashboard to enhance code reviews.');
  console.log('The dashboard provides visual test results, code quality metrics, and');
  console.log('automated PR comments.\n');
  console.log('### Features');
  console.log('- 📊 Visual test execution flows');
  console.log('- 📋 Code quality analysis (ESLint, Prettier)');
  console.log('- 💬 Automated PR comments');
  console.log('- 🎨 Interactive dashboard\n');
  console.log('### Usage');
  console.log('The dashboard runs automatically on pull requests.');
  console.log('View the generated dashboard in the GitHub Actions tab or via');
  console.log('the link posted in PR comments.');
  console.log('```\n');
  
  // Next steps
  console.log('✨ Setup complete!\n');
  console.log('Next steps:');
  console.log('1. Review and customize the generated workflow file');
  console.log('2. Commit the changes: git add . && git commit -m "Add GUI Test Review Dashboard"');
  console.log('3. Push to GitHub and open a pull request to see it in action');
  console.log('\nFor more information, see:');
  console.log('- https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests');
  
  rl.close();
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  rl.close();
  process.exit(1);
});