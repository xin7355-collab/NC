// 專業審核（第五階段）：審核資料庫 3d/review/reviews.json（隨網站發布，所有手機看到的正式狀態）＋這支手機匯入的審核意見
// App 的播放器和審核資料包頁面（review/）都用這個檔案。審核意見只在這支手機，直到開發者把「匯出審核資料庫」的檔案更新到網站
import { EXERCISES, STATUS, reviewLabel } from './exercises.js';
export { STATUS, reviewLabel };
const LS = 'nc_rev3d';   // 本機匯入的審核意見（不在 App 健康資料備份裡；換手機要重新匯入，或請開發者發布到網站）
export const CHOICES = ['approved', 'revision_required', 'rejected'];   // 審核的人可以選的結果
export const FIELDS = [['anim', '動畫（姿勢、角度、節奏）'], ['desc', '動作說明與常見錯誤'], ['muscles', '肌群'], ['cautions', '注意事項']];
export const HIDDEN = '（不公開姓名）';
const p2 = n => String(n).padStart(2, '0'), ymd = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const today = () => ymd(new Date());
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };

// 讀審核資料庫與資料包清單（內容版本）；ver＝App 版本號（換版時不吃舊快取）
export async function loadDB(ver = '') { const q = ver ? `?v=${encodeURIComponent(ver)}` : '', get = async f => { const r = await fetch(new URL(`./review/${f}`, import.meta.url).href + q); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() };
  const [db, pkg] = await Promise.all([get('reviews.json'), get('package.json')]);
  return { db, pkg, content: Object.fromEntries((pkg.items || []).map(i => [i.id, i.content])) } }
export function local() { try { const v = JSON.parse(localStorage.getItem(LS) || 'null'); return v && v.items && typeof v.items === 'object' ? v : { schema: 1, items: {} } } catch (e) { return { schema: 1, items: {} } } }
function saveLocal(o) { try { localStorage.setItem(LS, JSON.stringify(o)); return true } catch (e) { return false } }
export function clearLocal() { try { localStorage.removeItem(LS) } catch (e) {} }
// 每個動作取版本較新的那一份（網站的正式資料 vs 這支手機匯入的）
export function merged(db) { const L = local().items, out = {};
  for (const e of EXERCISES) { const a = db?.items?.[e.id], b = L[e.id]; out[e.id] = b && (!a || (b.rev || 0) > (a.rev || 0)) ? b : a || { status: e.review, rev: 0, history: [] } }
  return out }
// 審核人＋日期（審核通過才有）；姓名只有本人同意公開、或在這支手機上才顯示
export function who(rec, showName) { if (!rec?.reviewedAt) return ''; const nm = rec.reviewer && rec.reviewer !== HIDDEN && (rec.publish || showName) ? rec.reviewer : ''; return [[rec.title, nm].filter(Boolean).join(' '), rec.reviewedAt].filter(Boolean).join('，') }
// 修正紀錄（新的在前）：內容更新、送審、每次審核意見
export function historyLines(rec, showName) { return [...(rec?.history || [])].reverse().map(h => {
  const by = [h.title, h.reviewer && h.reviewer !== HIDDEN && (h.publish || showName) ? h.reviewer : ''].filter(Boolean).join(' '), cm = h.comments ? Object.values(h.comments).filter(Boolean).join('；') : '';
  const text = h.kind === 'content' ? `內容更新：${h.note || ''}` : h.kind === 'status' ? `${STATUS[h.status] || h.status}：${h.note || ''}` : `${by || '專業人員'}審核「${STATUS[h.status] || h.status}」（${h.reviewedAt || h.date}）${h.stale ? '，針對舊版內容，沒有改變目前狀態' : ''}${cm ? '：' + cm : ''}`;
  return { rev: h.rev, date: h.date, text } }) }

