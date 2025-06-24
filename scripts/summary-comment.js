#!/usr/bin/env node
/**
 * Posts or updates a sticky "GUI Test Review" comment on PRs.
 */

const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/core');

const ART =
  process.env.ARTIFACTS_DIR ||
  'artifacts'; // fallback for local testing

const readJSON = (file, fallback = {}) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ART, file), 'utf8'));
  } catch {
    return fallback;
  }
};

const play = readJSON('playwright-summary.json');
const lint = readJSON('lint-summary.json');
const checklistMD = (() => {
  try {
    return fs.readFileSync(path.join(ART, 'checklist.md'), 'utf8');
  } catch {
    return '';
  }
})();

const webUrl = process.env.WEB_REPORT_URL;

const icon = (ok, warn = false) => (ok ? '✅' : warn ? '⚠️' : '❌');

const prNumber = (() => {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (event.pull_request) return event.pull_request.number;
  if (event.issue && event.issue.pull_request) return event.issue.number;
  throw new Error('Not a PR event');
})();

const owner = process.env.GITHUB_REPOSITORY?.split('/')[0];
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('GITHUB_TOKEN missing');
  process.exit(1);
}

const octokit = new Octokit({ auth: token });

/* ── Compose comment ── */
const body = `
# 🔍 **GUI Test Review**

<details open>
<summary><b>Checklist</b></summary>

${checklistMD || '_No checklist found_'}
</details>

---

**Playwright**:  
${icon(play.failed === 0 && play.passed > 0)}  
**Total:** ${play.total ?? 0} ✅ ${play.passed ?? 0} ❌ ${play.failed ?? 0} ⏭️ ${play.skipped ?? 0} ${play.pass_rate !== undefined ? `(Pass-rate ${play.pass_rate}%)` : ''} ${play.duration !== undefined ? `• Duration ${play.duration} ms` : ''}

---

**🎨 Prettier:**  
${lint.prettier?.filesWithIssues ?? 0} file(s) need formatting  
${lint.prettier?.files?.length ? `Files: ${lint.prettier.files.join(', ')}` : ''}  
${lint.prettier?.totalChanges ? `Num places to fix: ${lint.prettier.totalChanges}` : ''}  
${lint.prettier?.totalChanges > 50 ? `\n⚠️ **Num places to fix exceed the GitHub inline comment limit, suggested to fix it locally before PR with:**\n\`\`\`bash\nnpx prettier "tests/**/*.{js,jsx,ts,tsx}" --write\n\`\`\`` : ''}
${lint.prettier?.sample ? `\n<details><summary>First 20-line diff sample</summary>\n\n\`\`\`diff\n${lint.prettier.sample}\n\`\`\`\n</details>` : ''}

---

**📋 ESLint:**  
${lint.eslint?.errors ?? 0} error(s), ${lint.eslint?.warnings ?? 0} warning(s)  
${lint.eslint?.first ? `First error: \`${lint.eslint.first}\`` : ''}
💡 You can modify the \`eslint.local.config.mjs\` file to design custom rules
---

👉 **[Open Full Dashboard to see full report↗](${webUrl})**

---

_Automated comment updated on every push._
`;

/* ── Upsert sticky comment ── */
(async () => {
  // Get all comments
  const { data: comments } = await octokit.request(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    { owner, repo, issue_number: prNumber }
  );

  // Find the existing sticky comment
  const existing = comments.find(
    c =>
      c.user.type === 'Bot' &&
      c.body.startsWith('# 🔍 **GUI Test Review**')
  );

  if (existing) {
    await octokit.request('PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}', {
      owner,
      repo,
      comment_id: existing.id,
      body
    });
    console.log('🔄 Updated GUI-test summary comment.');
  } else {
    await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner,
      repo,
      issue_number: prNumber,
      body
    });
    console.log('💬 Created GUI-test summary comment.');
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
