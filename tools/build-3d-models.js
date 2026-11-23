#!/usr/bin/env node
// 3D 人體素材轉檔（開發工具）：Microsoft Rocketbox（MIT）FBX＋TGA → 3d/models/<人物>.glb＋預覽圖
// 人物＝身體（衣服、體型）＋頭（亞洲臉孔）：同性別的 Rocketbox 人物共用骨架、頭部網格與 UV 排法，頭換過去（tools/headswap.js），動畫照舊用男、女各一套
// 取得原始檔（MIT，上游 commit 記在 3d/licenses/assets.json）：
//   git clone --filter=blob:none --no-checkout https://github.com/microsoft/Microsoft-Rocketbox.git rb && cd rb
//   git checkout HEAD -- Assets/Avatars/Professions/Sports_Male_04 Assets/Avatars/Professions/Sports_Female_02 Assets/Avatars/Professions/Business_Male_02 Assets/Avatars/Adults/Male_Adult_10 Assets/Avatars/Adults/Female_Adult_03
// three 套件（FBXLoader、TGALoader、GLTFExporter 只有轉檔用，不放進 App）：npm pack three@0.187.0 && tar -xzf three-0.187.0.tgz
// 用法：node tools/build-3d-models.js --src rb/Assets/Avatars/Professions,rb/Assets/Avatars/Adults --three package [--only male,female2]
// 每個人物依序：轉檔（換頭、修法線）→ 貼圖縮小（glb-textures.py）→ 女性加馬尾骨頭（glb-add-ponytail.py）→ 合併同材質區塊（glb-merge-prims.py）
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { chromium } = require('playwright');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null };
const SRCS = (arg('--src') || '').split(',').filter(Boolean).map(p => path.resolve(p)), THREE_DIR = arg('--three') && path.resolve(arg('--three')), ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, '3d', 'models');
if (!SRCS.length || !THREE_DIR) { console.error('用法：node tools/build-3d-models.js --src <Rocketbox Professions 資料夾>,<Adults 資料夾> --three <three 套件資料夾> [--only male,female2]'); process.exit(2) }
// rig＝用哪一套動畫（男、女骨架比例不同）；head 沒寫＝用身體原本的頭（女性原本就是亞洲臉孔）
// cards: false＝不要透明髮片（男性短髮拿掉外觀幾乎一樣；維持每格繪製 ≤ 3 次、貼圖全是 JPEG）
const MODELS = {
  male: { body: 'Sports_Male_04', head: 'Business_Male_02', rig: 'male', cards: false },
  male2: { body: 'Sports_Male_04', head: 'Male_Adult_10', rig: 'male', cards: false },
  female: { body: 'Sports_Female_02', rig: 'female' },
  female2: { body: 'Sports_Female_02', head: 'Female_Adult_03', rig: 'female' }
};
const only = (arg('--only') || '').split(',').filter(Boolean);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const find = rel => { for (const d of SRCS) { const f = path.join(d, rel); if (f.startsWith(d) && fs.existsSync(f)) return f } return null };
const srv = http.createServer((q, res) => {
  const u = decodeURIComponent(q.url.split('?')[0]); let f = null;
  if (u.startsWith('/src/')) f = find(u.slice(5));
  else { const map = [['/three/', THREE_DIR], ['/tools/', __dirname]].find(([p]) => u.startsWith(p)); if (map) { f = path.join(map[1], u.slice(map[0].length)); if (!f.startsWith(map[1])) f = null } }
  if (!f || !fs.existsSync(f)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const py = (script, ...a) => execFileSync('python3', [path.join(__dirname, script), ...a], { stdio: 'inherit' });
srv.listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  p.on('pageerror', e => console.error('頁面錯誤：', e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/tools/build-3d.html`); await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [id, M] of Object.entries(MODELS)) {
    if (only.length && !only.includes(id)) continue;
    const r = await p.evaluate(([n, h, o]) => window.convert(n, h, o), [M.body, M.head || null, { cards: M.cards }]);
    if (r.info.missing.length) throw new Error(`${id} 有貼圖沒載入：${r.info.missing.join('、')}`);
    const tmp = path.join(OUT, `${id}.raw.glb`), glb = path.join(OUT, `${id}.glb`), who = M.head ? `${M.body} body with ${M.head} head` : M.body;
    fs.writeFileSync(tmp, Buffer.from(r.glb, 'base64')); fs.writeFileSync(path.join(OUT, `${id}.jpg`), Buffer.from(r.preview, 'base64'));
    console.log(`${id}（${who}）：${r.info.tris} 個三角形、頂點 ${r.info.vin} → ${r.info.vout}、${r.info.bones} 根骨頭、身高 ${r.info.height} m；材質 ${r.info.mats.join('、')}；換頭／法線 ${JSON.stringify(r.info.swap)}`);
    py('glb-textures.py', tmp, glb, `${who}, from Microsoft Rocketbox Avatar Library, Copyright (c) 2020 Microsoft, MIT License (see 3d/licenses/THIRD_PARTY_NOTICES.md)`); fs.unlinkSync(tmp);
    if (M.rig === 'female') py('glb-add-ponytail.py', glb, '--bone-only-if-short');   // 女性動畫都帶馬尾軌；短髮的人物只加骨頭
    py('glb-merge-prims.py', glb);
    console.log(`  → ${path.relative(ROOT, glb)} ${(fs.statSync(glb).size / 1048576).toFixed(2)} MB；預覽圖 ${(fs.statSync(path.join(OUT, `${id}.jpg`)).size / 1024).toFixed(0)} KB`);
  }
  await b.close(); srv.close();
});
