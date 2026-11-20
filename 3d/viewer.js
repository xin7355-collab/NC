// 3D 人體檢視器（按需載入：使用者按「載入 3D」才下載這個模組和模型，App 開啟時不會載入）
// 原則：一次只載入一個人物（換人時釋放舊的）；畫面不在視窗內、App 在背景時停止渲染；離開就 dispose 釋放 GPU 記憶體
import * as THREE from './vendor/three/build/three.module.js';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from './vendor/three/examples/jsm/environments/RoomEnvironment.js';
import { MODELS, CREDIT } from './manifest.js';

export { MODELS, CREDIT };
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
  const render = () => { raf = 0; if (dead) return; const moving = ctl.update(); R.render(scene, cam); if (moving && visible) raf = requestAnimationFrame(render) };
  const kick = () => { if (!raf && visible && !dead) raf = requestAnimationFrame(render) };
  ctl.addEventListener('change', kick);
  const size = () => { if (!mount || dead) return; const w = mount.clientWidth || 300, hh = mount.clientHeight || 400; R.setSize(w, hh, false); cv.style.width = '100%'; cv.style.height = '100%'; cam.aspect = w / hh; cam.updateProjectionMatrix(); kick() };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null;
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting) && !document.hidden; if (visible) kick() }) : null;
  const onVis = () => { visible = !document.hidden; if (visible) kick() }; document.addEventListener('visibilitychange', onVis);
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
  function setView(v) { const a = (VIEWS[v] ?? 0) * Math.PI / 180, d = Math.max(3.2, h * 2.3 / Math.min(1, cam.aspect * 1.6));
    ctl.target.set(0, h * 0.52, 0); cam.position.set(Math.sin(a) * d, h * 0.55, Math.cos(a) * d); cam.lookAt(ctl.target); ctl.update(); kick() }
  async function load(s, onProgress) {
    const M = MODELS[s]; if (!M) throw new Error('model');
    let g; try { g = await new GLTFLoader().loadAsync(new URL(M.file, import.meta.url).href + ver, e => onProgress?.(e.total ? e.loaded / e.total : (e.loaded / M.bytes))) }
    catch (e) { const err = new Error('load'); err.cause = e; throw err }
    if (dead) { disposeObj(g.scene); return }
    if (model) { scene.remove(model); disposeObj(model) }   // 一次只留一個人物
    model = g.scene; sex = s; bones = {}; tris = 0;
    model.traverse(o => { if (o.isBone) bones[o.name] = o; if (o.isMesh) { o.frustumCulled = false; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 } });
    const box = new THREE.Box3().setFromObject(model); h = box.max.y - box.min.y || 1.75;
    stand(); scene.add(model); setView('front'); return stats()
  }
  function stats() { const az = Math.round(THREE.MathUtils.radToDeg(ctl.getAzimuthalAngle())); const mi = R.info.memory;
    return { sex, bones: Object.keys(bones).length, tris: Math.round(tris), height: +h.toFixed(2), az, geometries: mi.geometries, textures: mi.textures, rendering: !!raf } }
  function attach(el) { mount = el; el.appendChild(cv); ro?.disconnect(); io?.disconnect(); ro?.observe(el); io?.observe(el); size() }
  function dispose() { if (dead) return; dead = true; if (raf) cancelAnimationFrame(raf); raf = 0; ro?.disconnect(); io?.disconnect(); document.removeEventListener('visibilitychange', onVis);
    ctl.dispose(); if (model) disposeObj(model); model = null; shTex.dispose(); shadow.geometry.dispose(); shadow.material.dispose(); env.dispose(); R.dispose(); R.forceContextLoss?.(); cv.remove() }
  // 測試用：立刻渲染並讀畫面中央一條水平線上的像素，確認人有畫出來（不是只有背景）
  function probe() { R.render(scene, cam); const gl = R.getContext(), w = gl.drawingBufferWidth, hh = gl.drawingBufferHeight, px = new Uint8Array(4 * 41); let hit = 0;
    for (let i = 0; i <= 40; i++) { gl.readPixels(Math.round(w * (0.3 + i * 0.01)), Math.round(hh * 0.55), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px.subarray(i * 4, i * 4 + 4)); const r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2]; if (Math.abs(r - 11) + Math.abs(gg - 18) + Math.abs(b - 32) > 40) hit++ }
    return hit }
  attach(host);
  return { load, setView, reset: () => setView('front'), stats, dispose, attach, probe, credit: CREDIT, get sex() { return sex } }
}
