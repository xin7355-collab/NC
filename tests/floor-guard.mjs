#!/usr/bin/env node
// 地板守衛（constraint-driven-development）：比對「還沒推上 origin/main 的改動」，擋下偷偷降低品質門檻的改法
//   node tests/floor-guard.mjs [--base origin/main]
// 結束碼：0 沒問題；1 有降低門檻的改動（不要推，先修或請使用者同意）；2 沒辦法檢查（不是 git、找不到 origin/main）
// 檢查：① 測試的 check( 變少（刪測試或把測試註解掉）② 測試加了跳過（if (false)、.skip、// check(）
//       ③ index.html 新增 eval／new Function／document.write ④ CONSTRAINTS.md 的門檻被放寬或整條刪掉
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const i = process.argv.indexOf('--base'), base = i > -1 ? process.argv[i + 1] : 'origin/main';
const git = args => { try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }) } catch { return null } };
const bail = msg => { console.error('floor-guard：' + msg); process.exit(2) };
const top = git(['rev-parse', '--show-toplevel'])?.trim(); if (!top) bail('不是 git 工作區');
process.chdir(top);
const mb = git(['merge-base', base, 'HEAD'])?.trim(); if (!mb) bail('找不到和 ' + base + ' 的共同起點（先 git fetch origin main）');
const old = f => git(['show', `${mb}:${f}`]) ?? '', now = f => existsSync(f) ? readFileSync(f, 'utf8') : '';
const findings = [], flag = (rule, file, text) => findings.push({ rule, file, text: String(text).trim().slice(0, 140) });

// ① 測試數量不能變少
const TESTS = ['tests/e2e.js'], count = s => (s.match(/\bcheck\(/g) || []).length;
for (const f of TESTS) { const a = count(old(f)), b = count(now(f)); if (b < a) flag('測試變少', f, `check( 從 ${a} 個變成 ${b} 個`) }

// 新增的行（含還沒 commit 的改動與新檔）
const diff = (git(['diff', '--unified=0', mb, '--']) ?? bail('git diff 失敗')) + '\n' +
  (git(['ls-files', '--others', '--exclude-standard']) || '').split('\n').filter(Boolean).map(f => now(f).split('\n').map(l => '+' + l).join('\n').replace(/^/, `+++ b/${f}\n`)).join('\n');
let file = ''; const added = [];
for (const line of diff.split('\n')) { if (line.startsWith('+++ ')) { file = line.slice(4).replace(/^b\//, ''); continue } if (line.startsWith('---') || line.startsWith('@@') || line.startsWith('diff ')) continue; if (line.startsWith('+')) added.push({ file, text: line.slice(1) }) }

for (const { file: f, text } of added) {
  // ② 測試加了跳過
  if (TESTS.includes(f) && (/if\s*\(\s*(false|0)\s*\)/.test(text) || /\.(skip|only)\(/.test(text) || /^\s*\/\/\s*check\(/.test(text))) flag('測試被跳過', f, text);
  // ③ 不安全的寫法（XSS／程式注入）
  if (f === 'index.html' && /\beval\(|new Function\(|document\.write\(/.test(text)) flag('不安全的寫法', f, text);
}

// ④ CONSTRAINTS.md 門檻：表格第一欄是規則名稱；「≤ N」放寬＝變大、「≥ N」放寬＝變小；規則整條不見也算
const rules = s => { const m = new Map(); for (const l of s.split('\n')) { const c = l.split('|').map(x => x.trim()); if (l.trim().startsWith('|') && c[1] && !/^[-:]+$/.test(c[1]) && c[1] !== '規則') m.set(c[1], l) } return m };
const nums = t => [...t.matchAll(/(≤|≥|<|>|至少|不超過)\s*([\d.]+)/g)].map(x => ({ dir: /≤|<|不超過/.test(x[1]) ? 'max' : 'min', n: +x[2] }));
const R0 = rules(old('CONSTRAINTS.md')), R1 = rules(now('CONSTRAINTS.md'));
for (const [k, l0] of R0) { const l1 = R1.get(k); if (!l1) { flag('門檻被刪掉', 'CONSTRAINTS.md', k); continue }
  const a = nums(l0), b = nums(l1); a.forEach((x, j) => { const y = b.filter(z => z.dir === x.dir)[a.filter(z => z.dir === x.dir).indexOf(x)]; if (!y) flag('門檻被刪掉', 'CONSTRAINTS.md', `${k}：${x.dir === 'max' ? '≤' : '≥'} ${x.n}`);
    else if (x.dir === 'max' ? y.n > x.n : y.n < x.n) flag('門檻被放寬', 'CONSTRAINTS.md', `${k}：${x.n} → ${y.n}`) }) }

if (!findings.length) { console.log(`floor-guard：沒有降低門檻的改動（比對 ${base}，測試 check( ${count(now('tests/e2e.js'))} 個）`); process.exit(0) }
for (const x of findings) console.log(`✗ ${x.rule}：${x.file}：${x.text}`);
console.log('floor-guard：有降低品質門檻的改動。真的要這樣改，先在 CONSTRAINTS.md 寫明原因並請使用者同意。'); process.exit(1);
