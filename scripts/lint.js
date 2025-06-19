#!/usr/bin/env node
/* Unified linter that always writes artifacts/lint-summary.json */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const IS_PR = process.env.GITHUB_EVENT_NAME === 'pull_request';
const capture = cmd => execSync(cmd, { encoding: 'utf8' }).trim();

/* ── Prettier ─────────────────────────────────────────────── */
function runPrettier() {
  console.log('\n▶ Prettier (write → diff → reviewdog)');
  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio: 'inherit' });

  const diff   = capture('git diff -U0 -- tests || true');
  const files  = diff ? capture('git diff --name-only -- tests').split('\n').filter(Boolean) : [];
  const totalChanges = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;

  if (diff && IS_PR) {
    spawnSync(
      'reviewdog',
      ['-f=diff','-name=prettier','-reporter=github-pr-review',
       '-filter-mode=nofilter','-level=info','-tee','-fail-on-error=false'],
      { input: diff, stdio:['pipe','inherit','inherit'], encoding:'utf8' }
    );
  }

  execSync('git checkout -- .');          // keep tree clean

  return { filesWithIssues: files.length, totalChanges, files,
           sample: diff.split('\n').slice(0,20).join('\n') };
}

/* ── ESLint ───────────────────────────────────────────────── */
function runESLint() {
  console.log('\n▶ ESLint');
  let raw = '';
  try { raw = capture('npx eslint tests --ext .js,.ts,.tsx -f json'); }
  catch (e) { raw = e.stdout.toString(); }

  const results = raw ? JSON.parse(raw) : [];
  let errors=0,warnings=0,first='',files=new Set();

  results.forEach(f=>{
    if (f.messages.length) files.add(path.basename(f.filePath));
    f.messages.forEach(m=>{
      if (m.severity===2){ errors++; if(!first) first=`${m.ruleId||'unknown-rule'} in ${path.basename(f.filePath)}:${m.line}`;}
      if (m.severity===1) warnings++;
    });
  });

  if (raw && IS_PR) {
    spawnSync(
      'reviewdog',
      ['-f=eslint','-name=eslint','-reporter=github-pr-review',
       '-filter-mode=nofilter','-tee'],
      { input: raw, stdio:['pipe','inherit','inherit'], encoding:'utf8' }
    );
  }

  return { files: files.size, errors, warnings, first };
}

/* ── run & always write summary ──────────────────────────── */
let prettier = { filesWithIssues:0,totalChanges:0,files:[],sample:'' };
let eslint   = { files:0,errors:0,warnings:0,first:'' };

try {
  prettier = runPrettier();
  eslint   = runESLint();
} finally {
  fs.mkdirSync('artifacts',{recursive:true});
  fs.writeFileSync('artifacts/lint-summary.json',
    JSON.stringify({prettier,eslint},null,2));
  console.log('📝 artifacts/lint-summary.json written');
}
