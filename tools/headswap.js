// 3D 人物換頭（開發工具，tools/build-3d.html 用；不是 App 的一部分）
// Microsoft Rocketbox 同性別的人物共用同一套骨架名稱（Bip01）、頭部網格與頭部貼圖的 UV 排法，所以可以把 D（提供頭的人物）的頭部、頭髮搬到 B（身體）上：
// 1) 頂點對位：D 的頭部頂點用「B 綁定姿勢的骨頭 × D 的反綁定矩陣」逐骨頭換到 B 身上（依蒙皮權重平均），骨頭編號換成 B 的
// 2) 脖子：每個人物的頭部網格下緣不一樣高（看衣領）。B 頭部網格在 D 下緣以下、跟身體連著的部分（脖子）保留、改貼 D 的頭部貼圖；
//    D 下緣和「B 身體＋保留的脖子」上緣之間用細三角形縫起來（拉鍊式，依繞脖子的角度配對）
// 3) 膚色：harmonize()：脖子那塊直接放 B 自己的脖子貼圖（跟 B 的身體本來就接得起來），D 的脖子靠近接縫的地方漸層調到 B 的膚色
// 4) 法線：原檔頭部、頭髮有些頂點法線跟所在的面差 75° 以上，打光時頭髮會出現發亮的方塊、灰白條紋；只換掉這些頂點（renormal）
import * as THREE from 'three';

export const kind = m => /_head/i.test(m.name) ? 'head' : /_opacity/i.test(m.name) ? 'op' : 'body';
const K = p => `${Math.round(p.x * 100)},${Math.round(p.y * 100)},${Math.round(p.z * 100)}`;   // 合併同位置頂點用（FBX 單位公分 → 0.1 mm）
const ek = (a, b) => a.key < b.key ? a.key + '|' + b.key : b.key + '|' + a.key;

// 三角形清單：每個頂點 {p（B 的綁定世界座標）, n, uv, si, sw, key}；xf 負責換座標
function triList(mesh, xf) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry, mats = [].concat(mesh.material), A = g.attributes, out = [];
  const groups = g.groups.length ? g.groups : [{ start: 0, count: A.position.count, materialIndex: 0 }];
  for (const gr of groups) { const m = mats[gr.materialIndex], k = kind(m);
    for (let v = gr.start; v < gr.start + gr.count; v += 3) out.push({ k, m, v: [0, 1, 2].map(i => { const j = v + i;
      const r = { p: new THREE.Vector3().fromBufferAttribute(A.position, j), n: new THREE.Vector3().fromBufferAttribute(A.normal, j), uv: [A.uv.getX(j), A.uv.getY(j)],
        si: [0, 1, 2, 3].map(c => A.skinIndex.getComponent(j, c)), sw: [0, 1, 2, 3].map(c => A.skinWeight.getComponent(j, c)) };
      xf(r); r.key = K(r.p); return r }) }) }
  return out }

// 開放邊（只屬於一個三角形的邊）連成環；環上每個頂點取自那條邊所屬的三角形（UV 在同一側）
function loops(T) {
  const E = new Map();
  for (const t of T) for (let i = 0; i < 3; i++) { const a = t.v[i], b = t.v[(i + 1) % 3], k = ek(a, b), e = E.get(k); if (e) e.n++; else E.set(k, { n: 1, a, b }) }
  const open = [...E.values()].filter(e => e.n === 1), nx = new Map(), add = (k, e) => (nx.get(k) || nx.set(k, []).get(k)).push(e);
  for (const e of open) { add(e.a.key, e); add(e.b.key, e) }
  const used = new Set(), res = [];
  for (const e0 of open) { if (used.has(e0)) continue; const L = []; let e = e0, cur = e0.a; used.add(e0);
    for (let guard = 0; guard < 20000; guard++) { L.push(cur); const other = cur === e.a ? e.b : e.a, nxt = (nx.get(other.key) || []).find(f => !used.has(f)); if (!nxt) break; used.add(nxt); cur = nxt.a.key === other.key ? nxt.a : nxt.b; e = nxt }
    res.push(L) }
  return res }

