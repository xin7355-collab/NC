/**
 * NutriCore 圖片後端（Google Apps Script，免費）
 * 用途：替 App 呼叫 Cloudflare Workers AI（FLUX.1 schnell），金鑰只放在這裡，不進前端、不進 GitHub。
 * Cloudflare 免費方案每天 10,000 neurons，用完會直接失敗、不會扣款。
 *
 * 一、設定（專案設定 → 指令碼屬性）
 *   CF_ACCOUNT_ID  Cloudflare 帳戶 ID（Cloudflare 後台右側欄可複製）
 *   CF_API_TOKEN   API Token：My Profile → API Tokens → Create Token → 範本「Workers AI」
 *   DAILY_CAP      每天最多幾張（選填，預設 60），防止網址外流被灌爆
 * 二、部署：部署 → 新增部署作業 → 類型「網頁應用程式」→ 執行身分「我」、存取權「所有人」→ 複製 /exec 結尾的網址
 * 三、App：「我的 → 圖片後端」貼上網址
 *
 * 回傳：{ok:true, b64:'<JPEG base64>', mime:'image/jpeg'}；失敗 {ok:false, error:'DAILY_CAP' | 'NOT_CONFIGURED' | 'CF_401' | ...}
 */
var MODEL = '@cf/black-forest-labs/flux-1-schnell';

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'BAD_JSON' }); }
  var prompt = String(req.prompt || '').slice(0, 1500);
  var seed = Math.abs(parseInt(req.seed, 10) || 0) % 2147483647;
  if (!prompt) return out_({ ok: false, error: 'NO_PROMPT' });

  var P = PropertiesService.getScriptProperties();
  var acc = P.getProperty('CF_ACCOUNT_ID'), tok = P.getProperty('CF_API_TOKEN');
  if (!acc || !tok) return out_({ ok: false, error: 'NOT_CONFIGURED' });
  if (!takeQuota_(P)) return out_({ ok: false, error: 'DAILY_CAP' });

  var url = 'https://api.cloudflare.com/client/v4/accounts/' + acc + '/ai/run/' + MODEL;
  for (var i = 0; i < 3; i++) {                       // 429／5xx：1、2 秒指數退避，最多 3 次
    var r = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + tok },
      payload: JSON.stringify({ prompt: prompt, steps: 4, seed: seed })
    });
    var code = r.getResponseCode();
    if (code === 200) {
      var j = JSON.parse(r.getContentText());
      var b64 = j && j.result && j.result.image;
      return out_(b64 ? { ok: true, b64: b64, mime: 'image/jpeg' } : { ok: false, error: 'NO_IMAGE' });
    }
    if (code === 429 || code >= 500) { Utilities.sleep(1000 * Math.pow(2, i)); continue; }
    return out_({ ok: false, error: 'CF_' + code });
  }
  return out_({ ok: false, error: 'BUSY' });
}

// 每日上限：LockService 確保同時多個請求也不會算錯；順便清掉前幾天的計數
function takeQuota_(P) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var day = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd'), key = 'CNT_' + day;
    var cap = parseInt(P.getProperty('DAILY_CAP') || '60', 10), n = parseInt(P.getProperty(key) || '0', 10);
    P.getKeys().forEach(function (k) { if (k.indexOf('CNT_') === 0 && k !== key) P.deleteProperty(k); });
    if (n >= cap) return false;
    P.setProperty(key, String(n + 1));
    return true;
  } finally { lock.releaseLock(); }
}

function doGet() { return out_({ ok: true, service: 'NutriCore image backend' }); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
