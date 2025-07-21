#!/usr/bin/env node
/**
 * Modular PR comment generator for GUI Test Review Dashboard
 */
const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/core');

// Configuration
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'artifacts';
const WEB_REPORT_URL = process.env.WEB_REPORT_URL || '';

// Helper to safely read JSON
const readJSON = (filename, defaultValue = {}) => {
  try {
    const filepath = path.join(ARTIFACTS_DIR, filename);
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }
  } catch (error) {
    console.log(`⚠️  Could not read ${filename}: ${error.message}`);
  }
  return defaultValue;
};

// Helper to check if file exists
const fileExists = (filename) => {
  return fs.existsSync(path.join(ARTIFACTS_DIR, filename));
};

// Get GitHub context
const getGitHubContext = () => {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error('GITHUB_EVENT_PATH not set');
  }
  
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const prNumber = event.pull_request?.number || event.issue?.number;
  
  if (!prNumber) {
    throw new Error('Not a pull request event');
  }
  
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  return { owner, repo, prNumber, event };
};

// Generate comment body
const generateCommentBody = () => {
  // Read all available summaries
  const playwrightSummary = readJSON('playwright-summary.json');
  const eslintSummary = readJSON('eslint-summary.json');
  const prettierSummary = readJSON('prettier-summary.json');
  const lintSummary = readJSON('lint-summary.json');
  
  // Check for visual comparison data
  const hasComparison = fileExists('playwright-summary-pr.json') && 
                       fileExists('playwright-summary-main.json');
  const prSummary = readJSON('playwright-summary-pr.json', playwrightSummary);
  const mainSummary = readJSON('playwright-summary-main.json');
  
  // Read checklist if available
  let checklist = '';
  try {
    const checklistPath = path.join(ARTIFACTS_DIR, 'checklist.md');
    if (fs.existsSync(checklistPath)) {
      checklist = fs.readFileSync(checklistPath, 'utf8');
    }
  } catch (error) {
    console.log('⚠️  No checklist found');
  }
  
  // Build sections
  const sections = [];
  
  // Header
  sections.push('# 🎯 GUI Test Review Dashboard\n');
  
  // Dashboard link (if available)
  const runId = process.env.GITHUB_RUN_ID || 'latest';
  if (WEB_REPORT_URL && !WEB_REPORT_URL.includes('artifact')) {
    sections.push(`📊 **[View Interactive Dashboard](${WEB_REPORT_URL})** ↗\n`);
  } else {
    sections.push(`📊 **Dashboard**: Available as artifact in [workflow summary](../../actions/runs/${runId})\n`);
  }
  
  // Test Results Section
  if (playwrightSummary.total > 0 || prSummary.total > 0) {
    sections.push('## 🧪 Test Results\n');
    
    if (hasComparison) {
      // Show comparison table
      sections.push('| Branch | Total | Passed | Failed | Skipped | Pass Rate | Duration |');
      sections.push('|--------|------:|-------:|-------:|--------:|----------:|---------:|');
      sections.push(`| **PR** | ${prSummary.total || 0} | ${prSummary.passed || 0} | ${prSummary.failed || 0} | ${prSummary.skipped || 0} | ${prSummary.pass_rate || 0}% | ${(prSummary.duration || 0) / 1000}s |`);
      sections.push(`| **Main** | ${mainSummary.total || 0} | ${mainSummary.passed || 0} | ${mainSummary.failed || 0} | ${mainSummary.skipped || 0} | ${mainSummary.pass_rate || 0}% | ${(mainSummary.duration || 0) / 1000}s |`);
      
      // Add regression warning if needed
      if (prSummary.failed > mainSummary.failed || prSummary.pass_rate < mainSummary.pass_rate) {
        sections.push('\n> ⚠️ **Regression detected**: PR has more failures than main branch\n');
      }
    } else {
      // Single result table
      const summary = prSummary.total > 0 ? prSummary : playwrightSummary;
      sections.push(`- **Total Tests**: ${summary.total || 0}`);
      sections.push(`- **Passed**: ${summary.passed || 0} (${summary.pass_rate || 0}%)`);
      sections.push(`- **Failed**: ${summary.failed || 0}`);
      if (summary.skipped > 0) {
        sections.push(`- **Skipped**: ${summary.skipped}`);
      }
      sections.push(`- **Duration**: ${((summary.duration || 0) / 1000).toFixed(2)}s`);
    }
    sections.push('');
  }
  
  // Code Quality Section
  const hasLintResults = (eslintSummary.files > 0 || prettierSummary.filesWithIssues > 0 ||
                         lintSummary.eslint?.files > 0 || lintSummary.prettier?.filesWithIssues > 0);
  
  if (hasLintResults) {
    sections.push('## 📋 Code Quality\n');
    
    // ESLint results
    const eslint = lintSummary.eslint || eslintSummary;
    if (eslint.files > 0 || eslint.errors > 0 || eslint.warnings > 0) {
      sections.push('### ESLint');
      sections.push(`- **Errors**: ${eslint.errors || 0}`);
      sections.push(`- **Warnings**: ${eslint.warnings || 0}`);
      if (eslint.fixableErrors > 0 || eslint.fixableWarnings > 0) {
        sections.push(`- **Auto-fixable**: ${(eslint.fixableErrors || 0) + (eslint.fixableWarnings || 0)} issues`);
      }
      if (eslint.first) {
        sections.push(`- **First issue**: \`${eslint.first}\``);
      }
      sections.push('');
    }
    
    // Prettier results
    const prettier = lintSummary.prettier || prettierSummary;
    if (prettier.filesWithIssues > 0) {
      sections.push('### Prettier');
      sections.push(`- **Files needing formatting**: ${prettier.filesWithIssues}`);
      sections.push(`- **Total changes needed**: ${prettier.totalChanges || 0}`);
      if (prettier.files && prettier.files.length > 0) {
        sections.push('- **Files**: ' + prettier.files.slice(0, 3).map(f => `\`${path.basename(f)}\``).join(', ') + 
                     (prettier.files.length > 3 ? ` and ${prettier.files.length - 3} more` : ''));
      }
      sections.push('');
    }
  }
  
  // Checklist Section
  if (checklist) {
    sections.push('## ✅ Review Checklist\n');
    sections.push(checklist);
    sections.push('');
  }
  
  // Footer
  sections.push('---');
  sections.push('_This comment is automatically generated and updated on each push._');
  if (WEB_REPORT_URL && !WEB_REPORT_URL.includes('artifact')) {
    sections.push(`_Full details available in the [interactive dashboard](${WEB_REPORT_URL})._`);
  } else {
    sections.push(`_Dashboard available as artifact in the workflow summary._`);
  }
  
  return sections.join('\n');
};

