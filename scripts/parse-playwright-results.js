const fs = require('fs');
const path = require('path');

const reportPath = path.join(__dirname, '../playwright-report/report.json');
if (!fs.existsSync(reportPath)) {
  console.log('No test results found.');
  process.exit(0);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

let passed = 0;
let failed = 0;
let skipped = 0;
let total = 0;

const lines = [];

for (const suite of report.suites) {
  for (const spec of suite.specs) {
    for (const test of spec.tests) {
      const result = test.results[0];
      const status = result.status;
      total++;

      if (status === 'passed') {
        passed++;
        lines.push(`✔️ ${spec.title}`);
      } else if (status === 'failed') {
        failed++;
        lines.push(`❌ ${spec.title}`);
      } else {
        skipped++;
        lines.push(`⚠️ ${spec.title}`);
      }
    }
  }
}

const summary = [];
summary.push(`### Playwright Test Results`);
summary.push(`- Total tests: ${total}`);
summary.push(`- Passed: ${passed}`);
summary.push(`- Failed: ${failed}`);
if (skipped > 0) summary.push(`- Skipped: ${skipped}`);
summary.push(`\n**Test Summary**`);
lines.forEach(line => summary.push(line));

// Append link to report (will be dynamic via env var in workflow)
if (process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY) {
  const reportUrl = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  summary.push(`\n**Full HTML report:** [View in Actions](${reportUrl})`);
}

fs.writeFileSync('summary.txt', summary.join('\n'));
