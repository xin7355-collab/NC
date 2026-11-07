#!/usr/bin/env node
// 地板守衛（constraint-driven-development）：比對「還沒推上 origin/main 的改動」，擋下偷偷降低品質門檻的改法
//   node tests/floor-guard.mjs [--base origin/main]     檢查目前的改動
//   node tests/floor-guard.mjs --selftest               自我測試（不碰 git）
// 結束碼：0 沒問題；1 有降低門檻的改動（不要推，先修或請使用者同意）；2 沒辦法檢查（不是 git、找不到 origin/main）
// 檢查：① 測試的 check( 變少 ② 測試被跳過（if (false)、.skip/.only、// 或 /* 註解掉的 check(）
//       ③ index.html 新增 eval／new Function／document.write ④ CONSTRAINTS.md「規則」表的門檻被放寬或整條刪掉
//       ⑤ index.html 新增的行有「行尾註解後面還接著程式」（註解把後面的程式吃掉）
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const TESTS = ['tests/e2e.js'];
const countChecks = s => (s.match(/\bcheck\(/g) || []).length;
// ② 一行測試程式是不是「把測試關掉」
const skipsTest = t => /if\s*\(\s*(false|0)\s*\)/.test(t) || /\.(skip|only)\(/.test(t) || /^\s*\/\/.*\bcheck\(/.test(t) || /\/\*[^]*\bcheck\(/.test(t);
const unsafe = t => /\beval\(|new Function\(|document\.write\(/.test(t);
// ⑤ 行尾註解後面還接著程式（例如把註解插在一行中間，後面的 if(…)return… 全被註解掉）
const swallowed = t => { const m = t.match(/[;}\)]\s+\/\/\s(.*)$/); return !!m && /(if|for)\s*\(|return[\s'"(`]|(const|let)\s+\w+\s*=|=>\s*\{|\)\{/.test(m[1].replace(/「[^」]*」|（[^）]*）/g, '')) };

// ④ CONSTRAINTS.md：只看第一個表格（欄位「規則｜門檻｜…」），例外表格不算（刪過期例外＝收緊）
function ruleRows(md) {
  const rows = new Map(); let inRules = false;
  for (const l of String(md || '').split('\n')) {
    if (/^#{1,6}\s/.test(l)) { if (inRules) break; continue }
    if (!l.trim().startsWith('|')) { if (inRules && l.trim()) break; continue }
    const c = l.split('|').slice(1, -1).map(x => x.trim());
    if (c[0] === '規則') { inRules = true; continue }
    if (!inRules || /^[-: ]+$/.test(c.join(''))) continue;
    rows.set(c[0], c[1] ?? '');
  }
  return rows;
}
// 門檻：「標籤 ≤ 數字 單位」或「數字 單位 以下／以內／以上」。數字去千分位、單位換成同一種（KB／MB、ms／s）
const UNIT = { kb: 1, mb: 1024, gb: 1048576, ms: 1, s: 1000, '秒': 1000, '%': 1, '個': 1, '筆': 1, '張': 1, '': 1 };
function thresholds(text) {
  const out = [], t = String(text);
  const re = /([^、，；。()（）|≤≥<>]*?)\s*(≤|≥|<|>|至少|不超過|不少於)\s*([\d,]+(?:\.\d+)?)\s*(KB|MB|GB|ms|s|秒|%|個|筆|張)?|([^、，；。()（）|≤≥<>]*?)\s*([\d,]+(?:\.\d+)?)\s*(KB|MB|GB|ms|s|秒|%|個|筆|張)?\s*(以下|以內|以上)/gi;
  let m;
  while ((m = re.exec(t))) {
    const op = m[2] ?? m[8], num = parseFloat((m[3] ?? m[6]).replace(/,/g, '')), unit = (m[4] ?? m[7] ?? '').toLowerCase();
    const dir = /≤|<|不超過|以下|以內/.test(op) ? 'max' : 'min', scale = UNIT[unit] ?? 1;
    const label = (m[1] ?? m[5] ?? '').replace(/[`*：:]/g, '').trim().slice(-12);
    const kind = /kb|mb|gb/.test(unit) ? 'size' : /ms|^s$|秒/.test(unit) ? 'time' : unit;
    out.push({ key: `${label}|${dir}|${kind}`, dir, v: num * scale, raw: m[0].trim() });
  }
  return out;
}
function constraintsDiff(oldMd, newMd) {
  const F = [], A = ruleRows(oldMd), B = ruleRows(newMd);
  for (const [rule, cell] of A) {
    if (!B.has(rule)) { F.push({ rule: '門檻被刪掉', file: 'CONSTRAINTS.md', text: rule }); continue }
    const before = thresholds(cell), after = thresholds(B.get(rule));
    for (const x of before) {
      // 先用「標籤＋方向＋單位種類」配對；同一列標籤一樣的照順序
      const same = before.filter(z => z.key === x.key), idx = same.indexOf(x), y = after.filter(z => z.key === x.key)[idx];
      if (!y) { F.push({ rule: '門檻被刪掉', file: 'CONSTRAINTS.md', text: `${rule}：${x.raw}` }); continue }
      if (x.dir === 'max' ? y.v > x.v : y.v < x.v) F.push({ rule: '門檻被放寬', file: 'CONSTRAINTS.md', text: `${rule}：${x.raw} → ${y.raw}` });
    }
  }
  return F;
}

if (process.argv.includes('--selftest')) {
  const T = (rows, extra = '') => `# 品質門檻\n\n| 規則 | 門檻 | 怎麼驗 |\n|---|---|---|\n${rows.map(r => `| ${r[0]} | ${r[1]} | x |`).join('\n')}\n\n## 例外\n\n| 編號 | 規則 | 原因 | 到期日 |\n|---|---|---|---|\n${extra}\n`;
  const base = T([['單檔大小', 'index.html ≤ 900 KB'], ['速度', '比對 ≤ 100 ms'], ['測試', '`check(` 數量 ≥ 226'], ['數量', '≤ 1,000 筆']], '| E1 | 速度 | 暫時 | 2026-12-31 |');
  const cases = [
    ['原樣不變', base, 0],
    ['刪掉過期的例外（收緊）', T([['單檔大小', 'index.html ≤ 900 KB'], ['速度', '比對 ≤ 100 ms'], ['測試', '`check(` 數量 ≥ 226'], ['數量', '≤ 1,000 筆']]), 0],
    ['同一列前面新增門檻', T([['單檔大小', 'index.html ≤ 900 KB'], ['速度', '載入 ≤ 1500 ms、比對 ≤ 100 ms'], ['測試', '`check(` 數量 ≥ 226'], ['數量', '≤ 1,000 筆']], '| E1 | 速度 | 暫時 | 2026-12-31 |'), 0],
    ['收緊門檻', T([['單檔大小', 'index.html ≤ 850 KB'], ['速度', '比對 ≤ 80 ms'], ['測試', '`check(` 數量 ≥ 230'], ['數量', '≤ 900 筆']]), 0],
    ['單位換算：900 KB → 1.2 MB', T([['單檔大小', 'index.html ≤ 1.2 MB'], ['速度', '比對 ≤ 100 ms'], ['測試', '`check(` 數量 ≥ 226'], ['數量', '≤ 1,000 筆']]), 1],
    ['千分位：1,000 → 1,500', T([['單檔大小', 'index.html ≤ 900 KB'], ['速度', '比對 ≤ 100 ms'], ['測試', '`check(` 數量 ≥ 226'], ['數量', '≤ 1,500 筆']]), 1],
    ['「以下」寫法放寬', T([['單檔大小', 'index.html ≤ 900 KB'], ['速度', '比對 150 ms 以下'], ['測試', '`check(` 數量 ≥ 226'], ['數量', '≤ 1,000 筆']]).replace('比對 150 ms 以下', '比對 150 ms 以下'), 1],
    ['最低數量調低', T([['單檔大小', 'index.html ≤ 900 KB'], ['速度', '比對 ≤ 100 ms'], ['測試', '`check(` 數量 ≥ 200'], ['數量', '≤ 1,000 筆']]), 1],
    ['整條規則刪掉', T([['單檔大小', 'index.html ≤ 900 KB'], ['測試', '`check(` 數量 ≥ 226'], ['數量', '≤ 1,000 筆']]), 1],
  ];
  // 「以下」那一條：先把基準改成「以下」寫法再放寬
  const baseBelow = base.replace('比對 ≤ 100 ms', '比對 100 ms 以下');
  let ok = 0; const bad = [];
  for (const [name, md, want] of cases) { const from = name.startsWith('「以下」') ? baseBelow : base, n = constraintsDiff(from, md).length, got = n ? 1 : 0; if (got === want) ok++; else bad.push(`${name}：預期 ${want ? '擋' : '不擋'}，實際 ${got ? '擋' : '不擋'}（${JSON.stringify(constraintsDiff(from, md))}）`) }
  const lines = [['// check(1)', true], ['/* check(1) */', true], ['  if (false) check(1)', true], ['test.skip(', true], ['check(1)', false], ['const x = 1 // 說明', false]];
  for (const [t, want] of lines) { if (skipsTest(t) === want) ok++; else bad.push(`「${t}」預期 ${want ? '算跳過' : '不算'}`) }
  const sw = [['const v=f(x);   // 壞資料不畫if(v.length<2)return 0;', true], ['let pk=1.6;   // 一般人 1.6 g/kgif(mode.kidney)pk=.8;', true], ['if(!its.length)continue;   // 候選（建議書）還沒買，不參與理賠const age=e.d?1:2;', true], ['const a=1;   // 說明：先算 a（如果有）', false], ['x();   // 和「if(a)return」無關的說明', false], ['const u="https://a.b";', false]];
  for (const [t, want] of sw) { if (swallowed(t) === want) ok++; else bad.push(`「${t}」預期 ${want ? '算吃掉程式碼' : '不算'}`) }
  const total = cases.length + lines.length + sw.length;
  if (bad.length) { console.log(bad.map(b => '✗ ' + b).join('\n')); console.log(`floor-guard 自我測試失敗 ${bad.length}/${total}`); process.exit(1) }
  console.log(`floor-guard 自我測試全部通過（${total} 項）`); process.exit(0);
}

// ⑤ 整個檔案掃一次（不只新增的行）：舊程式裡被註解吃掉的程式碼也要抓出來
const scanFile = f => (existsSync(f) ? readFileSync(f, 'utf8') : '').split('\n').map((t, n) => [n + 1, t]).filter(([, t]) => swallowed(t));
if (process.argv.includes('--scan')) {
  const f = process.argv[process.argv.indexOf('--scan') + 1] || 'index.html', hit = scanFile(f);
  for (const [n, t] of hit) console.log(`✗ 註解吃掉程式碼：${f}:${n}：${t.trim().slice(0, 140)}`);
  console.log(`floor-guard --scan：${f} 有 ${hit.length} 處註解吃掉程式碼`); process.exit(hit.length ? 1 : 0);
}

const i = process.argv.indexOf('--base'), base = i > -1 ? process.argv[i + 1] : 'origin/main';
const git = args => { try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }) } catch { return null } };
const bail = msg => { console.error('floor-guard：' + msg); process.exit(2) };
const top = git(['rev-parse', '--show-toplevel'])?.trim(); if (!top) bail('不是 git 工作區');
process.chdir(top);
const mb = git(['merge-base', base, 'HEAD'])?.trim(); if (!mb) bail('找不到和 ' + base + ' 的共同起點（先 git fetch origin main）');
const old = f => git(['show', `${mb}:${f}`]) ?? '', now = f => existsSync(f) ? readFileSync(f, 'utf8') : '';
const findings = [];

// ① 測試數量不能變少
for (const f of TESTS) { const a = countChecks(old(f)), b = countChecks(now(f)); if (b < a) findings.push({ rule: '測試變少', file: f, text: `check( 從 ${a} 個變成 ${b} 個` }) }

// 新增的行：只看測試檔和 index.html（還沒 commit 的改動也算；其他沒追蹤的檔案不讀，避免讀到大檔）
const WATCH = [...TESTS, 'index.html'];
const diff = git(['diff', '--unified=0', mb, '--', ...WATCH]) ?? bail('git diff 失敗');
const untracked = (git(['ls-files', '--others', '--exclude-standard', '--', ...WATCH]) || '').split('\n').filter(Boolean);
let file = ''; const added = [];
for (const line of diff.split('\n')) { if (line.startsWith('+++ ')) { file = line.slice(4).replace(/^b\//, ''); continue } if (line.startsWith('---') || line.startsWith('@@') || line.startsWith('diff ')) continue; if (line.startsWith('+')) added.push({ file, text: line.slice(1) }) }
for (const f of untracked) for (const t of now(f).split('\n')) added.push({ file: f, text: t });
for (const { file: f, text } of added) {
  if (TESTS.includes(f) && skipsTest(text)) findings.push({ rule: '測試被跳過', file: f, text: text.trim().slice(0, 140) });
  if (f === 'index.html' && unsafe(text)) findings.push({ rule: '不安全的寫法', file: f, text: text.trim().slice(0, 140) });
}
for (const [n, t] of scanFile('index.html')) findings.push({ rule: '註解吃掉程式碼', file: `index.html:${n}`, text: t.trim().slice(0, 140) });
// ④ CONSTRAINTS.md 門檻
findings.push(...constraintsDiff(old('CONSTRAINTS.md'), now('CONSTRAINTS.md')));

if (!findings.length) { console.log(`floor-guard：沒有降低門檻的改動（比對 ${base}，測試 check( ${countChecks(now('tests/e2e.js'))} 個）`); process.exit(0) }
for (const x of findings) console.log(`✗ ${x.rule}：${x.file}：${x.text}`);
console.log('floor-guard：有降低品質門檻的改動。真的要這樣改，先在 CONSTRAINTS.md 寫明原因並請使用者同意。'); process.exit(1);