// Main execution
async function main() {
  try {
    console.log('💬 Generating PR comment...');
    console.log(`📁 Reading artifacts from: ${ARTIFACTS_DIR}`);
    
    // Get GitHub context
    const { owner, repo, prNumber } = getGitHubContext();
    console.log(`📍 Repository: ${owner}/${repo}`);
    console.log(`🔢 PR Number: ${prNumber}`);
    
    // Generate comment body
    const body = generateCommentBody();
    console.log(`📝 Comment length: ${body.length} characters`);
    
    // Initialize Octokit
    const octokit = new Octokit({ 
      auth: process.env.GITHUB_TOKEN 
    });
    
    // Find existing comment
    console.log('🔍 Looking for existing comment...');
    const { data: comments } = await octokit.request(
      'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
      { owner, repo, issue_number: prNumber }
    );
    
    const botComment = comments.find(comment => 
      comment.user.type === 'Bot' && 
      comment.body.includes('GUI Test Review Dashboard')
    );
    
    // Update or create comment
    if (botComment) {
      console.log('🔄 Updating existing comment...');
      await octokit.request(
        'PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}',
        { owner, repo, comment_id: botComment.id, body }
      );
      console.log('✅ Comment updated successfully');
    } else {
      console.log('📝 Creating new comment...');
      await octokit.request(
        'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
        { owner, repo, issue_number: prNumber, body }
      );
      console.log('✅ Comment created successfully');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Don't fail the workflow for comment errors
    if (error.message.includes('Not a pull request')) {
      console.log('ℹ️  Not running on a pull request, skipping comment');
      process.exit(0);
    }
    
    process.exit(1);
  }
}

// Run the script
main();