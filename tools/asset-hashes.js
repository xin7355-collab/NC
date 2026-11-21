#!/usr/bin/env node
// 3D 素材的內容版本（開發工具）：算每個檔案的 SHA-256 前 10 碼，寫進 3d/asset-ver.js
// 載入時網址用 ?h=內容版本：檔案沒改就不會因為 App 換版而重新下載；Service Worker（sw.js）看到 ?h= 就存在手機、離線直接用
// 改了 3d/models、3d/anims、3d/review 的 reviews.json／package.json 之後要重跑：node tools/asset-hashes.js（測試會擋過期的版本表）
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), D3 = path.join(ROOT, '3d');
function files() { const out = []; for (const [dir, re] of [['models', /\.(glb|jpg)$/], ['anims', /\.(glb|json)$/], ['review', /^(reviews|package)\.json$/]]) for (const f of fs.readdirSync(path.join(D3, dir)).sort()) if (re.test(f)) out.push(`${dir}/${f}`); return out }
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(D3, f))).digest('hex').slice(0, 10);
const table = Object.fromEntries(files().map(f => [f, hash(f)]));
if (require.main === module) {
  const js = `// 自動產生（node tools/asset-hashes.js）：3D 素材的內容版本，載入時用在網址 ?h=…\n// 檔案沒改就不重新下載；Service Worker 看到 ?h= 就存在手機、離線直接用。改了素材要重跑工具（測試會擋過期的版本表）\nexport const ASSET_VER = ${JSON.stringify(table, null, 1)};\n`;
  fs.writeFileSync(path.join(D3, 'asset-ver.js'), js); console.log(`3d/asset-ver.js：${Object.keys(table).length} 個檔案`) }
module.exports = { files, hash, table };
