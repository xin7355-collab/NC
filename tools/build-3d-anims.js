#!/usr/bin/env node
// 3D 運動動畫轉檔（開發工具）：產生 3d/anims/<動作>.glb（male、female 兩段動畫）＋ 3d/anims/<動作>.json（動作階段、品質數據）＋關鍵影格截圖
// 來源（授權見 3d/licenses）：
//   CMU 動作捕捉（BVH 版）：git clone --filter=blob:none --no-checkout https://github.com/una-dinosauria/cmu-mocap.git cmu && cd cmu && git checkout HEAD -- data/086/86_02.bvh
//   Mesh2Motion（CC0）：git clone --filter=blob:none --no-checkout https://github.com/Mesh2Motion/mesh2motion-app.git m2m && cd m2m && git checkout HEAD -- static/assets/human/animations/pushup.glb
//   three 套件（BVHLoader、GLTFExporter 只有轉檔用）：npm pack three@0.187.0 && tar -xzf three-0.187.0.tgz
// 用法：node tools/build-3d-anims.js --three package --cmu cmu/data --m2m m2m/static/assets/human/animations [--shots 截圖資料夾] [--only squat,lunge]
const http = require('http'), fs = require('fs'), path = require('path'), { chromium } = require('playwright');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }, abs = p => p && path.resolve(p);
const ROOT = path.join(__dirname, '..'), THREE_DIR = abs(arg('--three')), CMU = abs(arg('--cmu')), M2M = abs(arg('--m2m')), SHOTS = abs(arg('--shots')), ONLY = (arg('--only') || '').split(',').filter(Boolean);
if (!THREE_DIR || !CMU || !M2M) { console.error('用法：node tools/build-3d-anims.js --three <three 套件> --cmu <cmu-mocap/data> --m2m <mesh2motion 動畫資料夾>'); process.exit(2) }
const SPECS = require('./anim-specs.js');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const srv = http.createServer((q, res) => { const u = decodeURIComponent(q.url.split('?')[0]), m = [['/three/', THREE_DIR], ['/cmu/', CMU], ['/m2m/', M2M], ['/repo/', ROOT], ['/tools/', __dirname]].find(([p]) => u.startsWith(p));
  const f = m && path.join(m[1], u.slice(m[0].length)); if (!f || !f.startsWith(m[1]) || !fs.existsSync(f)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res) });
srv.listen(0, '127.0.0.1', async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage(); p.on('pageerror', e => console.error('頁面錯誤：', e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/tools/build-3d-anims.html`); await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
  const OUT = path.join(ROOT, '3d', 'anims'); fs.mkdirSync(OUT, { recursive: true }); if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  for (const spec of SPECS.filter(s => !ONLY.length || ONLY.includes(s.id))) {
    const t0 = Date.now(), { curve, ...plain } = spec, r = await p.evaluate(s => window.build(s), { ...plain, curve });
    fs.writeFileSync(path.join(OUT, spec.id + '.glb'), Buffer.from(r.glb, 'base64'));
    fs.writeFileSync(path.join(OUT, spec.id + '.json'), JSON.stringify({ id: spec.id, phases: r.phases, clips: r.clips, metrics: r.metrics }, null, 1) + '\n');
    if (SHOTS) for (const sex of ['male', 'female']) r.shots[sex].forEach((s, i) => fs.writeFileSync(path.join(SHOTS, `${spec.id}_${sex}_${s.v}_${i}.jpg`), Buffer.from(s.img, 'base64')));
    console.log(`${spec.id}：${(fs.statSync(path.join(OUT, spec.id + '.glb')).size / 1024).toFixed(0)} KB，${((Date.now() - t0) / 1000).toFixed(1)} 秒；階段 ${r.phases.map(x => `${x[0]} ${x[1]}–${x[2]}`).join('、')}`);
    for (const sex of ['male', 'female']) console.log(`  ${sex}`, JSON.stringify(r.metrics[sex]));
  }
  await b.close(); srv.close();
});
