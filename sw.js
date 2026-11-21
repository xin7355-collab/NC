// Kinwell 離線快取（第六階段，Service Worker）。原則：
// 1. App 頁面先走網路：線上一定拿到最新版（「回到前景自動更新」照舊）；斷線或 5 秒沒回應才用上次存的
// 2. 3D 素材網址有 ?h=內容版本（3d/asset-ver.js）→ 存在手機直接用，沒網路也能播；同一個檔案只留最新的一份
// 3. 其他同網域檔案（3D 程式、圖示、審核資料包）先走網路、斷線用存的；同一個檔案只留一份
// 4. 不碰：跨網域請求（GAS、AI 服務等可能帶健康資料）、非 GET、影片分段請求（Range）；錯誤回應不存
const V = 'v1', PAGES = 'kw-pages-' + V, ASSETS = 'kw-3d-' + V;
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(PAGES).then(c => c.add(new Request(self.registration.scope, { cache: 'reload' }))).catch(() => {})) });   // 先存 App 首頁：第一次打開就斷網也能開
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('kw-') && k !== PAGES && k !== ASSETS) await caches.delete(k);   // 舊版本的快取整個刪掉
  await self.clients.claim() })()));
self.addEventListener('fetch', e => { const r = e.request; if (r.method !== 'GET' || r.headers.has('range')) return;
  const u = new URL(r.url); if (u.origin !== self.location.origin) return;
  e.respondWith(u.searchParams.has('h') ? cacheFirst(r, u) : networkFirst(r, u)) });
// 同一個檔案（路徑相同、網址參數不同＝舊版本）只留一份
async function keepOne(c, u) { for (const k of await c.keys()) { const ku = new URL(k.url); if (ku.pathname === u.pathname && ku.search !== u.search) await c.delete(k) } }
async function cacheFirst(r, u) { const c = await caches.open(ASSETS), hit = await c.match(r); if (hit) return hit;
  const res = await fetch(r); if (res.ok && res.type === 'basic') { await keepOne(c, u); await c.put(r, res.clone()) } return res }
const within = (p, ms) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error('timeout')), ms); p.then(v => { clearTimeout(t); ok(v) }, e => { clearTimeout(t); no(e) }) });
async function networkFirst(r, u) { const c = await caches.open(PAGES), nav = r.mode === 'navigate', key = nav ? new Request(u.origin + u.pathname) : r;
  try { const res = await (nav ? within(fetch(r), 5000) : fetch(r)); if (res.ok && res.type === 'basic') { if (!nav) await keepOne(c, u); await c.put(key, res.clone()) } return res }
  catch (err) { const hit = await c.match(key, { ignoreSearch: true }) || (nav && await c.match(new Request(self.registration.scope))); if (hit) return hit; throw err } }
