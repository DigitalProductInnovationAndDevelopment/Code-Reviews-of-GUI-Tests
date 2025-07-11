# GUI Test Code Review Action

A comprehensive GitHub Action for reviewing GUI tests with **dual-branch comparison testing**, automated code quality checks, visual reporting, and intelligent PR comments.

## 🚀 Features

- **🔄 Dual-Branch Testing**: Compare test results between PR branch and main branch
- **🧪 Playwright Testing**: Run comprehensive GUI tests with detailed reporting
- **📊 Regression Detection**: Automatically detect test regressions in PRs
- **📋 Code Quality**: ESLint and Prettier integration with reviewdog for inline PR comments
- **📊 Visual Reports**: Generate flowcharts and interactive HTML dashboards
- **🔗 GitHub Integration**: Automated PR comments with test results and checklists
- **🌐 GitHub Pages**: Deploy test reports to GitHub Pages automatically
- **📦 Artifact Management**: Comprehensive artifact collection and retention

## 🎯 Dual-Branch Testing

This action's key feature is **comparison testing**: it runs your tests twice during PR reviews:

1. **PR Branch Tests**: Tests with your current changes
2. **Main Branch Tests**: Tests with the main branch version of test files
3. **Automatic Comparison**: Identifies regressions and improvements

This helps catch:
- Tests that pass on main but fail with your changes
- New tests that weren't in the main branch
- Performance regressions in test execution

## 📋 Quick Start

### Basic Usage

```yaml
a
```

### Advanced Usage with Comparison Testing

```yaml
name: Comprehensive GUI Testing with Comparison
on: [push, pull_request]

jobs:
  gui-test-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      pages: write
      id-token: write
    
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Required for comparison testing
      
      - name: Run GUI Test Review with Comparison
        uses: DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          test-files: 'tests/**/*.spec.{js,ts,tsx}'
          enable-comparison-testing: 'true'
          main-branch: 'main'
          key-test-file: 'tests/your-key-test.spec.ts'
          test-paths-to-checkout: 'tests/ playwright.config.js'
          fail-on-test-failure: 'false'
          
      # Use comparison outputs in subsequent steps
      - name: Check for regressions
        if: steps.test-review.outputs.tests-regression == 'true'
        run: |
          echo "⚠️ Test regression detected!"
          echo "PR Results: ${{ steps.test-review.outputs.pr-test-results }}"
          echo "Main Results: ${{ steps.test-review.outputs.main-test-results }}"
```

## 🔄 Comparison Testing Configuration

### Key Configuration Options

- **`enable-comparison-testing`**: Set to `false` to disable dual-branch testing
- **`main-branch`**: Configure your main branch name (default: `main`)
- **`key-test-file`**: A test file that must exist for validation (customize for your project)
- **`test-paths-to-checkout`**: Which files/directories to checkout from main branch

### Important Notes

1. **Fetch Depth**: Use `fetch-depth: 0` in your checkout step for comparison testing
2. **Key Test File**: Update `key-test-file` to match a real test file in your project
3. **File Paths**: Customize `test-paths-to-checkout` based on your project structure

## 🔧 Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token for API access | Yes | `${{ github.token }}` |
| `test-files` | Glob pattern for test files | No | `tests/**/*.spec.{js,ts,tsx}` |
| `node-version` | Node.js version to use | No | `18` |
| `enable-pr-comments` | Post PR comments with results | No | `true` |
| `enable-github-pages` | Deploy report to GitHub Pages | No | `true` |
| `reviewdog-reporter` | Reviewdog reporter type | No | `github-pr-review` |
| `eslint-config` | Custom ESLint config path | No | `''` |
| `prettier-config` | Custom Prettier config path | No | `''` |
| `artifacts-retention-days` | Days to retain artifacts | No | `30` |
| `web-report-url` | Base URL for web report | No | `''` (auto-generated) |
| `fail-on-test-failure` | Fail action if tests fail | No | `false` |
| `playwright-config` | Playwright config file path | No | `playwright.config.js` |
| `enable-comparison-testing` | Enable dual-branch comparison | No | `true` |
| `main-branch` | Main branch name for comparison | No | `main` |
| `key-test-file` | Key test file to verify checkout | No | `tests/demo-todo-app.spec.ts` |
| `test-paths-to-checkout` | Paths to checkout from main | No | `tests/ playwright.config.js` |

## 📤 Outputs

| Output | Description |
|--------|-------------|
| `test-results` | JSON summary of test results |
| `artifacts-path` | Path to generated artifacts |
| `report-url` | URL to the deployed web report |
| `pass-rate` | Test pass rate percentage |
| `total-tests` | Total number of tests executed |
| `eslint-errors` | Number of ESLint errors found |
| `prettier-issues` | Number of files with Prettier issues |
| `pr-test-results` | JSON summary of PR branch test results |
| `main-test-results` | JSON summary of main branch test results |
| `comparison-summary` | Complete comparison between PR and main |
| `tests-regression` | Whether tests show regression vs main |

## 🏗️ Project Structure

Your project should have the following structure:

