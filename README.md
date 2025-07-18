# GUI-Based Testing Code Review GitHub Extension

**A GitHub Action for enhancing code review processes for automated GUI tests by integrating visual context directly into GitHub pull requests.**

*Developed for the Digital Product Innovation and Development Seminar at Technical University of Munich (TUM)*

## 🎯 Project Overview

### Purpose
This GitHub Action addresses the challenge of reviewing GUI-based tests by automatically capturing and displaying visual context (screenshots, test flows, and metadata) directly within GitHub pull requests. Using Playwright as the testing framework, the system eliminates the need for reviewers to run tests locally, making the review process more efficient and accessible.

### Problem Statement
Code reviews on GitHub often lack visual information for GUI-based tests, making it harder for reviewers to assess what was tested. Testers frequently need to run tests locally, leading to inefficiencies and communication gaps between developers, testers, and reviewers.

### Solution
This tool automates the capture and display of relevant visuals and metadata within pull requests, providing:
- **Visual context** of the tested user interface directly in PRs
- **Reduced need** for local test execution, saving time and effort
- **Improved collaboration** through clearer communication during code reviews

## 👥 Stakeholders

| Stakeholder | Role | Primary Interests |
|-------------|------|-------------------|
| **Test Engineer/Developer** | Writes and reviews GUI-based tests, submits PRs | Quick, clear feedback on test results with screenshots and UI flow—without re-running tests locally |
| **Code Reviewer** | Reviews pull requests and approves changes | Full context on what was tested and changed to make informed decisions |

## 🚀 Key Features

### 🔄 **Visual Comparison Testing**
- Executes tests on both PR branch and main branch
- Provides side-by-side visual comparisons
- Automatically detects GUI test regressions

### 📊 **Comprehensive Visual Feedback**
- Interactive report with test results
- Visual flowcharts showing test execution paths
- Screenshot capture and diff analysis
- Integrated code quality metrics

### 📋 **Automated Review Assistance**
- Dynamic checklists for code reviewers
- Inline code quality feedback via reviewdog
- Automated PR comments with test summaries

### 🎨 **Enhanced Developer Experience**
- No local test execution required for reviewers
- Visual representation of GUI test logic
- Configurable ESLint and Prettier integration
- Comprehensive artifact management

### 🔧 **Modular Architecture** (New!)
- Integrate with existing CI/CD pipelines
- Run components separately or together
- Respect existing project configurations
- Support for any test framework through converters

## 🔧 Quick Start

### Basic Usage (All-in-One)

```yaml
name: GUI Test Code Review
on:
  pull_request:
    branches: [main]

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
          fetch-depth: 0  # Required for visual comparison
      
      - name: GUI-Based Testing Code Review
        uses: DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Modular Integration with Existing CI/CD

```yaml
name: CI Pipeline with GUI Review Dashboard

on: [pull_request]

jobs:
  # Your existing test job
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
      
      # Upload your test results as artifacts
      - uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: test-results/
  
  # Add the dashboard generation
  dashboard:
    needs: [test]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      pages: write
      id-token: write
    
    steps:
      - uses: actions/checkout@v4
      
      # Download artifacts from your existing jobs
      - uses: actions/download-artifact@v4
      
      # Generate dashboard only
      - uses: DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          mode: 'dashboard-only'
