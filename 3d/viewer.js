// 3D 人體檢視器（按需載入：使用者按「載入 3D」才下載這個模組和模型，App 開啟時不會載入）
// 原則：一次只載入一個人物（換人時釋放舊的）；畫面不在視窗內、App 在背景時停止渲染；離開就 dispose 釋放 GPU 記憶體
import * as THREE from './vendor/three/build/three.module.js';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from './vendor/three/examples/jsm/environments/RoomEnvironment.js';
import { MODELS, CREDIT } from './manifest.js';
import { EXERCISES } from './exercises.js';
import { prepare, paint, makeMaterials } from './muscles.js';

export { MODELS, CREDIT, EXERCISES };
export const supports3D = () => { try { return !!document.createElement('canvas').getContext('webgl2') } catch (e) { return false } };
const VIEWS = { front: 0, side: 90, back: 180 };
const BG = new THREE.Color('#0b1220');

export function createViewer(host, opt = {}) {
  const ver = opt.ver ? `?v=${encodeURIComponent(opt.ver)}` : '', low = !!opt.low;
  let R;
  try { R = new THREE.WebGLRenderer({ antialias: !low, powerPreference: 'default' }) } catch (e) { const err = new Error('webgl'); err.cause = e; throw err }
  R.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1 : 2)); R.toneMapping = THREE.ACESFilmicToneMapping; R.outputColorSpace = THREE.SRGBColorSpace;
  const cv = R.domElement; cv.setAttribute('aria-label', '3D 人體：用手指拖曳旋轉、兩指縮放'); cv.style.touchAction = 'none'; cv.style.display = 'block';
  const scene = new THREE.Scene(); scene.background = BG;
  const pm = new THREE.PMREMGenerator(R), env = pm.fromScene(new RoomEnvironment(), 0.04); scene.environment = env.texture; scene.environmentIntensity = 0.5; pm.dispose();
  const key = new THREE.DirectionalLight('#fff4ea', 2.0); key.position.set(1.6, 3.2, 2.6);
  const rim = new THREE.DirectionalLight('#9ec8ff', 1.2); rim.position.set(-2, 2.2, -2.5);
  scene.add(key, rim, new THREE.HemisphereLight('#dfe9ff', '#2a2420', 0.5));
  // 腳下的柔和影子（不用即時陰影，手機比較省電）
  const sh = document.createElement('canvas'); sh.width = sh.height = 128; { const g = sh.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128) }
  const shTex = new THREE.CanvasTexture(sh), shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; scene.add(shadow);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50), ctl = new OrbitControls(cam, cv);
  Object.assign(ctl, { enablePan: false, enableDamping: true, dampingFactor: 0.12, rotateSpeed: 0.8, minDistance: 1.4, maxDistance: 7, minPolarAngle: 0.35, maxPolarAngle: 1.75 });
  let model = null, sex = '', bones = {}, tris = 0, raf = 0, visible = true, dead = false, h = 1.75, mount = null;
  // 動畫（AnimationMixer）：一次一個動作；暫停時不更新動畫、也不持續渲染（省電）
  let mixer = null, action = null, exId = '', exData = null, playing = false, speed = 1, loopOn = true, lastT = 0, listener = opt.onAnim || null;
  let samp = null, rest = [];   // samp：probeAnim 的取樣頂點（跟著目前的人物）；rest：每根骨頭的站姿（換動作前歸位用）
  let mus = null, musMat = null, musOn = false;   // 肌群部位（第四階段）：分區、假人材質、是否開啟
  const animCache = new Map(), emit = () => listener?.(animState());
  const render = () => { raf = 0; if (dead) return; const now = performance.now(), dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0; lastT = now;
    if (mixer && playing) { mixer.update(dt); emit() } const moving = ctl.update(); R.render(scene, cam); if ((moving || playing) && visible) raf = requestAnimationFrame(render); else lastT = 0 };
  const kick = () => { if (!raf && visible && !dead) raf = requestAnimationFrame(render) };
  ctl.addEventListener('change', kick);
  const size = () => { if (!mount || dead) return; const w = mount.clientWidth || 300, hh = mount.clientHeight || 400; R.setSize(w, hh, false); cv.style.width = '100%'; cv.style.height = '100%'; cam.aspect = w / hh; cam.updateProjectionMatrix(); kick() };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null;
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting) && !document.hidden; if (visible) kick() }) : null;
  const onVis = () => { visible = !document.hidden; lastT = 0; if (visible) kick() }; document.addEventListener('visibilitychange', onVis);
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); if (!dead) opt.onLost?.() });   // 自己 dispose（forceContextLoss）時不算「被系統暫停」
  // 骨架的骨頭矩陣貼圖（skeleton.boneTexture）不屬於材質，要另外釋放，不然每換一次人物就多一張 GPU 貼圖
  const disposeObj = o => o.traverse(x => { if (x.isSkinnedMesh) x.skeleton?.dispose(); if (x.geometry) x.geometry.dispose(); for (const m of [].concat(x.material || [])) { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose() } });
  // 自然站姿：上臂、前臂往下（綁定姿勢是 A 字，看起來像假人）
  function stand() {
    if (!model) return; model.updateMatrixWorld(true); const v = n => bones[n].getWorldPosition(new THREE.Vector3()), up = new THREE.Vector3(0, 1, 0);
    const lat = v('Bip01_L_Thigh').sub(v('Bip01_R_Thigh')).normalize(), fwd = new THREE.Vector3().crossVectors(lat, up).normalize();
    const aim = (n, c, dir) => { model.updateMatrixWorld(true); const b = bones[n], cur = v(c).sub(v(n)).normalize(), dq = new THREE.Quaternion().setFromUnitVectors(cur, dir.normalize());
      const wq = b.getWorldQuaternion(new THREE.Quaternion()), pq = b.parent.getWorldQuaternion(new THREE.Quaternion()); b.quaternion.copy(pq.invert().multiply(dq.multiply(wq))); model.updateMatrixWorld(true) };
    for (const [s, k] of [['L', 1], ['R', -1]]) {
      aim(`Bip01_${s}_UpperArm`, `Bip01_${s}_Forearm`, up.clone().negate().add(lat.clone().multiplyScalar(0.2 * k)).add(fwd.clone().multiplyScalar(0.04)));
      aim(`Bip01_${s}_Forearm`, `Bip01_${s}_Hand`, up.clone().negate().add(lat.clone().multiplyScalar(0.06 * k)).add(fwd.clone().multiplyScalar(0.16)))
    }
  }
  // ---- 肌群部位：灰色假人＋紅（主要）、橘（次要）、灰（其他）；只是部位示意 ----
  const musLevels = () => { const m = EXERCISES.find(e => e.id === exId)?.muscles || {}, o = {}; for (const k of m.secondary || []) o[k] = 1; for (const k of m.primary || []) o[k] = 2; return o };
  function setMats(on) { if (!model) return; model.traverse(m => { if (!m.isMesh) return; const o = m.userData.mat0;
    if (on && musMat) { if (!o) m.userData.mat0 = m.material; const src = m.userData.mat0; m.material = Array.isArray(src) ? src.map(x => musMat.swap.get(x) || x) : musMat.swap.get(src) || src }
    else if (o) { m.material = o; delete m.userData.mat0 } }) }   // 關掉或釋放前一定換回原本的材質：原本的貼圖才會跟著人物一起釋放
  function setMuscles(on) { musOn = !!on; if (model && mus) { if (musOn) paint(mus, musLevels()); setMats(musOn) } kick(); emit(); return musOn }
  function setView(v) { const a = (VIEWS[v] ?? 0) * Math.PI / 180, d = Math.max(3.2, h * 2.3 / Math.min(1, cam.aspect * 1.6));
    if (action) { frame(a); kick(); return }   // 播動作時依動作的範圍取景（臀橋、伏地挺身人在地上，套站姿的取景會被擠到畫面最下面）
    ctl.target.set(0, h * 0.52, 0); cam.position.set(Math.sin(a) * d, h * 0.55, Math.cos(a) * d); cam.lookAt(ctl.target); ctl.update(); kick() }
  async function load(s, onProgress) {
    const M = MODELS[s]; if (!M) throw new Error('model');
    let g; try { g = await new GLTFLoader().loadAsync(new URL(M.file, import.meta.url).href + ver, e => onProgress?.(e.total ? e.loaded / e.total : (e.loaded / M.bytes))) }
    catch (e) { const err = new Error('load'); err.cause = e; throw err }
    if (dead) { disposeObj(g.scene); return }
    if (model) { setMats(false); scene.remove(model); disposeObj(model) } musMat?.dispose(); musMat = null;   // 一次只留一個人物（先換回原本材質再釋放）
    model = g.scene; sex = s; bones = {}; tris = 0; samp = null;   // 換人物：測試用的取樣頂點也要換
    model.traverse(o => { if (o.isBone) bones[o.name] = o; if (o.isMesh) { o.frustumCulled = false; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 } });
    const box = new THREE.Box3().setFromObject(model); h = box.max.y - box.min.y || 1.75;
    mus = prepare(model); musMat = makeMaterials(model);   // 肌群分區要用綁定姿勢算（擺站姿之前）
    const keep = action ? action.time : 0; stand(); rest = []; model.traverse(o => { if (o.isBone) rest.push([o, o.position.clone(), o.quaternion.clone()]) }); scene.add(model);
    if (musOn) { paint(mus, musLevels()); setMats(true) }   // 換男女時肌群模式照舊
    if (exData) bind(keep); else setView('front');   // 換男女：動作和時間點接著播
    return stats()
  }
  // ---- 動作動畫 ----
  async function loadAnim(id) { if (animCache.has(id)) return animCache.get(id); const base = new URL(`anims/${id}`, import.meta.url).href;
    let g, meta; try { [g, meta] = await Promise.all([new GLTFLoader().loadAsync(base + '.glb' + ver), fetch(base + '.json' + ver).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })]) }
    catch (e) { const err = new Error('anim'); err.cause = e; throw err }
    const clips = {}; for (const c of g.animations) clips[c.name] = c; const a = { clips, phases: meta.phases || [] }; animCache.set(id, a); return a }
  // 取景：取動作前、中、後幾個時間點的實際（蒙皮後）外框，讓整個動作都在畫面裡（趴地的動作比站著的長）
  function frame(az) { if (!action) return; const d = action.getClip().duration, t0 = action.time, box = new THREE.Box3();
    for (const u of [0, 0.25, 0.5, 0.75, 1]) { action.time = u * d; mixer.update(0); model.updateMatrixWorld(true); box.union(new THREE.Box3().setFromObject(model, true)) }
    action.time = t0; mixer.update(0); const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()), f = Math.tan(cam.fov * Math.PI / 360), a = az ?? ctl.getAzimuthalAngle();
    // 依視角算畫面上的寬（側面看＝身體長度）和深度，寬、高都要放得下
    const horiz = Math.abs(Math.sin(a)) * sz.z + Math.abs(Math.cos(a)) * sz.x, depth = Math.abs(Math.cos(a)) * sz.z + Math.abs(Math.sin(a)) * sz.x;
    const dist = Math.max(sz.y / (2 * f), horiz / (2 * f * cam.aspect)) * 1.15 + depth / 2;
    ctl.target.copy(c); cam.position.set(c.x + Math.sin(a) * dist, c.y + sz.y * 0.15 + 0.15, c.z + Math.cos(a) * dist); cam.lookAt(c);
    // 外框 8 個角投影回畫面：身體很長時（從頭那端看棒式）近端會超出畫面，超出就把相機沿視線拉遠，最多調 4 次
    for (let k = 0; k < 4; k++) { cam.updateMatrixWorld(); let m = 0; for (let i = 0; i < 8; i++) { const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam); m = Math.max(m, Math.abs(p.x), Math.abs(p.y)) }
      if (m <= 0.94) break; cam.position.sub(c).multiplyScalar(m / 0.9).add(c) }
    ctl.update() }
  function bind(keep = 0) { if (!model || !exData) return; const clip = exData.clips[sex] || exData.clips.male || Object.values(exData.clips)[0];
    if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()) }
    for (const [o, p, q] of rest) { o.position.copy(p); o.quaternion.copy(q) }   // 先全部歸位：新動作沒有的骨頭（例如女性的馬尾）才不會停在上一個動作的姿勢
    mixer = new THREE.AnimationMixer(model); action = mixer.clipAction(clip); action.setLoop(loopOn ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); action.clampWhenFinished = true; action.timeScale = speed; action.play();
    mixer.addEventListener('finished', () => { playing = false; emit() }); action.time = Math.min(keep, clip.duration); mixer.update(0); frame(); kick(); emit() }
  async function setExercise(id, o = {}) { const ex = EXERCISES.find(e => e.id === id); if (!ex) throw new Error('exercise'); const a = await loadAnim(id); if (dead) return;
    exData = a; exId = id; speed = ex.speed || 1; playing = false; if (musOn && mus) paint(mus, musLevels()); const az = (VIEWS[o.view || 'side'] ?? 90) * Math.PI / 180; cam.position.set(Math.sin(az) * 4, h * 0.55, Math.cos(az) * 4); ctl.target.set(0, h * 0.5, 0); ctl.update();
    bind(0); if (o.autoplay) play(); return animState() }
  function play() { if (!action) return; if (!loopOn && action.time >= action.getClip().duration - 1e-3) { action.reset(); action.play() } playing = true; lastT = 0; kick(); emit() }
  function pause() { playing = false; emit() }
  function replay() { if (!action) return; action.reset(); action.play(); action.timeScale = speed; mixer.update(0); play() }
  function setSpeed(x) { speed = x; if (action) action.timeScale = x; emit() }
  function setLoop(on) { loopOn = !!on; if (action) { action.setLoop(loopOn ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); action.clampWhenFinished = true } emit() }
  function seek(t) { if (!action) return; const d = action.getClip().duration; action.enabled = true; action.paused = false; action.time = Math.max(0, Math.min(d, t)); mixer.update(0); kick(); emit() }
  function step(n) { pause(); seek((action?.time || 0) + n / 30) }
  function animState() { if (!action) return { id: exId, ready: false, mus: musOn }; const d = action.getClip().duration, t = action.time, P = exData.phases, ph = P.find(p => t >= p[1] - 1e-6 && t <= p[2] + 1e-6) || P[0];
    return { id: exId, ready: true, time: +t.toFixed(3), dur: +d.toFixed(3), playing, speed, loop: loopOn, phase: ph ? ph[0] : '', phases: P, mus: musOn } }
  function stats() { const az = Math.round(THREE.MathUtils.radToDeg(ctl.getAzimuthalAngle())); const mi = R.info.memory;
    return { sex, bones: Object.keys(bones).length, tris: Math.round(tris), height: +h.toFixed(2), az, geometries: mi.geometries, textures: mi.textures, rendering: !!raf } }
  function attach(el) { mount = el; el.appendChild(cv); ro?.disconnect(); io?.disconnect(); ro?.observe(el); io?.observe(el); size() }
  function dispose() { if (dead) return; dead = true; if (raf) cancelAnimationFrame(raf); raf = 0; if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()) } mixer = action = null; rest = []; animCache.clear(); listener = null; ro?.disconnect(); io?.disconnect(); document.removeEventListener('visibilitychange', onVis);
    ctl.dispose(); if (model) { setMats(false); disposeObj(model) } musMat?.dispose(); musMat = mus = null; model = null; shTex.dispose(); shadow.geometry.dispose(); shadow.material.dispose(); env.dispose(); R.dispose(); R.forceContextLoss?.(); cv.remove() }
  // 測試用：立刻渲染並讀畫面中央一條水平線上的像素，確認人有畫出來（不是只有背景）
  function probe() { R.render(scene, cam); const gl = R.getContext(), w = gl.drawingBufferWidth, hh = gl.drawingBufferHeight, px = new Uint8Array(4 * 41); let hit = 0;
    for (let i = 0; i <= 40; i++) { gl.readPixels(Math.round(w * (0.3 + i * 0.01)), Math.round(hh * 0.55), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px.subarray(i * 4, i * 4 + 4)); const r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2]; if (Math.abs(r - 11) + Math.abs(gg - 18) + Math.abs(b - 32) > 40) hit++ }
    return hit }
  // 測試用：肌群分區的頂點數、各區中心（綁定姿勢）、目前各部位等級
  function muscleState() { return { on: musOn, counts: mus?.counts || null, other: mus?.other ?? null, centroid: mus?.centroid || null, levels: musLevels() } }
  // 測試用：立刻渲染、在畫面上取 48×48 個點，數紅（主要）、橘（次要）、灰（其他）的像素
  function colorStats() { R.render(scene, cam); const gl = R.getContext(), w = gl.drawingBufferWidth, hh = gl.drawingBufferHeight, px = new Uint8Array(4), o = { red: 0, orange: 0, gray: 0 };
    for (let i = 0; i < 48; i++) for (let j = 0; j < 48; j++) { gl.readPixels(Math.round((i + 0.5) * w / 48), Math.round((j + 0.5) * hh / 48), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const [r, g, b] = px;
      if (r > 140 && g < 90 && b < 90) o.red++; else if (r > 170 && g > 95 && g < 200 && b < 110 && r - g > 50) o.orange++; else if (r > 55 && Math.abs(r - g) < 20 && Math.abs(g - b) < 26) o.gray++ }
    return o }
  // 工具用（審核資料包的截圖、影片）：立刻渲染並回傳畫面圖檔
  function snapshot(type = 'image/jpeg', q = 0.85) { R.render(scene, cam); return cv.toDataURL(type, q) }
  // 測試用：人物（目前姿勢）投影到畫面上的範圍，-1～1＝畫面邊緣；用來確認整個人都在畫面裡、而且夠大
  function screenBox() { if (!model) return null; model.updateMatrixWorld(true); cam.updateMatrixWorld(); const b = new THREE.Box3().setFromObject(model, true), o = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
    for (let i = 0; i < 8; i++) { const p = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(cam); o.x0 = Math.min(o.x0, p.x); o.x1 = Math.max(o.x1, p.x); o.y0 = Math.min(o.y0, p.y); o.y1 = Math.max(o.y1, p.y) }
    for (const k in o) o[k] = +o[k].toFixed(3); return o }
  // 測試用：跳到指定時間，量皮膚最低點（整體與各部位）和關節位置（確認動畫真的綁到這個人物的骨架、著地、不滑）
  function probeAnim(times, regions = {}) { if (!model || !action) return null; if (!samp) { samp = []; const seen = new Set(); model.traverse(m => { if (!m.isSkinnedMesh || seen.has(m.geometry.attributes.position)) return; seen.add(m.geometry.attributes.position);   // 好幾個材質區塊共用同一份頂點，只算一次；每個頂點都算
      const n = m.geometry.attributes.position.count, si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
      for (let i = 0; i < n; i++) { let bi = 0, bw = -1; for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > bw) { bw = sw.getComponent(i, c); bi = si.getComponent(i, c) } samp.push([m, i, m.skeleton.bones[bi]?.name || '']) } }) }
    const v = new THREE.Vector3(), out = [], t0 = action.time, J = ['L_Foot', 'R_Foot', 'L_Toe0', 'R_Toe0', 'L_Hand', 'R_Hand', 'L_Forearm', 'R_Forearm', 'L_UpperArm', 'R_UpperArm', 'L_Thigh', 'R_Thigh', 'L_Calf', 'R_Calf', 'Pelvis', 'Spine1', 'Spine2', 'Neck', 'Head'];
    for (const t of times) { seek(t); model.updateMatrixWorld(true); const r = { t, minY: Infinity, reg: {}, j: {} }; for (const k in regions) r.reg[k] = Infinity;
      for (const [m, i, b] of samp) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); if (v.y < r.minY) r.minY = v.y; for (const k in regions) if (new RegExp(regions[k]).test(b) && v.y < r.reg[k]) r.reg[k] = v.y }
      for (const n of J) { const o = model.getObjectByName('Bip01_' + n); if (o) r.j[n] = o.getWorldPosition(new THREE.Vector3()).toArray().map(x => +x.toFixed(4)) } out.push(r) }
    seek(t0); return out }
  attach(host);
  return { load, setView, reset: () => setView('front'), stats, dispose, attach, probe, credit: CREDIT, get sex() { return sex },
    setExercise, play, pause, replay, setSpeed, setLoop, seek, step, animState, probeAnim, screenBox, setMuscles, muscleState, colorStats, snapshot, onAnim: f => { listener = f } }
}
