// 3D 動作播放控制（由 3D 模組產生；主程式 index.html 只放容器，維持單檔大小）
// 單手操作：▶／⏸、↺ 重播、◀ ▶ 逐格；進度條＋動作階段；速度 0.5／0.75／1×；循環；💪 標出肌群（第四階段）。系統「減少動態效果」時選了動作也不自動播放
// 🩺 專業審核（第五階段，只在 App 顯示）：開啟審核資料包、匯入教練的審核意見（先預覽再套用）、匯出審核資料庫；審核狀態與修正紀錄依審核資料庫顯示
import { EXERCISES, MUSCLE_GROUPS } from './exercises.js';
import * as RV from './review.js';
const esc = RV.esc;
const STYLE = `.h3dp .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}.h3dp .row .btn{width:auto;min-height:44px;flex:1 1 0;padding:0 6px;margin:0;white-space:nowrap}.h3dp .row .btn.sq{flex:0 0 48px}
.h3dp input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:44px;margin:0;padding:0;border:0;background:transparent;box-shadow:none}
.h3dp input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:rgba(255,255,255,.22)}.h3dp input[type=range]::-moz-range-track{height:6px;border-radius:3px;background:rgba(255,255,255,.22)}
.h3dp input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;margin-top:-9px;border-radius:50%;background:var(--cyan);border:2px solid #0b1220}.h3dp input[type=range]::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:var(--cyan);border:2px solid #0b1220}.h3dp .info{display:flex;justify-content:space-between;gap:8px;font-size:calc(13px*var(--fz));color:var(--mute)}.h3dp .info b{color:var(--text)}
.h3dp input[type=range]:focus-visible{outline:2px solid var(--cyan);outline-offset:2px;border-radius:6px}.h3dp input[type=range]:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 4px rgba(34,228,255,.4)}
.h3dp .mus{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:calc(14px*var(--fz))}.h3dp .lv{flex:none;min-width:3.2em;text-align:center;padding:2px 8px;border-radius:6px;font-size:calc(12px*var(--fz));font-weight:700}.h3dp .lv.p{background:#d93a3e;color:#fff}.h3dp .lv.s{background:#ff8a1f;color:#1a1205}
.h3dp .seg{flex:1 1 180px}.h3dp .chip{min-height:44px}.h3dp .msg{color:var(--amber);font-size:calc(13px*var(--fz));margin:6px 0}.h3dp .msg:empty{display:none}.h3dp .msg.ok{color:var(--green,#3ddc97)}
.h3dp details{margin:10px 0}.h3dp summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600}.h3dp .hist summary{min-height:32px;font-weight:400;color:var(--mute)}.h3dp .hist ol{margin:4px 0;padding-left:1.4em;font-size:calc(13px*var(--fz));color:var(--mute)}
.h3dp .rvi{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.08)}.h3dp .rvi b{min-width:6em}.h3dp .rvp .row .btn{flex:1 1 160px}.h3dp .rvprev{border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:8px 12px;margin:8px 0}.h3dp .rvprev ul{margin:6px 0;padding-left:1.3em}.h3dp .row a.rvlink{display:flex;align-items:center;justify-content:center;flex:1 1 auto;min-height:44px;height:auto;padding:8px 12px;text-decoration:none;text-align:center;line-height:1.4;white-space:normal}`;
export function mountPlayer(el, v, opt = {}) {
  if (!document.getElementById('h3dp-css')) { const st = document.createElement('style'); st.id = 'h3dp-css'; st.textContent = STYLE; document.head.appendChild(st) }
  const root = document.createElement('div'); root.className = 'h3dp';
  root.innerHTML = `<div class="h4">選一個動作</div><div class="chips" role="group" aria-label="動作">${EXERCISES.map(e => `<button type="button" class="chip" data-ex="${e.id}" aria-pressed="false">${esc(e.name)}</button>`).join('')}</div>
<div class="msg" role="status" aria-live="polite"></div>
<div class="ctl" hidden>
<div class="row"><button type="button" class="btn" data-a="play" aria-pressed="false">▶ 播放</button><button type="button" class="btn ghost" data-a="replay">↺ 重播</button><button type="button" class="btn ghost sq" data-a="back" aria-label="上一格">◀</button><button type="button" class="btn ghost sq" data-a="fwd" aria-label="下一格">▶</button></div>
<input type="range" min="0" max="1" step="0.0333" value="0" aria-label="動作進度">
<div class="info"><b class="ph"></b><span class="tm"></span></div>
<div class="row"><div class="seg" role="group" aria-label="速度">${[0.5, 0.75, 1].map(x => `<button type="button" data-sp="${x}" aria-pressed="false">${x}×</button>`).join('')}</div><button type="button" class="chip" data-a="loop" aria-pressed="true">🔁 循環</button><button type="button" class="chip" data-a="mus" aria-pressed="false">💪 標出肌群</button></div>
<div class="ex"></div></div>${opt.panel === false ? '' : `
<details class="rvp"><summary>🩺 專業審核（給教練看、匯入審核意見）</summary>
<p class="note">每個動作要有物理治療師或運動教練的審核紀錄，才會標示通過；沒有審核人和日期、或審核的是舊版內容都不算。</p>
<div class="row"><a class="btn ghost rvlink" href="./review/" target="_blank" rel="noopener">開啟審核資料包（把這頁網址傳給教練）</a></div>
<div class="rvl"></div>
<input type="file" accept=".json,application/json" hidden><div class="row"><button type="button" class="btn ghost" data-a="rvimp">📥 匯入教練的審核意見</button></div>
<div class="rvprev" hidden></div>
<div class="row"><button type="button" class="btn ghost" data-a="rvexp">📤 匯出審核資料庫</button><button type="button" class="btn ghost" data-a="rvclr">清除匯入的意見</button></div>
<p class="note">匯入的意見只存在這支手機（不在健康資料備份裡）。要讓每支手機都看到，請把匯出的審核資料庫交給開發者更新網站；教練沒同意公開的姓名不會匯出。</p>
<p class="msg rvmsg" role="status" aria-live="polite"></p></details>`}`;
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)], rng = $('input[type=range]'), msg = $('.msg'); let st = { ready: false }, drag = false, busy = false;
  const GL = Object.fromEntries(MUSCLE_GROUPS), names = a => (a || []).map(k => esc(GL[k] || k)).join('、') || '—';
  // 審核資料：審核資料包頁面會直接給；App 自己讀（讀不到時退回動作本身的預設狀態，不會顯示通過）
  let db = opt.db || null, pending = null; const recs = () => db ? RV.merged(db.db) : {}, cur = () => EXERCISES.find(e => e.id === st.id);
  if (!db) RV.loadDB(opt.ver).then(x => { db = x; root.dataset.rv = 'ready'; refresh() }).catch(() => { root.dataset.rv = 'error'; refresh(); rvMsg('審核資料讀不到：請確認網路後重新打開 3D（狀態先顯示預設值）') }); else root.dataset.rv = 'ready';
  function refresh() { const ex = cur(); if (ex && $('.ex').childElementCount) details(ex); const L = $('.rvl'); if (!L) return; const R = recs();
    L.innerHTML = (db || root.dataset.rv === 'error' ? '' : '<p class="note">審核資料讀取中…</p>') + EXERCISES.map(e => { const r = R[e.id], w = RV.who(r, true); return `<div class="rvi"><b>${esc(e.name)}</b><span class="tg" data-review="${esc(r?.status || e.review)}">${esc(RV.reviewLabel(e, r, db?.content[e.id]))}</span>${w ? `<span class="note">${esc(w)}</span>` : ''}</div>` }).join('') }
  function rvMsg(t, ok) { const m = $('.rvmsg'); if (!m) return; m.textContent = t; m.classList.toggle('ok', !!ok) }
  function details(ex) { const s = ex.src, M = ex.muscles || {}, r = recs()[ex.id], w = r ? RV.who(r, true) : '', H = r ? RV.historyLines(r, true) : [];
    $('.ex').innerHTML = `<div class="h4">💪 用到的肌群</div><div class="mus"><span class="lv p">主要</span><span>${names(M.primary)}</span></div><div class="mus"><span class="lv s">次要</span><span>${names(M.secondary)}</span></div>
<p class="note">${ex.musNote ? esc(ex.musNote) + '<br>' : ''}按「💪 標出肌群」在人物身上看：紅＝主要、橘＝次要、灰＝其他。只是部位示意，不是真實肌肉的形狀或收縮。</p>
<div class="h4">✅ 做對的重點</div>${ex.cues.map(c => `<div class="bl">${esc(c)}</div>`).join('')}<div class="h4">⚠️ 常見錯誤</div>${ex.bad.map(c => `<div class="bl">${esc(c)}</div>`).join('')}
${(ex.cautions || []).length ? `<div class="h4">🩹 注意事項</div>${ex.cautions.map(c => `<div class="bl">${esc(c)}</div>`).join('')}` : ''}
<p class="note">動畫來源：${esc(s.kind)}・${esc(s.name)}${s.clip ? `（${esc(s.clip)}）` : ''}；授權：${esc(s.license)}。審核狀態：<span class="tg" data-review="${esc(r?.status || ex.review)}">${esc(RV.reviewLabel(ex, r, db?.content[ex.id]))}</span>${w ? `（${esc(w)}）` : ''}<br>動作示範只供參考，不能判斷你自己的動作做得對不對；有疼痛、受傷或病史，先問醫師或物理治療師。</p>
${H.length ? `<details class="hist"><summary>修正紀錄（${H.length} 筆）</summary><ol reversed>${H.map(x => `<li>${esc(x.date)}：${esc(x.text)}</li>`).join('')}</ol></details>` : ''}` }
  // 匯入教練的審核意見：先檢查、列出會改什麼，按「套用」才存
  function preview(r) { const P = $('.rvprev'); P.hidden = false; const R = recs();
    if (r.err.length) { pending = null; P.innerHTML = `<b>這個檔案不能匯入：</b><ul>${r.err.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="note">沒有套用任何資料。</p><button type="button" class="btn ghost" data-a="rvno">關閉</button>`; return }
    pending = r; const lines = r.items.map(it => { const ex = EXERCISES.find(e => e.id === it.id), from = RV.reviewLabel(ex, R[it.id], db?.content[it.id]);
      return `<li>${esc(it.name)}：${it.dup ? '已經匯入過，略過' : it.stale ? `⚠️ 這份意見是針對舊版內容，只記在修正紀錄、不改目前狀態（${esc(from)}）` : `${esc(from)} → ${esc(RV.STATUS[it.status])}`}${Object.keys(it.comments).length ? `<br><span class="note">意見：${esc(Object.values(it.comments).join('；'))}</span>` : ''}</li>` }).join('');
    const any = r.items.some(it => !it.dup); if (!any) pending = null;
    P.innerHTML = `<b>審核人：${esc(r.reviewer.title)} ${esc(r.reviewer.name)}（${esc(r.date)}${r.reviewer.publish ? '，同意公開姓名' : '，姓名不公開'}）</b><ul>${lines}</ul>${any ? '<div class="row"><button type="button" class="btn" data-a="rvok">套用</button><button type="button" class="btn ghost" data-a="rvno">取消</button></div>' : '<p class="note">這個檔案的意見都已經匯入過，不用再套用。</p><button type="button" class="btn ghost" data-a="rvno">關閉</button>'}` }
  async function rvAction(a) { if (a === 'rvimp') return $('.rvp input[type=file]').click();
    if (a === 'rvno') { pending = null; $('.rvprev').hidden = true; return }
    if (a === 'rvok') { if (!pending || !db) return; const n = RV.applyResult(pending, { recs: recs(), content: db.content }); pending = null; $('.rvprev').hidden = true;
      if (n < 0) return rvMsg('儲存失敗：手機空間不足或瀏覽器限制'); refresh(); return rvMsg(n ? `已套用 ${n} 個動作的審核意見（存在這支手機）` : '沒有新的意見（都已經匯入過）', true) }
    if (a === 'rvexp') { if (!db) return rvMsg('審核資料還沒讀到：請確認網路後再試一次'); const d = new Date(), f = `kinwell-3d-reviews-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
      const r = await RV.shareFile(JSON.stringify(RV.exportDB(db.db), null, 1), f); if (r !== 'cancel') rvMsg(r === 'shared' ? '已分享審核資料庫：請交給開發者更新網站' : `已下載 ${f}：請交給開發者更新網站`, true); return }
    if (a === 'rvclr') { if (!confirm('清除這支手機匯入的審核意見？（網站上的正式審核紀錄不受影響）')) return; RV.clearLocal(); refresh(); rvMsg('已清除這支手機匯入的審核意見', true) } }
  root.querySelector('.rvp input[type=file]')?.addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; rvMsg('');
    if (f.size > 200 * 1024) return rvMsg('檔案太大：審核意見檔通常不到 50 KB，請確認選對檔案');
    let j; try { j = JSON.parse(await f.text()) } catch (err) { return rvMsg('讀不懂這個檔案：請選教練在審核資料包匯出的 .json 檔') }
    if (!db) return rvMsg('審核資料還沒讀到：請確認網路後再試一次'); preview(RV.checkResult(j, { recs: recs(), content: db.content })) });
  async function select(id) { if (busy) return; busy = true; msg.textContent = '載入動作…';
    try { await v.setExercise(id, { autoplay: !opt.reduced }); msg.textContent = ''; details(EXERCISES.find(e => e.id === id)) }
    catch (e) { msg.textContent = '這個動作下載失敗：請確認網路後再點一次' } finally { busy = false } }
  const put = (e, t) => { if (e.textContent !== t) e.textContent = t };   // 播放時每格都會同步：文字有變才寫，省掉手機上無謂的版面重算
  function sync(s) { st = s || { ready: false }; $('.ctl').hidden = !st.ready; $$('[data-ex]').forEach(b => { const on = b.dataset.ex === st.id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on) });
    if (!st.ready) return; const p = $('[data-a="play"]'); put(p, st.playing ? '⏸ 暫停' : '▶ 播放'); p.setAttribute('aria-pressed', st.playing);
    rng.max = st.dur; if (!drag) rng.value = st.time; rng.setAttribute('aria-valuetext', `${st.phase}，第 ${st.time.toFixed(1)} 秒`);
    put($('.ph'), st.phase); put($('.tm'), `${st.time.toFixed(1)}／${st.dur.toFixed(1)} 秒`);
    $$('[data-sp]').forEach(b => { const on = +b.dataset.sp === st.speed; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on) });
    const lp = $('[data-a="loop"]'); lp.classList.toggle('on', st.loop); lp.setAttribute('aria-pressed', st.loop);
    const mu = $('[data-a="mus"]'); mu.classList.toggle('on', !!st.mus); mu.setAttribute('aria-pressed', !!st.mus) }
  root.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ex) return select(b.dataset.ex);
    if (b.dataset.sp) return v.setSpeed(+b.dataset.sp);
    const a = b.dataset.a; if (/^rv/.test(a)) return rvAction(a); if (a === 'play') st.playing ? v.pause() : v.play(); else if (a === 'replay') v.replay(); else if (a === 'back') v.step(-1); else if (a === 'fwd') v.step(1); else if (a === 'loop') v.setLoop(!st.loop); else if (a === 'mus') v.setMuscles(!st.mus) });
  rng.addEventListener('pointerdown', () => { drag = true }); addEventListener('pointerup', () => { drag = false });
  rng.addEventListener('input', () => { const t = +rng.value; v.pause(); v.seek(t) });   // 先讀值：暫停會觸發畫面同步，把滑桿改回目前時間（鍵盤調整時就會跳回去）
  v.onAnim(sync);
  function attach(c) { if (c) c.appendChild(root) }
  attach(el); sync(v.animState()); refresh();
  return { attach, select, destroy() { v.onAnim(null); root.remove() }, get el() { return root } }
}