// 法線跟所在的面差太多（> maxDeg）的頂點：換成同位置所有面的平均法線（還是差太多就用這個面的法線）
export function renormal(T, maxDeg = 75) {
  const acc = new Map(), fn = t => new THREE.Vector3().crossVectors(t.v[1].p.clone().sub(t.v[0].p), t.v[2].p.clone().sub(t.v[0].p));
  for (const t of T) { const n = fn(t); for (const r of t.v) { const a = acc.get(r.key); if (a) a.add(n); else acc.set(r.key, n.clone()) } }
  const c = Math.cos(maxDeg * Math.PI / 180); let fixed = 0;
  for (const t of T) { const f0 = fn(t); if (f0.lengthSq() < 1e-12) continue; f0.normalize();
    for (const r of t.v) if (r.n.dot(f0) < c) { const a = acc.get(r.key).clone().normalize(); r.n.copy(a.dot(f0) > c ? a : f0); fixed++ } }
  return fixed }

// 頭部貼圖：脖子放 B 的貼圖、D 靠近接縫處漸層調到 B 的膚色、沒畫到的地方補邊（見檔頭說明 3）
function harmonize(dTex, bTex, dHead, bandT, zipT, seamLoop) {
  const W = dTex.image.width, H = dTex.image.height, Dd = dTex.image.data, sd = Dd.length / (W * H), bW = bTex.image.width, bH = bTex.image.height, Bd = bTex.image.data, sb = Bd.length / (bW * bH);
  const F = Math.round(0.05 * H), BL = Math.max(4, Math.round(0.012 * H)), fyD = dTex.flipY, fyB = bTex.flipY, N = W * H;
  const bIdx = i => { const x = i % W, y = (i / W) | 0, u = (x + .5) / W, vv = fyD ? 1 - (y + .5) / H : (y + .5) / H, bx = Math.min(bW - 1, (u * bW) | 0), by = Math.min(bH - 1, ((fyB ? 1 - vv : vv) * bH) | 0); return by * bW + bx };
  const px = uv => [uv[0] * W, (fyD ? 1 - uv[1] : uv[1]) * H];
  const mk = () => new Uint8Array(N), mAll = mk(), mMain = mk(), mBand = mk(), seed = mk();
  const raster = (T, M) => { for (const t of T) { const P = t.v.map(r => px(r.uv));
    const x0 = Math.max(0, Math.floor(Math.min(...P.map(p => p[0]))) - 1), x1 = Math.min(W - 1, Math.ceil(Math.max(...P.map(p => p[0]))) + 1), y0 = Math.max(0, Math.floor(Math.min(...P.map(p => p[1]))) - 1), y1 = Math.min(H - 1, Math.ceil(Math.max(...P.map(p => p[1]))) + 1);
    const e = (a, b, x, y) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]), ar = e(P[0], P[1], P[2][0], P[2][1]); if (Math.abs(ar) < 1e-9) continue; const tol = 1.5 / Math.sqrt(Math.abs(ar));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const qx = x + .5, qy = y + .5; if (e(P[1], P[2], qx, qy) / ar >= -tol && e(P[2], P[0], qx, qy) / ar >= -tol && e(P[0], P[1], qx, qy) / ar >= -tol) M[y * W + x] = 1 } } };
  // 主要 UV 島＝面積最大的島（臉、頭皮、脖子）；眼睛、牙齒的小島不動
  const par = new Map(), f = k => { while (par.get(k) !== k) { par.set(k, par.get(par.get(k))); k = par.get(k) } return k }, uk = r => `${Math.round(r.uv[0] * 1e4)},${Math.round(r.uv[1] * 1e4)}`;
  for (const t of dHead) for (const r of t.v) { const k = uk(r); if (!par.has(k)) par.set(k, k) }
  for (const t of dHead) { const a = f(uk(t.v[0])); for (const r of t.v.slice(1)) { const b = f(uk(r)); if (a !== b) par.set(b, a) } }
  const area = new Map(); for (const t of dHead) { const [a, b, c] = t.v.map(r => r.uv), s = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2, k = f(uk(t.v[0])); area.set(k, (area.get(k) || 0) + s) }
  const main = [...area].sort((a, b) => b[1] - a[1])[0][0];
  raster(dHead, mAll); raster(dHead.filter(t => f(uk(t.v[0])) === main), mMain); raster([...bandT, ...zipT], mBand);
  for (let k = 0; k < 4; k++) { const nb = mBand.slice(); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (!mBand[i] && (mBand[i - 1] || mBand[i + 1] || mBand[i - W] || mBand[i + W]) && !(mAll[i] && !mMain[i])) nb[i] = 1 } mBand.set(nb) }
  // 接縫：D 下緣在貼圖上的折線（3 像素寬）；跨 UV 接縫（u 差超過一半）的段跳過
  for (let i = 0; i < seamLoop.length; i++) { const a = seamLoop[i], b = seamLoop[(i + 1) % seamLoop.length]; if (Math.abs(a.uv[0] - b.uv[0]) > .5) continue; const A = px(a.uv), Bp = px(b.uv), n = Math.ceil(Math.hypot(Bp[0] - A[0], Bp[1] - A[1])) + 1;
    for (let s = 0; s <= n; s++) { const x = Math.round(A[0] + (Bp[0] - A[0]) * s / n), y = Math.round(A[1] + (Bp[1] - A[1]) * s / n); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) seed[yy * W + xx] = 1 } } }
  for (let i = 0; i < N; i++) if (mBand[i]) seed[i] = 1;
  // 1) 脖子範圍：B 的頭部貼圖
  for (let i = 0; i < N; i++) if (mBand[i]) { const bi = bIdx(i); for (let c = 0; c < 3; c++) Dd[i * sd + c] = Bd[bi * sb + c]; if (sd === 4) Dd[i * sd + 3] = 255 }
  // 2) 主要島內離接縫的距離
  const dist = new Int32Array(N).fill(-1), q = new Int32Array(N); let qh = 0, qt = 0;
  for (let i = 0; i < N; i++) if (seed[i]) { dist[i] = 0; q[qt++] = i }
  while (qh < qt) { const i = q[qh++]; if (dist[i] >= F + BL) continue; const x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) { if (j < 0 || j >= N || dist[j] >= 0 || !mMain[j]) continue; dist[j] = dist[i] + 1; q[qt++] = j } }
  // 「B − D」的差，兩邊內容不同（頭髮對皮膚、顏色差太多）的地方權重 0；加權模糊後只留低頻（膚色），D 的細節不動
  const num = new Float32Array(N * 3), den = new Float32Array(N);
  for (let i = 0; i < N; i++) { if (dist[i] < 0 || mBand[i]) continue; const bi = bIdx(i); let s = 0; const d3 = [0, 1, 2].map(c => Bd[bi * sb + c] - Dd[i * sd + c]); for (const d of d3) s += Math.abs(d); s /= 3;
    const lumD = (Dd[i * sd] + Dd[i * sd + 1] + Dd[i * sd + 2]) / 3, lumB = (Bd[bi * sb] + Bd[bi * sb + 1] + Bd[bi * sb + 2]) / 3, w = Math.max(0, Math.min(1, 1 - (s - 45) / 35)) * (lumD > 45 && lumB > 45 ? 1 : 0);
    den[i] = w; for (let c = 0; c < 3; c++) num[i * 3 + c] = d3[c] * w }
  const blur = (A, ch) => { const T = new Float32Array(N * ch); for (let pass = 0; pass < 2; pass++) { const src = pass ? T.slice() : A, dst = pass ? A : T;
    for (let y = 0; y < H; y++) { const acc = new Float64Array(ch); for (let x = -BL; x < W; x++) { const a = x + BL; if (a < W) for (let c = 0; c < ch; c++) acc[c] += src[(y * W + a) * ch + c]; if (x - BL - 1 >= 0) for (let c = 0; c < ch; c++) acc[c] -= src[(y * W + x - BL - 1) * ch + c]; if (x >= 0) for (let c = 0; c < ch; c++) dst[(y * W + x) * ch + c] = acc[c] } }
    const tmp = dst.slice();
    for (let x = 0; x < W; x++) { const acc = new Float64Array(ch); for (let y = -BL; y < H; y++) { const a = y + BL; if (a < H) for (let c = 0; c < ch; c++) acc[c] += tmp[(a * W + x) * ch + c]; if (y - BL - 1 >= 0) for (let c = 0; c < ch; c++) acc[c] -= tmp[((y - BL - 1) * W + x) * ch + c]; if (y >= 0) for (let c = 0; c < ch; c++) dst[(y * W + x) * ch + c] = acc[c] } } } };
  blur(num, 3); blur(den, 1);
  const full = Math.pow(2 * BL + 1, 4) * .25;
  for (let i = 0; i < N; i++) { if (dist[i] < 0 || mBand[i] || dist[i] >= F || den[i] < 1e-3) continue; const t = dist[i] / F, k = (1 - t * t * (3 - 2 * t)) * Math.min(1, den[i] / full);
    for (let c = 0; c < 3; c++) Dd[i * sd + c] = Math.max(0, Math.min(255, Math.round(Dd[i * sd + c] + k * num[i * 3 + c] / den[i]))) }
  // 3) 沒畫到的地方：從主要島＋脖子取最近的顏色補 32 像素的邊
  const from = new Int32Array(N).fill(-1); qh = qt = 0; for (let i = 0; i < N; i++) if (mMain[i] || mBand[i]) { from[i] = i; q[qt++] = i }
  const dd = new Uint8Array(N);
  while (qh < qt) { const i = q[qh++]; if (dd[i] >= 32) continue; const x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) { if (j < 0 || j >= N || from[j] >= 0 || mAll[j]) continue; from[j] = from[i]; dd[j] = dd[i] + 1; q[qt++] = j; for (let c = 0; c < sd; c++) Dd[j * sd + c] = Dd[from[i] * sd + c] } }
  dTex.needsUpdate = true }