```
your-repo/
├── tests/                     # Test files
│   └── *.spec.{js,ts,tsx}    # Playwright test files
├── scripts/                   # Action scripts (optional - included in action)
│   ├── lint.js
│   ├── playwright-test.js
│   ├── generate-flowchart.js
│   ├── checklist.js
│   ├── generate-webpage.js
│   └── summary-comment.js
├── package.json              # Dependencies
├── playwright.config.js      # Playwright configuration
├── .eslintrc.json           # ESLint configuration
├── .prettierrc.json         # Prettier configuration
└── README.md
```

## 📦 Required Dependencies

Add these to your `package.json`:

```json
{
  "devDependencies": {
    "@playwright/test": "^1.52.0",
    "@mermaid-js/mermaid-cli": "10.6.1",
    "@octokit/core": "^5.0.0",
    "@typescript-eslint/eslint-plugin": "^8.35.0",
    "@typescript-eslint/parser": "^8.35.0",
    "eslint": "^8.0.0",
    "eslint-plugin-playwright": "^2.2.0",
    "eslint-plugin-prettier": "^5.5.1",
    "marked": "15.0.12",
    "prettier": "^3.3.2"
  }
}
```

## 🎯 What This Action Does

### 1. **Dual-Branch Comparison Testing** 🔄
- Runs tests on your PR branch with current changes
- Checks out and runs tests with main branch test files
- Compares results to detect regressions automatically
- Archives separate reports for both test runs

### 2. **Code Quality Checks** 📋
- Runs ESLint with configurable rules
- Checks Prettier formatting
- Integrates with reviewdog for inline PR comments
- Generates detailed lint summaries

### 3. **GUI Testing** 🧪
- Executes Playwright tests
- Generates comprehensive test reports
- Creates test result summaries
- Handles test failures gracefully

### 4. **Visual Reporting** 📊
- Creates Mermaid flowcharts showing test structure
- Generates interactive HTML dashboards
- Builds completion checklists
- Produces downloadable artifacts

### 5. **GitHub Integration** 🔗
- Posts/updates PR comments with comparison results
- Deploys reports to GitHub Pages
- Manages artifact uploads
- Provides detailed test summaries with regression detection

## 🔄 Workflow Integration

### For Pull Requests

```yaml
name: PR Review
on:
  pull_request:
    branches: [main]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: GUI Test Review
        uses: DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          enable-pr-comments: 'true'
          enable-github-pages: 'false'
```

### For Main Branch with Deployment

```yaml
name: Main Branch Testing
on:
  push:
    branches: [main]

jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    
    steps:
      - uses: actions/checkout@v4
      
      - name: GUI Test Review
        id: test-review
        uses: DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          enable-pr-comments: 'false'
          enable-github-pages: 'true'
          fail-on-test-failure: 'true'
```

## 🛠️ Configuration Examples

### ESLint Configuration (`.eslintrc.json`)

```json
{
  "env": {
    "browser": true,
    "es2021": true,
    "node": true
  },
  "extends": [
    "eslint:recommended",
    "@typescript-eslint/recommended"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "plugins": [
    "@typescript-eslint",
    "playwright"
  ],
  "rules": {
    "playwright/no-wait-for-timeout": "error"
  }
}
```

### Prettier Configuration (`.prettierrc.json`)

```json
{
  "printWidth": 100,
  "singleQuote": true,
  "semi": true,
  "trailingComma": "es5"
}
```

### Playwright Configuration (`playwright.config.js`)

```javascript
module.exports = {
  testDir: './tests',
  reporter: [
    ['html'],
    ['json', { outputFile: 'playwright-metrics.json' }]
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    }
  ]
};
```

## 📊 Generated Reports

### 1. **HTML Dashboard**
- Interactive test results
- Code quality metrics
- Visual flowcharts
- Downloadable artifacts

### 2. **PR Comments**
- Test pass/fail summary
- Code quality issues
- Links to full reports
- Completion checklist

### 3. **Artifacts**
- `playwright-summary-pr.json` - PR branch test results
- `playwright-summary-main.json` - Main branch test results  
- `lint-summary.json` - Code quality results
- `flowchart.png` - Visual test structure
- `checklist.md` - Completion status
- `pr-report/` - PR branch HTML test report
- `main-report/` - Main branch HTML test report
- `web-report/` - Combined HTML dashboard

## 🔧 Troubleshooting

### Common Issues

1. **Permission Errors**
   - Ensure proper permissions in your workflow
   - Check `contents`, `pull-requests`, and `pages` permissions

2. **Missing Dependencies**
   - Verify all required packages in `package.json`
   - Check Node.js version compatibility

3. **Test Failures**
   - Use `fail-on-test-failure: 'false'` for non-blocking behavior
   - Check Playwright configuration
   - Verify test file paths

4. **Reviewdog Issues**
   - Ensure `GITHUB_TOKEN` has proper permissions
   - Check PR event context
   - Verify reviewdog reporter settings

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 🙏 Acknowledgments

- Built with [Playwright](https://playwright.dev/)
- Powered by [reviewdog](https://github.com/reviewdog/reviewdog)
- Visualizations with [Mermaid](https://mermaid-js.github.io/)
- GitHub integration via [Octokit](https://octokit.github.io/)

## License

This work (source code) is licensed under [MIT](./LICENSE)
