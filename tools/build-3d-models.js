#!/usr/bin/env node
// 3D 人體素材轉檔（開發工具）：Microsoft Rocketbox（MIT）FBX＋TGA → 3d/models/{male,female}.glb＋預覽圖
// 取得原始檔（MIT，上游 commit 記在 3d/licenses/assets.json）：
//   git clone --filter=blob:none --no-checkout https://github.com/microsoft/Microsoft-Rocketbox.git rb && cd rb
//   git checkout HEAD -- Assets/Avatars/Professions/Sports_Male_04 Assets/Avatars/Professions/Sports_Female_02
// three 套件（FBXLoader、TGALoader、GLTFExporter 只有轉檔用，不放進 App）：npm pack three@0.187.0 && tar -xzf three-0.187.0.tgz
// 用法：node tools/build-3d-models.js --src rb/Assets/Avatars/Professions --three package
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { chromium } = require('playwright');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? path.resolve(process.argv[i + 1]) : null };
const SRC = arg('--src'), THREE_DIR = arg('--three'), ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, '3d', 'models');
if (!SRC || !THREE_DIR) { console.error('用法：node tools/build-3d-models.js --src <Rocketbox Professions 資料夾> --three <three 套件資料夾>'); process.exit(2) }
const MODELS = { male: 'Sports_Male_04', female: 'Sports_Female_02' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, res) => {
  const u = decodeURIComponent(q.url.split('?')[0]), map = [['/three/', THREE_DIR], ['/src/', SRC], ['/tools/', __dirname]].find(([p]) => u.startsWith(p));
  const f = map && path.join(map[1], u.slice(map[0].length));
  if (!f || !f.startsWith(map[1]) || !fs.existsSync(f)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
srv.listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage();
  p.on('pageerror', e => console.error('頁面錯誤：', e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/tools/build-3d.html`); await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [sex, name] of Object.entries(MODELS)) {
    const r = await p.evaluate(n => window.convert(n), name);
    if (r.info.missing.length) throw new Error(`${name} 有貼圖沒載入：${r.info.missing.join('、')}`);
    const tmp = path.join(OUT, `${sex}.raw.glb`), glb = path.join(OUT, `${sex}.glb`);
    fs.writeFileSync(tmp, Buffer.from(r.glb, 'base64')); fs.writeFileSync(path.join(OUT, `${sex}.jpg`), Buffer.from(r.preview, 'base64'));
    console.log(`${sex}（${name}）：${r.info.tris} 個三角形、頂點 ${r.info.vin} → ${r.info.vout}、${r.info.bones} 根骨頭、身高 ${r.info.height} m；材質 ${r.info.mats.join('、')}`);
    execFileSync('python3', [path.join(__dirname, 'glb-textures.py'), tmp, glb, `${name} from Microsoft Rocketbox Avatar Library, Copyright (c) 2020 Microsoft, MIT License (see 3d/licenses/THIRD_PARTY_NOTICES.md)`], { stdio: 'inherit' }); fs.unlinkSync(tmp);
    console.log(`  → ${path.relative(ROOT, glb)} ${(fs.statSync(glb).size / 1048576).toFixed(2)} MB；預覽圖 ${(fs.statSync(path.join(OUT, `${sex}.jpg`)).size / 1024).toFixed(0)} KB`);
  }
  await b.close(); srv.close();
});
