# GUI-Based Testing Code Review

> 🔍 Enhance pull request reviews with visual testing feedback, automated quality checks, and interactive dashboards

[![GitHub Action](https://img.shields.io/badge/GitHub-Action-2088FF?logo=github-actions)](https://github.com/marketplace/actions/gui-based-testing-code-review)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Playwright](https://img.shields.io/badge/Playwright-Ready-45ba4b?logo=playwright)](https://playwright.dev/)

![Dashboard preview](demo-dashboard.png)

## ✨ What This Does

Automatically captures and displays visual context from your Playwright tests directly in GitHub pull requests - no more asking reviewers to run tests locally to understand what changed.

### 🎯 Key Features

- **🔄 Visual Comparison** - Side-by-side test results from PR vs main branch
- **📊 Interactive Dashboard** - Beautiful test reports with flowcharts and metrics  
- **📋 Review Checklists** - Automated tracking of review completeness
- **🎨 Code Quality** - ESLint/Prettier checks with inline PR feedback via reviewdog
- **🚀 Modular Design** - Use all-in-one or integrate with existing CI/CD
- **💡 Actionable Insights** - Regression detection, flaky test identification, and prioritized recommendations

## 🚀 Quick Start

Add to your workflow in 30 seconds:

```yaml
name: GUI Test Review
on: [pull_request]

jobs:
  test-review:
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
          github-token: ${{ secrets.GITHUB_TOKEN }}
          enable-visual-comparison: 'true'  # Compare PR vs main
          max-test-retries: '2'             # Retry flaky tests
```

**That's it!** The action will:
1. Run your Playwright tests with automatic retries
2. Check code quality with ESLint/Prettier
3. Analyze test failures and identify patterns
4. Generate an interactive dashboard with performance metrics
5. Post an insightful summary comment on your PR

## 🏗️ Required Project Structure

```
your-gui-project/
├── tests/                          # GUI test files
│   ├── *.spec.{js,ts,tsx}         # Playwright test files
│   └── fixtures/                   # Test data and fixtures
├── scripts/                        # Action scripts (auto-included)
├── package.json                    # Dependencies
├── playwright.config.js            # Playwright configuration
├── .eslintrc.json                  # ESLint configuration (optional)
├── .prettierrc.json               # Prettier configuration (optional)
└── README.md                       # Project documentation
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

Add these to your `playwright.config.js`:

```javascript
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  use: {
    headless: true,
    screenshot: 'on',
    trace: 'on',
    video: 'off',
    ignoreHTTPSErrors: true,
  },
  reporter: [
    ['list'],
    ['json', { outputFile: 'playwright-metrics.json' }],   // ← relative path
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
});
```

## 🔧 Common Configurations

### Use with Existing Tests

Already running tests? Just add the dashboard:

```yaml
jobs:
  your-tests:
    # ... your existing test job
    
  dashboard:
    needs: [your-tests]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
      - uses: DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests@v1
        with:
          mode: 'dashboard-only'
```

### Separate Lint and Test Jobs

```yaml
with:
  mode: 'test-only'  # or 'lint-only'
```

### Key Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `mode` | `full`, `test-only`, `lint-only`, `dashboard-only` | `full` |
| `enable-visual-comparison` | Compare PR vs main branch | `false` |
| `enable-github-pages` | Deploy dashboard to Pages | `true` |
| `test-files` | Test file pattern | `tests` |
| `max-test-retries` | Maximum retries for flaky tests | `2` |
| `enable-pr-comments` | Post summary comment on PRs | `true` |
| `fail-on-test-failure` | Fail job if tests fail | `false` |
| `artifacts-retention-days` | Days to retain artifacts | `30` |

### Enhanced Outputs

| Output | Description |
|--------|-------------|
| `test-results` | JSON summary of Playwright results |
| `dashboard-url` | Deployed dashboard URL |
| `has-failures` | Boolean indicating if any tests failed |
| `failure-details` | JSON array of failed test names |
| `execution-time` | Total execution time in seconds |
| `performance-metrics` | JSON object with performance data |
| `gui-regression-detected` | True if regression detected vs main |

[📚 **Full Configuration Guide →**](https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/wiki/Configuration-Reference)

## 📊 What You Get

- **PR Comment** with test summary and metrics
- **Interactive Dashboard** with test flows and results
- **Inline Code Review** feedback via reviewdog
- **Visual Comparisons** between branches
- **Review Checklist** tracking
- **Smart Test Failure Analysis** to identify patterns
- **Performance Tracking** with optimization suggestions

## 📚 Documentation

- [**Configuration Reference**](https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/wiki/Configuration-Reference) - All inputs, outputs, and options
- [**Integration Patterns**](https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/wiki/Integration-Patterns) - Advanced CI/CD setups
- [**Architecture Guide**](https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/wiki/Architecture-Guide) - How it works under the hood
- [**Troubleshooting**](https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/wiki/Troubleshooting-Guide) - Common issues and solutions

## 🤝 Contributing

This project was developed for the Digital Product Innovation and Development Seminar at TUM.

[📚 **Full Academic Context & References →**](https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/wiki/Academic-Context-&-References)

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Playwright](https://playwright.dev/)
- Powered by [reviewdog](https://github.com/reviewdog/reviewdog)
- Visualizations with [Mermaid](https://mermaid-js.github.io/)
- GitHub integration via [Octokit](https://octokit.github.io/)
---

<p align="center">
  <a href="https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/wiki">📖 Wiki</a> •
  <a href="https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/issues">🐛 Issues</a> •
  <a href="https://github.com/DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests/discussions">💬 Discussions</a>
</p>