// 檢查教練匯出的審核意見檔；回傳要套用的項目與錯誤（不會改任何資料）
const str = (v, n) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= n;
export function checkResult(j, st) { const err = [], items = [];
  if (!j || j.type !== 'kinwell-3d-review-result' || j.schema !== 1) return { err: ['這不是 Kinwell 的審核意見檔：請選教練在審核資料包按「匯出審核意見」產生的 .json 檔'], items };
  const rv = j.reviewer || {}, tmr = ymd(new Date(Date.now() + 864e5));
  if (!str(rv.name, 40)) err.push('檔案裡沒有審核人的姓名'); if (!str(rv.title, 60)) err.push('檔案裡沒有審核人的職稱或資格');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(j.date || '') || j.date > tmr) err.push('審核日期不正確');
  if (!Array.isArray(j.items) || !j.items.length) err.push('檔案裡沒有任何動作的審核結果');
  for (const it of Array.isArray(j.items) ? j.items : []) { const ex = EXERCISES.find(e => e.id === it?.id); if (!ex) { err.push(`不認得的動作：${String(it?.id).slice(0, 20)}`); continue }
    if (!CHOICES.includes(it.status)) { err.push(`${ex.name}：審核結果不正確`); continue }
    const cm = {}; let bad = false; for (const k of ['general', ...FIELDS.map(f => f[0])]) { const v = it.comments?.[k]; if (v == null) continue; if (typeof v !== 'string' || v.length > 2000) bad = true; else if (v.trim()) cm[k] = v.trim() }
    if (bad) { err.push(`${ex.name}：意見太長（每欄 2000 字內）或格式不對`); continue }
    if (it.status !== 'approved' && !Object.keys(cm).length) { err.push(`${ex.name}：選了「${STATUS[it.status]}」但沒有寫原因`); continue }
    const rec = st.recs[ex.id] || {}, content = typeof it.content === 'string' ? it.content.slice(0, 40) : '', stale = content !== st.content[ex.id];
    const dup = (rec.history || []).some(h => h.kind === 'review' && h.reviewedAt === j.date && h.status === it.status && h.content === content && h.title === String(rv.title).trim());
    items.push({ id: ex.id, name: ex.name, status: it.status, content, comments: cm, stale, dup, from: rec.status }) }
  return { err, items, reviewer: { name: String(rv.name || '').trim(), title: String(rv.title || '').trim(), publish: rv.publish === true }, date: j.date } }
// 套用（存在這支手機）：每個動作版本＋1、修正紀錄加一筆；針對舊版內容的意見只記紀錄、不改目前狀態；重複匯入的略過
export function applyResult(r, st) { const L = local(), t = today(); let n = 0;
  for (const it of r.items) { if (it.dup) continue; const rec = st.recs[it.id] || { history: [] }, rev = (rec.rev || 0) + 1;
    const h = { rev, date: t, kind: 'review', status: it.status, reviewer: r.reviewer.name, title: r.reviewer.title, publish: r.reviewer.publish, reviewedAt: r.date, content: it.content, comments: it.comments, ...(it.stale ? { stale: true } : {}) };
    L.items[it.id] = it.stale ? { ...rec, rev, history: [...(rec.history || []), h] }
      : { ...rec, rev, status: it.status, reviewer: r.reviewer.name, title: r.reviewer.title, publish: r.reviewer.publish, reviewedAt: r.date, content: it.content, comments: it.comments, history: [...(rec.history || []), h] };
    n++ }
  return saveLocal(L) ? n : -1 }
// 匯出審核資料庫（給開發者更新網站）：沒同意公開的姓名一律拿掉，只留職稱
export function exportDB(db) { const strip = o => o && o.reviewer && !o.publish ? { ...o, reviewer: HIDDEN } : o, out = {};
  for (const [id, r] of Object.entries(merged(db))) out[id] = { ...strip(r), history: (r.history || []).map(strip) };
  return { type: 'kinwell-3d-reviews', schema: 1, updated: today(), items: out } }
// iPhone 分享檔案只能帶 files（帶 title 會丟掉檔案）；不支援時改成下載
export async function shareFile(json, name) { const file = new File([json], name, { type: 'application/json' });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return 'shared' } } catch (e) { if (e.name === 'AbortError') return 'cancel' }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1500); return 'downloaded' }