```

## 🔧 Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token for API access and reviewdog integration | Yes | `${{ github.token }}` |
| `mode` | Operation mode: full, lint-only, test-only, dashboard-only, comment-only | No | `full` |
| `test-files` | Glob pattern for GUI test files to analyze | No | `tests/**/*.spec.{js,ts,tsx}` |
| `node-version` | Node.js version to use | No | `18` |
| `enable-pr-comments` | Post comprehensive PR comments with visual feedback | No | `true` |
| `enable-github-pages` | Deploy visual dashboard to GitHub Pages | No | `true` |
| `reviewdog-reporter` | Reviewdog reporter for inline code quality feedback | No | `github-pr-review` |
| `artifacts-retention-days` | Days to retain test artifacts and screenshots | No | `30` |
| `web-report-url` | Base URL for visual dashboard | No | `''` (auto-generated) |
| `fail-on-test-failure` | Fail action if GUI tests fail | No | `false` |
| `playwright-config` | Path to Playwright configuration file | No | `playwright.config.js` |
| `enable-visual-comparison` | Enable visual comparison between PR and main branch | No | `true` |
| `main-branch` | Main branch name for visual comparison testing | No | `main` |
| `key-test-file` | Key test file to verify successful main branch checkout | No | `tests/demo-todo-app.spec.ts` |
| **Modular Inputs** | | | |
| `playwright-artifact` | Name of existing Playwright artifact to use (dashboard-only mode) | No | `''` |
| `eslint-artifact` | Name of existing ESLint artifact to use (dashboard-only mode) | No | `''` |
| `prettier-artifact` | Name of existing Prettier artifact to use (dashboard-only mode) | No | `''` |
| `custom-artifacts-path` | Path to custom artifacts directory | No | `artifacts` |
| `dependencies` | Additional npm dependencies to install (space-separated) | No | `''` |
| `use-project-eslint` | Use project ESLint config if exists | No | `true` |
| `use-project-prettier` | Use project Prettier config if exists | No | `true` |
| `skip-playwright` | Skip Playwright tests | No | `false` |
| `skip-eslint` | Skip ESLint checks | No | `false` |
| `skip-prettier` | Skip Prettier checks | No | `false` |
| `fail-on-error` | Fail action on any error | No | `false` |

## 📤 Outputs

| Output | Description |
|--------|-------------|
| `test-results` | Comprehensive JSON summary of GUI test results |
| `visual-artifacts-path` | Path to generated visual artifacts and screenshots |
| `dashboard-url` | URL to the deployed visual testing dashboard |
| `test-pass-rate` | GUI test pass rate percentage |
| `total-gui-tests` | Total number of GUI tests executed |
| `code-quality-score` | Overall code quality score based on linting results |
| `pr-test-results` | JSON summary of PR branch GUI test results |
| `main-test-results` | JSON summary of main branch GUI test results |
| `visual-comparison` | Visual comparison analysis between PR and main branch |
| `gui-regression-detected` | Whether GUI test regression was detected in PR |
| `review-checklist-status` | Status of the code review checklist completion |
| `artifacts-uploaded` | List of uploaded artifacts (modular mode) |
| `lint-results` | Lint results summary JSON (modular mode) |

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

## 🎯 What This Action Delivers

### 1. **Visual Context Integration** 📊
- Automatic screenshot capture during GUI test execution
- Side-by-side visual comparisons between PR and main branch
- Visual flowcharts showing test execution paths
- Interactive report for comprehensive analysis

### 2. **Automated Code Quality Assurance** 📋
- ESLint integration with Playwright-specific rules
- Prettier formatting checks
- Inline PR comments via reviewdog
- Custom rules for detecting mixed abstraction levels

### 3. **Enhanced Review Process** 🔍
- Dynamic checklists ensuring review completeness
- Context information linking changes to requirements
- Comprehensive PR comments with visual summaries
- Regression detection and alerting

### 4. **Developer Productivity** ⚡
- Eliminates need for local test execution by reviewers
- Provides immediate visual feedback on changes
- Automated artifact management and retention
- Configurable quality gates and failure policies

## 📊 Generated Artifacts

### Visual Reports
- **Interactive Dashboard**: Complete test analysis with visual elements
- **Flowchart Diagrams**: Mermaid-generated test execution flows
- **Screenshot Archives**: Before/after comparisons and failure captures
- **HTML Reports**: Detailed Playwright test results with visual context

### Data Artifacts
- **Test Summaries**: JSON format for both PR and main branch results
- **Code Quality Reports**: ESLint and Prettier analysis results
- **Checklist Status**: Review completion tracking
- **Regression Analysis**: Automated comparison results

### Integration Artifacts
- **PR Comments**: Comprehensive visual feedback for reviewers
- **GitHub Pages**: Deployed dashboards for persistent access
- **Artifact Storage**: Configurable retention for historical analysis

## 🔧 Operation Modes

The action supports multiple operation modes for maximum flexibility:

| Mode | Description | Use Case |
|------|-------------|----------|
| `full` | Run all checks and generate dashboard | Default, all-in-one solution |
| `test-only` | Run only Playwright tests | When you want to handle linting separately |
| `lint-only` | Run only ESLint/Prettier checks | When you want to handle tests separately |
| `dashboard-only` | Generate dashboard from existing artifacts | Integration with existing CI/CD |
| `comment-only` | Post PR comments from existing artifacts | Update comments without regenerating |

## 🏗️ Integration Patterns

### Pattern 1: Enhance Existing Playwright Tests

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright test
      
      # Generate metrics for dashboard
      - run: |
          npx playwright test --reporter=json > playwright-metrics.json
          mkdir -p artifacts
          cp playwright-metrics.json artifacts/
      
      - uses: actions/upload-artifact@v4
        with:
          name: playwright-artifacts
          path: artifacts/
  
  dashboard:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
      - uses: DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests@v1
        with:
          mode: 'dashboard-only'
```

