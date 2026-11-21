#!/usr/bin/env node
// 專業審核資料包（開發工具）：用 App 同一個 3D 檢視器拍
//   3d/review/media/<動作>_<male|female>_<start|middle|key|end>.jpg（起始／過程／關鍵／結束，側面）
//   3d/review/media/<動作>.mp4（男女並排、側面、一個循環；H.264，iPhone 能直接播）
// 寫 3d/review/package.json（每個動作的內容版本、截圖、影片），更新 3d/review/reviews.json 的內容版本：
//   內容（動畫檔或畫面上的文字）改過的動作 → 版本＋1、修正紀錄加一筆、已審核的狀態改回「待專業審核」（舊的審核不能沿用）
// 用法：node tools/build-review.js [--note "這次改了什麼"]   需要：playwright、ffmpeg（libx264）
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process'), { chromium } = require('playwright');
const { contentHash, loadExercises } = require('./review-hash.js');
const ROOT = path.join(__dirname, '..'), MEDIA = path.join(ROOT, '3d', 'review', 'media'), arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null };
const KEYS = [['start', '起始'], ['middle', '過程'], ['key', '關鍵'], ['end', '結束']], FPS = 30, W = 480, H = 400;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.jpg': 'image/jpeg' };
const p2 = n => String(n).padStart(2, '0'), d = new Date(), TODAY = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const srv = http.createServer((q, res) => { const u = decodeURIComponent(q.url.split('?')[0]), f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end() } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res) });
srv.listen(0, '127.0.0.1', async () => {
  const E = await loadExercises(ROOT); fs.mkdirSync(MEDIA, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }), p = await b.newPage({ viewport: { width: W, height: H } }); p.on('pageerror', e => console.error('頁面錯誤：', e.message));
  await p.goto(`http://127.0.0.1:${srv.address().port}/tools/review-capture.html`); await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
  const cap = (sex, id, ts, q) => p.evaluate(a => window.cap(...a), [sex, id, ts, q]), items = [];
  for (const ex of E) { const t0 = Date.now(), meta = JSON.parse(fs.readFileSync(path.join(ROOT, '3d', 'anims', ex.id + '.json'), 'utf8')), ph = meta.phases, dur = meta.clips[0].dur;
    const mid = i => +((ph[Math.min(i, ph.length - 1)][1] + ph[Math.min(i, ph.length - 1)][2]) / 2).toFixed(3), at = { start: 0, middle: mid(1), key: mid(2), end: ph[ph.length - 1][1] };   // 結束＝「完成」階段開始（做完、回到起始姿勢）
    const phaseAt = t => (ph.find(x => t >= x[1] - 1e-6 && t <= x[2] + 1e-6) || ph[0])[0], shots = {};
    for (const sex of ['male', 'female']) { const imgs = await cap(sex, ex.id, KEYS.map(([k]) => at[k]), 0.82);
      shots[sex] = KEYS.map(([k, label], i) => { const f = `${ex.id}_${sex}_${k}.jpg`, buf = Buffer.from(imgs[i], 'base64'); fs.writeFileSync(path.join(MEDIA, f), buf); return { key: k, label, phase: phaseAt(at[k]), t: at[k], file: `3d/review/media/${f}`, bytes: buf.length } }) }
    // 影片：每一格都用同一個檢視器逐格拍，男女並排
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kwrv-')), n = Math.round(dur * FPS);
    for (const sex of ['male', 'female']) for (let i0 = 0; i0 <= n; i0 += FPS) { const ts = []; for (let i = i0; i <= Math.min(n, i0 + FPS - 1); i++) ts.push(+(i / FPS).toFixed(4));
      (await cap(sex, ex.id, ts, 0.92)).forEach((x, k) => fs.writeFileSync(path.join(tmp, `${sex}_${String(i0 + k).padStart(4, '0')}.jpg`), Buffer.from(x, 'base64'))) }
    const mp4 = path.join(MEDIA, `${ex.id}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, 'male_%04d.jpg'), '-framerate', String(FPS), '-i', path.join(tmp, 'female_%04d.jpg'),
      '-filter_complex', '[0:v][1:v]hstack=inputs=2,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-movflags', '+faststart', '-an', mp4]);
    fs.rmSync(tmp, { recursive: true, force: true });
    items.push({ id: ex.id, name: ex.name, content: contentHash(ROOT, ex), dur, phases: ph, shots, video: { file: `3d/review/media/${ex.id}.mp4`, bytes: fs.statSync(mp4).size, w: W * 2, h: H, layout: '左：男性、右：女性（側面）' } });
    console.log(`${ex.id}：內容版本 ${items.at(-1).content}；影片 ${(fs.statSync(mp4).size / 1024).toFixed(0)} KB、截圖 ${Object.values(shots).flat().reduce((a, s) => a + s.bytes, 0) / 1024 | 0} KB；${((Date.now() - t0) / 1000).toFixed(1)} 秒`) }
  await b.close(); srv.close();
  fs.writeFileSync(path.join(ROOT, '3d', 'review', 'package.json'), JSON.stringify({ type: 'kinwell-3d-review-package', schema: 1, built: TODAY, items }, null, 1) + '\n');
  // 審核資料庫：內容版本有變的動作加修正紀錄；已審核過的改回「待專業審核」
  const dbf = path.join(ROOT, '3d', 'review', 'reviews.json'), db = JSON.parse(fs.readFileSync(dbf, 'utf8')), note = arg('--note') || '內容更新';
  for (const it of items) { const r = db.items[it.id] || (db.items[it.id] = { status: 'pending_review', rev: 0, content: null, reviewer: null, title: null, publish: false, reviewedAt: null, comments: {}, history: [] });
    if (r.content == null) { r.content = it.content; continue }
    if (r.content === it.content) continue;
    const back = !['draft', 'pending_review'].includes(r.status); r.rev += 1; r.history.push({ rev: r.rev, date: TODAY, kind: 'content', content: it.content, note: note + (back ? '（舊的審核不再適用，改回待專業審核）' : '') });
    r.content = it.content; if (back) Object.assign(r, { status: 'pending_review', reviewer: null, title: null, publish: false, reviewedAt: null, comments: {} });
    console.log(`  ${it.id}：內容改過 → 版本 ${r.rev}${back ? '，改回待專業審核' : ''}`) }
  db.updated = TODAY; fs.writeFileSync(dbf, JSON.stringify(db, null, 1) + '\n'); console.log('完成：3d/review/package.json、reviews.json');
});
