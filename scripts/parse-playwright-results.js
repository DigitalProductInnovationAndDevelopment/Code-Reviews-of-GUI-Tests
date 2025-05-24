const fs = require('fs');
const path = require('path');

const reportPath = path.join(__dirname, '../playwright-report/report.json');

if (!fs.existsSync(reportPath)) {
  console.log("❗ No test results found.");
  process.exit(0);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

let passed = 0;
let failed = 0;
let skipped = 0;

const summaryLines = [];

for (const suite of report.suites) {
  for (const spec of suite.specs) {
    for (const test of spec.tests) {
      const result = test.results[0];
      const status = result.status;
      const emoji = status === 'passed' ? '✅' : status === 'failed' ? '❌' : '⚠️';

      if (status === 'passed') passed++;
      else if (status === 'failed') failed++;
      else skipped++;

      summaryLines.push(`${emoji} ${spec.title}`);
    }
  }
}

console.log(`## 🧪 Playwright Test Results`);
console.log(`- ✅ Passed: ${passed}`);
console.log(`- ❌ Failed: ${failed}`);
console.log(`- ⚠️ Skipped: ${skipped}`);
console.log('');
summaryLines.forEach(line => console.log(line));