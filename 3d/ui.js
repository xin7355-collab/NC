// 3D 動作播放控制（由 3D 模組產生；主程式 index.html 只放容器，維持單檔大小）
// 單手操作：▶／⏸、↺ 重播、◀ ▶ 逐格；進度條＋動作階段；速度 0.5／0.75／1×；循環。系統「減少動態效果」時選了動作也不自動播放
import { EXERCISES, reviewLabel } from './exercises.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STYLE = `.h3dp .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}.h3dp .row .btn{width:auto;min-height:44px;flex:1 1 0;padding:0 6px;margin:0;white-space:nowrap}.h3dp .row .btn.sq{flex:0 0 48px}
.h3dp input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:44px;margin:0;padding:0;border:0;background:transparent;box-shadow:none}
.h3dp input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:rgba(255,255,255,.22)}.h3dp input[type=range]::-moz-range-track{height:6px;border-radius:3px;background:rgba(255,255,255,.22)}
.h3dp input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;margin-top:-9px;border-radius:50%;background:var(--cyan);border:2px solid #0b1220}.h3dp input[type=range]::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:var(--cyan);border:2px solid #0b1220}.h3dp .info{display:flex;justify-content:space-between;gap:8px;font-size:calc(13px*var(--fz));color:var(--mute)}.h3dp .info b{color:var(--text)}
.h3dp input[type=range]:focus-visible{outline:2px solid var(--cyan);outline-offset:2px;border-radius:6px}.h3dp input[type=range]:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 4px rgba(34,228,255,.4)}
.h3dp .seg{flex:1 1 180px}.h3dp .chip{min-height:44px}.h3dp .msg{color:var(--amber);font-size:calc(13px*var(--fz));margin:6px 0}.h3dp .msg:empty{display:none}`;
export function mountPlayer(el, v, opt = {}) {
  if (!document.getElementById('h3dp-css')) { const st = document.createElement('style'); st.id = 'h3dp-css'; st.textContent = STYLE; document.head.appendChild(st) }
  const root = document.createElement('div'); root.className = 'h3dp';
  root.innerHTML = `<div class="h4">選一個動作</div><div class="chips" role="group" aria-label="動作">${EXERCISES.map(e => `<button type="button" class="chip" data-ex="${e.id}" aria-pressed="false">${esc(e.name)}</button>`).join('')}</div>
<div class="msg" role="status" aria-live="polite"></div>
<div class="ctl" hidden>
<div class="row"><button type="button" class="btn" data-a="play" aria-pressed="false">▶ 播放</button><button type="button" class="btn ghost" data-a="replay">↺ 重播</button><button type="button" class="btn ghost sq" data-a="back" aria-label="上一格">◀</button><button type="button" class="btn ghost sq" data-a="fwd" aria-label="下一格">▶</button></div>
<input type="range" min="0" max="1" step="0.0333" value="0" aria-label="動作進度">
<div class="info"><b class="ph"></b><span class="tm"></span></div>
<div class="row"><div class="seg" role="group" aria-label="速度">${[0.5, 0.75, 1].map(x => `<button type="button" data-sp="${x}" aria-pressed="false">${x}×</button>`).join('')}</div><button type="button" class="chip" data-a="loop" aria-pressed="true">🔁 循環</button></div>
<div class="ex"></div></div>`;
  const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)], rng = $('input[type=range]'), msg = $('.msg'); let st = { ready: false }, drag = false, busy = false;
  function details(ex) { const s = ex.src;
    $('.ex').innerHTML = `<div class="h4">✅ 做對的重點</div>${ex.cues.map(c => `<div class="bl">${esc(c)}</div>`).join('')}<div class="h4">⚠️ 常見錯誤</div>${ex.bad.map(c => `<div class="bl">${esc(c)}</div>`).join('')}
<p class="note">動畫來源：${esc(s.kind)}・${esc(s.name)}${s.clip ? `（${esc(s.clip)}）` : ''}；授權：${esc(s.license)}。審核狀態：<span class="tg" data-review="${esc(ex.review)}">${esc(reviewLabel(ex))}</span><br>動作示範只供參考，不能判斷你自己的動作做得對不對；有疼痛、受傷或病史，先問醫師或物理治療師。</p>` }
  async function select(id) { if (busy) return; busy = true; msg.textContent = '載入動作…';
    try { await v.setExercise(id, { autoplay: !opt.reduced }); msg.textContent = ''; details(EXERCISES.find(e => e.id === id)) }
    catch (e) { msg.textContent = '這個動作下載失敗：請確認網路後再點一次' } finally { busy = false } }
  const put = (e, t) => { if (e.textContent !== t) e.textContent = t };   // 播放時每格都會同步：文字有變才寫，省掉手機上無謂的版面重算
  function sync(s) { st = s || { ready: false }; $('.ctl').hidden = !st.ready; $$('[data-ex]').forEach(b => { const on = b.dataset.ex === st.id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on) });
    if (!st.ready) return; const p = $('[data-a="play"]'); put(p, st.playing ? '⏸ 暫停' : '▶ 播放'); p.setAttribute('aria-pressed', st.playing);
    rng.max = st.dur; if (!drag) rng.value = st.time; rng.setAttribute('aria-valuetext', `${st.phase}，第 ${st.time.toFixed(1)} 秒`);
    put($('.ph'), st.phase); put($('.tm'), `${st.time.toFixed(1)}／${st.dur.toFixed(1)} 秒`);
    $$('[data-sp]').forEach(b => { const on = +b.dataset.sp === st.speed; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on) });
    const lp = $('[data-a="loop"]'); lp.classList.toggle('on', st.loop); lp.setAttribute('aria-pressed', st.loop) }
  root.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ex) return select(b.dataset.ex);
    if (b.dataset.sp) return v.setSpeed(+b.dataset.sp);
    const a = b.dataset.a; if (a === 'play') st.playing ? v.pause() : v.play(); else if (a === 'replay') v.replay(); else if (a === 'back') v.step(-1); else if (a === 'fwd') v.step(1); else if (a === 'loop') v.setLoop(!st.loop) });
  rng.addEventListener('pointerdown', () => { drag = true }); addEventListener('pointerup', () => { drag = false });
  rng.addEventListener('input', () => { const t = +rng.value; v.pause(); v.seek(t) });   // 先讀值：暫停會觸發畫面同步，把滑桿改回目前時間（鍵盤調整時就會跳回去）
  v.onAnim(sync);
  function attach(c) { if (c) c.appendChild(root) }
  attach(el); sync(v.animState());
  return { attach, select, destroy() { v.onAnim(null); root.remove() }, get el() { return root } }
}
