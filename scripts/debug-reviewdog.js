#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

// Create artifacts directory if it doesn't exist
fs.mkdirSync('artifacts', { recursive: true });

console.log('Debug: Testing reviewdog setup directly');

// Check reviewdog version
console.log('Reviewdog version:');
execSync('reviewdog -version', { stdio: 'inherit' });

// Create a simple test diff
const testDiff = `diff --git a/test-file.txt b/test-file.txt
index 1234567..abcdefg 100644
--- a/test-file.txt
+++ b/test-file.txt
@@ -1,5 +1,5 @@
 This is a test file
-with a problem line
+with a fixed line
 and some
 other content
 here
`;

// Write test diff to file
fs.writeFileSync('artifacts/test-diff.txt', testDiff);
console.log('Created test diff file in artifacts/test-diff.txt');

// Try running reviewdog with test diff
console.log('Running reviewdog with test diff:');
const result = spawnSync(
  'reviewdog',
  [
    '-f=diff',
    '-name=test',
    '-reporter=github-pr-review',
    '-filter-mode=nofilter',
    '-level=info',
    '-fail-on-error=false'
  ],
  {
    input: testDiff,
    stdio: ['pipe', 'inherit', 'inherit'],
    encoding: 'utf8',
    env: {
      ...process.env,
      REVIEWDOG_GITHUB_API_TOKEN: process.env.GITHUB_TOKEN || process.env.REVIEWDOG_GITHUB_API_TOKEN
    }
  }
);

if (result.error) {
  console.error('Error running reviewdog:', result.error);
} else {
  console.log('Reviewdog exit code:', result.status);
  console.log('Reviewdog completed successfully');
}

// Environment variable checks
console.log('Checking environment variables:');
console.log('- GITHUB_TOKEN exists:', !!process.env.GITHUB_TOKEN);
console.log('- REVIEWDOG_GITHUB_API_TOKEN exists:', !!process.env.REVIEWDOG_GITHUB_API_TOKEN);
console.log('- GITHUB_EVENT_NAME:', process.env.GITHUB_EVENT_NAME);
