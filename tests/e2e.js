// NutriCore 端對端測試：用 iPhone 尺寸的無頭 Chromium 操作 index.html（不連外網，外部 API 全部模擬）
// 用法：node tests/e2e.js            跑全部測試
//       node tests/e2e.js --update-prompts   依 App 內提示詞重寫 PROMPTS.md
const path = require('path'), fs = require('fs');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break } catch (e) {} }
if (!pw) { console.error('找不到 playwright（npm i -g playwright）'); process.exit(2) }
const ROOT = path.join(__dirname, '..'), PAGE = 'file://' + path.join(ROOT, 'index.html');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGP432ODFTEMLQkAoxxxwW4TzCoAAAAASUVORK5CYII=', 'base64');
const addD = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
const results = []; const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);

(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const errs = [];
  // ---- AI Horde 模擬：ok 模式先排隊兩次再完成；fail 模式志工主機失敗；hang 模式查進度永遠不回應 ----
  let horde = { mode: 'ok', checks: 0, prompts: [] };
  await ctx.route('https://aihorde.net/api/v2/**', async r => {
    const u = r.request().url(), m = r.request().method();
    if (u.endsWith('/generate/async')) { horde.prompts.push(JSON.parse(r.request().postData()).prompt); horde.checks = 0; return r.fulfill({ status: 202, json: { id: 'job1', kudos: 10 } }) }
    if (u.includes('/generate/check/') && horde.mode === 'hang') return;   // 不回應：請求一直掛著
    if (u.includes('/generate/check/')) { horde.checks++; return r.fulfill({ json: horde.mode === 'fail' ? { faulted: true } : { done: horde.checks > 2, queue_position: Math.max(0, 3 - horde.checks), wait_time: 6, processing: 0, is_possible: true, faulted: false } }) }
    if (u.includes('/generate/status/')) return m === 'DELETE' ? r.fulfill({ json: {} }) : r.fulfill({ json: { done: true, generations: [{ img: PNG.toString('base64'), censored: false }] } });
    return r.fulfill({ status: 404, json: {} });
  });
  // ---- GAS 後端模擬：reply 是物件就回 JSON，字串就回 HTML（模擬部署網址錯誤） ----
  const gas = { hits: 0, reply: { ok: false, error: 'NOT_CONFIGURED' } };
  await ctx.route('https://script.google.com/**', r => { gas.hits++; const h = { 'Access-Control-Allow-Origin': '*' };
    return typeof gas.reply === 'string' ? r.fulfill({ status: 200, contentType: 'text/html', body: gas.reply, headers: h }) : r.fulfill({ json: gas.reply, headers: h }) });
  // o.clock：裝假時鐘（可快轉計時器）；o.url：改用 http 網址載入
  const newPage = async (seed, o = {}) => { const p = await ctx.newPage(); if (o.clock) await p.clock.install(); p.on('pageerror', e => errs.push(`[pageerror] ${e.message}`)); p.on('dialog', d => d.accept());
    p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(`[console] ${m.text()}`) });
    // 每個分頁第一次載入時清空並寫入自己的測試資料（同一分頁重新整理時保留）
    if (seed) await p.addInitScript(([s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem('nc_' + k, JSON.stringify(v)); sessionStorage.setItem('seeded', '1') } }, [seed]);
    await p.goto(o.url || PAGE); await p.waitForTimeout(500); return p };

  // 圖片工坊入口在「飲食」頁底部
  const toLab = async () => { await page.click('#nav button[data-v="menu"]'); await page.click('#v-menu [data-golab]'); await page.waitForTimeout(150) };

  // =============== 1. 判讀、評分、身體地圖 ===============
  let page = await newPage({
    members: [{ id: 'm1', name: '爸爸', sex: 'm', birth: '1975-05-20', h: 172, w: 82, waist: 95, neck: 40, act: '1.375', goal: 'cut' }], active: 'm1',
    scale: { m1: [{ id: 's1', t: '2026-10-10T07:30', weight: 82, bmi: 37.2, fat: 31.5, visceral: 16, muscle: 55, hr: 88, status: { fat: '偏高', visceral: '嚴重' } }] },
    labs: { m1: [{ id: 'l1', t: '2026-09-20', hospital: '測試醫院', items: { sbp: { v: 142 }, dbp: { v: 92 }, glu: { v: 118 }, tc: { v: 232 }, ldl: { v: 165 }, alt: { v: 88 }, ast: { v: 52 }, cr: { v: 1.4 }, egfr: { v: 52 },
      ua: { v: 9.6 }, hb: { v: 12.1 }, tsh: { v: 5.2 }, fobt: { v: '陽性' }, uob: { v: '+' }, psa: { v: 4.8 }, waist: { v: 95 }, iop: { v: 24 }, ebv: { v: '陽性' } }, extra: [] }] } });
  const scaleLv = await page.evaluate(() => scaleEval(scalesOf(me())[0], me()).map(i => `${i.k}:${i.lv}`).join(','));
  check('體脂機項目最高判到「異常」', !/:3/.test(scaleLv), scaleLv);
  const caps = await page.evaluate(() => [scoreOf([{ organ: 'liver', k: 'alt', lv: 2 }]), scoreOf([{ organ: 'liver', k: 'alt', lv: 1 }]), scoreOf([{ organ: 'x', k: 'a', lv: 3 }]), scoreOf([])]);
  check('分數上限：異常≤74、注意≤89、嚴重≤59、無異常100', caps[0] <= 74 && caps[1] <= 89 && caps[2] <= 59 && caps[3] === 100, caps.join(','));
  await page.click('#nav button[data-v="body"]'); await page.waitForTimeout(600);
  const tap = async o => {
    const pt = await page.evaluate(o => { const el = document.querySelector(`#hud [data-org="${o}"]`) || document.querySelector(`#hud [data-o="${o}"]`), b = el.getBoundingClientRect();
      const fx = { kidney: .12, lung: .12 }[o]; if (o === 'stomach') { const q = el.ownerSVGElement.createSVGPoint(); q.x = 124; q.y = 172; const r = q.matrixTransform(document.querySelector('#hud [data-o="stomach"]').getScreenCTM()); return { x: r.x, y: r.y } }
      return { x: b.x + b.width * (fx || .5), y: b.y + b.height / 2 } }, o);
    await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(900);
    return page.evaluate(() => document.querySelector('#organPanel b')?.textContent || '(none)') };
  for (const [o, want] of [['kidney', '腎臟'], ['pancreas', '胰臟／血糖'], ['heart', '心臟'], ['liver', '肝臟'], ['stomach', '胃'], ['thyroid', '甲狀腺'], ['brain', '腦部'], ['lung', '肺部']]) { const got = await tap(o); check(`點 ${o}`, got === want, got) }
  const lab = await page.evaluate(() => { const svg = document.querySelector('#hud svg'), r = svg.getBoundingClientRect(), ts = [...svg.querySelectorAll('.callout text')].map(t => t.getBoundingClientRect());
    let ov = 0; for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) { const a = ts[i], b = ts[j]; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) ov++ }
    return { out: ts.filter(b => b.left < r.left - .5 || b.right > r.right + .5).length, ov, organs: [...svg.querySelectorAll('.callout')].map(c => c.dataset.o).join(',') } });
  check('標註不超出畫面、不重疊', !lab.out && !lab.ov, JSON.stringify(lab));
  check('眼睛、耳鼻喉出現在身體地圖', /eye/.test(lab.organs) && /ent/.test(lab.organs), lab.organs);
  await page.close();

  // =============== 2. 體檢 AI 匯入 ===============
  page = await newPage({ members: [{ id: 'f1', name: '媽媽', sex: 'f', birth: '1980-03-02', h: 160, w: 58, act: '1.375', goal: 'keep' }], active: 'f1' });
  await page.click('#nav button[data-v="body"]'); await page.click('#v-body [data-addlab]'); await page.waitForTimeout(400); await page.click('details.box.ai > summary');
  const labJSON = '好的 [體檢] 結果：```json\n' + JSON.stringify({ type: 'nutricore.lab', v: 1, date: '115/09/20', hospital: '台大醫院', items: {
    wbc: { value: 6500, unit: '/uL', lo: 4000, hi: 10000 }, plt: { value: 250000, unit: '/uL', flag: 'Normal' }, fobt: { value: 135, unit: 'ng/mL', hi: 100, flag: 'H' },
    ua: { value: 0.42, unit: 'mmol/L' }, hdl: { value: 52, unit: 'mg/dL', lo: 40, flag: 'Normal' }, glu: { value: 5.6, unit: 'mmol/L' }, k: { value: 6.2, unit: 'mmol/L' },
    vitd: { value: 37.5, unit: 'nmol/L' }, dxa: { value: -2.7 }, hbsab: { value: '陰性' }, ana: { value: '1:80' },
    us_liver: { value: 'Mild fatty liver', note: '輕度脂肪肝' }, mammo: { value: 'BI-RADS 4A' }, ldct: { value: 'Lung-RADS 4X' }, pap: { value: '正常（陰性）' } },
    extra: [{ name: '鈉 Na', value: 140, unit: 'mmol/L', lo: 136, hi: 145, flag: 'Normal' }, { name: '鐵蛋白', value: 8, unit: 'ng/mL', lo: 15, hi: 150, flag: 'L' }] }) + '\n```';
  await page.fill('#ai-in', labJSON); await page.click('#ai-go'); await page.waitForTimeout(200);
  const vals = await page.evaluate(() => Object.fromEntries(['l-date', 'l-wbc', 'l-plt', 'l-ua', 'l-glu', 'l-k', 'l-vitd', 'l-dxa', 'l-hbsab', 'l-us_liver', 'l-mammo', 'l-ldct'].map(id => [id, document.getElementById(id)?.value])));
  check('民國年 115/09/20 → 2026-09-20', vals['l-date'] === '2026-09-20', vals['l-date']);
  check('白血球 6500/uL → 6.5、血小板 250000 → 250', +vals['l-wbc'] === 6.5 && +vals['l-plt'] === 250, `${vals['l-wbc']} ${vals['l-plt']}`);
  check('尿酸 mmol/L、血糖 mmol/L、維生素 D nmol/L 換算', Math.abs(+vals['l-ua'] - 7.06) < .05 && Math.abs(+vals['l-glu'] - 100.89) < .1 && Math.abs(+vals['l-vitd'] - 15.02) < .05, `${vals['l-ua']} ${vals['l-glu']} ${vals['l-vitd']}`);
  check('影像結果對應選項（脂肪肝、BI-RADS 4A、Lung-RADS 4X）', vals['l-us_liver'] === '輕度脂肪肝' && /BI-RADS 4/.test(vals['l-mammo']) && /4X/.test(vals['l-ldct']), `${vals['l-us_liver']}｜${vals['l-mammo']}｜${vals['l-ldct']}`);
  check('負的骨密度 T 值、抗體文字可填', vals['l-dxa'] === '-2.7' && vals['l-hbsab'] === '陰性', `${vals['l-dxa']} ${vals['l-hbsab']}`);
  await page.click('#lSave'); await page.waitForTimeout(500);
  const ev = await page.evaluate(() => { const r = labsOf(me()).find(x => x.hospital === '台大醫院'); return labEval(r, me()).map(i => `${i.k}:${i.lv}`).join(',') });
  check('糞便潛血 135（H）判異常', /fobt:2/.test(ev), ev);
  check('"Normal" 標記不算異常、/µL 換算後正常', !/hdl:|wbc:|plt:|x_鈉/.test(ev), ev);
  check('鉀 6.2 判嚴重、骨密度 -2.7 判異常、乳房 4A 判嚴重、LDCT 4X 判嚴重', /k:3/.test(ev) && /dxa:2/.test(ev) && /mammo:3/.test(ev) && /ldct:3/.test(ev), ev);
  check('ANA 1:80 不算異常、抗體保護力不計分、鐵蛋白 L 判注意', !/ana:/.test(ev) && !/hbsab/.test(ev) && /x_鐵蛋白:1/.test(ev), ev);
  const breast = await page.evaluate(() => { closeSheet(); go('body'); return [...document.querySelectorAll('#hud .callout')].map(c => c.dataset.o).join(',') });
  check('乳房出現在身體地圖', /breast/.test(breast), breast);
  await page.close();

  // =============== 3. 今年健檢建議（家族史、公費資格、趨勢） ===============
  page = await newPage({ members: [
      { id: 'u1', name: '阿鑫', sex: 'm', birth: '1984-03-15', h: 173, w: 78, act: '1.375', goal: 'keep', fh: { ca: ['crc'], chr: ['cvd'], early: false }, life: { smoke: 'former', ppd: 1, yrs: 12, quit: 5, betel: 'never', alc: 'some' } },
      { id: 'u2', name: '大姊', sex: 'f', birth: '1981-01-10', h: 158, w: 55, act: '1.375', goal: 'keep' },
      { id: 'u3', name: '伯伯', sex: 'm', birth: '1969-06-01', h: 170, w: 70, act: '1.375', goal: 'keep', life: { smoke: 'current', ppd: 1, yrs: 30, betel: 'never', alc: 'none' } }], active: 'u1',
    labs: { u1: [{ id: 'a', t: '2025-09-20', items: { glu: { v: 104 }, alt: { v: 52 }, hbsag: { v: '陰性' }, antihcv: { v: '陰性' }, sbp: { v: 128 }, dbp: { v: 84 } }, extra: [] },
                 { id: 'b', t: '2024-09-10', items: { glu: { v: 94 }, alt: { v: 38 } }, extra: [] }] } });
  const plans = await page.evaluate(() => MEM.map(m => yearPlan(m).items.map(o => `${o.pr}|${o.sec}|${o.t}`)));
  const has = (i, re) => plans[i].some(x => re.test(x));
  check('42 歲＋一等親大腸癌 → 優先公費糞便潛血', has(0, /^1\|公費.*糞便潛血/), plans[0].filter(x => /糞便/.test(x)).join(' / '));
  check('早發心血管家族史 → Lp(a)；吸菸已戒 → 口腔癌篩檢', has(0, /Lp\(a\)/) && has(0, /口腔黏膜/), '');
  check('血糖 94→104、GPT 38→52 列入趨勢', has(0, /數值趨勢\|空腹血糖/) && has(0, /數值趨勢\|GPT/), '');
  check('45 歲女性 → 乳房攝影、抹片、HPV、幽門桿菌', has(1, /乳房 X 光/) && has(1, /子宮頸抹片/) && has(1, /HPV/) && has(1, /幽門桿菌/), plans[1].join(' / ').slice(0, 160));
  check('57 歲 30 包年吸菸 → LDCT、戒菸門診', has(2, /LDCT/) && has(2, /戒菸門診/), '');
  await page.click('#nav button[data-v="body"]'); await page.waitForTimeout(400);
  await page.evaluate(() => { ACT = 'u2'; renderAll() });
  check('沒填家族史會提示填寫', !!(await page.$('#planBody [data-fh]')));
  await page.click('#planBody [data-fh]'); await page.waitForTimeout(500);
  await page.click('#m-fhca .chip[data-k="breast"]'); await page.click('#m-early'); await page.click('#m-betel button[data-v="former"]'); await page.click('#m-save'); await page.waitForTimeout(400);
  const saved = await page.evaluate(() => { const m = MEM.find(x => x.id === 'u2'); return { fh: m.fh, life: m.life, plan: yearPlan(m).items.map(o => o.t) } });
  check('家族史表單可儲存並影響建議', saved.fh.ca.includes('breast') && saved.fh.early && saved.life.betel === 'former' && saved.plan.some(t => /BRCA/.test(t)) && saved.plan.some(t => /口腔黏膜/.test(t)), JSON.stringify(saved.fh));
  const txt = await page.evaluate(() => planText(me()));
  check('可產生複製用清單文字', /今年健檢建議/.test(txt) && /【公費篩檢/.test(txt), txt.split('\n')[0]);
  await page.close();

  // =============== 4. 圖片：AI Horde（模擬）→ IndexedDB ===============
  page = await newPage({ members: [{ id: 'g1', name: '我', sex: 'm', birth: '1990-01-01', h: 170, w: 65, act: '1.375', goal: 'keep' }], active: 'g1',
    img: { b1: 'https://image.pollinations.ai/prompt/x' } });
  check('舊的 Pollinations 網址自動清掉', await page.evaluate(() => !IMG.b1));
  await toLab(); await page.selectOption('#labDish', 'l2'); await page.click('#labStyle button[data-v="neon"]'); await page.click('#genOne');
  await page.waitForSelector('#labOut img', { timeout: 60000 });
  const img = await page.evaluate(async () => ({ src: document.querySelector('#labOut img').src.slice(0, 5), mark: IMG.l2, idb: Object.keys(await IDB.all()).includes('l2') }));
  check('生成圖片存進 IndexedDB 並顯示', img.src === 'blob:' && img.mark === 'idb' && img.idb, JSON.stringify(img));
  check('生成時套用選的風格（賽博）', /neon/.test(horde.prompts[0] || ''), (horde.prompts[0] || '').slice(0, 60));
  horde.mode = 'fail'; await page.selectOption('#labDish', 'l3'); await page.click('#genOne');
  await page.waitForSelector('#labOut .note[style*="red"]', { timeout: 90000 });
  check('失敗會重試後顯示錯誤、不卡轉圈', !(await page.$('#genState .spin')), await page.textContent('#labOut'));
  await page.close();
  // AI Horde 完全不回應：每次請求 30 秒逾時、退避重試後放棄，佇列不會永遠停在「送出中」（假時鐘快轉，約 4 分鐘的流程幾秒跑完）
  horde.mode = 'hang';
  page = await newPage({ members: [{ id: 'g1', name: '我', sex: 'm', birth: '1990-01-01', h: 170, w: 65, act: '1.375', goal: 'keep' }], active: 'g1' }, { clock: true });
  await toLab(); await page.selectOption('#labDish', 'l4'); await page.click('#genOne');
  for (let i = 0; i < 60 && await page.evaluate(() => !!busy || queue.length > 0); i++) { await page.clock.fastForward(10000); await page.waitForTimeout(80) }
  const hang = await page.evaluate(() => ({ busy: !!busy, q: queue.length, out: document.querySelector('#labOut').textContent }));
  check('AI Horde 不回應：逾時後顯示錯誤、佇列不卡死', !hang.busy && !hang.q && /沒有回應/.test(hang.out), hang.out.slice(0, 50));
  horde.mode = 'ok'; await page.close();
  // GAS：設定錯誤直接停（不重試 3 次、不再等 20 秒），訊息講要去哪裡設定
  page = await newPage({ members: [{ id: 'g1', name: '我', sex: 'm', birth: '1990-01-01', h: 170, w: 65, act: '1.375', goal: 'keep' }], active: 'g1', gas: 'https://script.google.com/macros/s/TEST/exec' });
  const labOut = re => page.waitForFunction(re => new RegExp(re).test(document.querySelector('#labOut').textContent), re.source, { timeout: 15000 }).catch(() => {});
  await toLab(); await page.selectOption('#labDish', 'l5'); await page.click('#genOne'); await labOut(/生成失敗/);
  let t = await page.textContent('#labOut');
  check('GAS 未設定：只送 1 次，提示去填 CF_ACCOUNT_ID／CF_API_TOKEN', gas.hits === 1 && /CF_ACCOUNT_ID/.test(t) && /指令碼屬性/.test(t), `${gas.hits} 次｜${t.slice(0, 50)}`);
  gas.hits = 0; gas.reply = '<html><body>找不到網頁</body></html>'; await page.click('#genOne'); await labOut(/不是圖片資料/);
  t = await page.textContent('#labOut');
  check('GAS 網址錯（回 HTML）：只送 1 次，提示用 /exec 網址', gas.hits === 1 && /\/exec/.test(t), `${gas.hits} 次｜${t.slice(0, 50)}`);
  const ge = await page.evaluate(() => typeof gasErr !== 'function' ? ['沒有 gasErr'] : ['CF_401', 'CF_403', 'DAILY_CAP', 'BUSY', 'CF_502', 'GAS_ERROR'].map(e => { const x = gasErr({ error: e, detail: 'quota' }); return `${e}:${x.fatal ? 1 : 0}:${x.message}` }));
  check('GAS 錯誤代碼都翻成中文（Token、額度、忙線分開；忙線才重試）', /CF_401:1:.*Token/.test(ge[0]) && /CF_403:1:.*權限/.test(ge[1]) && /DAILY_CAP:1:.*上限/.test(ge[2]) && /BUSY:0:/.test(ge[3]) && /CF_502:0:.*502/.test(ge[4]) && /GAS_ERROR:0:.*quota/.test(ge[5]), ge.join(' | ').slice(0, 120));
  await page.close();

  // =============== 5. 安全與手機體驗 ===============
  page = await newPage({ members: [{ id: 'k1', name: '我', sex: 'm', birth: '1990-01-01', h: 170, w: 65, act: '1.375', goal: 'keep' }], active: 'k1' });
  const evil = { app: 'NutriCore', v: 2, members: [{ id: 'x"><img src=x onerror=window.__pwn=1>', name: 'evil', sex: 'm', birth: '1990-01-01' },
      { id: 'ok1', name: '<b>好人</b>', sex: 'f', birth: '115/01/02', fh: { ca: ['crc', '<script>'], chr: 'x', early: 1 }, life: { smoke: 'x', ppd: 99 } }],
    active: 'ok1', scale: { ok1: [{ id: 'a1', t: '<img src=x onerror=window.__pwn=2>', weight: 60 }, { id: 'a2', t: '2026-01-01T07:00', weight: 60 }] }, labs: {}, img: { b1: 'javascript:alert(1)' }, gas: 'https://evil.example.com/' };
  const ep = path.join(require('os').tmpdir(), 'nc-evil.json'); fs.writeFileSync(ep, JSON.stringify(evil));
  await page.click('#nav button[data-v="me"]'); await page.setInputFiles('#importFile', ep); await page.waitForTimeout(500);
  await page.click('#nav button[data-v="body"]'); await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ pwn: window.__pwn || 0, mem: MEM.map(m => m.id + ':' + m.birth).join(','), fh: MEM[0].fh, life: MEM[0].life, scale: (SCALE.ok1 || []).length, gas: GAS }));
  check('惡意備份檔被清洗、沒有執行', after.pwn === 0 && after.mem === 'ok1:2026-01-02' && after.fh.ca.join() === 'crc' && after.life.smoke === 'never' && after.life.ppd === 10 && after.scale === 1 && !/evil/.test(after.gas), JSON.stringify(after));
  const big = path.join(require('os').tmpdir(), 'nc-big.json'); fs.writeFileSync(big, '{"app":"NutriCore","pad":"' + 'x'.repeat(6 * 1048576) + '"}');
  await page.click('#nav button[data-v="me"]'); await page.setInputFiles('#importFile', big); await page.waitForTimeout(400);
  const bigRes = await page.evaluate(() => ({ t: document.querySelector('#toast').textContent, mem: MEM.map(m => m.id).join() }));
  check('超過 5MB 的檔案直接拒絕（不讀進記憶體）', /不是 NutriCore 備份/.test(bigRes.t) && bigRes.mem === 'ok1', bigRes.t.slice(0, 40)); fs.unlinkSync(big);
  check('輸入框字級 ≥16px（iOS 不自動放大）', await page.evaluate(() => { const t = document.createElement('textarea'); document.body.appendChild(t); const v = parseFloat(getComputedStyle(t).fontSize); t.remove(); return v >= 16 }));

  // =============== 6. 文件一致性 ===============
  const prompts = await page.evaluate(() => ({ scale: promptScale(), lab: promptLab() }));
  const md = p => '```text\n' + p + '\n```';
  const pfile = path.join(ROOT, 'PROMPTS.md');
  if (process.argv.includes('--update-prompts')) {
    const doc = fs.readFileSync(pfile, 'utf8').replace(/(## 一、體脂機截圖\n\n)```text[\s\S]*?\n```/, (m0, h) => h + md(prompts.scale)).replace(/(## 二、體檢報告\n\n)```text[\s\S]*?\n```/, (m0, h) => h + md(prompts.lab));
    fs.writeFileSync(pfile, doc); console.log('已更新 PROMPTS.md');
  }
  const doc = fs.readFileSync(pfile, 'utf8');
  check('PROMPTS.md 與 App 內提示詞一致', doc.includes(md(prompts.scale)) && doc.includes(md(prompts.lab)), '不一致時執行 node tests/e2e.js --update-prompts');
  await page.close();

  // =============== 6b. 儀表、營養師、健身教練、疫苗 ===============
  const ZM = { id: 'z', name: '宗鑫', sex: 'm', birth: '1984-03-15', h: 170, w: 71.4, waist: 88, act: '1.375', goal: 'keep', fit: { lim: ['knee'], lvl: 'new', days: 4, min: 30, like: ['walk', 'slowjog', 'swim'] },
    life: { smoke: 'never', betel: 'never', alc: 'some', colono: 2014 }, fh: { ca: ['crc'], chr: ['dm'], early: false } };
  page = await newPage({ members: [ZM, { id: 'g', name: '阿嬤', sex: 'f', birth: '1958-02-01', h: 155, w: 52, act: '1.2', goal: 'auto', life: { colono: 2022 } }], active: 'z',
    labs: { z: [{ id: 'l', t: '2026-09-14', items: { glu: { v: 106 }, hba1c: { v: 5.9 }, tg: { v: 182 }, ldl: { v: 142 }, ua: { v: 7.6 }, sbp: { v: 134 }, dbp: { v: 86 } }, extra: [] }] } });
  check('BMI 儀表：單一漸層弧線＋動畫指針（不再是 4 段圓頭線）', await page.evaluate(() => !!document.querySelector('#gauge linearGradient') && !!document.querySelector('#gauge .gmark') && !document.querySelector('#gauge [stroke="#ffb547"]')));
  const sg = await page.evaluate(() => ({ g: suggestGoal(me()).goal, box: !!document.querySelector('#energyCard [data-autogoal]'), bmr: /別低於 BMR/.test(document.querySelector('#energyCard').textContent) }));
  check('BMI 24.7 → 營養師建議減脂，熱量卡說明 BMR／TDEE 怎麼用', sg.g === 'cut' && sg.box && sg.bmr, JSON.stringify(sg));
  await page.click('#energyCard [data-autogoal]'); await page.waitForTimeout(200);
  const ag = await page.evaluate(() => { const c = calc(me()); return { goal: me().goal, cg: c.goal, d: Math.round(c.target - c.tdee) } });
  check('一鍵改成自動 → 目標變減脂、熱量低於 TDEE', ag.goal === 'auto' && ag.cg === 'cut' && ag.d < 0, JSON.stringify(ag));
  const np = await page.evaluate(() => { const n = nutriPlan(me()), ds = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map(d => plan(d));
    return { f: n.F.map(f => f.t).join(','), avd: [...n.avd].join(','), bad: ds.flatMap(x => x.slots.flatMap(s => s.items)).filter(f => f.x.includes('pur') || f.x.includes('hc')).map(f => f.n).join(','), adj: ds[0].slots.flatMap(s => s.adj).join(',') } });
  check('營養師：控糖＋降膽固醇＋降尿酸＋減脂，菜單 5 天都避開高普林與精緻澱粉', /控糖/.test(np.f) && /降壞膽固醇/.test(np.f) && /降尿酸/.test(np.f) && /減脂/.test(np.f) && !np.bad && /先吃菜再吃飯/.test(np.adj), `${np.f}｜避開 ${np.avd}｜違規 ${np.bad || '無'}`);
  const fp = await page.evaluate(() => { const P = fitPlan(me()); return { used: [...new Set(P.days.flatMap(d => d.b.map(b => b.k)))].join(','), no: P.no.map(x => x.k + ':' + x.why.join('/')).join(','), w: P.W.map(x => x.t).join('｜'), aer: P.aer, aerT: P.aerT, nS: P.nS, mv: P.mv.map(x => x.n).join(',') } });
  check('教練：膝蓋不適 → 不排跑步、超慢跑、爬山、球類，並說明原因', !/run|slowjog|hike|ball|hiit/.test(fp.used) && /slowjog:膝蓋/.test(fp.no) && /膝蓋/.test(fp.w) && !/椅子深蹲|弓箭步/.test(fp.mv), `排了 ${fp.used}｜${fp.no}`);
  check('教練：每週有氧 ≥150 分（WHO 最低）、肌力 ≥2 天、血糖高提醒飯後散步', fp.aer >= 150 && fp.nS >= 2 && /飯後散步/.test(fp.w), `${fp.aer}/${fp.aerT} 分、肌力 ${fp.nS} 天`);
  const fp2 = await page.evaluate(() => { const m = { ...me(), fit: { lim: [], lvl: 'mid', days: 5, min: 45, like: ['slowjog', 'gym'] } }; const P = fitPlan(m); return [...new Set(P.days.flatMap(d => d.b.map(b => b.k)))].join(',') });
  check('沒有限制、喜歡超慢跑＋重訓 → 課表有超慢跑與器械重訓', /slowjog/.test(fp2) && /gym/.test(fp2), fp2);
  const stop = await page.evaluate(() => { const m = me(); LABS.z[0].items.sbp = { v: 182 }; LABS.z[0].items.dbp = { v: 112 }; const P = fitPlan(m); LABS.z[0].items.sbp = { v: 134 }; LABS.z[0].items.dbp = { v: 86 }; return P.stop && /太高/.test(P.W[0].t) });
  check('血壓 182/112 → 先就醫、暫停中高強度', stop);
  const ics = await page.evaluate(() => { const m = me(), t = fitICS(m, fitPlan(m)); return { ev: (t.match(/BEGIN:VEVENT/g) || []).length, rr: /RRULE:FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)/.test(t), al: /TRIGGER:-PT10M/.test(t), long: t.split('\r\n').filter(l => new TextEncoder().encode(l).length > 75).length } });
  check('行事曆檔：每個訓練日一個每週重複事件、提前 10 分鐘提醒、每行 ≤75 bytes', ics.ev === 4 && ics.rr && ics.al && !ics.long, JSON.stringify(ics));
  await page.click('#nav button[data-v="fit"]'); await page.waitForTimeout(300); await page.click('#fitBody [data-timer]'); await page.waitForTimeout(300);
  const t0 = await page.textContent('#tmTxt'); await page.click('#tmGo'); await page.waitForTimeout(1600); const t1 = await page.textContent('#tmTxt');
  await page.click('#sheet h3 [data-close]'); await page.waitForTimeout(200);
  check('運動計時器會倒數，關閉後停止', t0 === '30:00' && t1 !== t0 && await page.evaluate(() => !onSheetClose), `${t0} → ${t1}`);
  const yp = await page.evaluate(() => MEM.map(m => yearPlan(m).items.filter(o => /大腸鏡|疫苗|皰疹/.test(o.t)).map(o => `${o.t}|${o.ch}`)));
  check('大腸鏡：家族史上次 2014 → 今年該做；一般人上次 2022 → 下次 2032', yp[0].some(x => /今年該做/.test(x)) && yp[1].some(x => /下次 2032/.test(x)), yp.map(x => x.filter(y => /大腸鏡/.test(y)).join('/')).join('｜'));
  check('疫苗：42 歲流感自費；68 歲肺炎鏈球菌公費、帶狀皰疹', yp[0].some(x => /^流感疫苗\|自費/.test(x)) && yp[1].some(x => /^肺炎鏈球菌疫苗\|公費/.test(x)) && yp[1].some(x => /帶狀皰疹/.test(x)), yp[1].join(' / ').slice(0, 120));
  await page.evaluate(() => openMemberEdit('z', 'vax')); await page.waitForTimeout(400);
  await page.click('#m-vax .chip[data-k="flu"]'); await page.click('#m-tabs [data-t="fit"]'); await page.click('#m-lim .chip[data-k="back"]'); await page.click('#m-save'); await page.waitForTimeout(300);
  const sv = await page.evaluate(() => ({ vax: me().vax, lim: me().fit.lim, flu: yearPlan(me()).items.some(o => o.t === '流感疫苗') }));
  check('成員表單可存疫苗紀錄與運動限制；打過流感就不再列', sv.vax.flu === (new Date().getMonth() >= 9 ? new Date().getFullYear() : new Date().getFullYear() - 1) && sv.lim.includes('back') && !sv.flu, JSON.stringify(sv));
  const cb = await page.evaluate(() => { const c = cleanBackup({ members: [{ id: 'q', name: 'x', sex: 'm', birth: '1990-01-01', goal: '<x>', fit: { lim: ['knee', '<img>'], lvl: 'zzz', days: 99, like: ['run', 'evil'] }, vax: { flu: 'abc', zzz: 2020, pneu: 2020 } }] }).mem[0]; return { g: c.goal, lim: c.fit.lim, lvl: c.fit.lvl, days: c.fit.days, like: c.fit.like, vax: c.vax } });
  check('備份檔的運動、疫苗、目標欄位會被清洗', cb.g === 'auto' && cb.lim.join() === 'knee' && cb.lvl === 'new' && cb.days === 6 && cb.like.join() === 'run' && JSON.stringify(cb.vax) === '{"pneu":2020}', JSON.stringify(cb));
  const ovf = []; for (const v of ['dash', 'body', 'menu', 'fit', 'lab', 'me']) { await page.evaluate(v => go(v), v); await page.waitForTimeout(250); if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) ovf.push(v) }
  check('6 個頁面在 iPhone 寬度都沒有橫向捲動', !ovf.length, ovf.join(','));
  await page.close();

  // =============== 6c. 菜色庫、不吃的食物、採買清單 ===============
  page = await newPage({ members: [{ id: 'a', name: '爸', sex: 'm', birth: '1980-01-01', h: 172, w: 75, act: '1.375', goal: 'auto' }, { id: 'b', name: '媽', sex: 'f', birth: '1982-01-01', h: 160, w: 55, act: '1.375', goal: 'auto' }], active: 'a' });
  const db = await page.evaluate(() => { const ids = FOODS.map(f => f.id); return { n: FOODS.length, dup: ids.length - new Set(ids).size, unk: [...new Set(FOODS.flatMap(f => ingOf(f).map(i => i.n)).filter(n => !CAT_OF[n]))].join(','),
    bad: FOODS.filter(f => !f.g || !f.en || !['b', 'ld', 'v', 's'].includes(f.m) || Math.abs(f.k - (4 * (f.p + f.c) + 9 * f.f)) / f.k > .25).map(f => f.id).join(',') } });
  check('菜色庫 ≥130 道：id 不重複、每道都有食材與英文描述、食材都有分類、熱量與三大營養素一致', db.n >= 130 && !db.dup && !db.unk && !db.bad, `${db.n} 道｜未分類 ${db.unk || '無'}｜有問題 ${db.bad || '無'}`);
  const days14 = await page.evaluate(() => [...Array(14)].map((_, i) => addDays(ymd(new Date()), i)));
  const vary = await page.evaluate(d => { const ld = d.slice(0, 7).flatMap(x => plan(x).slots.filter(s => /午|晚/.test(s.n)).map(s => s.items[0].id)); return new Set(ld).size }, days14);
  check('一週 14 餐午晚餐不重複', vary === 14, `${vary} 種`);
  await page.click('#nav button[data-v="menu"]'); await page.waitForTimeout(300); await page.click('#meals [data-meal="1"]'); await page.waitForTimeout(400);
  const banned = await page.getAttribute('#sheet [data-ban]', 'data-ban'); await page.click('#sheet [data-ban]'); await page.waitForTimeout(300);
  const ban = await page.evaluate(([id, d]) => ({ saved: dietOf(me()).ban.includes(id), seen: d.some(x => plan(x).slots.some(s => s.items.some(f => f.id === id))) }), [banned, days14]);
  check('點一餐 →「不要這道」→ 之後 14 天都不再排', ban.saved && !ban.seen, `${banned} ${JSON.stringify(ban)}`);
  await page.evaluate(() => openMemberEdit('a', 'diet')); await page.waitForTimeout(400);
  for (const k of ['beef', 'shell', 'wheat']) await page.click(`#m-no .chip[data-k="${k}"]`);
  await page.click(`#m-ban .chip[data-k="${banned}"]`); await page.click('#m-save'); await page.waitForTimeout(300);
  const ex = await page.evaluate(d => { const dt = dietOf(me()), hit = d.flatMap(x => plan(x).slots.flatMap(s => s.items)).flatMap(f => ingOf(f).map(i => i.n)).filter(n => /牛(?!奶|蒡)|蝦|蛤|花枝|麵|吐司|饅頭|餅皮|貝果|燒餅|水餃|油條/.test(n));
    return { no: dt.no.join(), ban: dt.ban.length, hit: [...new Set(hit)].join(',') } }, days14);
  check('不吃牛肉、蝦蟹貝、麵食 → 14 天菜單都避開；點掉的菜可恢復', ex.no === 'beef,shell,wheat' && !ex.hit && ex.ban === 0, JSON.stringify(ex));
  const veg = await page.evaluate(d => { const m = { ...me(), diet: { no: ['beef', 'pork', 'chicken', 'fish', 'shell'], ban: [] } }; return d.every(x => plan(x, m).slots.filter(s => /午|晚/.test(s.n)).length === 2) && !d.some(x => plan(x, m).slots.some(s => s.items.some(f => ingOf(f).some(i => /雞(?!蛋)|豬|牛(?!奶)|魚|蝦|鮭|鯖|鱈|鯛|鱸|鮪/.test(i.n))))) }, days14);
  check('吃素（不吃肉、魚、海鮮）每天仍排得出午晚餐', veg);
  await page.click('#v-menu [data-shop]'); await page.waitForTimeout(400);
  const sh0 = await page.evaluate(() => ({ rows: document.querySelectorAll('#shopBody .shop').length, cats: document.querySelectorAll('#shopBody .h4').length, egg: [...document.querySelectorAll('#shopBody .shop')].map(r => r.textContent).find(t => /^.?雞蛋/.test(t.trim())) || '' }));
  const k1 = await page.getAttribute('#shopBody .shop:nth-of-type(1) [data-shopk], #shopBody [data-shopk]', 'data-shopk');
  await page.click(`#shopBody [data-shopk="${k1}"]`); await page.waitForTimeout(150);
  const k2 = await page.evaluate(() => [...document.querySelectorAll('#shopBody [data-shoprm]')].map(b => b.dataset.shoprm)[1]); await page.click(`#shopBody .x[data-shoprm="${k2}"]`); await page.waitForTimeout(150);
  await page.click('#sheet h3 [data-close]'); await page.waitForTimeout(200); await page.click('#v-menu [data-shop]'); await page.waitForTimeout(300);
  const sh1 = await page.evaluate(([a, b]) => ({ done: document.querySelector(`#shopBody .shop [data-shopk="${a}"]`)?.closest('.shop').classList.contains('done'), gone: !document.querySelector(`#shopBody .sk[data-shopk="${b}"]`), txt: shopText() }), [k1, k2]);
  check('採買清單：依分類列出、雞蛋以整數顆計', sh0.rows >= 15 && sh0.cats >= 5 && /雞蛋\s*\d+ 顆/.test(sh0.egg), `${sh0.rows} 項 ${sh0.cats} 類｜${sh0.egg.slice(0, 20)}`);
  check('採買清單：打勾、移除會記住，複製的文字不含已買與已移除', sh1.done && sh1.gone && !sh1.txt.includes('□ ' + k1.split('|')[0] + ' ') && !sh1.txt.includes('□ ' + k2.split('|')[0] + ' ') && /【.+】/.test(sh1.txt), sh1.txt.split('\n').slice(0, 3).join(' / '));
  const two = await page.evaluate(() => { const one = shopList(['a'], '2026-10-12', '2026-10-18'), both = shopList(['a', 'b'], '2026-10-12', '2026-10-18'), q = l => l.reduce((t, o) => t + (o.u === 'g' ? o.q : 0), 0); return [Math.round(q(one)), Math.round(q(both))] });
  check('兩個人吃的採買量比一個人多', two[1] > two[0] * 1.3, two.join(' → ') + ' g');
  const cd = await page.evaluate(() => cleanBackup({ members: [{ id: 'q', name: 'x', sex: 'm', birth: '1990-01-01', diet: { no: ['beef', '<x>'], ban: ['l1', 'zzz', '<img>'] } }] }).mem[0].diet);
  check('備份檔的「不吃的食物」會被清洗', JSON.stringify(cd) === '{"no":["beef"],"ban":["l1"]}', JSON.stringify(cd));
  await page.close();

  // =============== 6d. 報告項目對應、體脂計 vs 醫院、設定分頁、自動補圖 ===============
  const X = (name, value, unit, ref, flag, lo, hi) => ({ name, value, unit, ref, flag, lo, hi });
  page = await newPage({ members: [{ id: 'z', name: '宗鑫', sex: 'm', birth: '1984-03-15', h: 172, w: 73.1, act: '1.375', goal: 'auto', life: { smoke: 'never', betel: 'never', alc: 'none' } }], active: 'z',
    labs: { z: [{ id: 'l', t: `${new Date().getFullYear()}-09-14`, hospital: '台安', items: { us_liver: { v: '輕度脂肪肝' }, cxr: { v: '輕微變化（如主動脈鈣化、陳舊病灶）' } }, extra: [
      X('身體質量指數BMI', '24.8', '', '18.5~24', '*', 18.5, 24), X('右眼壓', '9', 'mmHg', '0~20', '', 0, 20), X('糞便潛血檢驗值(免疫法)', '50', 'ng/mL', '<100', '', null, 100), X('超壞膽固醇(sdLDL)', '30.2', 'mg/dL', '<30', '*', null, 30),
      X('骨質密度攝影檢查', '-0.2', '', '>-1.0', '', -1, null), X('骨質密度攝影檢查(右股骨頭)', '-0.4', '', '>-1.0', '', -1, null), X('體脂肪質量', '16.8', 'kg', '7.3~14.5', '', 7.3, 14.5), X('腰臀圍比', '0.87'), X('體脂肪率', '23.2', '%'), X('體重', '73.1', 'kg'),
      X('白蛋白/球蛋白比(A/G)', '1.7', 'mg/dl', '1.0~2.5', '', 1, 2.5), X('腰圍(InBody)', '83.7', 'cm'), X('肺功能檢查', '正常')] }] },
    scale: { z: [{ id: 's', t: `${new Date().getFullYear()}-10-11T20:57`, device: '小米', weight: 74.6, bmi: 24.9, fat: 21, fatMass: 15.7, visceral: 6, whr: 1, status: { bmi: '標準', whr: '偏高' } }] } });
  const mg = await page.evaluate(() => { const L = LABS.z[0], pl = yearPlan(me()).items; return { it: Object.keys(L.items).join(), dxa: L.items.dxa?.v, alb: !!L.items.alb, ev: labEval(L, me()).map(i => i.k).join(), ex: L.extra.map(e => e.name).join('、'), plan: pl.map(o => o.t + '｜' + o.why).join(' / '), sec: SECS[0] } });
  check('舊報告「其他項目」搬回正式項目：糞便潛血、眼壓、骨密度取最低、sdLDL、InBody', /fobt/.test(mg.it) && /iop/.test(mg.it) && mg.dxa === -0.4 && /sdldl/.test(mg.it) && /bia_fm/.test(mg.it) && /wt/.test(mg.it), mg.it);
  check('「白蛋白/球蛋白比」不會被當成白蛋白；肺功能留在其他項目', !mg.alb && /白蛋白\/球蛋白比/.test(mg.ex) && /肺功能/.test(mg.ex), mg.ex);
  check('BMI、體脂肪量只記錄不再叫你「複驗」；sdLDL 列入血脂追蹤', !/複驗 (身體質量|體脂肪|BMI)/.test(mg.plan) && /血脂/.test(mg.plan) && mg.ev === 'us_liver,cxr,sdldl', mg.ev);
  check('今年的報告不說「去年」；胸部 X 光輕微變化不追加 CT', !/去年/.test(mg.plan) && /這次報告/.test(mg.plan) && /下次健檢再照/.test(mg.plan) && !/低劑量 CT/.test(mg.plan) && mg.sec === '追蹤報告異常', mg.plan.slice(0, 80));
  const cmp = await page.evaluate(() => { const r = scalesOf(me())[0]; openScaleDetail(r.id); const t = document.querySelector('#sheetBody').textContent; closeSheet(); return { whr: scaleEval(r, me()).some(i => i.k === 'whr'), t } });
  check('體脂計 vs 醫院 InBody：逐項比較、指出腰臀比是推算、BMI 身高設定', /和醫院 InBody 比較/.test(cmp.t) && /腰臀比差很多/.test(cmp.t) && /身高設定/.test(cmp.t) && /國際標準/.test(cmp.t) && !cmp.whr, cmp.whr ? '腰圍正常卻仍判腰臀比' : '');
  await page.click('#nav button[data-v="body"]'); await page.click('#v-body [data-addlab]'); await page.waitForTimeout(400); await page.click('details.box.ai > summary');
  await page.fill('#ai-in', JSON.stringify({ type: 'nutricore.lab', v: 1, date: '2026-09-14', items: { '骨質密度攝影檢查(左股骨頭)': { value: -0.1 }, '骨質密度攝影檢查(右股骨頭)': { value: -0.4 }, '右眼壓': { value: 9 }, '左眼壓': { value: 12 }, '白蛋白/球蛋白比(A/G)': { value: 1.7 }, '握力 右手': { value: 36, unit: 'kgf' } } }));
  await page.click('#ai-go'); await page.waitForTimeout(200);
  const imp = await page.evaluate(() => ({ dxa: $('#l-dxa').value, iop: $('#l-iop').value, alb: $('#l-alb')?.value || '', grip: $('#l-grip_r')?.value, ex: lExtra.map(e => e.name).join() }));
  check('匯入：多個骨密度取最低、兩眼取較高眼壓、A/G 比放其他項目、握力對到', imp.dxa === '-0.4' && imp.iop === '12' && !imp.alb && /白蛋白/.test(imp.ex) && imp.grip === '36', JSON.stringify(imp));
  await page.evaluate(() => closeSheet()); await page.waitForTimeout(200);
  await page.click('#gearBtn'); await page.waitForTimeout(400);
  const st1 = await page.evaluate(() => ({ title: document.querySelector('#sheetBody h3').textContent, vis: [...document.querySelectorAll('#sheetBody .tabp')].filter(p => !p.hidden).map(p => p.dataset.t).join(), smoke: $('#m-smokebox').offsetParent === null }));
  await page.click('#m-tabs [data-t="app"]'); await page.waitForTimeout(150);
  const st2 = await page.evaluate(() => ({ vis: [...document.querySelectorAll('#sheetBody .tabp')].filter(p => !p.hidden).map(p => p.dataset.t).join(), save: $('#m-actions').offsetParent === null, exp: !!document.querySelector('#sheetBody [data-export]') }));
  check('右上角 ⚙️ 設定：分頁一次只顯示一頁，App 設定頁藏起儲存鈕；沒吸菸時不顯示包數', /設定・宗鑫/.test(st1.title) && st1.vis === 'basic' && st1.smoke && st2.vis === 'app' && st2.save && st2.exp, JSON.stringify([st1, st2]));
  await page.close();
  // 自動補齊全部菜色圖片：一次只跑一張、做完自動接下一張；連續失敗 3 次暫停（假時鐘快轉）
  horde.mode = 'ok'; let jobs = 0, maxOpen = 0, open = 0;
  await ctx.route('https://aihorde.net/api/v2/generate/async', async r => { jobs++; open++; maxOpen = Math.max(maxOpen, open); horde.checks = 0; horde.prompts.push(JSON.parse(r.request().postData()).prompt); return r.fulfill({ status: 202, json: { id: 'job' + jobs } }) });
  await ctx.route('https://aihorde.net/api/v2/generate/status/**', async r => { if (r.request().method() === 'GET') open--; return r.fallback() });
  page = await newPage({ members: [{ id: 'g1', name: '我', sex: 'm', birth: '1990-01-01', h: 170, w: 65, act: '1.375', goal: 'keep' }], active: 'g1' }, { clock: true });
  await toLab(); await page.click('#genMissing');
  for (let i = 0; i < 40 && jobs < 3; i++) { await page.clock.fastForward(10000); await page.waitForTimeout(80) }
  const au = await page.evaluate(() => ({ on: JSON.parse(localStorage.getItem('nc_autoimg')), have: FOODS.filter(f => imgSrc(f.id)).length, txt: $('#autoImg').textContent }));
  check('自動補齊全部菜色圖片：做完一張自動接下一張、永遠只有一張在跑、開關會記住', jobs >= 3 && maxOpen === 1 && au.on === true && au.have >= 2 && /已有圖片 \d+ \/ \d+/.test(au.txt), `已送 ${jobs} 張、同時最多 ${maxOpen}、已有 ${au.have}`);
  horde.mode = 'fail'; const j0 = jobs;
  for (let i = 0; i < 120 && !(await page.evaluate(() => autoPause)); i++) { await page.clock.fastForward(10000); await page.waitForTimeout(60) }
  const ap = await page.evaluate(() => ({ p: !!autoPause, txt: $('#autoImg').textContent })); const j1 = jobs;
  for (let i = 0; i < 20; i++) { await page.clock.fastForward(10000); await page.waitForTimeout(40) }
  check('連續失敗 3 次 → 自動補圖暫停，不再送出', ap.p && /暫停/.test(ap.txt) && jobs === j1, `失敗期間送了 ${j1 - j0} 張，暫停後又送 ${jobs - j1} 張`);
  horde.mode = 'ok'; await page.close();
  await ctx.unroute('https://aihorde.net/api/v2/generate/async'); await ctx.unroute('https://aihorde.net/api/v2/generate/status/**');

  // =============== 6e. AI 醫生（整理問題、複製後打開 AI） ===============
  await ctx.route(/^https:\/\/(chatgpt\.com|claude\.ai|gemini\.google\.com)\//, r => r.fulfill({ contentType: 'text/html', body: '<title>AI</title>ok' }));
  page = await newPage({ members: [{ id: 'z', name: '宗鑫', sex: 'm', birth: '1984-03-15', h: 172, w: 73.1, waist: 88, act: '1.375', goal: 'auto', fh: { ca: ['breast'], chr: ['htn'], early: false }, life: { smoke: 'never', betel: 'never', alc: 'some' }, fit: { lim: ['knee'] } }], active: 'z',
    labs: { z: [{ id: 'l', t: '2026-09-14', hospital: '台安醫院', items: { glu: { v: 106 }, ldl: { v: 142 }, sdldl: { v: 30.2, hi: 30 }, alt: { v: 30 } }, extra: [] }] } });
  const ap0 = await page.evaluate(() => { const o = { topic: 'all', fh: true, scale: true, normals: false, q: '' }; return { a: aiPrompt(me(), o), n: aiPrompt(me(), { ...o, normals: true }), it: aiPrompt(me(), { ...o, topic: 'item', item: 'sdldl' }) } });
  check('AI 醫生的問題：不含姓名、生日、醫院；有年齡性別、異常數值、家族史、身體限制、正常的關鍵數值', !/宗鑫|1984|台安/.test(ap0.a + ap0.n) && /男性、42 歲/.test(ap0.a) && /空腹血糖：106/.test(ap0.a) && /乳癌/.test(ap0.a) && /膝蓋/.test(ap0.a) && /【關鍵數值（有驗、正常）】.*GPT 30/.test(ap0.a), ap0.a.split('\n').slice(3, 5).join(' / '));
  check('單項提問帶入該項數值與報告自己的參考值', /請解釋我的「小而密低密度膽固醇 sdLDL 30\.2 mg\/dL」（參考 ≤30）/.test(ap0.it), (ap0.it.match(/【我的問題】.*/) || [''])[0].slice(0, 60));
  await page.click('#nav button[data-v="body"]'); await page.waitForTimeout(300);
  await page.click('#issueList [data-ask="sdldl"]'); await page.waitForTimeout(400);
  const ai1 = await page.evaluate(() => ({ on: document.querySelector('#ai-topic .chip.on')?.textContent, href: [...document.querySelectorAll('[data-aiopen]')].map(a => a.href) }));
  check('異常項目旁的「問 AI」→ 直接選好這一項；三個 AI 連結', /這一項/.test(ai1.on) && /^https:\/\/chatgpt\.com\//.test(ai1.href[0]) && /^https:\/\/claude\.ai\/new/.test(ai1.href[1]) && /^https:\/\/gemini\.google\.com\/app/.test(ai1.href[2]), ai1.on);
  await page.evaluate(() => { window.copyText = t => { window.__copied = t } });
  await page.click('#ai-opt .chip[data-k="normals"]'); await page.fill('#ai-q', '最近常覺得累');
  const [pop] = await Promise.all([ctx.waitForEvent('page'), page.click('[data-aiopen="claude"]')]); await pop.waitForLoadState().catch(() => {});
  const cp = await page.evaluate(() => window.__copied || ''); const popUrl = pop.url(); await pop.close();
  check('按 Claude：先複製完整問題（含補充、正常數值），再開新分頁', /補充：最近常覺得累/.test(cp) && /GPT 30/.test(cp) && /^https:\/\/claude\.ai\/new/.test(popUrl), popUrl.slice(0, 40));
  await page.evaluate(() => closeSheet()); await page.click('#nav button[data-v="dash"]'); await page.waitForTimeout(200);
  check('總覽與身體頁都有「問 AI 醫生」入口', await page.evaluate(() => !!document.querySelector('#latestCard [data-aidoc]') && !!document.querySelector('#v-body [data-aidoc]')));
  await page.close();

  // =============== 6f. 不用問 AI 就能算的：FIB-4、代謝症候群、略高、X 光原文、身高不一致 ===============
  page = await newPage({ members: [{ id: 'z', name: '宗鑫', sex: 'm', birth: '1984-03-15', h: 173, w: 74.6, act: '1.375', goal: 'auto', fh: { ca: ['breast'], chr: ['htn'], early: true }, life: { smoke: 'never', betel: 'never', alc: 'some' } },
      { id: 'q', name: '阿伯', sex: 'm', birth: '1966-01-01', h: 168, w: 82, waist: 96, act: '1.2', goal: 'auto' }], active: 'z',
    labs: { z: [{ id: 'l', t: '2026-09-14', items: { ht: { v: '172' }, bmi: { v: '24.8' }, glu: { v: 92 }, ldl: { v: 118 }, hdl: { v: 48 }, tg: { v: 110 }, ast: { v: 24 }, alt: { v: 30 }, plt: { v: 240 }, sdldl: { v: 30.2, hi: 30 }, us_liver: { v: '輕度脂肪肝' },
      cxr: { v: '輕微變化（如主動脈鈣化、陳舊病灶）', ref: '原文：肺部無明顯異常（疑輕度脊椎側彎）' } }, extra: [] }],
      q: [{ id: 'm', t: '2026-09-01', items: { sbp: { v: 136 }, dbp: { v: 86 }, glu: { v: 108 }, tg: { v: 190 }, hdl: { v: 36 }, ast: { v: 60 }, alt: { v: 45 }, plt: { v: 150 }, cxr: { v: '肺結節或陰影（待查）', ref: '原文：右上肺結節 0.6 cm' } }, extra: [] }] },
    scale: { z: [{ id: 'a', t: addD(-2) + 'T07:00', weight: 74.2 }, { id: 'b', t: addD(-4) + 'T07:00', weight: 74.4 }, { id: 'c', t: addD(-10) + 'T07:00', weight: 75.0 }] } });
  const dz = await page.evaluate(() => { const ev = labEval(LABS.z[0], me()), pl = yearPlan(me()).items; return { ev: ev.map(i => i.k + (i.bl != null ? '~' : '')).join(), dv: derivedOf(me()).map(d => `${d.k}:${d.val}:${d.lv}`).join(), lip: pl.find(o => /血脂/.test(o.t))?.pr, brca: pl.some(o => /BRCA/.test(o.t)) } });
  check('X 光原文寫「肺部無明顯異常」→ 不算肺部異常；sdLDL 只超出 0.7% 標「略高」、血脂追蹤降為可考慮', !/cxr/.test(dz.ev) && /sdldl~/.test(dz.ev) && dz.lip === 3, dz.ev);
  check('FIB-4 自己算（42 歲 GOT 24、GPT 30、血小板 240 → 0.77 低風險）；代謝症候群 0/5', /fib4:0\.77:0/.test(dz.dv) && /mets:0\/5:0/.test(dz.dv), dz.dv);
  check('男性、一等親早發乳癌 → 列出 BRCA 遺傳諮詢可考慮', dz.brca);
  const dq = await page.evaluate(() => { const m = MEM.find(x => x.id === 'q'), pl = yearPlan(m).items; return { dv: derivedOf(m).map(d => `${d.k}:${d.val}:${d.lv}`).join(), plan: pl.filter(o => /代謝症候群|FibroScan|胸腔科/.test(o.t)).map(o => o.pr + o.t).join(' / '), cx: labEval(LABS.q[0], m).some(i => i.k === 'cxr') } });
  check('代謝症候群 5/5 → 列為優先；FIB-4 偏高 → 建議彈性超音波；X 光原文有結節仍算異常', /mets:5\/5:2/.test(dq.dv) && /1代謝症候群/.test(dq.plan) && /FibroScan/.test(dq.plan) && dq.cx, dq.dv + '｜' + dq.plan);
  const pz = await page.evaluate(() => aiPrompt(me(), { topic: 'all', fh: true, scale: true, normals: false, q: '' }));
  check('AI 問題附台灣標準、已驗正常的關鍵數值、沒驗的項目、FIB-4、醫院身高；X 光用報告原文', /BMI：18\.5–24 正常、24–27 過重/.test(pz) && /【關鍵數值（有驗、正常）】.*LDL 118/.test(pz) && /【這份報告沒有驗】.*HbA1c/.test(pz) && /FIB-4 .*0\.77/.test(pz) && /醫院量：身高 172 cm/.test(pz) && !/主動脈鈣化/.test(pz), (pz.match(/【這份報告沒有驗】.*/) || [''])[0].slice(0, 50));
  await page.click('#nav button[data-v="dash"]'); await page.waitForTimeout(300);
  const hb = await page.evaluate(() => !!document.querySelector('#energyCard [data-fixh="172"]'));
  await page.click('#energyCard [data-fixh="172"]'); await page.waitForTimeout(200);
  check('身高和醫院不一致（173 vs 172）→ 提示並一鍵改成 172', hb && await page.evaluate(() => me().h === 172 && !document.querySelector('#energyCard [data-fixh]')));
  await page.click('#nav button[data-v="body"]'); await page.waitForTimeout(300);
  const bodyTxt = await page.evaluate(() => ({ d: document.querySelector('#derivedCard').hidden ? '' : document.querySelector('#derivedList').textContent, w: document.querySelector('#recList').textContent }));
  check('身體頁顯示「App 自動計算」卡與近 7 天平均體重', /FIB-4/.test(bodyTxt.d) && /代謝症候群/.test(bodyTxt.d) && /近 7 天平均體重\s*74\.3 kg/.test(bodyTxt.w) && /前 7 天 75/.test(bodyTxt.w), bodyTxt.w.slice(0, 50));
  await page.close();

  // 不預設立場：沒填運動狀況的成員，不能出現任何身體限制；費用標籤寫「健保給付」
  page = await newPage({ members: [{ id: 'n', name: '新成員', sex: 'm', birth: '1984-01-01', h: 172, w: 70, act: '1.375', goal: 'auto' }], active: 'n' });
  const np0 = await page.evaluate(() => { const P = fitPlan(me()); return { F: [...P.F].filter(k => LIM.some(z => z[0] === k)).join(), W: P.W.map(x => x.t).join('｜'), ai: aiPrompt(me(), { topic: 'all', fh: true, scale: true, normals: false, q: '' }), pl: planHTML(me()) } });
  check('沒填運動狀況 → 不預設任何身體限制（不會說膝蓋不好）；健檢費用標「健保給付」', !np0.F && !/膝蓋|下背|肩膀|腳踝/.test(np0.W) && !/身體限制/.test(np0.ai) && /健保給付|公費免費/.test(np0.pl) && !/>💰 健保</.test(np0.pl), np0.W.slice(0, 60));
  await page.close();

  // =============== 7. 版本自動更新（本機 http 伺服器模擬 GitHub Pages） ===============
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check("index.html 恰好有一個 const APP_VER='dev'（部署時換成 commit 編號）", html.split("const APP_VER='dev'").length === 2);
  let ver = 'v1';
  const srv = require('http').createServer((q, res) => { const u = q.url.split('?')[0];
    if (u === '/NC/' || u === '/NC/index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'max-age=600' }); return res.end(html.replace("const APP_VER='dev'", `const APP_VER='${ver}'`)) }
    const f = path.join(ROOT, path.normalize(u.replace(/^\/NC\//, '')).replace(/^(\.\.[/\\])+/, ''));
    if (u.startsWith('/NC/') && fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200); return res.end(fs.readFileSync(f)) }
    res.writeHead(404); res.end() });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  page = await newPage({ members: [{ id: 'v1', name: '我', sex: 'm', birth: '1990-01-01', h: 170, w: 65, act: '1.375', goal: 'keep' }], active: 'v1' }, { url: `http://127.0.0.1:${srv.address().port}/NC/` });
  const backToFront = () => page.evaluate(() => { window.__old = 1; verAt = 0; document.dispatchEvent(new Event('visibilitychange')) });
  await backToFront(); await page.waitForTimeout(800);
  check('線上版本相同 → 不重新載入', await page.evaluate(() => window.__old === 1 && (typeof APP_VER === 'undefined' ? '' : APP_VER) === 'v1'));
  ver = 'v2'; await Promise.all([page.waitForEvent('load', { timeout: 10000 }).catch(() => {}), backToFront()]); await page.waitForTimeout(300);
  check('回到前景發現新版本 → 自動重新載入', await page.evaluate(() => !window.__old && (typeof APP_VER === 'undefined' ? '' : APP_VER) === 'v2'));
  ver = 'v3'; await page.evaluate(() => openMemberEdit(MEM[0].id)); await backToFront();
  await page.waitForSelector('#updBar:not([hidden])', { timeout: 10000 }).catch(() => {});
  check('開著表單時不打斷，改顯示「有新版本」按鈕', await page.evaluate(() => window.__old === 1 && (typeof APP_VER === 'undefined' ? '' : APP_VER) === 'v2' && !document.querySelector('#updBar').hidden));
  await Promise.all([page.waitForEvent('load', { timeout: 10000 }).catch(() => {}), page.click('#updBar', { timeout: 5000 }).catch(() => {})]); await page.waitForTimeout(300);
  check('點「有新版本」更新到最新版、資料還在', await page.evaluate(() => (typeof APP_VER === 'undefined' ? '' : APP_VER) === 'v3' && MEM[0].id === 'v1'));
  await page.close(); srv.close();

  // =============== 8. GAS 後端（在 Node 模擬 Apps Script 環境執行 gas/Code.gs） ===============
  const gasRun = (props, cf) => { const P = { ...props }; let fetches = 0;
    const sb = { PropertiesService: { getScriptProperties: () => ({ getProperty: k => P[k] ?? null, setProperty: (k, v) => { P[k] = v }, deleteProperty: k => { delete P[k] }, getKeys: () => Object.keys(P) }) },
      LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) }, Utilities: { formatDate: () => '20261012', sleep() {} },
      UrlFetchApp: { fetch: () => { const c = cf(++fetches); if (c instanceof Error) throw c; return { getResponseCode: () => c, getContentText: () => JSON.stringify({ result: { image: 'AAAA' } }), getHeaders: () => ({}) } } },
      ContentService: { createTextOutput: t => ({ setMimeType: () => JSON.parse(t) }), MimeType: { JSON: 'json' } } };
    require('vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'gas/Code.gs'), 'utf8'), sb);
    let out; try { out = sb.doPost({ postData: { contents: JSON.stringify({ prompt: '菜', seed: 1 }) } }) } catch (e) { out = { error: '例外沒接住' } }
    return `${out.ok ? 'ok' : out.error}/${P.CNT_20261012 || 0}/${fetches}${P.CNT_20261011 ? '/舊計數沒清' : ''}` };
  const KEY = { CF_ACCOUNT_ID: 'a', CF_API_TOKEN: 't', CNT_20261011: '5' };
  const gasCases = [gasRun(KEY, () => 200), gasRun(KEY, () => 500), gasRun(KEY, () => 401), gasRun(KEY, () => new Error('Service invoked too many times: urlfetch')),
    gasRun({ ...KEY, DAILY_CAP: '2', CNT_20261012: '2' }, () => 200), gasRun({}, () => 200)];
  check('GAS：成功才扣額度、失敗退回、額度滿不呼叫 Cloudflare', gasCases.join(' ') === 'ok/1/1 BUSY/0/3 CF_401/0/1 GAS_ERROR/0/1 DAILY_CAP/2/0 NOT_CONFIGURED/0/0', gasCases.join(' '));

  await browser.close();
  console.log(results.join('\n'));
  if (errs.length) console.log('\n頁面錯誤：\n' + errs.join('\n'));
  const fail = results.filter(r => r.startsWith('FAIL')).length + errs.length;
  console.log(`\n${results.length - results.filter(r => r.startsWith('FAIL')).length}/${results.length} 通過${errs.length ? `，${errs.length} 個頁面錯誤` : ''}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('測試程式出錯', e); process.exit(2) });