// 重組 B 的網格：donor（D）給了就換頭；沒給就只修法線。直接換掉 B.mesh 的幾何與材質（骨架、綁定矩陣不動）
// opt.cards === false：不要 D 的透明髮片（opacity 材質）。男性短髮的髮片只是髮際一點毛邊，拿掉外觀幾乎一樣，少一個材質＝每格少畫一次、少一張 PNG 貼圖
export function rebuild(B, D, opt = {}) {
  const bm = B.mesh.bindMatrix, bInv = bm.clone().invert(), nmB = new THREE.Matrix3().getNormalMatrix(bm), nmInv = new THREE.Matrix3().getNormalMatrix(bInv);
  const TB = triList(B.mesh, r => { r.p.applyMatrix4(bm); r.n.applyMatrix3(nmB).normalize() });
  let parts, info;
  if (!D) { parts = TB; info = { normals: renormal(TB.filter(t => t.k !== 'body')) } }
  else {
    const bw = B.mesh.skeleton.boneInverses.map(m => m.clone().invert()), bIdx = Object.fromEntries(B.mesh.skeleton.bones.map((b, i) => [b.name, i]));
    const neck = new THREE.Vector3().setFromMatrixPosition(bw[bIdx.Bip01_Neck]), pol = p => { const d = p.clone().sub(neck); return { th: Math.atan2(d.x, d.z), y: d.y, r: Math.hypot(d.x, d.z) } };
    const dS = D.mesh.skeleton, M = dS.bones.map((b, i) => { const j = bIdx[b.name]; return j == null ? null : { j, m: bw[j].clone().multiply(dS.boneInverses[i]) } });
    const nmD = new THREE.Matrix3().getNormalMatrix(D.mesh.bindMatrix), n3 = new THREE.Matrix3();
    const TD = triList(D.mesh, r => { r.p.applyMatrix4(D.mesh.bindMatrix); r.n.applyMatrix3(nmD).normalize(); const q = new THREE.Vector3(), nq = new THREE.Vector3(), t = new THREE.Vector3(); let ws = 0;
      for (let k = 0; k < 4; k++) { const w = r.sw[k], e = M[r.si[k]]; if (w > .01 && !e) r.lost = dS.bones[r.si[k]]?.name; if (!w || !e) { r.sw[k] = 0; r.si[k] = 0; continue } q.addScaledVector(t.copy(r.p).applyMatrix4(e.m), w); nq.addScaledVector(r.n.clone().applyMatrix3(n3.getNormalMatrix(e.m)), w); ws += w; r.si[k] = e.j }
      if (ws > 0) { r.p.copy(q.multiplyScalar(1 / ws)); r.n.copy(nq.normalize()); for (let k = 0; k < 4; k++) r.sw[k] /= ws } }).filter(t => t.k !== 'body' && !(opt.cards === false && t.k === 'op'));
    const lost = TD.flatMap(t => t.v).find(r => r.lost); if (lost) throw new Error(`${D.name} 的頭部綁在 ${B.name} 沒有的骨頭上：${lost.lost}`);
    // 頭髮綁在背、肩上的權重改綁頭骨：躺下（臀橋）時頭髮跟著頭，不會壓進地板。頭髮＝opacity 材質（髮片）＋頭部材質裡不在主要 UV 島的部分（垂在背上的長髮）；
    // 臉、脖子的皮膚（主要 UV 島）不改，脖子接縫要跟著身體動
    const sk = B.mesh.skeleton.bones, jHead = bIdx.Bip01_Head, headSet = new Set([bIdx.Bip01_Neck]); sk[jHead].traverse(b => { const j = sk.indexOf(b); if (j >= 0) headSet.add(j) });
    const par = new Map(), fd = k => { while (par.get(k) !== k) { par.set(k, par.get(par.get(k))); k = par.get(k) } return k }, uk = r => `${Math.round(r.uv[0] * 1e4)},${Math.round(r.uv[1] * 1e4)}`, hd = TD.filter(t => t.k === 'head');
    for (const t of hd) for (const r of t.v) if (!par.has(uk(r))) par.set(uk(r), uk(r)); for (const t of hd) { const a = fd(uk(t.v[0])); for (const r of t.v.slice(1)) { const b = fd(uk(r)); if (a !== b) par.set(b, a) } }
    const cnt = new Map(); for (const t of hd) { const k = fd(uk(t.v[0])); cnt.set(k, (cnt.get(k) || 0) + 1) } const mainIsland = [...cnt].sort((a, b) => b[1] - a[1])[0]?.[0];
    let hair = 0; for (const t of TD) if (t.k === 'op' || (t.k === 'head' && fd(uk(t.v[0])) !== mainIsland)) for (const r of t.v) { let out = 0; for (let k = 0; k < 4; k++) if (r.sw[k] && !headSet.has(r.si[k])) { out += r.sw[k]; r.sw[k] = 0; r.si[k] = 0 }
      if (!out) continue; hair++; const k = r.si.findIndex((j, c) => j === jHead && r.sw[c] > 0); if (k >= 0) r.sw[k] += out; else { const z = r.sw.findIndex(w => !w); r.si[z] = jHead; r.sw[z] = out } }
    const fixed = renormal(TD), dHead = TD.filter(t => t.k === 'head'), dMat = dHead[0].m;
    // D 的下緣（脖子開口）：頭部材質在脖子附近的開放邊，取最長的環
    const LD = loops(dHead).filter(L => L.length > 8 && L.every(r => { const q = pol(r.p); return q.y < 7 && q.r < 14 })).sort((a, b) => b.length - a.length)[0];
    if (!LD) throw new Error(`${D.name} 找不到脖子開口`);
    const prof = LD.map(r => pol(r.p)).sort((a, b) => a.th - b.th), yAt = th => { const n = prof.length; for (let i = 0; i < n; i++) { const a = prof[i], b = prof[(i + 1) % n], ta = a.th, tb = i + 1 < n ? b.th : b.th + 2 * Math.PI; let t = th; if (t < ta) t += 2 * Math.PI; if (t >= ta && t <= tb) return a.y + (b.y - a.y) * (tb > ta ? (t - ta) / (tb - ta) : 0) } return prof[0].y };
    // B 的脖子：B 頭部網格在 D 下緣以下（容許 0.3 cm）、從身體交界往上連著的三角形；改貼 D 的頭部貼圖
    const bHead = TB.filter(t => t.k === 'head'), bBody = TB.filter(t => t.k === 'body'), bodyEdges = new Set();
    for (const t of bBody) for (let i = 0; i < 3; i++) bodyEdges.add(ek(t.v[i], t.v[(i + 1) % 3]));
    const below = t => t.v.every(r => { const q = pol(r.p); return q.y < yAt(q.th) + 0.3 && q.y < 7 }), adj = new Map();
    for (const t of bHead) for (let i = 0; i < 3; i++) { const k = ek(t.v[i], t.v[(i + 1) % 3]); (adj.get(k) || adj.set(k, []).get(k)).push(t) }
    const band = new Set(), st = bHead.filter(t => below(t) && [0, 1, 2].some(i => bodyEdges.has(ek(t.v[i], t.v[(i + 1) % 3]))));
    for (const t of st) band.add(t);
    while (st.length) { const t = st.pop(); for (let i = 0; i < 3; i++) for (const u of adj.get(ek(t.v[i], t.v[(i + 1) % 3])) || []) if (!band.has(u) && below(u)) { band.add(u); st.push(u) } }
    const bandT = [...band].map(t => ({ ...t, m: dMat }));
    // 上緣：「B 身體＋保留的脖子」在脖子附近的開放邊；身體那側的頂點去 B 頭部三角形找同一條邊的頭部 UV
    const headEdgeUV = new Map(); for (const t of bHead) for (let i = 0; i < 3; i++) { const a = t.v[i], b = t.v[(i + 1) % 3]; headEdgeUV.set(ek(a, b), { [a.key]: a.uv, [b.key]: b.uv }) }
    const near = r => { const q = pol(r.p); return q.y > -14 && q.y < 9 && q.r < 16 }, avgD = L => L.reduce((s, r) => s + Math.min(...LD.map(d => d.p.distanceTo(r.p))), 0) / L.length;
    const LT = loops([...bBody, ...bandT]).filter(L => L.length > 8 && L.every(near)).sort((a, b) => avgD(a) - avgD(b))[0]?.map(r => ({ ...r, uv: r.uv.slice() }));
    if (!LT) throw new Error(`${B.name} 找不到脖子上緣`);
    for (let i = 0; i < LT.length; i++) { const r = LT[i], nb = LT[(i + 1) % LT.length], pv = LT[(i - 1 + LT.length) % LT.length], h = headEdgeUV.get(ek(r, nb)) || headEdgeUV.get(ek(pv, r)); if (h?.[r.key]) r.uv = h[r.key].slice() }
    // 拉鍊式縫合：兩個環都從背後中線開始、照繞脖子的角度遞增，角度小的先前進
    const prep = L => { let s = 0, best = 1e9; L.forEach((r, i) => { const d = Math.abs(Math.abs(pol(r.p).th) - Math.PI); if (d < best) { best = d; s = i } }); L = [...L.slice(s), ...L.slice(0, s)];
      const un = th => { const u = [th[0]]; for (let i = 1; i < th.length; i++) { let d = th[i] - th[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; u.push(u[i - 1] + d) } return u };
      let u = un(L.map(r => pol(r.p).th)); if (u[u.length - 1] < u[0]) { L = [L[0], ...L.slice(1).reverse()]; u = un(L.map(r => pol(r.p).th)) } return { L, t: u.map(x => (x - u[0]) / (2 * Math.PI)) } };
    const A = prep(LD), Z = prep(LT), m = A.L.length, n = Z.L.length, ta = k => k < m ? A.t[k] : 1 + A.t[k - m], tz = k => k < n ? Z.t[k] : 1 + Z.t[k - n], zip = [];
    for (let i = 0, j = 0; i < m || j < n;) { if (j >= n || (i < m && ta(i + 1) <= tz(j + 1))) { zip.push([A.L[i % m], A.L[(i + 1) % m], Z.L[j % n]]); i++ } else { zip.push([A.L[i % m], Z.L[(j + 1) % n], Z.L[j % n]]); j++ } }
    const zipT = zip.map(v => { v = v.map(r => ({ ...r, uv: r.uv.slice() })); const fnm = new THREE.Vector3().crossVectors(v[1].p.clone().sub(v[0].p), v[2].p.clone().sub(v[0].p)); if (fnm.lengthSq() < 1e-8) return null;
      const out = v[0].p.clone().add(v[1].p).add(v[2].p).divideScalar(3).sub(neck); out.y = 0; if (fnm.dot(out) < 0) v = [v[0], v[2], v[1]];
      const u0 = v[0].uv[0]; for (const r of v) { while (r.uv[0] - u0 > .5) r.uv[0] -= 1; while (u0 - r.uv[0] > .5) r.uv[0] += 1 } return { k: 'head', m: dMat, v } }).filter(Boolean);   // 貼圖是重複（REPEAT）模式：跨 UV 接縫的三角形把 u 移到同一側
    const dTex = dMat.map, bTex = bHead[0].m.map; if (!dTex?.image?.data || !bTex?.image?.data) throw new Error('頭部貼圖沒載入');
    harmonize(dTex, bTex, dHead, bandT, zipT, LD);
    parts = [...bBody, ...TD, ...bandT, ...zipT];
    info = { normals: fixed, neck: bandT.length, seam: zipT.length, hair };
  }
  // 依材質排好、換回 B 的幾何座標
  const byMat = new Map(); for (const t of parts) (byMat.get(t.m) || byMat.set(t.m, []).get(t.m)).push(t);
  const mats = [], pos = [], nor = [], uv = [], si = [], sw = [], g = new THREE.BufferGeometry();
  for (const [mt, L] of byMat) { const mi = mats.push(mt) - 1, s0 = pos.length / 3;
    for (const t of L) for (const r of t.v) { const p = r.p.clone().applyMatrix4(bInv), q = r.n.clone().applyMatrix3(nmInv).normalize(); pos.push(p.x, p.y, p.z); nor.push(q.x, q.y, q.z); uv.push(r.uv[0], r.uv[1]); si.push(...r.si); sw.push(...r.sw) }
    g.addGroup(s0, pos.length / 3 - s0, mi) }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  B.mesh.geometry.dispose(); B.mesh.geometry = g; B.mesh.material = mats;
  return { ...info, tris: pos.length / 9, mats: mats.map(m => m.name) };
}
