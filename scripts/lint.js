#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const IS_PR = process.env.GITHUB_EVENT_NAME === 'pull_request';
const capture = cmd => execSync(cmd, { encoding: 'utf8' }).trim();

/* ── Prettier ─────────────────────────────────────────────── */
function runPrettier() {
  execSync('npx prettier --write "tests/**/*.{js,ts,tsx,json}"', { stdio:'inherit' });

  const diff  = capture('git diff -U0 -- tests || true');
  const files = diff ? capture('git diff --name-only -- tests').split('\n').filter(Boolean) : [];
  const places = (diff.match(/^[+-](?![+-]{3})/gm) || []).length;

  if (diff && IS_PR)
    spawnSync('reviewdog',
      ['-f=diff','-name=prettier','-reporter=github-pr-review',
       '-filter-mode=nofilter','-tee','-level=info','-fail-on-error=false'],
      { input:diff, stdio:['pipe','inherit','inherit'], encoding:'utf8' });

  execSync('git checkout -- .');   // reset

  return { filesWithIssues: files.length, totalChanges: places, files,
           sample: diff.split('\n').slice(0,20).join('\n') };
}

/* ── ESLint ───────────────────────────────────────────────── */
function runESLint() {
  let raw=''; try{ raw=capture('npx eslint tests --ext .js,.ts,.tsx -f json'); }
  catch(e){ raw = e.stdout.toString(); }

  const results = raw ? JSON.parse(raw) : [];
  let errors=0,warnings=0,fixErr=0,fixWarn=0,first='',fileSet=new Set();

  results.forEach(f=>{
    if (f.messages.length) fileSet.add(path.basename(f.filePath));
    f.messages.forEach(m=>{
      if (m.severity===2){ errors++; if(m.fix) fixErr++; }
      if (m.severity===1){ warnings++; if(m.fix) fixWarn++; }
      if (!first && m.severity===2)
        first = `${m.ruleId||'unknown-rule'} in ${path.basename(f.filePath)}:${m.line}`;
    });
  });

  if (raw && IS_PR)
    spawnSync('reviewdog',
      ['-f=eslint','-name=eslint','-reporter=github-pr-review',
       '-filter-mode=nofilter','-tee'],
      { input:raw, stdio:['pipe','inherit','inherit'], encoding:'utf8' });

  return { files:fileSet.size, errors, warnings, fixableErrors:fixErr,
           fixableWarnings:fixWarn, first };
}

/* ── run & write artefact ────────────────────────────────── */
const prettier = runPrettier();
const eslint   = runESLint();

fs.mkdirSync('artifacts',{recursive:true});
fs.writeFileSync('artifacts/lint-summary.json',
  JSON.stringify({prettier, eslint},null,2));
console.log('📝 artifacts/lint-summary.json written');