### Pattern 2: Separate Jobs with Dependencies

```yaml
jobs:
  playwright:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests@v1
        with:
          mode: 'test-only'
  
  eslint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: DigitalProductInnovationAndDevelopment/Code-Reviews-of-GUI-Tests@v1
        with:
          mode: 'lint-only'
          use-project-eslint: 'true'
  
  dashboard:
    needs: [playwright, eslint]
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
          mode: 'dashboard-only'
```

## 🔍 Architecture Overview

### System Flow
1. **Developer** commits GUI test changes and opens PR
2. **GitHub Action** triggers automated analysis workflow
3. **Playwright Runner** executes tests on both PR and main branches
4. **Visual Processor** captures screenshots and generates comparisons
5. **Quality Analyzer** runs ESLint/Prettier checks with reviewdog integration
6. **Report Generator** creates interactive dashboards and flowcharts
7. **Integration Layer** posts comprehensive feedback to PR
8. **Reviewer** accesses visual context without local test execution

## 🎨 Respecting Existing Configurations

The action automatically detects and uses your project's existing configuration files:

### ESLint
- `.eslintrc.js`, `.eslintrc.json`, `.eslintrc.yml`
- `eslint.config.js`, `eslint.config.mjs`
- Set `use-project-eslint: 'false'` to use action's defaults

### Prettier
- `.prettierrc`, `.prettierrc.json`, `.prettierrc.js`
- `prettier.config.js`, `prettier.config.mjs`
- Set `use-project-prettier: 'false'` to use action's defaults

## 🤝 Contributing

This project was developed as part of the Digital Product Innovation and Development Seminar at TUM. Contributions are welcome for:

- Enhancing visual comparison algorithms
- Improving code quality detection rules
- Extending framework support beyond Playwright
- Adding new visualization types
- Optimizing performance for large test suites

## 📄 Academic Context

**Course**: Digital Product Innovation and Development Seminar  
**Institution**: Technical University of Munich (TUM), Germany  
**Date**: June 1, 2025  
**Stakeholder**: Andreas Bauer (Blekinge Institute of Technology)

### Project Team
- Alice Mota
- Amarilda Memushaj  
- Baris Arslan (CI/CD)
- Kalp Aghada (Project Manager)
- Xiaomin Qiu

## 📚 References

Based on research in GUI-based testing code reviews:
- "Code review guidelines for GUI-based testing artifacts" - Bauer et al. (2023)
- "When GUI-based Testing Meets Code Reviews" - Bauer et al. (unpublished)
- "Integrated Visual Software Analytics on the GitHub Platform" - Scheibel et al. (2024)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Contribution**: A dashboard and bot comments to improve comprehension during code reviews, with a guide on how to integrate your solution with existing CI testing jobs.