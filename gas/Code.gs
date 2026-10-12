/**
 * NutriCore 圖片後端（Google Apps Script，免費）
 * 用途：替 App 呼叫 Cloudflare Workers AI（FLUX.1 schnell），金鑰只放在這裡，不進前端、不進 GitHub。
 * Cloudflare 免費方案每天 10,000 neurons，用完會直接失敗、不會扣款。
 *
 * 一、設定（專案設定 → 指令碼屬性）
 *   CF_ACCOUNT_ID  Cloudflare 帳戶 ID（Cloudflare 後台右側欄可複製）
 *   CF_API_TOKEN   API Token：My Profile → API Tokens → Create Token → 範本「Workers AI」
 *   DAILY_CAP      每天最多幾張（選填，預設 60），防止網址外流被灌爆；只計算成功的張數
 * 二、部署：部署 → 新增部署作業 → 類型「網頁應用程式」→ 執行身分「我」、存取權「所有人」→ 複製 /exec 結尾的網址
 *     改過這個檔案後：部署 → 管理部署作業 → 編輯 → 版本選「新版本」，網址不變
 * 三、App：「我的 → 圖片後端」貼上網址
 *
 * 回傳：{ok:true, b64:'<JPEG base64>', mime:'image/jpeg'}
 * 失敗：{ok:false, error:'NOT_CONFIGURED' | 'DAILY_CAP' | 'CF_401' | 'BUSY' | 'NO_IMAGE' | 'LOCKED' | 'GAS_ERROR', detail?}
 *       App 會把代碼翻成中文說明（index.html 的 GAS_ERR）
 */
var MODEL = '@cf/black-forest-labs/flux-1-schnell';

function doPost(e) {
  try { return out_(handle_(e)); }
  catch (err) { return out_({ ok: false, error: 'GAS_ERROR', detail: String(err && err.message || err).slice(0, 200) }); }  // 例如 UrlFetch 每日配額用完
}

function handle_(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return { ok: false, error: 'BAD_JSON' }; }
  var prompt = String(req.prompt || '').slice(0, 1500);
  var seed = Math.abs(parseInt(req.seed, 10) || 0) % 2147483647;
  if (!prompt) return { ok: false, error: 'NO_PROMPT' };

  var P = PropertiesService.getScriptProperties();
  var acc = P.getProperty('CF_ACCOUNT_ID'), tok = P.getProperty('CF_API_TOKEN');
  if (!acc || !tok) return { ok: false, error: 'NOT_CONFIGURED' };

  var q = quota_(P, 1);                               // 先保留一張額度（同時多個請求也不會超過上限）
  if (q !== 'OK') return { ok: false, error: q };
  var res = { ok: false, error: 'BUSY' };
  try { res = callCf_(acc, tok, prompt, seed); }
  finally { if (!res.ok) quota_(P, -1); }             // 沒拿到圖片就退回額度：失敗不扣
  return res;
}

// 呼叫 Cloudflare：429／5xx 照 Retry-After（最多 8 秒），沒有就 1、2 秒退避，最多 3 次
function callCf_(acc, tok, prompt, seed) {
  var url = 'https://api.cloudflare.com/client/v4/accounts/' + acc + '/ai/run/' + MODEL;
  for (var i = 0; i < 3; i++) {
    var r = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + tok },
      payload: JSON.stringify({ prompt: prompt, steps: 4, seed: seed })
    });
    var code = r.getResponseCode();
    if (code === 200) {
      var j = JSON.parse(r.getContentText());
      var b64 = j && j.result && j.result.image;
      return b64 ? { ok: true, b64: b64, mime: 'image/jpeg' } : { ok: false, error: 'NO_IMAGE' };
    }
    if (code === 429 || code >= 500) {
      if (i < 2) {
        var h = r.getHeaders() || {}, ra = parseInt(h['Retry-After'] || h['retry-after'], 10);
        Utilities.sleep(Math.min(ra > 0 ? ra * 1000 : 1000 * Math.pow(2, i), 8000));
      }
      continue;
    }
    return { ok: false, error: 'CF_' + code };
  }
  return { ok: false, error: 'BUSY' };
}

// 每日額度：d=1 保留一張（已滿回傳 DAILY_CAP），d=-1 退回；LockService 確保同時多個請求也不會算錯；順便清掉前幾天的計數
function quota_(P, d) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return 'LOCKED';
  try {
    var day = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd'), key = 'CNT_' + day;
    var cap = parseInt(P.getProperty('DAILY_CAP') || '60', 10), n = parseInt(P.getProperty(key) || '0', 10);
    P.getKeys().forEach(function (k) { if (k.indexOf('CNT_') === 0 && k !== key) P.deleteProperty(k); });
    if (d > 0 && n >= cap) return 'DAILY_CAP';
    P.setProperty(key, String(Math.max(0, n + d)));
    return 'OK';
  } finally { lock.releaseLock(); }
}

function doGet() { return out_({ ok: true, service: 'NutriCore image backend' }); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
