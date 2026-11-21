// 審核用的「內容版本」：動畫檔（GLB、動作階段 JSON）＋畫面上給使用者看的文字（名稱、速度、來源、重點、常見錯誤、注意事項、肌群）
// 任何一樣改了，版本就變，App 會把舊的「審核通過」改成「內容已更新・待重新審核」。tools/build-review.js 產生資料包時算、tests/e2e.js 檢查有沒有過期
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const FIELDS = ['id', 'name', 'speed', 'src', 'cues', 'bad', 'cautions', 'muscles', 'musNote'];
const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v ?? null);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function contentHash(root, ex) { const f = x => sha(fs.readFileSync(path.join(root, '3d', 'anims', ex.id + x)));
  return sha(f('.glb') + f('.json') + canon(Object.fromEntries(FIELDS.map(k => [k, ex[k] ?? null])))).slice(0, 12) }
// exercises.js 是瀏覽器用的 ES 模組：讀出來轉成 data: URL 再 import（不依賴 Node 自動判斷模組格式）
async function loadExercises(root) { const src = fs.readFileSync(path.join(root, '3d', 'exercises.js'), 'utf8'); return (await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))).EXERCISES }
module.exports = { contentHash, loadExercises };
