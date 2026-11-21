// 肌群部位分區（第四階段）：人物模型沒有獨立的肌肉網格，所以不做「肌肉收縮」，只把皮膚分成 8 個部位上色
// 分法：每個頂點主要綁在哪根骨頭＋站姿（綁定姿勢）時的高度、面向（法線朝前或朝後）。只是部位示意，不是真實肌肉的形狀
import * as THREE from './vendor/three/build/three.module.js';
import { MUSCLE_GROUPS as GROUPS } from './exercises.js';

export { GROUPS };
export const LABEL = Object.fromEntries(GROUPS);
const IDX = Object.fromEntries(GROUPS.map(([k], i) => [k, i + 1]));   // 0＝其他（頭、頸、手、腳、鼠蹊）
// 顏色：紅＝主要、橘＝次要、灰＝其他（亮度差大，紅橘分不清的人也看得出深淺；畫面上另外有文字）
export const COLORS = { 2: '#d93a3e', 1: '#ff8a1f', 0: '#8b929e' };

// 在綁定姿勢（剛載入、還沒擺站姿）呼叫：算每個頂點屬於哪一區。好幾個材質區塊共用同一份頂點時只算一次
export function prepare(model) {
  model.updateMatrixWorld(true);
  const bones = {}; model.traverse(o => { if (o.isBone) bones[o.name] = o });
  const P = n => bones['Bip01_' + n].getWorldPosition(new THREE.Vector3()), avgY = (a, b) => (P(a).y + P(b).y) / 2;
  const hipY = avgY('L_Thigh', 'R_Thigh'), shoY = avgY('L_UpperArm', 'R_UpperArm');
  const chestLow = shoY - 0.36 * (shoY - hipY), absLow = hipY - 0.04, gluteHi = hipY + 0.08, gluteLo = hipY - 0.17;   // 胸、腹的分界約在胸骨下緣；臀部從髖關節上方 10 公分到臀線
  const sho = { L: P('L_UpperArm'), R: P('R_UpperArm') }, elb = { L: P('L_Forearm'), R: P('R_Forearm') };
  const out = { geo: new Map(), counts: Object.fromEntries(GROUPS.map(([k]) => [k, 0])), other: 0, centroid: {} };
  const sum = Object.fromEntries(GROUPS.map(([k]) => [k, new THREE.Vector3()]));
  model.traverse(m => {
    if (!m.isSkinnedMesh) return; const g = m.geometry, pa = g.attributes.position;
    let st = out.geo.get(pa);
    if (!st) {
      const n = pa.count, reg = new Uint8Array(n), si = g.attributes.skinIndex, sw = g.attributes.skinWeight, na = g.attributes.normal, v = new THREE.Vector3(), nv = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
      for (let i = 0; i < n; i++) {
        let bi = 0, bw = -1; for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > bw) { bw = sw.getComponent(i, c); bi = si.getComponent(i, c) }
        const name = m.skeleton.bones[bi]?.name || '', s = /_L_/.test(name) ? 'L' : 'R';
        m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); if (na) nv.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); else nv.set(0, 0, 1);
        let k = '';
        if (/Forearm/.test(name)) k = 'arms';
        else if (/UpperArm/.test(name)) { const d = elb[s].clone().sub(sho[s]), t = v.clone().sub(sho[s]).dot(d) / d.lengthSq(); k = t < 0.33 ? 'shoulders' : 'arms' }   // 上臂靠肩膀的三分之一＝三角肌
        else if (/Clavicle/.test(name)) k = v.distanceTo(sho[s]) < 0.09 || Math.abs(nv.z) < 0.35 ? 'shoulders' : nv.z > 0 ? 'chest' : 'back';
        else if (/Spine/.test(name)) k = v.y > shoY + (nv.z >= 0 ? 0.04 : 0.09) ? '' : nv.y > 0.6 && nv.z < 0.2 && v.y > shoY - 0.06 ? 'back' : nv.z >= 0 ? (v.y >= chestLow ? 'chest' : 'abs') : (v.y > gluteHi ? 'back' : 'glutes');   // 鎖骨以上（脖子）不算；肩膀上緣朝上、偏後的面（斜方肌）算背部
        else if (/Pelvis/.test(name) || name === 'Bip01') k = nv.z >= 0 ? (v.y >= absLow ? 'abs' : '') : (v.y > gluteHi ? 'back' : v.y > gluteLo ? 'glutes' : 'thighs');
        else if (/Thigh/.test(name)) k = nv.z < -0.2 && v.y > gluteLo ? 'glutes' : 'thighs';
        else if (/Calf/.test(name)) k = 'calves';
        reg[i] = k ? IDX[k] : 0;   // 頭、頸、馬尾、臉、手、腳、鼠蹊＝其他
        if (k) { out.counts[k]++; sum[k].add(v) } else out.other++
      }
      st = { reg, color: new THREE.BufferAttribute(new Float32Array(n * 3), 3) }; out.geo.set(pa, st)
    }
    if (!g.attributes.color) g.setAttribute('color', st.color)   // 同一份頂點的區塊共用同一個顏色緩衝（只上傳一次）
  });
  for (const [k] of GROUPS) out.centroid[k] = out.counts[k] ? sum[k].divideScalar(out.counts[k]).toArray().map(x => +x.toFixed(3)) : null;
  return out;
}

// 依各部位的等級上色：levels＝{ chest: 2, arms: 2, shoulders: 1 }（2 主要、1 次要、沒寫＝其他）
export function paint(st, levels = {}) {
  const C = [0, 1, 2].map(l => new THREE.Color(COLORS[l])), lv = [0, ...GROUPS.map(([k]) => levels[k] || 0)];
  for (const { reg, color } of st.geo.values()) { const a = color.array; for (let i = 0; i < reg.length; i++) { const c = C[lv[reg[i]]]; a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b } color.needsUpdate = true }
}

// 開啟時換成灰色假人材質（頂點顏色）；透明貼圖的髮片、睫毛先藏起來（灰色假人上會變成黑色斑點）
export function makeMaterials(model) {
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }), hide = new THREE.MeshBasicMaterial({ visible: false }), swap = new Map();
  model.traverse(m => { if (!m.isMesh) return; for (const o of [].concat(m.material)) if (!swap.has(o)) swap.set(o, o.alphaTest > 0 || o.transparent ? hide : solid) });
  return { swap, dispose() { solid.dispose(); hide.dispose() } };   // 只釋放這兩個材質；原本的材質和貼圖跟著人物一起釋放
}
