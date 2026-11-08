// Kinwell（舊名：家安康、NutriCore）端對端測試：用 iPhone 尺寸的無頭 Chromium 操作 index.html（不連外網，外部 API 全部模擬）
// 用法：node tests/e2e.js            跑全部測試
//       node tests/e2e.js --update-prompts   依 App 內提示詞重寫 PROMPTS.md
// 測試端算的日期（T(30)、addD 這類「幾天前」）要和瀏覽器同一個時區（下面 newContext 的 timezoneId），不然每天 UTC 16:00–24:00 會差一天
process.env.TZ = 'Asia/Taipei';
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
    if (seed) await p.addInitScript(([s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); for (const [k, v] of Object.entries({ tour: 2, ...s })) localStorage.setItem('nc_' + k, JSON.stringify(v)); sessionStorage.setItem('seeded', '1') } }, [seed]);
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
    const pt = await page.evaluate(o => { const el = document.querySelector(`#hud [data-org="${o}"]`) || document.querySelector(`#hud [data-o="${o}"]`); document.querySelector('#hud').scrollIntoView({ block: 'center', behavior: 'instant' }); const b = el.getBoundingClientRect();   // 上一個器官的說明框會把頁面往下捲，先捲回人體圖
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
  check('"Normal" 標記不算異常、/µL 換算後正常', !/hdl:|wbc:|plt:|x_鈉|(^|,)na:/.test(ev), ev);
  check('鉀 6.2 判嚴重、骨密度 -2.7 判異常、乳房 4A 判嚴重、LDCT 4X 判嚴重', /k:3/.test(ev) && /dxa:2/.test(ev) && /mammo:3/.test(ev) && /ldct:3/.test(ev), ev);
  check('ANA 1:80 不算異常、抗體保護力不計分；「其他項目」的鐵蛋白 8 對到正式項目並判異常', !/ana:/.test(ev) && !/hbsab/.test(ev) && /(^|,)ferritin:[12]/.test(ev) && !/x_鐵蛋白/.test(ev), ev);
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
  check('早發心血管家族史 → Lp(a)；吸菸已戒 → 口腔癌篩檢（提醒向院所確認資格）', has(0, /Lp\(a\)/) && has(0, /口腔黏膜/), '');
  check('血糖 94→104、GPT 38→52 列入趨勢', has(0, /數值趨勢\|空腹血糖/) && has(0, /數值趨勢\|GPT/), '');
  check('45 歲女性 → 乳房攝影、抹片、HPV、幽門桿菌', has(1, /乳房 X 光/) && has(1, /子宮頸抹片/) && has(1, /HPV/) && has(1, /幽門桿菌/), plans[1].join(' / ').slice(0, 160));
  check('57 歲 30 包年吸菸 → LDCT、戒菸門診', has(2, /LDCT/) && has(2, /戒菸門診/), '');
  await page.click('#nav button[data-v="body"]'); await page.waitForTimeout(400);
  await page.evaluate(() => { ACT = 'u2'; renderAll() });
  check('沒填家族史會提示填寫', !!(await page.$('#planBody [data-fh]')));
  await page.click('#v-body .subnav [data-sub="plan"]'); await page.waitForTimeout(150);
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
  await page.setInputFiles('#importFile', ep); await page.waitForTimeout(500); await page.click('#sheetBody [data-imp="replace"]'); await page.waitForTimeout(300);
  await page.click('#nav button[data-v="body"]'); await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ pwn: window.__pwn || 0, mem: MEM.map(m => m.id + ':' + m.birth).join(','), fh: MEM[0].fh, life: MEM[0].life, scale: (SCALE.ok1 || []).length, gas: GAS }));
  check('惡意備份檔被清洗、沒有執行', after.pwn === 0 && after.mem === 'ok1:2026-01-02' && after.fh.ca.join() === 'crc' && after.life.smoke === 'never' && after.life.ppd === 10 && after.scale === 1 && !/evil/.test(after.gas), JSON.stringify(after));
  const big = path.join(require('os').tmpdir(), 'nc-big.json'); fs.writeFileSync(big, '{"app":"NutriCore","pad":"' + 'x'.repeat(6 * 1048576) + '"}');
  await page.setInputFiles('#importFile', big); await page.waitForTimeout(400);
  const bigRes = await page.evaluate(() => ({ t: document.querySelector('#toast').textContent, mem: MEM.map(m => m.id).join() }));
  check('超過 5MB 的檔案直接拒絕（不讀進記憶體）', /不是 Kinwell 備份/.test(bigRes.t) && bigRes.mem === 'ok1', bigRes.t.slice(0, 40)); fs.unlinkSync(big);
  check('輸入框字級 ≥16px（iOS 不自動放大）', await page.evaluate(() => { const t = document.createElement('textarea'); document.body.appendChild(t); const v = parseFloat(getComputedStyle(t).fontSize); t.remove(); return v >= 16 }));

  // =============== 6. 文件一致性 ===============
  const prompts = await page.evaluate(() => ({ scale: promptScale(), lab: promptLab(), watch: promptWatch(), policy: promptPolicy(), law: PROMPT_LAW, lawdiff: PROMPT_LAWDIFF, insrule: INS_RULE + '\n' + EVID, polchk: POLCHK_HEAD, claimprep: CLAIMPREP_HEAD, terms: TERMS_HEAD, review: REVIEW_TAIL }));
  const md = p => '```text\n' + p + '\n```';
  const pfile = path.join(ROOT, 'PROMPTS.md');
  if (process.argv.includes('--update-prompts')) {
    const doc = fs.readFileSync(pfile, 'utf8').replace(/(## 一、體脂機截圖\n\n)```text[\s\S]*?\n```/, (m0, h) => h + md(prompts.scale)).replace(/(## 二、體檢報告\n\n)```text[\s\S]*?\n```/, (m0, h) => h + md(prompts.lab)).replace(/(## 四、手錶／健康 App 截圖\n\n)```text[\s\S]*?\n```/, (m0, h) => h + md(prompts.watch))
      .replace(/(## 六、保單匯入（照片／PDF → JSON）\n\n)```text[\s\S]*?\n```/, (m0, h) => h + md(prompts.policy)).replace(/(### 法令／條例更新審查\n\n)```text[\s\S]*?\n```/, (m0, h) => h + md(prompts.law)).replace(/(### 法規新舊條文比對\n\n)```text[\s\S]*?\n```/, (m0, h) => h + md(prompts.lawdiff)).replace(/(### 保單核對（哪裡有錯、去哪裡找）\n\n[^\n]*\n\n)```text[\s\S]*?\n```/, (m0, h) => h + md(prompts.polchk)).replace(/(### 突發狀況：理賠準備與怎麼問醫師\n\n[^\n]*\n\n)```text[\s\S]*?\n```/, (m0, h) => h + md(prompts.claimprep)).replace(/(### 條款規則擷取（理賠試算用）\n\n[^\n]*\n\n)```text[\s\S]*?\n```/, (m0, h) => h + md(prompts.terms)).replace(/(### 保單條款審查（最後附條款規則 JSON）\n\n[^\n]*\n\n)```text[\s\S]*?\n```/, (m0, h) => h + md(prompts.review)).replace(/(### 共同規則與證據分級\n\n)```text[\s\S]*?\n```/, (m0, h) => h + md(prompts.insrule));
    fs.writeFileSync(pfile, doc); console.log('已更新 PROMPTS.md');
  }
  const doc = fs.readFileSync(pfile, 'utf8');
  check('PROMPTS.md 與 App 內提示詞一致（體脂機、體檢、手錶、保單、法令審查、法規比對、保單核對、突發狀況理賠準備、條款規則擷取、條款審查最後附的 JSON）', doc.includes(md(prompts.scale)) && doc.includes(md(prompts.lab)) && doc.includes(md(prompts.watch)) && doc.includes(md(prompts.policy)) && doc.includes(md(prompts.law)) && doc.includes(md(prompts.lawdiff)) && doc.includes(md(prompts.insrule)) && doc.includes(md(prompts.polchk)) && doc.includes(md(prompts.claimprep)) && doc.includes(md(prompts.terms)) && doc.includes(md(prompts.review)), '不一致時執行 node tests/e2e.js --update-prompts');
  const selfHead = await page.evaluate(() => selfPrompt(me(), []).split('\n').slice(0, 2).join('\n'));
  check('PROMPTS.md 第五節（自我檢測給 AI）的開頭規則和 App 一致', doc.includes('```text\n' + selfHead + '\n'), '改了 selfPrompt 開頭要同步 PROMPTS.md 第五節');
  await page.close();

  // =============== 6b. 儀表、營養師、健身教練、疫苗 ===============
  const ZM = { id: 'z', name: '王小明', sex: 'm', birth: '1984-03-15', h: 170, w: 71.4, waist: 88, act: '1.375', goal: 'keep', fit: { lim: ['knee'], lvl: 'new', days: 4, min: 30, like: ['walk', 'slowjog', 'swim'] },
    life: { smoke: 'never', betel: 'never', alc: 'some', colono: 2014 }, fh: { ca: ['crc'], chr: ['dm'], early: false } };
  page = await newPage({ members: [ZM, { id: 'g', name: '阿嬤', sex: 'f', birth: '1958-02-01', h: 155, w: 52, act: '1.2', goal: 'auto', life: { colono: 2022 } }], active: 'z',
    labs: { z: [{ id: 'l', t: '2026-09-14', items: { glu: { v: 106 }, hba1c: { v: 5.9 }, tg: { v: 182 }, ldl: { v: 142 }, ua: { v: 7.6 }, sbp: { v: 134 }, dbp: { v: 86 } }, extra: [] }] } });
  check('BMI 儀表：單一漸層弧線＋動畫指針（不再是 4 段圓頭線）', await page.evaluate(() => !!document.querySelector('#gauge linearGradient') && !!document.querySelector('#gauge .gmark') && !document.querySelector('#gauge [stroke="#ffb547"]')));
  const sg = await page.evaluate(() => ({ g: suggestGoal(me()).goal, box: !!document.querySelector('#energyCard [data-autogoal]'), bmr: /別低於 BMR/.test(document.querySelector('#energyCard').textContent) }));
  check('BMI 24.7 → 營養師建議減脂，熱量卡說明 BMR／TDEE 怎麼用', sg.g === 'cut' && sg.box && sg.bmr, JSON.stringify(sg));
  await page.evaluate(() => go('menu', 'kcal')); await page.waitForTimeout(150); await page.click('#energyCard [data-autogoal]'); await page.waitForTimeout(200);
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
  const cv = await page.evaluate(() => { const Y = new Date().getFullYear(), mk = age => ({ id: 'tmp' + age, name: 't', sex: 'm', birth: `${Y - age}-01-01`, h: 170, w: 65, act: '1.375', goal: 'keep' }),
    f = m => yearPlan(m).items.filter(o => /^新冠疫苗|^流感疫苗/.test(o.t)).map(o => `${o.t.slice(0, 2)}:${o.ch}:${o.when}`).join(',');
    return { a42: f(mk(42)), a55: f(mk(55)), a66: f(mk(66)), a10: f(mk(10)), season: [9, 10, 11, 0, 1, 2].includes(new Date().getMonth()) } });
  check('新冠／流感公費資格（2026–27 疾管署）：42 歲自費；55 歲公費（11/2 起）；66 歲公費（10/1 起）；10 歲學生流感公費、新冠自費', /流感:自費/.test(cv.a42) && /新冠:自費/.test(cv.a42) && /新冠:公費/.test(cv.a55) && /新冠:公費/.test(cv.a66) && /流感:公費/.test(cv.a10) && /新冠:自費/.test(cv.a10)
    && (!cv.season || (/新冠:公費:現在（公費 11\/2 起）/.test(cv.a55) && /新冠:公費:現在（公費 10\/1 起）/.test(cv.a66))), JSON.stringify(cv));
  await page.evaluate(() => openMemberEdit('z', 'vax')); await page.waitForTimeout(400);
  await page.click('#m-vax .chip[data-k="flu"]'); await page.click('#m-tabs [data-t="fit"]'); await page.click('#m-lim .chip[data-k="back"]'); await page.click('#m-save'); await page.waitForTimeout(300);
  const sv = await page.evaluate(() => ({ vax: me().vax, lim: me().fit.lim, flu: yearPlan(me()).items.some(o => o.t === '流感疫苗') }));
  check('成員表單可存疫苗紀錄與運動限制；打過流感就不再列', sv.vax.flu === (new Date().getMonth() >= 9 ? new Date().getFullYear() : new Date().getFullYear() - 1) && sv.lim.includes('back') && !sv.flu, JSON.stringify(sv));
  const cb = await page.evaluate(() => { const c = cleanBackup({ members: [{ id: 'q', name: 'x', sex: 'm', birth: '1990-01-01', goal: '<x>', fit: { lim: ['knee', '<img>'], lvl: 'zzz', days: 99, like: ['run', 'evil'] }, vax: { flu: 'abc', zzz: 2020, pneu: 2020 } }] }).mem[0]; return { g: c.goal, lim: c.fit.lim, lvl: c.fit.lvl, days: c.fit.days, like: c.fit.like, vax: c.vax } });
  check('備份檔的運動、疫苗、目標欄位會被清洗', cb.g === 'auto' && cb.lim.join() === 'knee' && cb.lvl === 'new' && cb.days === 6 && cb.like.join() === 'run' && JSON.stringify(cb.vax) === '{"pneu":2020}', JSON.stringify(cb));
  const ovf = []; for (const [v, k] of [['dash'], ['body', 'now'], ['body', 'rec'], ['body', 'plan'], ['body', 'cond'], ['menu', 'menu'], ['menu', 'nutri'], ['menu', 'kcal'], ['fit', 'today'], ['fit', 'week'], ['fit', 'tips'], ['body', 'self'], ['ins', 'pol'], ['ins', 'cov'], ['ins', 'clm'], ['ins', 'tool'], ['lab']]) {
    await page.evaluate(([v, k]) => go(v, k), [v, k]); await page.waitForTimeout(250); if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('.view.on .card')].some(e => e.offsetParent && e.getBoundingClientRect().right > innerWidth + 1))) ovf.push(v + (k ? '/' + k : '')) }
  check('所有頁面與分頁在 iPhone 寬度都沒有橫向捲動、卡片沒超出螢幕', !ovf.length, ovf.join(','));
  await page.close();

  // =============== 6c. 菜色庫、不吃的食物、採買清單 ===============
  page = await newPage({ members: [{ id: 'a', name: '爸', sex: 'm', birth: '1980-01-01', h: 172, w: 75, act: '1.375', goal: 'auto' }, { id: 'b', name: '媽', sex: 'f', birth: '1982-01-01', h: 160, w: 55, act: '1.375', goal: 'auto' }], active: 'a' });
  const db = await page.evaluate(() => { const ids = FOODS.map(f => f.id); return { n: FOODS.length, dup: ids.length - new Set(ids).size, unk: [...new Set(FOODS.flatMap(f => ingOf(f).map(i => i.n)).filter(n => !CAT_OF[n]))].join(','),
    bad: FOODS.filter(f => !f.g || !f.en || !['b', 'ld', 'v', 's'].includes(f.m) || Math.abs(f.k - (4 * (f.p + f.c) + 9 * f.f)) / f.k > .25).map(f => f.id).join(',') } });
  check('菜色庫 ≥130 道：id 不重複、每道都有食材與英文描述、食材都有分類、熱量與三大營養素一致', db.n >= 130 && !db.dup && !db.unk && !db.bad, `${db.n} 道｜未分類 ${db.unk || '無'}｜有問題 ${db.bad || '無'}`);
  const days14 = await page.evaluate(() => [...Array(14)].map((_, i) => addDays(mondayOf(ymd(new Date())), i)));   // 從本週一起算（不重複是以週一～週日為單位）
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
  page = await newPage({ members: [{ id: 'z', name: '王小明', sex: 'm', birth: '1984-03-15', h: 172, w: 73.1, act: '1.375', goal: 'auto', life: { smoke: 'never', betel: 'never', alc: 'none' } }], active: 'z',
    labs: { z: [{ id: 'l', t: `${new Date().getFullYear()}-09-14`, hospital: '台安', items: { us_liver: { v: '輕度脂肪肝' }, cxr: { v: '輕微變化（如主動脈鈣化、陳舊病灶）' } }, extra: [
      X('身體質量指數BMI', '24.8', '', '18.5~24', '*', 18.5, 24), X('右眼壓', '9', 'mmHg', '0~20', '', 0, 20), X('糞便潛血檢驗值(免疫法)', '50', 'ng/mL', '<100', '', null, 100), X('超壞膽固醇(sdLDL)', '30.2', 'mg/dL', '<30', '*', null, 30),
      X('骨質密度攝影檢查', '-0.2', '', '>-1.0', '', -1, null), X('骨質密度攝影檢查(右股骨頭)', '-0.4', '', '>-1.0', '', -1, null), X('體脂肪質量', '16.8', 'kg', '7.3~14.5', '', 7.3, 14.5), X('腰臀圍比', '0.87'), X('體脂肪率', '23.2', '%'), X('體重', '73.1', 'kg'),
      X('白蛋白/球蛋白比(A/G)', '1.7', 'mg/dl', '1.0~2.5', '', 1, 2.5), X('腰圍(InBody)', '83.7', 'cm'), X('肺功能檢查', '正常')] }] },
    scale: { z: [{ id: 's', t: `${new Date().getFullYear()}-10-11T20:57`, device: '小米', weight: 74.6, bmi: 24.9, fat: 21, fatMass: 15.7, visceral: 6, whr: 1, status: { bmi: '標準', whr: '偏高' } }] } });
  const mg = await page.evaluate(() => { const L = LABS.z[0], pl = yearPlan(me()).items; return { it: Object.keys(L.items).join(), dxa: L.items.dxa?.v, alb: !!L.items.alb, ag: L.items.ag?.v, pft: L.items.pft?.v, ev: labEval(L, me()).map(i => i.k).join(), ex: L.extra.map(e => e.name).join('、'), plan: pl.map(o => o.t + '｜' + o.why).join(' / '), sec: SECS[0] } });
  check('舊報告「其他項目」搬回正式項目：糞便潛血、眼壓、骨密度取最低、sdLDL、InBody', /fobt/.test(mg.it) && /iop/.test(mg.it) && mg.dxa === -0.4 && /sdldl/.test(mg.it) && /bia_fm/.test(mg.it) && /wt/.test(mg.it), mg.it);
  check('「白蛋白/球蛋白比」對到 A/G 比、不會被當成白蛋白；肺功能「正常」對到肺功能項目', !mg.alb && mg.ag === 1.7 && mg.pft === '正常' && !/白蛋白|肺功能/.test(mg.ex), JSON.stringify([mg.ag, mg.pft, mg.ex]));
  check('BMI、體脂肪量只記錄不再叫你「複驗」；sdLDL 列入血脂追蹤', !/複驗 (身體質量|體脂肪|BMI)/.test(mg.plan) && /血脂/.test(mg.plan) && mg.ev === 'us_liver,cxr,sdldl', mg.ev);
  check('今年的報告不說「去年」；胸部 X 光輕微變化不追加 CT', !/去年/.test(mg.plan) && /這次報告/.test(mg.plan) && /下次健檢再照/.test(mg.plan) && !/低劑量 CT/.test(mg.plan) && mg.sec === '追蹤報告異常', mg.plan.slice(0, 80));
  const cmp = await page.evaluate(() => { const r = scalesOf(me())[0]; openScaleDetail(r.id); const t = document.querySelector('#sheetBody').textContent; closeSheet(); return { whr: scaleEval(r, me()).some(i => i.k === 'whr'), t } });
  check('體脂計 vs 醫院 InBody：逐項比較、指出腰臀比是推算、BMI 身高設定', /和醫院 InBody 比較/.test(cmp.t) && /腰臀比差很多/.test(cmp.t) && /身高設定/.test(cmp.t) && /國際標準/.test(cmp.t) && !cmp.whr, cmp.whr ? '腰圍正常卻仍判腰臀比' : '');
  await page.click('#nav button[data-v="body"]'); await page.click('#v-body [data-addlab]'); await page.waitForTimeout(400); await page.click('details.box.ai > summary');
  await page.fill('#ai-in', JSON.stringify({ type: 'nutricore.lab', v: 1, date: '2026-09-14', items: { '骨質密度攝影檢查(左股骨頭)': { value: -0.1 }, '骨質密度攝影檢查(右股骨頭)': { value: -0.4 }, '右眼壓': { value: 9 }, '左眼壓': { value: 12 }, '白蛋白/球蛋白比(A/G)': { value: 1.7 }, '握力 右手': { value: 36, unit: 'kgf' } } }));
  await page.click('#ai-go'); await page.waitForTimeout(200);
  const imp = await page.evaluate(() => ({ dxa: $('#l-dxa').value, iop: $('#l-iop').value, alb: $('#l-alb')?.value || '', ag: $('#l-ag')?.value, grip: $('#l-grip_r')?.value, ex: lExtra.map(e => e.name).join() }));
  check('匯入：多個骨密度取最低、兩眼取較高眼壓、A/G 比對到 A/G（不是白蛋白）、握力對到', imp.dxa === '-0.4' && imp.iop === '12' && !imp.alb && imp.ag === '1.7' && imp.grip === '36', JSON.stringify(imp));
  await page.evaluate(() => closeSheet()); await page.waitForTimeout(200);
  await page.click('#gearBtn'); await page.waitForTimeout(400);
  const hub = await page.evaluate(() => ({ title: document.querySelector('#sheetBody h3').textContent, grp: [...document.querySelectorAll('#sheetBody .sgh')].map(e => e.textContent).join('｜'), exp: !!document.querySelector('#sheetBody [data-export]'), fz: document.querySelectorAll('#set-fz [data-fz]').length, mem: document.querySelectorAll('#sheetBody [data-pick]').length }));
  await page.click('#sheetBody [data-setsec="basic"]'); await page.waitForTimeout(300);
  const st1 = await page.evaluate(() => ({ title: document.querySelector('#sheetBody h3').textContent, back: !!document.querySelector('#sheetBody [data-settings]'), vis: [...document.querySelectorAll('#sheetBody .tabp')].filter(p => !p.hidden).map(p => p.dataset.t).join(), smoke: $('#m-smokebox').offsetParent === null, app: !!document.querySelector('#m-tabs [data-t="app"]') }));
  await page.click('#sheetBody [data-settings]'); await page.waitForTimeout(300);
  const st2 = await page.evaluate(() => !!document.querySelector('#sheetBody #set-fz') && !document.querySelector('#v-me') && !!document.querySelector('#nav [data-v="ins"]') && !document.querySelector('#nav [data-v="self"]'));
  check('右上角 ⚙️ 設定中心（原「我的」）：個人資料、家庭成員、顯示、備份、圖片、關於分組；點「基本資料」進到那一頁、有「‹ 設定」返回；沒吸菸時不顯示包數；底部導覽有「保險」（自我檢測搬進健康頁）',
    /設定/.test(hub.title) && /個人資料｜家庭成員.*｜顯示｜資料匯出匯入｜菜色圖片｜關於/.test(hub.grp) && hub.exp && hub.fz === 3 && hub.mem >= 1 && /王小明 的資料/.test(st1.title) && st1.back && st1.vis === 'basic' && st1.smoke && !st1.app && st2, JSON.stringify([hub, st1, st2]));
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
  page = await newPage({ members: [{ id: 'z', name: '王小明', sex: 'm', birth: '1984-03-15', h: 172, w: 73.1, waist: 88, act: '1.375', goal: 'auto', fh: { ca: ['breast'], chr: ['htn'], early: false }, life: { smoke: 'never', betel: 'never', alc: 'some' }, fit: { lim: ['knee'] } }], active: 'z',
    labs: { z: [{ id: 'l', t: '2026-09-14', hospital: '台安醫院', items: { glu: { v: 106 }, ldl: { v: 142 }, sdldl: { v: 30.2, hi: 30 }, alt: { v: 30 } }, extra: [] }] } });
  const ap0 = await page.evaluate(() => { const o = { topic: 'all', fh: true, scale: true, normals: false, q: '' }; return { a: aiPrompt(me(), o), n: aiPrompt(me(), { ...o, normals: true }), it: aiPrompt(me(), { ...o, topic: 'item', item: 'sdldl' }) } });
  check('AI 醫生的問題：不含姓名、生日、醫院；有年齡性別、異常數值、家族史、身體限制、正常的關鍵數值', !/王小明|1984|台安/.test(ap0.a + ap0.n) && /男性、42 歲/.test(ap0.a) && /空腹血糖：106/.test(ap0.a) && /乳癌/.test(ap0.a) && /膝蓋/.test(ap0.a) && /【關鍵數值（有驗、正常）】.*GPT 30/.test(ap0.a), ap0.a.split('\n').slice(3, 5).join(' / '));
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
  check('總覽與身體頁都有「問 AI 醫生」入口', await page.evaluate(() => !!document.querySelector('#v-dash [data-aidoc]') && !!document.querySelector('#v-body [data-aidoc]')));
  await page.close();

  // =============== 6f. 不用問 AI 就能算的：FIB-4、代謝症候群、略高、X 光原文、身高不一致 ===============
  page = await newPage({ members: [{ id: 'z', name: '王小明', sex: 'm', birth: '1984-03-15', h: 173, w: 74.6, act: '1.375', goal: 'auto', fh: { ca: ['breast'], chr: ['htn'], early: true }, life: { smoke: 'never', betel: 'never', alc: 'some' } },
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
  await page.evaluate(() => go('menu', 'kcal')); await page.waitForTimeout(150); await page.click('#energyCard [data-fixh="172"]'); await page.waitForTimeout(200);
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

  // =============== 6g. 報告「其他項目」：InBody 分段、原始阻抗、視力聽力、理學檢查、尿沉渣、球蛋白、A/G、RISK ===============
  {
    const X = (name, value, unit = '', lo = null, hi = null, flag = '') => ({ name, value, unit, ref: lo != null || hi != null ? `${lo ?? ''}~${hi ?? ''}` : '', lo, hi, flag });
    const yr = new Date().getFullYear();
    page = await newPage({ members: [{ id: 'g', name: '測試', sex: 'm', birth: '1984-03-15', h: 172, w: 73, act: '1.375', goal: 'auto' }], active: 'g',
      labs: { g: [{ id: 'lg', t: `${yr}-09-14`, hospital: '甲醫院', items: {}, extra: [
        X('右上肢瘦肉量', '3.6', 'kg', 2.9, 3.6), X('左上肢瘦肉量', '3.5', 'kg', 2.9, 3.6), X('軀幹瘦肉量', '27.1', 'kg', 22.4, 26.3), X('右下肢瘦肉量', '9.2', 'kg', 8, 9.5), X('左下肢瘦肉量', '9.1', 'kg', 8, 9.5),
        X('右上肢體脂肪量', '0.9', 'kg', 0.5, 1), X('軀幹體脂肪量', '9.0', 'kg', 3.7, 7.4, '*'), X('右下肢體脂肪量', '2.6', 'kg', 1.6, 3.2),
        X('右上肢阻抗(5kHz)', '312.4', 'Ω'), X('軀幹阻抗(250kHz)', '18.1', 'Ω'), X('左下肢阻抗(50kHz)', '255', 'Ω'),
        X('矯正右眼', '1.0'), X('矯正左眼', '0.8'), X('聽力(右耳)', '正常'), X('聽力(左耳)', '異常'),
        X('頭頸部', '無異常'), X('呼吸系統', '未見明顯異常'), X('心臟血管系統', '正常，但有心雜音'), X('肌肉骨骼系統', '無明顯腫塊'),
        X('血小板平均體積MPV', '10.2', 'fL', 7.4, 10.4), X('血小板分布寬度PDW', '12', 'fL'), X('上皮細胞', '0-1', '/HPF'), X('結晶體', '(-)'), X('細菌', '(-)'),
        X('球蛋白', '2.8', 'g/dL', 2, 3.5), X('白蛋白/球蛋白比(A/G)', '1.7', '', 1, 2.5), X('心臟血管疾病率(RISK)', '3.2', '%'),
        X('水腫指數', '0.378', '', 0.36, 0.39), X('去脂肪質量', '57.3', 'kg'), X('體水分', '42.1', 'L'), X('骨骼肌質量指數SMI', '10.4', 'kg/m²'), X('健康分數(InBody)', '76', '分'),
        X('皮下脂肪面積', '141', 'cm²'), X('體脂肪質量指數FMI', '5.7', 'kg/m²'), X('去脂肪質量指數FFMI', '19.4', 'kg/m²')] }] } });
    const g = await page.evaluate(() => { const L = labsOf(me())[0], ev = labEval(L, me()), d = derivedOf(me()).find(x => x.k === 'bia');
      openLabDetail(L.id); const t = document.querySelector('#sheetBody').textContent; closeSheet();
      return { it: Object.keys(L.items).sort().join(), ag: L.items.ag?.v, hear: L.items.hearing?.v, ex: L.extra.map(e => e.name), ev: ev.map(i => `${i.k}:${i.lv}`).join(), bia: d && `${d.lv}|${d.txt}`, t } });
    const want = ['glo', 'ag', 'mpv', 'pdw', 'uepi', 'ucry', 'ubact', 'cvrisk', 'va_r', 'va_l', 'hearing', 'ecw', 'sfa', 'bia_score', 'ffm', 'tbw', 'smi', 'ffmi', 'fmi'];
    check('報告其他項目對到正式項目：球蛋白、A/G、MPV、PDW、尿沉渣、RISK、矯正視力、聽力、InBody 組成', want.every(k => g.it.split(',').includes(k)) && g.ag === 1.7, 'missing: ' + want.filter(k => !g.it.split(',').includes(k)).join());
    check('InBody 分段、原始阻抗留在其他項目，但不逐項判異常、不扣分', g.ex.some(n => /阻抗/.test(n)) && g.ex.some(n => /右上肢瘦肉/.test(n)) && !/x_.*(上肢|下肢|軀幹|阻抗)/.test(g.ev), g.ev);
    check('InBody 分段彙整：軀幹脂肪偏高、左右平衡', /^1\|/.test(g.bia || '') && /軀幹/.test(g.bia) && /左右肌肉平衡/.test(g.bia), g.bia);
    check('聽力一耳異常 → 單側異常（取較差那耳）；理學檢查「正常，但有心雜音」判注意、「無異常／未見明顯異常／無明顯腫塊」不判', /^單側/.test(g.hear) && /x_心臟血管系統:1/.test(g.ev) && !/x_頭頸部|x_呼吸系統|x_肌肉骨骼/.test(g.ev) && /hearing:1/.test(g.ev), `${g.hear}｜${g.ev}`);
    check('體檢分析頁：其他項目分組（理學檢查、原始阻抗收合）＋ InBody 分段摘要', /其他項目/.test(g.t) && /理學檢查/.test(g.t) && /InBody 原始阻抗/.test(g.t) && /InBody 分段/.test(g.t), '');
    const neg = await page.evaluate(() => ['無異常', '未見明顯結節', '無心律不整', '心雜音(-)', '雜音：無', '甲狀腺未腫大', '正常，但有心雜音', '無法排除結節', '無力，有心雜音', '心臟：無雜音，有心律不整'].map(t => txtAbn(t) ? 1 : 0).join(''));
    check('文字判讀：否定寫法（無心律不整、心雜音(-)、雜音：無）不算異常；「但有」「無法排除」算異常', neg === '0000001111', neg);
    const both = await page.evaluate(() => { const r = { items: {}, extra: [{ name: '右耳聽力', value: '異常' }, { name: '左耳聽力', value: '聽力下降' }] }; promoteExtras(r); return r.items.hearing?.v });
    check('左右耳都異常 → 雙側異常', /^雙側/.test(both || ''), both);
    await page.click('#nav button[data-v="body"]'); await page.click('#v-body [data-addlab]'); await page.waitForTimeout(400); await page.click('details.box.ai > summary');
    await page.fill('#ai-in', JSON.stringify({ type: 'nutricore.lab', v: 1, date: `${yr}-09-14`, items: { alb: { value: 4.5, unit: 'g/dL' } }, extra: [{ name: '矯正右眼', value: 1.0 }, { name: '聽力(右耳)', value: '異常' }, { name: '聽力(左耳)', value: '異常' }, { name: '右上肢阻抗(5kHz)', value: 312, unit: 'Ω' }, { name: '白蛋白', value: 3.1, unit: 'g/dL' }] }));
    await page.click('#ai-go'); await page.waitForTimeout(200);
    const fi = await page.evaluate(() => ({ va: $('#l-va_r').value, hear: $('#l-hearing').value, alb: $('#l-alb').value, ex: lExtra.map(e => e.name).join() }));
    check('AI 匯入：其他項目也會對到表單（視力、雙耳）；已經有值的不被其他項目覆蓋；阻抗留在其他項目', fi.va === '1' && /^雙側/.test(fi.hear) && fi.alb === '4.5' && /阻抗/.test(fi.ex), JSON.stringify(fi));
    await page.close();
  }

  // =============== 6h. 歷年比較（3 年內最多 3 份；不同醫院參考值；長期／可逆） ===============
  {
    const X = (name, value, unit = '', lo = null, hi = null) => ({ name, value, unit, ref: `${lo ?? ''}~${hi ?? ''}`, lo, hi, flag: null });
    page = await newPage({ members: [{ id: 'c', name: '測試', sex: 'm', birth: '1984-03-15', h: 172, w: 73.1, act: '1.375', goal: 'auto' }], active: 'c',
      labs: { c: [
        { id: 'old', t: '2021-05-01', hospital: '丙醫院', items: { alt: { v: 90 } }, extra: [] },
        { id: 'a', t: '2024-09-10', hospital: '甲醫院', items: { alt: { v: 25 }, tg: { v: 110 }, egfr: { v: 98 }, us_liver: { v: '正常' }, wt: { v: 70.2 }, fmi: { v: 4.7 }, smi: { v: 10.4 } }, extra: [X('軀幹體脂肪量', '7.0', 'kg', 3.7, 7.4), X('右上肢阻抗(5kHz)', '300', 'Ω')] },
        { id: 'b', t: '2025-09-12', hospital: '乙醫院', items: { alt: { v: 32, hi: 40 }, egfr: { v: 95 }, sdldl: { v: 30.0, hi: 35 }, us_liver: { v: '輕度脂肪肝' }, wt: { v: 71.5 } }, extra: [] },
        { id: 'n', t: '2026-09-14', hospital: '甲醫院', items: { alt: { v: 46 }, tg: { v: 112 }, egfr: { v: 58 }, sdldl: { v: 30.2, hi: 30 }, us_liver: { v: '輕度脂肪肝' }, wt: { v: 73.1 }, fmi: { v: 5.7 }, smi: { v: 10.4 } }, extra: [X('軀幹體脂肪量(InBody)', '9.0', 'kg', 3.7, 7.4), X('右上肢阻抗(5kHz)', '310', 'Ω')] }] } });
    const c = await page.evaluate(() => { const d = cmpData(me()), R = k => d.rows.find(r => r.k === k) || d.rows.find(r => r.name.includes(k)) || {};
      return { dates: d.rs.map(r => r.t).join(), diffH: d.diffH, sd: R('sdldl').vd, sdWhy: R('sdldl').why, eg: `${R('egfr').vd}|${R('egfr').rev?.[0]}`, liv: `${R('us_liver').vd}|${R('us_liver').rev?.[0]}`, tg: R('tg').vd,
        wt: R('wt').vd, fmi: R('fmi').vd, seg: R('軀幹體脂肪量').vd, imp: d.rows.some(r => /阻抗/.test(r.name)), body: d.body && `${d.body.dw}|${d.body.df}|${d.body.txt}`, ai: aiPrompt(me(), { topic: 'all', fh: true, scale: true }) } });
    check('歷年比較只取 3 年內最多 3 份（2021 年那份不算），舊 → 新', c.dates === '2024-09-10,2025-09-12,2026-09-14' && c.diffH, c.dates);
    check('數值幾乎沒變、只是兩家醫院參考值不同 → 標「標準不同」不是「變差」', c.sd === 'std' && /參考值不同/.test(c.sdWhy), c.sd + '｜' + c.sdWhy);
    check('eGFR 98 → 58 變差並標「長期／不可逆」；脂肪肝變差但標「可逆」；三酸甘油酯持平', c.eg === 'worse|perm' && c.liv === 'worse|rev' && c.tg === 'flat', `${c.eg} ${c.liv} ${c.tg}`);
    check('身體組成：體重 +2.9、脂肪 +3（FMI×身高²）→「增加的幾乎都是脂肪」；體重、FMI 標變差趨勢、肌肉指數持平', /^2\.9\|3\|增加的幾乎都是脂肪/.test(c.body || '') && c.wt === 'trend' && c.fmi === 'trend', c.body);
    check('InBody 分段同名比對（去掉「(InBody)」）、原始阻抗不比', c.seg === 'worse' && !c.imp, String(c.seg));
    check('AI 醫生附上歷年比較，只寫「不同醫院」不寫醫院名稱', /【歷年比較（2024-09 → 2025-09 → 2026-09，不同醫院）】/.test(c.ai) && /標準不同（數值幾乎沒變/.test(c.ai) && !/甲醫院|乙醫院/.test(c.ai), (c.ai.match(/【歷年比較[^\n]*/) || [''])[0].slice(0, 90));
    await page.click('#nav button[data-v="body"]'); await page.waitForTimeout(300);
    const ui = await page.evaluate(() => ({ card: !$('#cmpCard').hidden && /增加的幾乎都是脂肪/.test($('#cmpBody').textContent), tag: [...document.querySelectorAll('#issueList .issue')].some(e => /eGFR/.test(e.textContent) && /長期／不可逆/.test(e.textContent)) }));
    await page.click('#v-body .subnav [data-sub="rec"]'); await page.waitForTimeout(150); await page.click('#cmpBody [data-cmp]'); await page.waitForTimeout(400);
    const sh = await page.evaluate(() => ({ cols: document.querySelectorAll('#sheetBody .cmp-cols > div').length, rows: document.querySelectorAll('#sheetBody .cmp-r').length, banner: /來自不同醫院/.test($('#sheetBody').textContent), w: document.querySelector('.sheet-panel').scrollWidth <= document.querySelector('.sheet-panel').clientWidth + 1 }));
    await page.click('#cmpSeg [data-v="1"]'); await page.waitForTimeout(300);
    const all = await page.evaluate(() => document.querySelectorAll('#sheetBody .cmp-r').length);
    check('身體頁有歷年比較卡、異常清單標「長期／不可逆」；比較表 3 欄、不同醫院提示、手機不橫向捲動、「全部」比「重點」多', ui.card && ui.tag && sh.cols === 3 && sh.banner && sh.w && all > sh.rows && sh.rows > 0, JSON.stringify({ ...ui, ...sh, all }));
    await page.close();
  }

  // =============== 6i. 檢查輪替（上次做的年份＋間隔；自費大項一年一項） ===============
  {
    const Y = new Date().getFullYear();
    page = await newPage({ members: [
      { id: 'r1', name: '五十', sex: 'm', birth: `${Y - 50}-01-01`, h: 170, w: 70, act: '1.375', goal: 'keep', life: { smoke: 'never', betel: 'never', alc: 'none', ldct: Y - 3 }, fh: { ca: [], chr: [], early: false } },
      { id: 'r2', name: '胃癌家族', sex: 'f', birth: `${Y - 52}-06-01`, h: 158, w: 55, act: '1.375', goal: 'keep', life: { smoke: 'never', betel: 'never', alc: 'none' }, fh: { ca: ['stomach'], chr: [], early: false } },
      { id: 'r3', name: '四十二', sex: 'm', birth: `${Y - 42}-03-15`, h: 172, w: 73, act: '1.375', goal: 'keep', life: { smoke: 'never', betel: 'never', alc: 'none', colono: Y - 10 }, fh: { ca: [], chr: [], early: false } }], active: 'r1',
      labs: { r1: [{ id: 'a', t: `${Y - 1}-05-01`, hospital: '', items: { glu: { v: 90 }, iop: { v: 14 } }, extra: [] }], r2: [], r3: [] } });
    const ro = await page.evaluate(() => { const f = id => { const m = MEM.find(x => x.id === id), r = rotation(m), at = y => (r.years.find(z => z.y === y)?.items || []).map(o => o.k + (o.need ? '' : '?') + (o.moved ? '>' : '')).join(); return { r, at, plan: yearPlan(m).items.map(o => o.t).join('｜') } };
      const Y = new Date().getFullYear(), a = f('r1'), b = f('r2'), c = f('r3');
      return { a0: a.at(Y), a1: a.at(Y + 1), done: a.r.done.map(d => d.k + d.y + d.src).join(), b0: b.at(Y), pair: b.r.pair, cLater: c.r.later.map(o => o.k + o.due).join(), cPlan: c.plan } });
    check('50 歲：大腸鏡（可考慮自費）排今年；3 年前做過的自費肺部 CT 同年到期 → 輪到明年；公費糞便潛血、幽門桿菌今年', /colono\?/.test(ro.a0) && !/ldct/.test(ro.a0) && /ldct\?>/.test(ro.a1) && /fobt/.test(ro.a0) && /hp/.test(ro.a0), `${Y}:${ro.a0}｜${Y + 1}:${ro.a1}`);
    check('做過的檢查：報告的眼壓、自填的肺部 CT 都算；眼科去年做過 → 不排今年', /eye\d{4}報告/.test(ro.done) && new RegExp(`ldct${Y - 3}自填`).test(ro.done) && !/eye/.test(ro.a0), ro.done);
    check('胃癌家族史：胃鏡和大腸鏡排同一年 → 提示同一次麻醉', /gastro\?/.test(ro.b0) && /colono\?/.test(ro.b0) && ro.pair, ro.b0);
    check('42 歲一般風險、10 年前做過大腸鏡：要等 45 歲（不是「今年該做」）', new RegExp(`colono${Y + 3}`).test(ro.cLater) && /大腸鏡：下次 \d{4} 年/.test(ro.cPlan) && !/大腸鏡（今年該做了）/.test(ro.cPlan), ro.cLater + '｜' + (ro.cPlan.match(/大腸鏡[^｜]*/) || [''])[0]);
    await page.click('#nav button[data-v="body"]'); await page.waitForTimeout(300);
    const card = await page.evaluate(() => ({ vis: !$('#rotCard').hidden, txt: $('#rotBody').textContent }));
    check('身體頁有「檢查輪替（未來 3 年）」卡：今年、輪替標示、做過的年份', card.vis && /（今年）/.test(card.txt) && /輪替：原本/.test(card.txt) && /做過：/.test(card.txt), card.txt.slice(0, 60));
    await page.evaluate(() => openMemberEdit('r1', 'fh')); await page.waitForTimeout(300);
    await page.fill('#m-gastro', String(Y - 2)); await page.fill('#m-ldct', '1800'); await page.click('#m-save'); await page.waitForTimeout(300);
    const lf = await page.evaluate(() => ({ g: MEM.find(x => x.id === 'r1').life.gastro, l: MEM.find(x => x.id === 'r1').life.ldct, cb: JSON.stringify(cleanBackup({ members: [{ id: 'q', name: 'x', sex: 'm', birth: '1990-01-01', life: { gastro: '<img>', ldct: 2020.7, colono: 'x' } }] }).mem[0].life) }));
    check('「⚙️ → 家族史」可填上次胃鏡、肺部 CT 年份（不合理的年份不存）；備份檔會清洗', lf.g === Y - 2 && lf.l === '' && /"gastro":""/.test(lf.cb) && /"ldct":2020/.test(lf.cb) && /"colono":""/.test(lf.cb), JSON.stringify(lf));
    await page.close();
  }

  // =============== 6j. 手錶指數（近 7 天平均）：判讀、AI 匯入、運動心率、AI 醫生、備份 ===============
  {
    page = await newPage({ members: [{ id: 'w', name: '錶', sex: 'm', birth: `${new Date().getFullYear() - 42}-03-15`, h: 172, w: 73, act: '1.375', goal: 'keep' }, { id: 'x', name: '另一位', sex: 'f', birth: '1990-01-01', h: 160, w: 52, act: '1.375', goal: 'keep' }], active: 'w',
      watch: { w: [{ id: 'w0', t: '2026-09-01', rhr: 70, steps: 8000 }], x: [{ id: 'x0', t: '2026-09-01', rhr: 60 }] } });
    const ev = await page.evaluate(() => { const m = me(), E = r => watchEval(r, m).map(i => `${i.k}:${i.lv}${i.dept ? '@' + i.dept : ''}`).join();
      return { a: E({ rhr: 91, hrv: 18, spo2: 93, sleep: 5.6, steps: 3500, exmin: 12, vo2: 33.1, resp: 16, sbp: 136, dbp: 84 }), b: E({ rhr: 105, spo2: 89, sleep: 4.8, vo2: 44, afib: true }), c: E({ rhr: 42, sleep: 7.5, steps: 9000, exmin: 30, vo2: 44 }),
        bp: watchEval({ sbp: 136, dbp: 84 }, m)[0]?.val, s5: watchEval({ sleep: 4.8 }, m)[0]?.msg, cat: [vo2Cat(33.1, 42, 'm'), vo2Cat(44, 42, 'm'), vo2Cat(30, 55, 'f')],
        st: [E({ stress: 33, rhr: 63, sleep: 6.9 }), E({ stress: 55 })], pw: promptWatch() } });
    check('手錶判讀：心率 91、HRV 18、血氧 93、睡 5.6 h、3500 步、運動不足、VO₂max 差、手錶血壓 136/84 都標注意', ev.a === 'w_rhr:1,w_hrv:1,w_spo2:1,w_sleep:1,w_steps:1,w_exmin:1,w_vo2:1,w_bp:1' && ev.bp === '136/84', ev.a);
    check('靜止心率 >100、血氧 <90、心律不整 → 異常並建議心臟內科／胸腔科；VO₂max 44（42 歲男）良好不提醒；睡不到 5 小時加重提醒', /w_rhr:2@心臟內科/.test(ev.b) && /w_spo2:2@胸腔內科/.test(ev.b) && /w_afib:2@心臟內科/.test(ev.b) && !/w_vo2/.test(ev.b) && /5 小時/.test(ev.s5), ev.b);
    check('心率 42 只提醒（運動員常見、不叫你掛號）；VO₂max 分級（42 歲男）：33.1 差、44 優秀；55 歲女性 30 良好', ev.c === 'w_rhr:1' && ev.cat.join() === '1,4,3', `${ev.c}｜${ev.cat}`);
    check('平均壓力：33（小米截圖）＋安靜心率 63＋睡 6.9 小時都不提醒；平均 ≥50 提醒', ev.st[0] === '' && ev.st[1] === 'w_stress:1', JSON.stringify(ev.st));
    check('手錶提示詞：靜止心率要用「安靜心率」不是平均心率；心率區間加總燃脂以上當運動時間；睡眠分數、深淺睡比例不用填', /安靜心率/.test(ev.pw) && /不要填平均心率/.test(ev.pw) && /燃脂＋有氧＋無氧＋極限，不含熱身/.test(ev.pw) && /不用填：睡眠分數、睡眠結構/.test(ev.pw) && /"stress":null/.test(ev.pw), '');
    await page.click('#nav button[data-v="body"]'); await page.click('#v-body [data-addwatch]'); await page.waitForTimeout(400); await page.click('details.box.ai > summary');
    await page.fill('#ai-in', '```json\n' + JSON.stringify({ type: 'nutricore.watch', v: 1, date: '115/10/12', device: 'Apple Watch', rhr: 91, hrv: 18, stress: 33, spo2: 0.93, sleep: 5.6, steps: 3500, exmin: null, vo2: 33.1, resp: null, kcal: 380, sbp: null, dbp: null, afib: true }) + '\n```');
    await page.click('#ai-go'); await page.waitForTimeout(200);
    const fw = await page.evaluate(() => ({ msg: $('#ai-msg').textContent, t: $('#w-t').value, o2: $('#w-spo2').value, st: $('#w-stress').value, af: $('#w-afib').classList.contains('on'), dev: $('#w-device').value }));
    check('手錶 AI 匯入：民國年日期、血氧 0.93 → 93、平均壓力、心律不整勾選、裝置名稱', fw.t === '2026-10-12' && fw.o2 === '93' && fw.st === '33' && fw.af && fw.dev === 'Apple Watch' && /已填入 9 項/.test(fw.msg), JSON.stringify(fw));
    await page.click('#wSave'); await page.waitForTimeout(500);
    const after = await page.evaluate(() => { closeSheet(); const m = me(), P = fitPlan(m);
      return { recs: watchOf(m).length, issue: [...document.querySelectorAll('#issueList .issue')].some(e => /手錶/.test(e.textContent) && /心律不整提醒/.test(e.textContent)), dept: /心臟內科/.test($('#deptList').textContent),
        score: $('#bodyScore').textContent, hr: `${P.hrRest}|${P.hrSrc}|${P.F.has('heart')}`, warn: P.W.map(x => x.t).join('／'), ai: aiPrompt(m, { topic: 'all', fh: true, scale: true, watch: true }) } });
    check('存檔後：身體頁異常清單有手錶項目、心律不整 → 建議掛心臟內科；手錶不列入分數', after.recs === 2 && after.issue && after.dept && !/手錶/.test(after.score), JSON.stringify({ ...after, ai: '', warn: '' }));
    check('運動教練：心率區間改用手錶靜止心率、心律不整先限制強度；步數與 VO₂max 給建議', after.hr === '91|手錶 7 天平均|true' && /步/.test(after.warn) && /VO₂max/.test(after.warn), after.hr + '｜' + after.warn.slice(0, 80));
    check('AI 醫生附上手錶（近 7 天平均、VO₂max 同齡分級、異常說明）', /【手錶 2026-10-12（近 7 天平均、Apple Watch）】/.test(after.ai) && /同齡差/.test(after.ai) && /- 心律不整提醒/.test(after.ai), (after.ai.match(/【手錶[^\n]*/) || [''])[0].slice(0, 80));
    await page.click('#v-body .subnav [data-sub="rec"]'); await page.waitForTimeout(150); await page.click('#recSeg [data-v="watch"]'); await page.waitForTimeout(200);
    const tab = await page.evaluate(() => ({ rows: document.querySelectorAll('#recList [data-wid]').length, spark: document.querySelectorAll('#recList .stat').length }));
    check('身體頁「手錶」分頁：趨勢卡＋紀錄列表', tab.rows === 2 && tab.spark === 3, JSON.stringify(tab));
    const cb = await page.evaluate(() => cleanBackup({ members: [{ id: 'w', name: 'x', sex: 'm', birth: '1984-01-01' }], watch: { w: [{ id: 'a1', t: '2026-10-12', rhr: 61, spo2: 140, steps: '8000', device: '<b>Garmin</b>', afib: 'yes', evil: '<img src=x>' }, { id: 'bad id', t: '2026-10-12', rhr: 60 }, { id: 'a2', t: '10/12', rhr: 60 }] } }).watch);
    check('備份檔的手錶資料會清洗：只留已知欄位與合理數值、afib 只認 true、壞 id／日期丟掉', JSON.stringify(cb) === '{"w":[{"id":"a1","t":"2026-10-12","rhr":61,"steps":8000,"device":"<b>Garmin</b>"}]}', JSON.stringify(cb));
    await page.evaluate(() => { openMemberEdit('x'); }); await page.waitForTimeout(300); await page.click('#m-del'); await page.waitForTimeout(300);
    const del = await page.evaluate(() => ({ x: 'x' in WATCH, store: 'x' in JSON.parse(localStorage.getItem('nc_watch')) }));
    check('刪除成員時，手錶資料一起刪', !del.x && !del.store, JSON.stringify(del));
    await page.close();
  }

  // =============== 6k. 影像報告附帶發現（LDCT 醫師總評：Lung-RADS 1 ＋ 肋膜增厚 ＋ 冠狀動脈鈣化） ===============
  {
    page = await newPage({ members: [{ id: 'k', name: '測', sex: 'm', birth: '1984-03-15', h: 172, w: 73, act: '1.375', goal: 'auto' }], active: 'k' });
    await page.click('#nav button[data-v="body"]'); await page.click('#v-body [data-addlab]'); await page.waitForTimeout(400); await page.click('details.box.ai > summary');
    const note = '無明顯肺結節，肺癌篩檢分數(Lung-RADS)1級，建議定期追蹤。雙側肺尖肋膜增厚，建議胸腔科門診追蹤。冠狀動脈鈣化，建議心臟科門診追蹤。';
    await page.fill('#ai-in', JSON.stringify({ type: 'nutricore.lab', v: 1, date: '2025-09-01', hospital: '臺安醫院', items: { ldct: { value: 'Lung-RADS 1（陰性）', note } }, extra: [] }));
    await page.click('#ai-go'); await page.waitForTimeout(200); await page.click('#lSave'); await page.waitForTimeout(500);
    const ct = await page.evaluate(() => { const m = me(), L = labsOf(m)[0], ev = labEval(L, m), P = yearPlan(m).items, N = nutriPlan(m), F = fitPlan(m), R = rotation(m);
      return { ref: L.items.ldct.ref, ev: ev.map(i => `${i.k}:${i.lv}${i.dept ? '@' + i.dept : ''}`).join(), rv: (revOf('img_cac') || [])[0], plan: P.filter(o => o.pr <= 2).map(o => `${o.pr}${o.t}`).join('｜'),
        nutri: N.F.map(f => f.t).join(), heart: dietMode(m).heart, fit: F.W.map(x => x.t).join('／'), rot: R.never.map(o => o.k + ':' + o.why.slice(0, 10)).join(), detail: (openLabDetail(L.id), $('#sheetBody').textContent) } });
    check('LDCT 醫師總評整段保留（不再截在 60 字）', /冠狀動脈鈣化，建議心臟科門診追蹤/.test(ct.ref), ct.ref.slice(-24));
    check('Lung-RADS 1 正常，但附帶發現要判讀：冠狀動脈鈣化 → 異常（心臟內科）、肋膜增厚 → 注意（胸腔內科）', ct.ev === 'img_pleura:1@胸腔內科,img_cac:2@心臟內科', ct.ev);
    check('冠狀動脈鈣化：標長期、今年健檢優先看心臟內科、營養師加「降壞膽固醇」與護心、運動提醒高強度前先問心臟科、不用再為了有沒有鈣化去照', ct.rv === 'perm' && /1心臟內科：冠狀動脈有鈣化/.test(ct.plan) && /2胸腔內科：影像附帶發現追蹤/.test(ct.plan) && /降壞膽固醇/.test(ct.nutri) && ct.heart && /冠狀動脈有鈣化/.test(ct.fit) && /cac:影像已看到/.test(ct.rot), `${ct.plan}｜${ct.rot}`);
    check('體檢分析頁看得到兩個附帶發現與報告原句', /冠狀動脈鈣化/.test(ct.detail) && /肋膜增厚/.test(ct.detail) && /LDCT附帶發現/.test(ct.detail), '');
    const alt = await page.evaluate(() => { const m = me(), E = rec => labEval(rec, m).map(i => `${i.k}:${i.lv}`).join();
      return { neg: E({ items: { ldct: { v: 'Lung-RADS 1（陰性）', ref: '原文：未見明顯冠狀動脈鈣化，無肋膜增厚' } }, extra: [] }),
        extra: E({ items: {}, extra: [{ name: '冠狀動脈鈣化', value: '有，建議心臟科門診追蹤' }] }),
        score: E({ items: { cac: { v: 35 }, ldct: { v: 'Lung-RADS 1（陰性）', ref: '原文：冠狀動脈鈣化' } }, extra: [] }),
        cxrOpt: E({ items: { cxr: { v: '輕微變化（如主動脈鈣化、陳舊病灶）' } }, extra: [] }),
        cxrOk: E({ items: { cxr: { v: '輕微變化（如主動脈鈣化、陳舊病灶）', ref: '原文：肺部無明顯異常，主動脈弓鈣化' } }, extra: [] }) } });
    check('否定句（未見冠狀動脈鈣化、無肋膜增厚）不算；寫在其他項目也會對到、不重複；有鈣化分數時以分數為準', alt.neg === '' && alt.extra === 'img_cac:2' && alt.score === 'cac:1', JSON.stringify(alt));
    check('胸部 X 光：選項名稱裡的「如主動脈鈣化」不算發現；X 光判正常但原文有主動脈弓鈣化 → 另外標注意', alt.cxrOpt === 'cxr:1' && alt.cxrOk === 'img_aorta:1', `${alt.cxrOpt}｜${alt.cxrOk}`);
    await page.evaluate(() => closeSheet()); await page.click('#v-body [data-addlab]'); await page.waitForTimeout(400); await page.click('details.box.ai > summary');
    await page.fill('#ai-in', JSON.stringify({ type: 'nutricore.lab', v: 1, date: '2025-09-01', items: { cac: { value: '輕度鈣化' } } }));
    await page.click('#ai-go'); await page.waitForTimeout(200);
    const tx = await page.evaluate(() => ({ cac: $('#l-cac').value, ex: lExtra.map(e => `${e.name}=${e.value}`).join() }));
    check('數值項目讀到文字（冠狀動脈鈣化分數：輕度鈣化）→ 放進其他項目，不會默默丟掉', tx.cac === '' && /輕度鈣化/.test(tx.ex), JSON.stringify(tx));
    // 多頁報告分次匯入：第二次匯入不會清掉第一次的數值
    await page.fill('#ai-in', JSON.stringify({ type: 'nutricore.lab', v: 1, date: '2025-09-01', items: { glu: { value: 105 } } })); await page.click('#ai-go'); await page.waitForTimeout(150);
    await page.fill('#ai-in', JSON.stringify({ type: 'nutricore.lab', v: 1, date: '2025-09-01', items: { ldct: { value: 'Lung-RADS 1（陰性）', note: '冠狀動脈鈣化，建議心臟科門診追蹤。' } } })); await page.click('#ai-go'); await page.waitForTimeout(150);
    const mg2 = await page.evaluate(() => ({ glu: $('#l-glu').value, ldct: $('#l-ldct').value, rt: $('#lr-ldct').value, ex: lExtra.length }));
    check('多頁報告分次匯入：第二頁不會清掉第一頁（血糖還在）、影像原文顯示在「報告原文」欄、其他項目保留', mg2.glu === '105' && /Lung-RADS 1/.test(mg2.ldct) && /冠狀動脈鈣化/.test(mg2.rt) && mg2.ex === 1, JSON.stringify(mg2));
    await page.evaluate(() => closeSheet());
    // 舊版匯入（原文被截在 63 字）→ 分析頁提示；在「報告原文」貼上完整總評 → 判讀到冠狀動脈鈣化
    await page.evaluate(n => { const m = me(); (LABS[m.id] = LABS[m.id] || []).push({ id: 'old', t: '2025-09-01', hospital: '舊', items: { glu: { v: 92 }, ldct: { v: 'Lung-RADS 1（陰性）', ref: ('原文：醫師總評：' + n).slice(0, 63) } }, extra: [] }); S.set('labs', LABS); renderAll(); openLabDetail('old') }, note);   // 舊版截斷剛好切在「冠狀」
    const hint = await page.evaluate(() => ({ hint: /原文可能被截斷/.test($('#sheetBody').textContent), cac: labEval(labsOf(me()).find(r => r.id === 'old'), me()).some(i => i.k === 'img_cac') }));
    await page.click('#ld-edit'); await page.waitForTimeout(300); await page.fill('#lr-ldct', note); await page.click('#lSave'); await page.waitForTimeout(400);
    const fixed = await page.evaluate(() => { const r = labsOf(me()).find(x => x.id === 'old'); return { glu: r.items.glu?.v, ev: labEval(r, me()).map(i => i.k).join() } });
    check('舊版匯入原文被截斷 → 分析頁提示；編輯時在「報告原文」貼上完整總評 → 判讀到冠狀動脈鈣化，其他數值不受影響', hint.hint && !hint.cac && fixed.glu == 92 && /img_cac/.test(fixed.ev) && /img_pleura/.test(fixed.ev), JSON.stringify({ ...hint, ...fixed }));
    await page.close();
  }

  // =============== 6l. 醫院健檢手冊對照：幽門桿菌抗體、腫瘤標記跨醫院、eGFR 每年下降、新增項目 ===============
  {
    page = await newPage({ members: [{ id: 'h', name: '測', sex: 'm', birth: '1984-03-15', h: 172, w: 73, act: '1.375', goal: 'auto' }], active: 'h' });
    await page.click('#nav button[data-v="body"]'); await page.click('#v-body [data-addlab]'); await page.waitForTimeout(400); await page.click('details.box.ai > summary');
    await page.fill('#ai-in', JSON.stringify({ type: 'nutricore.lab', v: 1, date: '2026-09-14', items: { '幽門螺旋桿菌抗體(H.pylori Ab)': { value: '陽性' }, 'β-HCG': { value: 1.2, unit: 'mIU/mL' }, 'CK-MB': { value: 18, unit: 'U/L' }, 'CPK肌酸磷化酶': { value: 150, unit: 'U/L' } } }));
    await page.click('#ai-go'); await page.waitForTimeout(200);
    const hf = await page.evaluate(() => ({ hpab: $('#l-hpab').value, hp: $('#l-hp').value, bhcg: $('#l-bhcg').value, ckmb: $('#l-ckmb').value, ck: $('#l-ck').value }));
    await page.click('#lSave'); await page.waitForTimeout(400);
    const hpr = await page.evaluate(() => { const m = me(), L = labsOf(m)[0], P = yearPlan(m).items.map(o => o.t).join('｜');
      const L2 = { items: { hp: { v: '陽性' } }, extra: [] }; return { ev: labEval(L, m).map(i => `${i.k}:${i.lv}`).join(), plan: P, hpOnly: labEval(L2, m).map(i => `${i.k}:${i.lv}`).join() } });
    check('幽門桿菌「抗體」對到抗體項目（不是現在感染）：判注意、建議先用碳 13 呼氣或糞便抗原確認，不直接叫你除菌；呼氣／糞便抗原陽性才判異常', hf.hpab === '陽性' && hf.hp === '' && hpr.ev === 'hpab:1' && /碳 13 呼氣試驗或糞便抗原確認/.test(hpr.plan) && !/除菌治療/.test(hpr.plan) && hpr.hpOnly === 'hp:2', JSON.stringify({ hf, ev: hpr.ev }));
    check('手冊上的項目都對得到：β-HCG、CK-MB、CPK 肌酸磷化酶', hf.bhcg === '1.2' && hf.ckmb === '18' && hf.ck === '150', JSON.stringify(hf));
    const cm = await page.evaluate(() => { const m = me(), Y = '2026';
      const mk = (a, b) => { LABS[m.id] = [{ id: 'a', t: '2024-09-01', hospital: a, items: { cea: { v: 3.0 }, egfr: { v: 110 } }, extra: [] }, { id: 'b', t: '2026-09-01', hospital: b, items: { cea: { v: 4.8 }, egfr: { v: 92 } }, extra: [] }]; const c = cmpData(m), R = k => c.rows.find(r => r.k === k); return { cea: `${R('cea').vd}|${R('cea').why}`, egfr: `${R('egfr').vd}|${R('egfr').why}` } };
      const diff = mk('甲醫院', '乙醫院'), same = mk('甲醫院', '甲醫院');
      LABS[m.id] = [{ id: 'a', t: '2023-09-01', hospital: '甲', items: { egfr: { v: 98 } }, extra: [] }, { id: 'b', t: '2026-09-01', hospital: '甲', items: { egfr: { v: 95 } }, extra: [] }];
      const slow = cmpData(m).rows.find(r => r.k === 'egfr').vd;
      return { diff, same, slow, bp: LABK.sbp.hi } });
    check('腫瘤標記：不同醫院（試劑）數值不能比 → 不標變差趨勢；同一家醫院接近門檻才標', /^flat\|不同醫院（試劑）/.test(cm.diff.cea) && /^trend/.test(cm.same.cea), `${cm.diff.cea}｜${cm.same.cea}`);
    check('eGFR 兩年 110 → 92（每年降 9）標變差趨勢並建議複驗；三年只降 3（每年 1）屬正常老化', /^trend\|每年下降約 9/.test(cm.same.egfr) && /同一家醫院/.test(cm.diff.egfr) && cm.slow === 'flat', `${cm.same.egfr}｜${cm.slow}`);
    const tx = await page.evaluate(() => [txtAbn('子宮肌瘤 2 公分'), txtAbn('卵巢囊腫'), txtAbn('無結石'), txtAbn('膽結石')].map(Number).join(''));
    check('文字判讀補上子宮肌瘤、結石；血壓說明提到舊標準 140/90（醫院手冊）', tx === '1101' && /舊標準是 140\/90/.test(cm.bp), tx);
    await page.close();
  }

  // =============== 6m. 手動記錄運動、症狀自我評估 ===============
  {
    page = await newPage({ members: [{ id: 'e', name: '測', sex: 'm', birth: '1984-03-15', h: 172, w: 70, act: '1.375', goal: 'cut' }], active: 'e',
      labs: { e: [{ id: 'c', t: '2025-09-01', hospital: '臺安', items: { ldct: { v: 'Lung-RADS 1（陰性）', ref: '原文：No lung nodule. Mild bilateral apical pleural thickness. Coronary artery calcification.' } }, extra: [] }] } });
    await page.click('#nav button[data-v="fit"]'); await page.waitForTimeout(300); await page.click('#fitBody [data-exlog]'); await page.waitForTimeout(300);
    await page.click('#xl-k [data-k="swim"]'); await page.fill('#xl-min', '45'); await page.click('#xl-save'); await page.waitForTimeout(300);
    await page.click('#fitBody [data-exlog]'); await page.waitForTimeout(300); await page.click('#xl-k [data-k="walk"]'); await page.click('#xl-int [data-v="easy"]'); await page.click('[data-xm="30"]'); await page.click('#xl-save'); await page.waitForTimeout(300);
    const ex = await page.evaluate(() => { const L = exlogOf(me()), W = exWeek(me(), mondayOf(ymd(new Date()))); return { n: L.length, kcal: L.find(r => r.k === 'swim')?.kcal, aer: W.aer, all: W.all, card: /本週實際完成/.test($('#fitBody').textContent) && /游泳 45 分鐘/.test($('#fitBody').textContent), ai: aiPrompt(me(), { topic: 'all' }) } });
    check('手動記錄運動：游泳 45 分（中等）算進每週有氧、散步 30 分（輕鬆）只記錄不算；估算熱量；AI 醫生附上近 7 天紀錄', ex.n === 2 && ex.kcal > 200 && ex.aer === 45 && ex.all === 75 && ex.card && /【近 7 天運動紀錄】/.test(ex.ai), JSON.stringify({ ...ex, ai: '' }));
    const id = await page.evaluate(() => exlogOf(me()).find(r => r.k === 'walk').id); await page.click(`#fitBody [data-exrm="${id}"]`); await page.waitForTimeout(300);
    await page.evaluate(() => { openTimer(0); $('#tmLog').hidden = false }); await page.click('#tmLog'); await page.waitForTimeout(300);
    const ex2 = await page.evaluate(() => ({ n: exlogOf(me()).length, cb: JSON.stringify(cleanBackup({ members: [{ id: 'e', name: 'x', sex: 'm', birth: '1984-01-01' }], exlog: { e: [{ id: 'a', d: '2026-10-12', k: 'evil', min: 9999, int: 'x', note: '<b>hi</b>', kcal: 'x' }, { id: 'b', d: 'bad', k: 'walk', min: 30 }] } }).exlog) }));
    check('刪除一筆、計時完成一鍵記錄；備份檔的運動紀錄會清洗', ex2.n >= 2 && ex2.cb === '{"e":[{"id":"a","d":"2026-10-12","k":"other","min":600,"int":"mod","note":"<b>hi</b>"}]}', JSON.stringify(ex2));
    await page.evaluate(() => closeSheet()); await page.click('#nav button[data-v="body"]'); await page.waitForTimeout(200); await page.click('#v-body [data-sym]'); await page.waitForTimeout(300);
    await page.click('[data-sk="chest"]'); await page.waitForTimeout(150);
    const s1 = await page.evaluate(() => $('#sym-out').textContent);
    await page.click('#sym-out [data-rf="chest:0"]'); await page.waitForTimeout(150);
    const s2 = await page.evaluate(() => ({ t: $('#sym-out').textContent, now: !!$('#sym-out .banner') }));
    check('症狀：胸悶 → 心臟內科、心電圖、預設 1–3 天內就醫，並對照報告提到冠狀動脈鈣化；勾危險徵兆（悶痛超過 5 分鐘）→ 立即就醫', /心臟內科/.test(s1) && /心電圖/.test(s1) && /冠狀動脈鈣化/.test(s1) && /儘快：1–3 天內/.test(s1) && s2.now && /立即就醫/.test(s2.t), s1.slice(0, 80));
    await page.click('[data-sk="chest"]'); await page.click('[data-sk="head"]'); await page.click('#sym-dur [data-v="long"]'); await page.waitForTimeout(150);
    const s3 = await page.evaluate(() => $('#sym-out').textContent);
    await page.click('#sym-ai'); await page.waitForTimeout(300);
    const s4 = await page.evaluate(() => ({ q: $('#ai-q').value, pv: aiPrompt(me(), aiO) }));
    check('頭痛超過 2 週 → 從「觀察」升為「門診」；帶症狀問 AI 醫生會預先填好問題', /安排門診/.test(s3) && /頭痛（超過 2 週）/.test(s4.q) && /頭痛/.test(s4.pv), s4.q.slice(0, 40));
    const ev = await page.evaluate(() => labEval(labsOf(me())[0], me()).map(i => i.k).join());
    check('英文 LDCT 報告（pleural thickness、coronary artery calcification）也判讀得到', /img_pleura/.test(ev) && /img_cac/.test(ev), ev);
    await page.close();
  }

  // =============== 6n. 運動紀錄加進飲食熱量（只補超過活動量的淨消耗；減脂補一半） ===============
  {
    page = await newPage({ members: [{ id: 'q', name: '測', sex: 'm', birth: '1984-03-15', h: 172, w: 70, act: '1.375', goal: 'cut' }], active: 'q' });
    const r = await page.evaluate(() => { const m = me(), d = ymd(new Date()), c = calc(m), add = rs => { EXLOG[m.id] = rs.map((x, i) => ({ id: 'x' + i, d, ...x })); S.set('exlog', EXLOG); return exBonus(m, d) };
      const K = s => s.slots.reduce((t, sl) => t + sl.t.reduce((a, x) => a + x.k, 0) * sl.x, 0), p0 = plan(d, m), b0 = p0.tgt, k0 = K(p0), cut = add([{ k: 'swim', min: 60, int: 'mod' }]), p1 = plan(d, m);   // 同一天、同菜色比較（份量以 1/4 份為單位，加的不多時只用文字提醒）
      renderAll(); const menu = $('#menuSum').textContent, dash = $('#energyCard').textContent;
      const small = add([{ k: 'walk', min: 15, int: 'easy' }]); m.goal = 'keep'; const keep = add([{ k: 'swim', min: 60, int: 'mod' }]); m.act = '1.2'; const sit = add([{ k: 'swim', min: 60, int: 'mod' }]); m.act = '1.375'; m.goal = 'cut';
      const other = exBonus(m, addDays(d, -1));
      return { target: Math.round(c.target), b0: Math.round(b0), cut, tgt: Math.round(p1.tgt), kMore: K(p1) >= k0, menu: /可多吃約 150 kcal/.test(menu) && /減脂只補回一半/.test(menu), dash: /今天運動後可多吃約 150 kcal/.test(dash), small: `${small.add}|${exBonusTxt(small, c).includes('不用多吃')}`, keep: keep.add, sit: sit.add, other: other.add } });
    check('游泳 60 分（中等，MET 6）：淨消耗 368、扣掉輕度活動量已算的 61 → 減脂補一半 = 今天可多吃 150 kcal，菜單目標跟著加（份量以 1/4 份為單位、不會變少），總覽和飲食頁都有說明', r.cut.net === 368 && r.cut.base === 61 && r.cut.add === 150 && r.tgt === r.target + 150 && r.b0 === r.target && r.kMore && r.menu && r.dash, JSON.stringify({ ...r, cut: [r.cut.net, r.cut.base, r.cut.add] }));
    check('散步 15 分（輕鬆）在活動量內 → 不用多吃；維持目標補 75%（230）、久坐活動量全部算超出（280）；只影響當天', r.small === '0|true' && r.keep === 230 && r.sit === 280 && r.other === 0, JSON.stringify(r));
    await page.close();
  }

  // =============== 6o. 手錶活動消耗校正每日消耗（TDEE）；運動加吃扣掉手錶平均已含的運動 ===============
  {
    const td = new Date(), Y = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    page = await newPage({ members: [{ id: 'q', name: '測', sex: 'm', birth: '1984-03-15', h: 172, w: 70, act: '1.375', goal: 'keep' }], active: 'q', watch: { q: [{ id: 'w1', t: Y(1), kcal: 500, exmin: 30, rhr: 62 }] } });
    const r = await page.evaluate(([y1, y3, y20]) => { const m = me(), set = rs => { WATCH[m.id] = rs; S.set('watch', WATCH) }, T = () => Math.round(calc(m).tdee);
      const c = calc(m), a = { bmr: c.bmr, act: Math.round(c.tdeeAct), w500: T(), tag: '' }; renderAll();
      a.tag = $('#coreStats').textContent.includes('手錶校正'); a.card = /每日消耗已用手錶校正/.test($('#energyCard').textContent) && /只採 75%/.test($('#energyCard').textContent) && /BMR × 1\.1 ＋ 手錶活動消耗/.test($('#energyCard').textContent);
      const d = ymd(new Date()); EXLOG[m.id] = [{ id: 'e1', d, k: 'swim', min: 60, int: 'mod' }]; S.set('exlog', EXLOG); const b1 = exBonus(m, d); a.b1 = `${b1.base}|${b1.add}|${b1.src}|${exBonusTxt(b1, calc(m)).includes('手錶平均已算進')}`;
      set([{ id: 'w1', t: y1, kcal: 500 }]); EXLOG[m.id].push({ id: 'e2', d: y3, k: 'swim', min: 60, int: 'mod' }); S.set('exlog', EXLOG); const b2 = exBonus(m, d); a.b2 = `${b2.base}|${b2.add}`;
      set([{ id: 'w1', t: y1, kcal: 2100 }]); a.total = T(); set([{ id: 'w1', t: y1, kcal: 20 }]); a.low = T();
      set([{ id: 'w1', t: y20, kcal: 500 }]); a.stale = T(); renderAll(); a.staleTxt = /超過 14 天，沒拿來算/.test($('#energyCard').textContent) && !$('#coreStats').textContent.includes('手錶校正');
      set([{ id: 'w1', t: y1, rhr: 60 }, { id: 'w0', t: y3, kcal: 500 }]); a.older = T(); set([]); a.none = T(); return a }, [Y(1), Y(3), Y(20)]);
    check('手錶活動消耗 500（近 7 天平均）→ TDEE ＝ BMR × 1.1 ＋ 500 × 75%（取代活動量估算），總覽標「手錶校正」、熱量卡說明來源與打折', r.w500 === Math.round(r.bmr * 1.1 + 375) && r.w500 !== r.act && r.tag && r.card, JSON.stringify(r));
    check('填總卡路里（≥ BMR × 0.9）會先扣 BMR；活動太少下限 BMR × 1.2；超過 14 天沒更新改回活動量估算並提示；最新一筆沒填熱量就用較舊那筆', r.total === Math.round(r.bmr * 1.1 + (2100 - r.bmr) * .75) && r.low === Math.round(r.bmr * 1.2) && r.stale === r.act && r.staleTxt && r.older === r.w500 && r.none === r.act, JSON.stringify(r));
    check('有手錶時運動加吃：扣掉手錶每日運動 30 分（121 kcal）→ 游泳 60 分多吃 190；沒填運動分鐘就扣那 7 天運動紀錄平均（53）→ 240', r.b1 === '121|190|watch|true' && r.b2 === '53|240', `${r.b1}｜${r.b2}`);
    await page.close();
  }

  // =============== 6p. 危急值（今天就醫）、跟上一份比「新出現／也有」、正常不等於沒病、看診摘要圖 ===============
  {
    page = await newPage({ members: [{ id: 'c', name: '王小明', sex: 'm', birth: '1984-03-15', h: 172, w: 70, act: '1.375', goal: 'keep' }], active: 'c',
      labs: { c: [{ id: 'a1', t: '2025-09-01', items: { glu: { v: 92 }, ldl: { v: 135 }, k: { v: 4.2 }, hb: { v: 14 } }, extra: [] }, { id: 'a2', t: '2026-09-01', hospital: '測試醫院', items: { glu: { v: 112 }, ldl: { v: 140 }, k: { v: 6.8 }, hb: { v: 6.5 }, sbp: { v: 185 }, dbp: { v: 100 }, tsh: { v: 2 } }, extra: [] }] } });
    const r = await page.evaluate(() => { const m = me(), l = labsOf(m)[0], iss = labEval(l, m), dp = deptPlan(iss);
      return { crit: iss.filter(i => i.crit).map(i => i.k).sort().join(), lv: iss.filter(i => i.crit).every(i => i.lv === 3), k58: labEval({ items: { k: { v: 5.8 } } }, m).map(i => `${i.lv}${i.crit ? 'c' : ''}`).join(),
        dash: $('#critBox').textContent, kd: dp.find(d => d.d === '腎臟科')?.when || '', first: dp[0].crit, ai: aiPrompt(m, { topic: 'all', fh: true, scale: true, watch: true, self: true }) } });
    check('危急值：鉀 6.8、血紅素 6.5、收縮壓 185 → 「今天就醫」（不是 1–2 週內）；鉀 5.8 只是異常；總覽最上面紅色提醒、掛號排第一、AI 提示詞標「危急值」',
      r.crit === 'hb,k,sbp' && r.lv && r.k58 === '2' && /危急值：今天就要處理/.test(r.dash) && /鉀 K 6\.8/.test(r.dash) && /今天就醫/.test(r.kd) && r.first && /危急值（今天就要處理）/.test(r.ai), JSON.stringify({ ...r, ai: '', dash: r.dash.slice(0, 60) }));
    await page.click('#nav button[data-v="body"]'); await page.waitForTimeout(300);
    const b = await page.evaluate(() => ({ crit: $('#critBody').textContent, list: $('#issueList').textContent, top: $('#issueList .issue .lv')?.textContent }));
    check('身體頁：危急值橫幅、清單最上面是「危急」；跟 2025 年那份比：血糖「新出現」、LDL「2025 年也有」；附「正常不等於沒有疾病」說明',
      /危急值/.test(b.crit) && b.top === '危急' && /🆕 新出現/.test(b.list) && /2025 年(也有|嚴重|改善)/.test(b.list) && /不等於沒有疾病/.test(b.list), JSON.stringify({ top: b.top, list: b.list.slice(0, 200) }));
    const d = await page.evaluate(() => { openLabDetail('a1'); const t1 = $('#sheetBody').textContent; openLabDetail('a2'); return { old: !/新出現/.test(t1), cur: /危急值：今天就要處理/.test($('#sheetBody').textContent), note: /不等於沒有疾病/.test($('#sheetBody').textContent), btn: !!$('#sheetBody [data-summary]') } });
    check('報告詳情：最新那份有危急值橫幅、免責說明、看診摘要按鈕；最舊那份沒有更早的可比，不標「新出現」', d.old && d.cur && d.note && d.btn, JSON.stringify(d));
    const sm = await page.evaluate(async () => { const B = summaryBlocks(me()).map(b => b.s).join('\n'), cv = drawSummary(me()); window.__sh = null;
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true }); Object.defineProperty(navigator, 'share', { value: async o => { window.__sh = o }, configurable: true });
      await openSummary(); await new Promise(r => setTimeout(r, 300)); const img = $('#sheetBody img'); $('#sum-share').click(); await new Promise(r => setTimeout(r, 200));
      return { crit: /危急值/.test(B) && /鉀 K 6\.8/.test(B), neu: /新出現/.test(B), dept: /建議掛號/.test(B) && /今天就醫/.test(B), hist: /歷年 /.test(B), w: cv.width, h: cv.height, img: !!img, share: window.__sh && window.__sh.files?.[0]?.type === 'image/png' && !('title' in window.__sh) && !('text' in window.__sh) } });
    check('看診摘要圖：危急值、異常項目（含新出現、歷年數值）、建議掛號；1080 寬 PNG；分享只帶檔案（不帶 title，iOS 才不會丟檔）', sm.crit && sm.neu && sm.dept && sm.hist && sm.w === 1080 && sm.h > 600 && sm.img && sm.share, JSON.stringify(sm));
    check('提示訊息 VoiceOver 會唸（role=status、aria-live）', await page.evaluate(() => $('#toast').getAttribute('role') === 'status' && $('#toast').getAttribute('aria-live') === 'polite'));
    await page.close();
  }

  // =============== 6q. 自我檢測：中風、心臟、頭暈、記憶力 AD8、睡眠 STOP-Bang、憂鬱 PHQ-9、焦慮 GAD-7、肌少症 ===============
  {
    page = await newPage({ members: [{ id: 's', name: '王小明', sex: 'm', birth: '1970-06-01', h: 170, w: 80, neck: 42, act: '1.375', goal: 'keep', life: { smoke: 'current', betel: 'never', alc: 'none', ppd: 1, yrs: 20 } }], active: 's',
      labs: { s: [{ id: 'l1', t: '2026-08-01', items: { sbp: { v: 135 }, dbp: { v: 85 }, ldl: { v: 150 }, glu: { v: 95 } }, extra: [] }] } });
    const r = await page.evaluate(() => { const m = me(), R = (k, A) => selfRate(k, A, m), N = null;
      const st1 = R('stroke', [0, 0, 1, 0, 0, 0]), st0 = R('stroke', [0, 0, 0, 0, 0, 0]);
      const h1 = R('heart', [N, 1, 0, 0, N, 0, 0, 0, 0, N, 0, N, N, N, 0]), h2 = R('heart', [N, 0, 0, 0, N, 0, 0, 0, 0, N, 0, 72, 1, N, 0]), h3 = R('heart', [N, 0, 0, 0, N, 0, 0, 0, 1, N, 0, N, N, N, 0]);
      const d1 = R('dizzy', [N, 0, 0, 0, N, 0, 0, 0, 0, 0, N, 130, 80, 105, 72]), d2 = R('dizzy', [N, 0, 0, 0, N, 0, 2, 2, 0, 0, N, N, N, N, N]), d3 = R('dizzy', [N, 1, 0, 0, N, 3, 3, 0, 0, 0, N, N, N, N, N]);
      const ad = R('memory', [0, 0, 0, 1, 1, 1, 2, 1]), ad1 = R('memory', [1, 1, 1, 1, 1, 1, 1, 0]);
      const pre = SELF.sleep.pre(m, selfF(m)), sl = R('sleep', [1, 0, 0, 1, 0, 1, 1, 1]);
      const ph = R('phq9', [1, 1, 1, 1, 0, 0, 0, 0, 1]), ph0 = R('phq9', [0, 0, 0, 0, 0, 0, 0, 0, 0]), ga = R('gad7', [2, 2, 2, 2, 1, 1, 0]);
      const mu = R('muscle', [N, 1, 1, 1, 1, 0, N, 13]), mu0 = R('muscle', [N, 0, 0, 0, 0, 0, N, 9]);
      return { st1: `${st1.lv}|${/119/.test(st1.head)}|${st1.todo.some(t => /阿斯匹靈/.test(t))}`, st0: `${st0.lv}|${selfF(m) && ctxCV(m, selfF(m)).length}`,
        h1: h1.lv, h2: `${h2.lv}|${h2.find.some(t => /心房顫動/.test(t))}|${h2.exams.join()}`, h3: `${h3.lv}|${h3.find.some(t => /心絞痛/.test(t))}`,
        d1: `${d1.lv}|${d1.find.some(t => /耳石/.test(t))}|${d1.find.some(t => /姿勢性低血壓：站起來後收縮壓降 25、舒張壓降 8/.test(t))}|${d1.dept}`, d2: `${d2.lv}|${d2.find.some(t => /突發性耳聾/.test(t))}`, d3: d3.lv,
        ad: `${ad.lv}|${ad.sc}|${ad.dept}`, ad1: `${ad1.lv}|${ad1.sc}`, pre: JSON.stringify(pre), sl: `${sl.lv}|${sl.sc}`,
        ph: `${ph.lv}|${ph.sc}|${/1925/.test(ph.crisis)}`, ph0: `${ph0.lv}|${ph0.crisis}`, ga: `${ga.lv}|${ga.sc}|${ga.head}`, mu: `${mu.lv}|${mu.sc}|${mu.find.some(t => /13 秒/.test(t))}`, mu0: mu0.lv } });
    check('中風 BE FAST：任一項「有」→ 立刻 119、提醒別吃阿斯匹靈；都沒有但有高血壓、血脂、吸菸、BMI 27.7 → 「注意」並列出 4 個危險因子', r.st1 === '4|true|true' && r.st0 === '1|4', `${r.st1}｜${r.st0}`);
    check('心臟：胸痛 >5 分鐘 → 119；脈搏不規則 → 心房顫動、Holter；勞累胸悶休息就好 → 心絞痛儘快就醫', r.h1 === 4 && /^2\|true\|.*24 小時心電圖/.test(r.h2) && r.h3 === '3|true', `${r.h1}｜${r.h2}｜${r.h3}`);
    check('頭暈：翻身天旋地轉 <1 分 → 耳石、耳鼻喉科；量到姿勢性低血壓（130/80 → 105/72）；聽力突然變差 → 突發性耳聾 3 天內；合併講話不清 → 119', /^2\|true\|true\|耳鼻喉科/.test(r.d1) && r.d2 === '3|true' && r.d3 === 4, `${r.d1}｜${r.d2}｜${r.d3}`);
    check('記憶力 AD8：3 項改變 → 3/8 建議記憶門診；「不知道」不算分；1 項 → 觀察', r.ad === '2|3/8|神經內科或精神科（記憶門診）' && r.ad1 === '1|1/8', `${r.ad}｜${r.ad1}`);
    check('睡眠呼吸中止 STOP-Bang：依資料先選好血壓、BMI、年齡、頸圍、男性；打鼾＋這些 → 5/8 高風險', r.pre === '{"3":1,"4":0,"5":1,"6":1,"7":1}' && r.sl === '2|5/8', `${r.pre}｜${r.sl}`);
    check('憂鬱 PHQ-9：第 9 題只要不是「完全沒有」→ 至少「儘快」並顯示 1925 安心專線；全 0 沒有求助框；焦慮 GAD-7 10 分 → 中度', r.ph === '3|5/27|true' && r.ph0 === '0|' && r.ga === '2|10/21|焦慮症狀：中度', `${r.ph}｜${r.ph0}｜${r.ga}`);
    check('肌少症：SARC-F 4 分 → 疑似肌少症；椅子起立 13 秒（≥12）列出；都正常 → 低風險', r.mu === '2|4/10|true' && r.mu0 === 0, `${r.mu}｜${r.mu0}`);
    // 實際點畫面：底部「自我檢測」→ 記憶力 → 沒答就送出會提醒 → 作答 → 結果、存檔、整理給 AI
    await page.click('#nav button[data-v="body"]'); await page.click('#v-body .subnav [data-sub="self"]'); await page.waitForTimeout(300);
    const pg = await page.evaluate(() => ({ on: $('#v-body').classList.contains('on') && !$('#v-body .subp[data-sub="self"]').hidden, rows: document.querySelectorAll('#selfBody [data-self]').length, sym: !!$('#selfBody [data-sym]') }));
    await page.click('#selfBody [data-self="memory"]'); await page.waitForTimeout(300); await page.click('#sf-go'); await page.waitForTimeout(150);
    const t0 = await page.evaluate(() => $('#toast').textContent);
    for (let i = 0; i < 8; i++) await page.click(`#sf-qs [data-qi="${i}"][data-oj="${i < 3 ? 0 : 1}"]`);
    await page.click('#sf-go'); await page.waitForTimeout(300);
    const res = await page.evaluate(() => ({ t: $('#sheetBody').textContent, pv: $('#sf-pv').textContent, saved: JSON.parse(localStorage.getItem('nc_self')).s.length, href: document.querySelector('[data-selfopen="chatgpt"]').href }));
    check('自我檢測頁：8 項檢測＋其他症狀；沒答完會說第幾題；作答後顯示分數、要做什麼、掛哪科、可以安排的檢查，並存在手機', pg.on && pg.rows === 8 && pg.sym && /第 1 題還沒回答/.test(t0) && /3\/8/.test(res.t) && /記憶門診/.test(res.t) && /MoCA/.test(res.t) && res.saved === 1, JSON.stringify({ ...pg, t0, saved: res.saved }));
    check('整理給 AI：附每一題的回答、App 判讀、相關數值；不含姓名；按鈕直接帶問題開 ChatGPT', /【自我檢測：記憶力（極早期失智篩檢 AD8）/.test(res.pv) && /重複問相同的問題、講相同的故事或話：是，有改變/.test(res.pv) && /App 判讀：建議門診評估/.test(res.pv) && !/王小明/.test(res.pv) && /chatgpt\.com\/\?q=/.test(res.href), res.pv.slice(0, 120));
    await page.evaluate(() => closeSheet()); await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({ chip: $('#selfBody [data-self="memory"]').textContent, all: !!$('#selfBody [data-selfai]'), ai: aiPrompt(me(), { topic: 'all', self: true }) }));
    check('列表顯示上次結果；可把全部結果一起給 AI；AI 醫生也會附上自我檢測', /上次 .*3\/8/.test(after.chip) && /門診/.test(after.chip) && after.all && /【自我檢測（1 年內最新一次）】/.test(after.ai) && /記憶力.*3\/8/.test(after.ai), after.chip);
    // 椅子起立計時
    await page.click('#selfBody [data-self="muscle"]'); await page.waitForTimeout(300); await page.click('#sf-t7'); await page.waitForTimeout(1100); await page.click('#sf-t7');
    const tm = await page.evaluate(() => +$('#sf-n7').value);
    check('椅子起立 5 次：按開始／停止自動計秒', tm >= .9 && tm <= 2.5, String(tm));
    await page.evaluate(() => closeSheet());
    const cb = await page.evaluate(() => JSON.stringify(cleanSelf({ s: [{ id: 'a', k: 'memory', t: '2026-10-01', a: [0, 1, 9, '1', null, 0, 0, 0] }, { id: 'b', k: 'evil', t: '2026-10-01', a: [] }, { id: 'c', k: 'memory', t: '2026-10-01', a: [0] }, { id: 'd', k: 'muscle', t: '2026-10-01', a: [5, 0, 0, 0, 0, 0, 3, 999] }], 'bad id': [] }, v => typeof v === 'string' && /^[\w-]{1,40}$/.test(v))));
    check('備份檔的自我檢測會清洗：未知量表、題數不對丟掉；選項或數值超出範圍改成沒答', cb === '{"s":[{"id":"a","k":"memory","t":"2026-10-01","a":[0,1,null,1,null,0,0,0]},{"id":"d","k":"muscle","t":"2026-10-01","a":[null,0,0,0,0,0,null,null]}]}', cb);
    await page.close();
  }

  // =============== 6r. 字體大小、第一次使用的功能導覽 ===============
  {
    // 用本機 http 開：file:// 的 origin 是 null，無頭 Chromium 重新整理時偶爾丟掉剛寫入的 localStorage（App 沒有任何刪除 localStorage 的程式；iPhone 用的是 https 網址）
    const srv6r = require('http').createServer((q, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(ROOT, 'index.html'))) });
    await new Promise(ok => srv6r.listen(0, '127.0.0.1', ok));
    page = await newPage({ tour: 0, members: [{ id: 't', name: '我', sex: 'f', birth: '1960-01-01', h: 158, w: 55, act: '1.375', goal: 'keep' }], active: 't' }, { url: `http://127.0.0.1:${srv6r.address().port}/` });
    await page.waitForTimeout(1400);
    const t1 = await page.evaluate(() => { const h = $('#tour .tour-hole').getBoundingClientRect(), n = $('#nav button[data-v="dash"]').getBoundingClientRect();
      return { vis: !$('#tour').hidden, n: $('#tour-n').textContent, role: $('#tour').getAttribute('role'), hole: h.left <= n.left && h.right >= n.right && h.top <= n.top && h.bottom >= n.bottom } });
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    const t2 = await page.evaluate(() => ({ hid: $('#tour').hidden, saved: localStorage.getItem('nc_tour') }));
    await page.evaluate(() => startTour()); for (let i = 0; i < 6; i++) await page.click('#tour-next');
    const t3 = await page.evaluate(() => ({ n: $('#tour-n').textContent, last: $('#tour-next').textContent, t: $('#tour-t').textContent }));
    await page.click('#tour-next');
    const t4 = await page.evaluate(() => $('#tour').hidden);
    check('功能導覽：舊使用者第一次打開自動出現、聚光框住目前那一顆按鈕；Esc 關閉並記住；最後一步是「設定（原本的我的）」→「開始使用」關閉',
      t1.vis && t1.n === '1 / 7' && t1.role === 'dialog' && t1.hole && t2.hid && t2.saved === '2' && t3.n === '7 / 7' && t3.last === '開始使用' && t3.t === '設定' && t4, JSON.stringify([t1, t2, t3, t4]));
    await page.click('#gearBtn'); await page.waitForTimeout(300); await page.click('#set-fz [data-fz="1.25"]'); await page.waitForTimeout(200);
    const f1 = await page.evaluate(() => ({ body: getComputedStyle(document.body).fontSize, h2: getComputedStyle(document.querySelector('.card h2')).fontSize, saved: localStorage.getItem('nc_fz') }));
    await page.evaluate(() => closeSheet()); const fit = [];
    for (const v of ['dash', 'body', 'menu', 'fit', 'ins']) { await page.click(`#nav button[data-v="${v}"]`); await page.waitForTimeout(250);
      fit.push(await page.evaluate(v => { const W = innerWidth, bad = [...document.querySelectorAll(`#v-${v} .card, #nav button`)].filter(e => e.offsetParent && e.getBoundingClientRect().right > W + 1).length; return bad }, v)) }
    await page.reload(); await page.waitForTimeout(500);
    const f2 = await page.evaluate(() => getComputedStyle(document.body).fontSize);
    check('字體大小「特大」：全站字放大 1.25 倍（15→18.75px）、重新打開還在；各頁卡片與底部按鈕都沒超出螢幕', f1.body === '18.75px' && f1.h2 === '17.5px' && f1.saved === '"1.25"' && f2 === '18.75px' && fit.every(x => x === 0), JSON.stringify([f1, f2, fit]));
    await page.close(); srv6r.close();
    // 全新使用者：先建立資料，存好後才跑導覽
    page = await newPage({ tour: 0 }); await page.waitForTimeout(700);
    const fr = await page.evaluate(() => ({ sheet: $('#sheet').classList.contains('on'), tab: !!$('#m-name'), tour: !!$('#tour') && !$('#tour').hidden }));
    await page.fill('#m-name', '新朋友'); await page.fill('#m-birth', '1990-01-01'); await page.fill('#m-h', '170'); await page.fill('#m-w', '65'); await page.click('#m-save'); await page.waitForTimeout(900);
    const fr2 = await page.evaluate(() => ({ tour: !!$('#tour') && !$('#tour').hidden, n: $('#tour-n')?.textContent }));
    check('全新使用者：先開「建立資料」、不被導覽擋住；存好後才開始導覽', fr.sheet && fr.tab && !fr.tour && fr2.tour && fr2.n === '1 / 7', JSON.stringify([fr, fr2]));
    await page.close();
  }

  // =============== 6s. 小米「健康摘要」匯入（步行平均心率、每週運動次數、資料區間）＋健康評語（體檢＋體脂＋手錶） ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    page = await newPage({ members: [{ id: 'h', name: '測', sex: 'm', birth: '1984-05-05', h: 172, w: 70, act: '1.375', goal: 'keep' }], active: 'h',
      labs: { h: [{ id: 'l1', t: T(60), items: { sbp: { v: 118 }, dbp: { v: 76 }, glu: { v: 92 }, ldl: { v: 165 }, egfr: { v: 95 }, alt: { v: 25 } }, extra: [] }] },
      scale: { h: [{ id: 's1', t: T(3) + 'T07:00', weight: 70, fat: 19, visceral: 8 }] }, watch: { h: [{ id: 'w0', t: T(40), steps: 3337 }] } });
    const pw = await page.evaluate(() => promptWatch());
    check('手錶提示詞：健康摘要取較近期的平均、步行平均心率填 walkhr、上月活動次數 ÷4.3、主要睡眠時長、卡路里日均消耗', /6 週平均 4778」填 4778/.test(pw) && /填本月 62/.test(pw) && /「步行平均心率」填 walkhr/.test(pw) && /上月 11 次 → 2\.6/.test(pw) && /主要睡眠時長」7h36m → 7\.6/.test(pw) && /卡路里日均消耗/.test(pw) && /"period":null/.test(pw) && /"walkhr":null/.test(pw) && /"workouts":null/.test(pw), '');
    await page.click('#nav button[data-v="body"]'); await page.click('#v-body [data-addwatch]'); await page.waitForTimeout(400); await page.click('details.box.ai > summary');
    await page.fill('#ai-in', JSON.stringify({ type: 'nutricore.watch', v: 1, date: T(0), device: '小米運動健康', period: '本月／6週／26週', rhr: 62, walkhr: 93, sleep: 7.6, steps: 4778, kcal: 166, workouts: 2.6, hrv: null }));
    await page.click('#ai-go'); await page.waitForTimeout(200);
    const f = await page.evaluate(() => ({ msg: $('#ai-msg').textContent, wh: $('#w-walkhr').value, wo: $('#w-workouts').value, pd: $('#w-period').value }));
    await page.click('#wSave'); await page.waitForTimeout(500);
    const d = await page.evaluate(() => { const r = watchOf(me())[0]; return { rec: `${r.walkhr}|${r.workouts}|${r.period}`, iss: watchEval(r, me()).map(i => i.k).join(), sheet: $('#sheetBody').textContent } });
    check('小米健康摘要 JSON 匯入：步行平均心率 93、每週運動 2.6 次、資料區間存下來；每週不到 3 次提醒；手錶詳情直接附健康評語', /已填入 6 項/.test(f.msg) && f.wh === '93' && f.wo === '2.6' && f.pd === '本月／6週／26週' && d.rec === '93|2.6|本月／6週／26週' && /w_workouts/.test(d.iss) && /健康評語（結合體檢、體脂、手錶）/.test(d.sheet), JSON.stringify({ ...f, ...d, sheet: '' }));
    await page.evaluate(() => { closeSheet(); go('dash') }); await page.waitForTimeout(300);
    const c = await page.evaluate(() => { const h = healthComment(me()); return { h, card: $('#commentCard').hidden ? '' : $('#commentCard').textContent } });
    check('健康評語：結合體檢（LDL 165）、體脂、手錶：寫出做得好的（血壓、血糖、肝腎正常、體脂標準、靜止心率、睡眠、步數進步）、要注意的與接下來先做（血脂 → 有氧、步數不夠先多走 2,000 步）',
      /要找醫師|靠生活習慣/.test(c.h.head) && c.h.good.some(x => /血壓、血糖、肝功能、腎功能正常/.test(x)) && c.h.good.some(x => /體脂率 19%/.test(x)) && c.h.good.some(x => /靜止心率 62/.test(x)) && c.h.good.some(x => /睡 7\.6 小時/.test(x)) && c.h.good.some(x => /步數比上次多 1,?441/.test(x))
        && c.h.bad.some(x => /LDL|低密度/.test(x)) && c.h.bad.some(x => /4,?778 步/.test(x)) && c.h.todo.some(x => /每週 150 分鐘有氧.*多走 2,000 步/.test(x)) && /健康評語/.test(c.card) && /請 AI 寫更完整的評語/.test(c.card), JSON.stringify(c.h));
    await page.close();
  }

  // =============== 6t. 病史（體檢看不到的疾病）：蹠筋膜纖維瘤症＋冠狀動脈鈣化 → 運動、飲食、LDL 目標、健檢建議、健康評語、AI、看診摘要 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    const labU = { id: 'a2', t: '2025-09-01', hospital: '臺安', items: { glu: { v: 92 }, ldl: { v: 108 }, hdl: { v: 52 }, tg: { v: 90 }, sbp: { v: 118 }, dbp: { v: 76 }, ldct: { v: 'Lung-RADS 1（陰性）', ref: '原文：冠狀動脈鈣化，建議心臟科門診追蹤。' } }, extra: [] };
    page = await newPage({ members: [{ id: 'u', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 70, act: '1.375', goal: 'keep', life: { smoke: 'never', betel: 'never', alc: 'some' },
      cond: { items: [{ k: 'ledd', y: 2024, st: 'fu', note: '左腳 2 顆' }, { k: 'cac', y: 2025, st: 'fu', note: '2025-09-01 LDCT' }], meds: '', allergy: '無', surg: '' } }], active: 'u',
      labs: { u: [labU] }, watch: { u: [{ id: 'w0', t: T(40), steps: 3337 }, { id: 'w1', t: T(0), rhr: 62, sleep: 7.6, steps: 4778, kcal: 166, workouts: 2.6 }] } });
    const r = await page.evaluate(() => { const m = me(), iss = labEval(labsOf(m)[0], m), ldl = iss.find(i => i.k === 'ldl'), F = fitPlan(m), P = yearPlan(m).items, h = healthComment(m), N = nutriPlan(m);
      return { ldl: ldl && `${ldl.lv}|${/冠狀動脈鈣化/.test(ldl.msg)}|${ldl.cx}`, cardio: F.cardio.join(), no: F.no.map(x => `${x.k}:${x.why.join('/')}`).join('｜'), W: F.W.map(x => x.t).join('／'), hiZone: F.zone,
        plan: P.filter(o => /冠狀動脈有鈣化|蹠筋膜結節/.test(o.t)).map(o => `${o.sec}|${o.pr}|${o.t}`).join('｜'), heart: dietMode(m).heart, nutri: (N.F.find(f => f.t === '降壞膽固醇') || {}).why || '',
        head: h.head, cond: h.cond.join('｜'), bad: h.bad.join('｜'), todo: h.todo.join('｜'), rest: F.days.filter(d => d.rest).map(d => d.b[0]?.note || '').join('｜'),
        ai: aiPrompt(m, { topic: 'cond', fh: true, cond: true, scale: true, watch: true, self: true }), self: selfPrompt(m, []), sum: summaryBlocks(m).map(b => b.s).join('\n'), card: (renderBody(), $('#condBody').textContent) } });
    check('病史：冠狀動脈鈣化讓 LDL 108（一般人正常）改標「注意」並說明目標更嚴格；蹠筋膜纖維瘤症讓課表避開跑步、超慢跑、爬山、球類、HIIT 並寫原因，有氧改腳踏車、游泳、水中走路',
      r.ldl === '1|true|有冠狀動脈鈣化，LDL 目標應比一般人嚴格' && !/run|slowjog|hiit|hike|ball/.test(r.cardio) && /bike/.test(r.cardio) && /swim/.test(r.cardio) && /run:蹠筋膜纖維瘤症（病史）/.test(r.no) && /hiit:.*冠狀動脈鈣化（CT 發現）（病史）/.test(r.no) && /蹠筋膜纖維瘤症：有氧改用腳踏車/.test(r.W) && /冠狀動脈有鈣化：中等強度最好/.test(r.W) && /分 2 段走、穿厚底避震鞋/.test(r.rest), JSON.stringify({ ldl: r.ldl, cardio: r.cardio, no: r.no, W: r.W, rest: r.rest }));
    check('今年健檢建議：心臟內科（優先）＋「病史追蹤」蹠筋膜結節；營養師「降壞膽固醇」寫出病史；健康評語有「依你的病史」、不叫足底有狀況的人硬拚步數、鞋墊提醒、看診摘要提醒，報告的鈣化不重複列',
      /追蹤報告異常\|1\|心臟內科：冠狀動脈有鈣化/.test(r.plan) && /病史追蹤\|3\|骨科／復健科：蹠筋膜結節追蹤/.test(r.plan) && r.heart && /病史：冠狀動脈鈣化（CT 發現）/.test(r.nutri) && /另有 2 項病史/.test(r.head)
        && /蹠筋膜纖維瘤症：良性結節/.test(r.cond) && /冠狀動脈鈣化（CT 發現）：已有動脈硬化斑塊/.test(r.cond) && /不用硬拚步數/.test(r.bad) && !/冠狀動脈鈣化（體檢/.test(r.bad) && /騎腳踏車、游泳到微喘/.test(r.todo) && /減壓鞋墊/.test(r.todo) && /高強度運動前先讓心臟內科評估/.test(r.todo), JSON.stringify({ plan: r.plan, head: r.head, cond: r.cond, bad: r.bad, todo: r.todo }));
    check('AI 醫生「病史怎麼保養」：附病史中英文、ICD-10、年份、狀況、備註、藥物過敏；自我檢測給 AI 也附病史；看診摘要圖有 Medical history、Allergies、Medications，LDL 註明依病史',
      /【已知病史（醫師診斷過、體檢看不到的）】/.test(r.ai) && /- 蹠筋膜纖維瘤症 Plantar fibromatosis \(Ledderhose disease\)［ICD-10 M72\.2］・2024 年・追蹤中・左腳 2 顆/.test(r.ai) && /Coronary artery calcification \(CAC\)［ICD-10 I25\.10＋I25\.84］/.test(r.ai) && /【藥物過敏】無/.test(r.ai) && /請依我的病史（包含體檢看不到的疾病）/.test(r.ai) && !/王小明/.test(r.ai)
        && /【已知病史/.test(r.self) && /病史 Medical history/.test(r.sum) && /藥物過敏 Allergies\n無/.test(r.sum) && /目前用藥 Medications\n未填寫/.test(r.sum) && /・有冠狀動脈鈣化，LDL 目標應比一般人嚴格/.test(r.sum) && /蹠筋膜纖維瘤症/.test(r.card), (r.ai.match(/【已知病史[\s\S]{0,200}/) || [''])[0]);
    // 其他病史的規則：冠心病 LDL <70、糖尿病 <100、腎臟病飲食、痛風、地中海貧血不補鐵、已痊癒只記錄
    const o = await page.evaluate(() => { const base = { id: 'z', name: 'z', sex: 'm', birth: '1970-01-01', h: 170, w: 70 }, L = (items) => ({ t: '2026-01-01', items, extra: [] }), mk = items => ({ ...base, cond: { items } });
      const E = (m, items) => labEval(L(items), m).filter(i => i.k === 'ldl').map(i => `${i.lv}:${/<70|<100/.exec(i.msg)?.[0] || ''}`).join();
      const cad = mk([{ k: 'cad' }]), dm = mk([{ k: 'dm' }]), done = mk([{ k: 'cad', st: 'done' }]);
      MEM.push({ ...base, id: 'tz', cond: { items: [{ k: 'thal' }] } }); LABS.tz = [{ id: 'tl', t: '2026-01-01', items: { hb: { v: 12 }, mcv: { v: 65 } }, extra: [] }];
      const thal = nutriPlan(MEM.find(x => x.id === 'tz')).F.some(f => f.t === '補鐵'); MEM.pop(); delete LABS.tz;
      return { cad: E(cad, { ldl: { v: 85 } }), dm: E(dm, { ldl: { v: 110 } }), dmLow: E(dm, { ldl: { v: 90 } }), done: E(done, { ldl: { v: 85 } }), kid: dietMode(mk([{ k: 'ckd' }])).kidney, pur: dietMode(mk([{ k: 'gout' }])).lowPur, thal,
        fitDone: fitPlan(mk([{ k: 'kneeoa', st: 'done' }])).F.has('knee'), fitKnee: fitPlan(mk([{ k: 'kneeoa' }])).F.has('knee') } });
    check('冠心病 LDL 85 → 異常（目標 <70）；糖尿病 LDL 110 → 注意（<100）、90 不提醒；慢性腎臟病 → 護腎飲食；痛風 → 低普林；地中海型貧血沒缺鐵不建議補鐵；「已痊癒」只記錄、不影響判讀與課表',
      o.cad === '2:<70' && o.dm === '1:<100' && o.dmLow === '' && o.done === '' && o.kid && o.pur && !o.thal && !o.fitDone && o.fitKnee, JSON.stringify(o));
    const cl = await page.evaluate(() => JSON.stringify(cleanCond({ items: [{ k: 'ledd', y: 3000, st: 'x', note: '<b>左</b>', score: 5 }, { k: 'evil' }, { n: '  蕁麻疹'.padEnd(40, '!') }, { k: 'ledd' }, { k: 'cac', score: 99999 }, { k: 'cac', y: '2025' }, null, 'x'], meds: 'a'.repeat(500), allergy: 5 })));
    check('病史清洗：未知病名丟掉、自訂病名限 30 字、年份與狀況不合理改預設、重複的只留一筆、鈣化分數超出範圍清空、用藥限 400 字', cl === JSON.stringify({ items: [{ st: 'fu', y: '', note: '<b>左</b>', k: 'ledd' }, { st: 'fu', y: '', note: '', n: '蕁麻疹'.padEnd(30, '!') }, { st: 'fu', y: '', note: '', k: 'cac', score: '' }], meds: 'a'.repeat(400), allergy: '', surg: '' }), cl);
    // 實際點畫面：⚙️ 設定 → 病史與用藥 → 搜尋、點選、自訂、存檔；身體頁建議加入；病史頁的問題直接帶去問 AI
    await page.evaluate(() => { const m = me(); m.cond = { items: [{ k: 'ledd', y: 2024, st: 'fu', note: '左腳 2 顆' }], meds: '', allergy: '', surg: '' }; S.set('members', MEM); renderAll() });
    await page.click('#gearBtn'); await page.waitForTimeout(300);
    const hubRow = await page.evaluate(() => $('#sheetBody [data-setsec="cond"]')?.textContent || '');
    await page.click('#sheetBody [data-setsec="cond"]'); await page.waitForTimeout(300);
    const t0 = await page.evaluate(() => ({ vis: [...document.querySelectorAll('#sheetBody .tabp')].filter(p => !p.hidden).map(p => p.dataset.t).join(), sug: [...document.querySelectorAll('#m-condbox [data-csg]')].map(b => b.dataset.csg).join(), on: [...document.querySelectorAll('#m-cgrp .chip.on')].map(b => b.dataset.ck).join(), rows: document.querySelectorAll('#m-cdet .cdet').length }));
    await page.fill('#m-cq', '筋膜'); await page.waitForTimeout(100);
    const t1 = await page.evaluate(() => [...document.querySelectorAll('#m-cgrp [data-ck]')].filter(b => !b.hidden).map(b => b.dataset.ck).join());
    await page.fill('#m-cq', ''); await page.click('#m-cgrp [data-ck="pf"]'); await page.click('#m-cgrp [data-ck="pf"]');
    await page.click('#m-condbox [data-csg="cac"]'); await page.fill('#m-cown', '帶狀皰疹'); await page.click('#m-cadd'); await page.fill('#m-cown', '蹠筋膜纖維瘤'); await page.click('#m-cadd'); await page.waitForTimeout(100);
    const t2 = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#m-cdet .cdet b')].map(b => b.textContent).join('、'), toast: $('#toast').textContent }));
    await page.fill('#m-cdet [data-cid="cac"] [data-f="score"]', '45'); await page.fill('#m-allergy', '無'); await page.fill('#m-meds', 'Rosuvastatin 10 mg'); await page.click('#m-save'); await page.waitForTimeout(400);
    const t3 = await page.evaluate(() => ({ cond: JSON.stringify(me().cond), back: !!$('#sheetBody #set-fz') }));
    check('設定 → 病史與用藥：報告提到的冠狀動脈鈣化一鍵加入；搜尋「筋膜」只剩相關病名；點兩下取消；自訂「帶狀皰疹」（清單沒有的）；打「蹠筋膜纖維瘤」會對到清單；存檔後回到設定',
      /蹠筋膜纖維瘤症/.test(hubRow) && t0.vis === 'cond' && t0.sug === 'cac' && t0.on === 'ledd' && t0.rows === 1 && t1 === 'ledd,pf,dupuy' && t2.rows === '蹠筋膜纖維瘤症、冠狀動脈鈣化（CT 發現）、帶狀皰疹' && /清單裡有：蹠筋膜纖維瘤症/.test(t2.toast)
        && /"k":"cac","score":45/.test(t3.cond) && /"n":"帶狀皰疹"/.test(t3.cond) && /"meds":"Rosuvastatin 10 mg","allergy":"無"/.test(t3.cond) && t3.back, JSON.stringify({ hubRow, t0, t1, t2, t3 }));
    await page.evaluate(() => { closeSheet(); go('body', 'cond') }); await page.waitForTimeout(300);
    await page.click('#condBody [data-cond="cac"]'); await page.waitForTimeout(300);
    const cs = await page.evaluate(() => $('#sheetBody').textContent);
    await page.click('#sheetBody [data-condq="1"]'); await page.waitForTimeout(300);
    const aq = await page.evaluate(() => ({ q: $('#ai-q').value, topic: document.querySelector('#ai-topic .chip.on')?.dataset.k, pv: $('#ai-pv').textContent }));
    check('病史頁：要注意什麼（鈣化分數 45 → 輕度、偏向用藥）、怎麼運動（合併足底病史提醒）、怎麼保養、何時就醫、追蹤科別、給醫師看；點問題直接帶著資料問 AI',
      /鈣化分數 45（輕度 1–99）/.test(cs) && /合併你的其他病史：你也有「蹠筋膜纖維瘤症」/.test(cs) && /怎麼保養/.test(cs) && /什麼時候要就醫/.test(cs) && /心臟內科/.test(cs) && /AHA\/ACC 2018/.test(cs)
        && /LDL 要降到多少/.test(aq.q) && aq.topic === 'cond' && /鈣化分數 45/.test(aq.pv) && /【目前用藥】Rosuvastatin 10 mg/.test(aq.pv), JSON.stringify({ q: aq.q, topic: aq.topic }));
    await page.close();
  }

  // =============== 6u. 版面：子分頁、總覽儀表、文字版看診摘要；準確性：歷年比較誤差、體脂國健署標準、影像追蹤時程 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    page = await newPage({ members: [{ id: 'v', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 70, act: '1.375', goal: 'keep', cond: { items: [{ k: 'ledd', y: 2024 }], allergy: '無' } }], active: 'v',
      labs: { v: [{ id: 'p1', t: '2024-09-02', hospital: '甲醫院', items: { sbp: { v: 120 }, ldl: { v: 120 } }, extra: [] },
        { id: 'p2', t: '2025-09-01', hospital: '乙醫院', items: { sbp: { v: 118 }, ldl: { v: 165 }, ldct: { v: 'Lung-RADS 1（陰性）', ref: '原文：雙側肺尖肋膜增厚，建議胸腔科門診追蹤。' } }, extra: [] }] },
      scale: { v: [{ id: 's1', t: T(1) + 'T07:00', weight: 70, fat: 21, visceral: 8 }] }, watch: { v: [{ id: 'w1', t: T(0), rhr: 62, steps: 4778 }] } });
    const d0 = await page.evaluate(() => ({ subs: [...document.querySelectorAll('#v-body .subp')].map(p => `${p.dataset.sub}:${p.hidden ? 0 : 1}`).join(), kpi: document.querySelectorAll('#heroCard .kpi').length, ring: !!$('#heroCard svg'),
      head: $('#heroCard').textContent, today: $('#todayCard').textContent, badge: $('#v-body .subnav [data-sub="cond"] .bd')?.textContent }));
    await page.click('#heroCard .kpi'); await page.waitForTimeout(300);
    const d1 = await page.evaluate(() => ({ view: $('.view.on').id, kcal: !$('#v-menu .subp[data-sub="kcal"]').hidden, gauge: !!$('#gauge svg') }));
    await page.click('#nav button[data-v="dash"]'); await page.click('#todayCard [data-goplan]'); await page.waitForTimeout(300);
    const d2 = await page.evaluate(() => ({ view: $('.view.on').id, plan: !$('#v-body .subp[data-sub="plan"]').hidden, now: $('#v-body .subp[data-sub="now"]').hidden }));
    await page.click('#v-body .subnav [data-sub="cond"]'); await page.waitForTimeout(150);
    const d3 = await page.evaluate(() => ({ cond: !$('#v-body .subp[data-sub="cond"]').hidden, sel: $('#v-body .subnav [aria-selected="true"]')?.dataset.sub }));
    check('版面：身體頁 4 個分頁（預設「狀況」）、病史分頁有數字；總覽最上面是健康總覽（分數環＋一句總結＋4 個數字）＋今天要做；點 BMI 跳到「飲食 → 熱量計算」、點今年健檢跳到「身體 → 健檢規劃」',
      d0.subs === 'now:1,rec:0,plan:0,cond:0,self:0' && d0.kpi === 4 && d0.ring && /健康總覽/.test(d0.head) && /體檢 \d+ 分/.test(d0.head) && /吃約 \d+ kcal/.test(d0.today) && /訓練日|恢復日/.test(d0.today) && d0.badge === '1'
        && d1.view === 'v-menu' && d1.kcal && d1.gauge && d2.view === 'v-body' && d2.plan && d2.now && d3.cond && d3.sel === 'cond', JSON.stringify({ d0: { ...d0, head: '', today: '' }, d1, d2, d3 }));
    const a = await page.evaluate(() => { const m = me(), cd = cmpData(m), bp = cd.rows.find(r => r.k === 'sbp'), F = fat => scaleEval({ fat }, m).filter(i => i.k === 'fat').map(i => i.lv).join() || '0', y = { ...m, birth: `${new Date().getFullYear() - 25}-01-01` };
      const dp = deptPlan(labEval(labsOf(m)[0], m)), tx = summaryText(m);
      return { bp: `${bp?.vd}|${/測量誤差/.test(bp?.why || '')}`, f21: F(21), f24: F(24), f26: F(26), y21: scaleEval({ fat: 21 }, y).filter(i => i.k === 'fat').map(i => i.lv).join(), msg: scaleEval({ fat: 26 }, m).find(i => i.k === 'fat')?.msg,
        chest: dp.find(d => d.d === '胸腔內科')?.when, tx: tx.slice(0, 400), allTx: tx, rot: JSON.stringify(rotation(m).years) } });
    check('準確性：收縮壓 120 → 118（兩家醫院都沒附參考值）＝持平、測量誤差，不再誤標「標準不同」；體脂（國健署）：42 歲男 21% 正常、24% 接近、26% 肥胖，25 歲男 21% 就算肥胖；肋膜增厚是「帶報告回門診追蹤」不是「生活調整」；LDCT 的附帶發現不算成 Lung-RADS 異常（不會誤排明年再照）',
      a.bp === 'flat|true' && a.f21 === '0' && a.f24 === '1' && a.f26 === '2' && a.y21 === '2' && /國健署肥胖標準：男性 30 歲以上 >25%/.test(a.msg) && a.chest === '3–6 個月內帶報告回門診追蹤' && !/Lung-RADS 3 以上/.test(a.rot) && /不需要每年照/.test(a.rot), JSON.stringify({ ...a, tx: '', allTx: '', rot: a.rot.slice(0, 200) }));
    check('文字版看診摘要（和摘要圖同一份）：可以貼 LINE、Email；含病史中英文、藥物過敏、異常項目', /^【看診摘要】/.test(a.tx) && /■ 病史 Medical history/.test(a.allTx) && /Plantar fibromatosis/.test(a.allTx) && /■ 藥物過敏 Allergies\n無/.test(a.allTx) && /低密度膽固醇 LDL 165/.test(a.allTx), a.tx.slice(0, 120));
    await page.close();
  }

  // =============== 6v. 醫療準確性修正：症狀紅旗、ANA 效價、腎功能與蛋白質、肥胖蛋白質、貧血檢查順序、LDL 合併病史、熱量下限、喝水 ===============
  {
    page = await newPage({ members: [{ id: 'q1', name: '甲', sex: 'm', birth: '1981-01-01', h: 170, w: 100, act: '1.375', goal: 'cut' }, { id: 'q2', name: '乙', sex: 'f', birth: '1966-01-01', h: 150, w: 45, act: '1.2', goal: 'cut' }], active: 'q1' });
    const r = await page.evaluate(() => { const S = k => SYM.find(x => x.k === k), rfOf = (k, re) => (S(k).rf.find(x => re.test(x[0])) || [])[1], m = me(), E = (items, mm = m) => labEval({ items }, mm).map(i => `${i.k}:${i.lv}`).join();
      const base = { id: 'zz', name: 'z', sex: 'm', birth: '1970-01-01', h: 170, w: 70, act: '1.375', goal: 'keep' }, withLab = (mm, items) => { MEM.push(mm); LABS[mm.id] = [{ id: 'x', t: '2026-01-01', items, extra: [] }]; const out = { c: calc(mm), plan: yearPlan(mm).items.map(o => o.t).join('｜'), mode: dietMode(mm) }; MEM.pop(); delete LABS[mm.id]; return out };
      const mild = withLab({ ...base, id: 'k1', goal: 'cut' }, { egfr: { v: 55 } }), acr = withLab({ ...base, id: 'k2', goal: 'cut' }, { uacr: { v: 350 } });
      const anN = withLab({ ...base, id: 'h1' }, { hb: { v: 12 }, ferritin: { v: 120 } }), anL = withLab({ ...base, id: 'h2' }, { hb: { v: 12 }, ferritin: { v: 20 } }), an0 = withLab({ ...base, id: 'h3' }, { hb: { v: 12 } }), mcv = withLab({ ...base, id: 'h4' }, { hb: { v: 14 }, mcv: { v: 65 } });
      const stroke = { ...base, id: 'st', cond: { items: [{ k: 'stroke' }] } }, sc = { ...base, id: 'sc', cond: { items: [{ k: 'stroke' }, { k: 'cac' }] } }, L = (mm, v) => labEval({ items: { ldl: { v } } }, mm).map(i => i.lv).join() || '0';
      const fem = { ...base, id: 'f', sex: 'f' }, hf = { ...base, id: 'hf', cond: { items: [{ k: 'hf' }] } };
      const c1 = calc(m), c2 = calc(MEM.find(x => x.id === 'q2'));
      return { chest: `${S('chest').u}|${rfOf('chest', /5 分鐘/)}|${rfOf('chest', /越來越頻繁/)}`, dizzy: rfOf('dizzy', /快昏倒/), abd: rfOf('abd', /右上腹/), bowel: rfOf('bowel', /黑便/), reflux: rfOf('reflux', /黑便/), joint: rfOf('joint', /紅腫熱痛/), ect: rfOf('bleed', /子宮外孕/), cough: S('cough').n,
        ana: [E({ ana: { v: '1:640' } }), E({ ana: { v: '陽性 1:80' } }), E({ ana: { v: '陽性' } })].join('｜'), hbF: E({ hb: { v: 16.5 } }, fem), hbM: E({ hb: { v: 16.5 } }), cac300: E({ cac: { v: 300 } }), urbc: E({ urbc: { v: 3 } }),
        mildPk: Math.round(mild.c.prot / 70 * 100) / 100, mildTag: mild.mode.tags.join(), acrPk: Math.round(acr.c.prot / 70 * 100) / 100,
        obeseProt: Math.round(c1.prot), obeseCap: Math.round(c1.target * .35 / 4), obesePk: Math.round(c1.prot / 100 * 100) / 100,
        anN: /胃鏡＋大腸鏡/.test(anN.plan), anL: /胃鏡＋大腸鏡（排除腸胃道出血）/.test(anL.plan), an0: /先驗鐵蛋白：缺鐵才需要胃鏡＋大腸鏡/.test(an0.plan), mcv: /先驗鐵蛋白，正常再驗海洋性貧血帶因/.test(mcv.plan),
        ldl: [L(stroke, 85), L(stroke, 120), L(sc, 120), L(sc, 150)].join(), small: Math.round(c2.target), smallTdee: Math.round(c2.tdee), water: calc(hf).water, waterTxt: (renderDash(), true) } });
    check('症狀紅旗：胸痛超過 5 分鐘或越來越頻繁 → 立即、預設 1–3 天內；快昏倒合併心悸胸痛、右上腹痛＋發燒黃疸、黑便、關節紅腫熱痛＋發燒、可能子宮外孕 → 立即；久咳改 2 週（結核篩檢）',
      r.chest === 'soon|now|now' && r.dizzy === 'now' && r.abd === 'now' && r.bowel === 'now' && r.reflux === 'now' && r.joint === 'now' && r.ect === 'now' && r.cough === '咳嗽超過 2 週', JSON.stringify(r).slice(0, 300));
    check('檢驗：ANA 看效價（1:640 異常、陽性 1:80 不算、只寫陽性算注意）；血紅素上限分性別（女 16.5 注意、男不算）；鈣化分數 ≥300 嚴重；尿沉渣紅血球 ≥3 就標',
      r.ana === 'ana:1｜｜ana:1' && r.hbF === 'hb:1' && r.hbM === '' && r.cac300 === 'cac:3' && r.urbc === 'urbc:1', `${r.ana}｜${r.hbF}｜${r.hbM}｜${r.cac300}｜${r.urbc}`);
    check('蛋白質：eGFR 55（腎功能略降）減脂也不超過 1.0 g/kg 並標「顧腎」；UACR 350 → 0.8 g/kg；BMI 34.6 減脂用調整體重算、不超過總熱量 35%',
      r.mildPk <= 1 && /顧腎/.test(r.mildTag) && r.acrPk === 0.8 && r.obeseProt <= r.obeseCap && r.obesePk < 2, JSON.stringify({ mildPk: r.mildPk, acrPk: r.acrPk, obeseProt: r.obeseProt, cap: r.obeseCap, pk: r.obesePk }));
    check('貧血檢查順序：鐵蛋白正常不排胃鏡大腸鏡；缺鐵（鐵蛋白 20）才排；還沒驗鐵蛋白先驗；小球性（MCV 65）先驗鐵蛋白、正常再驗海洋性貧血帶因',
      !r.anN && r.anL && r.an0 && r.mcv, JSON.stringify({ anN: r.anN, anL: r.anL, an0: r.an0, mcv: r.mcv }));
    check('LDL 合併病史取最嚴重：中風 85 注意、120 異常；中風＋冠狀動脈鈣化 120、150 都是異常（不再被鈣化降級）；嬌小女性減脂熱量不低於 1,200（且不超過每日消耗）；心衰竭喝水改「依醫囑」',
      r.ldl === '1,2,2,2' && r.small >= Math.min(1200, r.smallTdee) && r.small <= r.smallTdee && r.water === null, JSON.stringify({ ldl: r.ldl, small: r.small, tdee: r.smallTdee, water: r.water }));
    await page.close();
  }

  // =============== 6w. 匯入：App 沒有的欄位存成「其他數值」並提示；記住體脂機／手錶／醫院；病史「醫師交代」；滑囊炎、鼻中隔彎曲等新病名與症狀 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    page = await newPage({ members: [{ id: 'w', name: '測', sex: 'm', birth: '1984-05-05', h: 172, w: 70, act: '1.375', goal: 'keep' }, { id: 'f', name: '乙', sex: 'f', birth: '1990-01-01', h: 160, w: 55, act: '1.375', goal: 'keep' }], active: 'w',
      scale: { w: [{ id: 's0', t: T(30) + 'T07:00', weight: 71, fat: 20, device: '小米體脂秤2' }] }, watch: { w: [{ id: 'w0', t: T(10), steps: 5000, device: '小米手環 9' }] },
      labs: { w: [{ id: 'l0', t: '2025-09-01', hospital: '測試醫院', items: { ldl: { v: 120 } }, extra: [] }] } });
    // 體脂機：品牌自動帶上次的；AI 給了 App 沒有的數值 → 存進「其他數值」並提示要更新 App
    await page.evaluate(() => openScaleSheet()); await page.waitForTimeout(300);
    const s0 = await page.evaluate(() => ({ dev: $('#s-device').value, opts: [...document.querySelectorAll('#dl-sdev option')].map(o => o.value).join() }));
    await page.click('details.box.ai > summary');
    await page.fill('#ai-in', JSON.stringify({ type: 'nutricore.scale', v: 1, measuredAt: T(0) + ' 07:10', device: null, weight: 70.2, fat: 19.5, visceral: 6, status: { visceral: '標準' }, other: [{ name: '內臟脂肪面積', value: 85, unit: 'cm²' }, { name: '肌肉均衡', value: '標準', unit: '' }, { name: '', value: 3 }, { name: '壞資料', value: {} }], fatControl: -1.2 }));
    await page.click('#ai-go'); await page.waitForTimeout(200);
    const s1 = await page.evaluate(() => $('#ai-msg').textContent);
    await page.click('#sSave'); await page.waitForTimeout(400);
    const s2 = await page.evaluate(() => { const m = me(), r = scalesOf(m)[0]; openScaleDetail(r.id); const det = $('#sheetBody').textContent; closeSheet();
      return { rec: JSON.stringify({ dev: r.device, ex: r.extra }), det, ai: aiPrompt(m, { topic: 'diet', scale: true, watch: true }), ps: promptScale(), pw: promptWatch(),
        dv: scaleEval({ visceral: 6, status: { visceral: '警戒' } }, m).find(i => i.k === 'visceral')?.msg || '' } });
    check('體脂機匯入：品牌自動帶上次的「小米體脂秤2」（有下拉清單）；App 沒有的數值（內臟脂肪面積、肌肉均衡、不認得的 fatControl）存進「其他數值」並提示「把這段訊息給 Claude 更新 App」，壞資料丟掉',
      s0.dev === '小米體脂秤2' && s0.opts === '小米體脂秤2' && /App 還沒有專屬欄位/.test(s1) && /內臟脂肪面積、肌肉均衡、fatControl/.test(s1) && /給 Claude 更新 App/.test(s1)
        && s2.rec === JSON.stringify({ dev: '小米體脂秤2', ex: [{ name: '內臟脂肪面積', value: 85, unit: 'cm²' }, { name: '肌肉均衡', value: '標準', unit: '' }, { name: 'fatControl', value: -1.2, unit: '' }] }), JSON.stringify({ s0, s1, rec: s2.rec }));
    check('其他數值會顯示在體脂詳情、也帶進問 AI（含體脂機品牌）；體脂提示詞不再有「警戒」範例、要求畫面沒寫判定就不要列，App 沒有的數值放 other；設備判定和 App 標準不同時講清楚',
      /其他數值（App 還沒有專屬欄位）/.test(s2.det) && /內臟脂肪面積85 cm²/.test(s2.det) && /【體脂計 [\d-]+・小米體脂秤2】/.test(s2.ai) && /其他數值（App 沒有專屬欄位，請一併參考）：內臟脂肪面積 85 cm²、肌肉均衡 標準、fatControl -1\.2/.test(s2.ai)
        && !/"visceral":"警戒"/.test(s2.ps) && /畫面沒寫判定的項目不要列，也不要自己判斷或照抄這裡的例子/.test(s2.ps) && /放進 other/.test(s2.ps) && /"other":\[\]\}/.test(s2.ps) && /放進 other/.test(s2.pw) && /"other":\[\]\}/.test(s2.pw)
        && /設備判定「警戒」；App 的內建標準判定正常/.test(s2.dv), JSON.stringify({ dv: s2.dv, ai: (s2.ai.match(/【體脂計[^\n]*/) || [''])[0] }));
    // 手錶：裝置自動帶上次的；其他數值
    await page.evaluate(() => openWatchSheet()); await page.waitForTimeout(300);
    const w0 = await page.evaluate(() => ({ dev: $('#w-device').value, opts: [...document.querySelectorAll('#dl-wdev option')].map(o => o.value).join() }));
    await page.click('details.box.ai > summary');
    await page.fill('#ai-in', JSON.stringify({ type: 'nutricore.watch', v: 1, date: T(0), device: null, rhr: 60, steps: 6000, other: [{ name: '體能分數', value: 42 }], bodyTemp: 36.5 }));
    await page.click('#ai-go'); await page.waitForTimeout(200);
    const w1 = await page.evaluate(() => $('#ai-msg').textContent);
    await page.click('#wSave'); await page.waitForTimeout(400);
    const w2 = await page.evaluate(() => { const m = me(), r = watchOf(m)[0]; openWatchDetail(r.id); const det = $('#sheetBody').textContent; closeSheet(); return { rec: JSON.stringify({ dev: r.device, ex: r.extra }), det, ai: aiPrompt(m, { topic: 'fit', watch: true }) } });
    const cb = await page.evaluate(() => { const o = cleanBackup({ members: [{ id: 'w', name: '測' }], scale: { w: [{ id: 'a1', t: '2026-01-01T07:00', weight: 70, extra: [null, { name: '壞', value: {} }, { name: '內臟脂肪面積', value: 85, unit: 'cm²', x: '<b>' }] }] },
      watch: { w: [{ id: 'b1', t: '2026-01-01', rhr: 60, extra: [{ name: '體能分數', value: 42 }, 5] }] } }); return JSON.stringify([o.scale.w[0].extra, o.watch.w[0].extra]) });
    check('手錶匯入：裝置自動帶上次的「小米手環 9」；體能分數、bodyTemp 存進其他數值並提示；詳情與問 AI 都看得到；還原備份時其他數值只留名稱／數值／單位',
      w0.dev === '小米手環 9' && w0.opts === '小米手環 9' && /App 還沒有專屬欄位/.test(w1) && /體能分數、bodyTemp/.test(w1) && w2.rec === JSON.stringify({ dev: '小米手環 9', ex: [{ name: '體能分數', value: 42, unit: '' }, { name: 'bodyTemp', value: 36.5, unit: '' }] })
        && /其他數值（App 還沒有專屬欄位）/.test(w2.det) && /體能分數 42、bodyTemp 36\.5/.test(w2.ai) && cb === JSON.stringify([[{ name: '內臟脂肪面積', value: 85, unit: 'cm²' }], [{ name: '體能分數', value: 42, unit: '' }]]), JSON.stringify({ w0, w1, rec: w2.rec, cb }));
    // 體檢：醫院記住；App 對不到的項目講清楚
    await page.evaluate(() => openLabSheet()); await page.waitForTimeout(300);
    const l0 = await page.evaluate(() => [...document.querySelectorAll('#dl-hosp option')].map(o => o.value).join());
    await page.click('details.box.ai > summary');
    await page.fill('#ai-in', JSON.stringify({ type: 'nutricore.lab', v: 1, date: T(0), items: { ldl: { value: 130, unit: 'mg/dL' }, 'XYZ 新指標': { value: 5, unit: 'mg/L' } }, extra: [{ name: '其他附註', value: '無' }] }));
    await page.click('#ai-go'); await page.waitForTimeout(200);
    const l1 = await page.evaluate(() => { const t = $('#ai-msg').textContent; closeSheet(); return t });
    check('體檢匯入：醫院名稱有下拉清單（填過的）；App 對不到的項目寫「App 還沒有專屬欄位」並放進其他項目（AI 本來就放在其他項目的不重複提醒）',
      l0 === '測試醫院' && /App 還沒有專屬欄位：XYZ 新指標，已放進「其他項目」/.test(l1) && !/其他附註，已放進/.test(l1), JSON.stringify({ l0, l1 }));
    // 病史：滑囊炎＋醫師交代（以醫師為準）
    await page.click('#gearBtn'); await page.waitForTimeout(300); await page.click('#sheetBody [data-setsec="cond"]'); await page.waitForTimeout(300);
    await page.fill('#m-cq', '滑囊'); await page.waitForTimeout(100);
    const c0 = await page.evaluate(() => ({ hit: [...document.querySelectorAll('#m-cgrp [data-ck]')].filter(b => !b.hidden).map(b => b.dataset.ck).join(), bph: !!$('#m-cgrp [data-ck="bph"]'), ent: [...document.querySelectorAll('#m-cgrp [data-cgw="ent"] [data-ck]')].map(b => b.dataset.ck).join() }));
    await page.fill('#m-cq', ''); await page.click('#m-cgrp [data-ck="bursitis"]'); await page.click('#m-cgrp [data-ck="septum"]');
    await page.fill('#m-cdet [data-cid="bursitis"] [data-f="dr"]', '溫水泡腳、熱敷要泡到小腿；先放鬆小腿。沒受傷不用照 X 光，組織沒問題不用超音波');
    await page.click('#m-save'); await page.waitForTimeout(400);
    const c1 = await page.evaluate(() => { const m = me(), F = fitPlan(m), h = healthComment(m); closeSheet(); go('body', 'cond');
      return { cond: JSON.stringify(m.cond.items), card: $('#condBody').textContent, ai: aiPrompt(m, { topic: 'cond', cond: true }), sum: summaryText(m), hc: h.cond.join('｜'), cardio: F.cardio.join(), W: F.W.map(x => x.t).join('／') } });
    await page.click('#condBody [data-cond="bursitis"]'); await page.waitForTimeout(300);
    const c2 = await page.evaluate(() => { const t = $('#sheetBody').textContent; closeSheet(); return t });
    check('病史：搜尋「滑囊」找到滑囊炎；男性才有攝護腺肥大；鼻中隔彎曲在「耳鼻喉眼」；「醫師交代」存檔後，病史頁最上面顯示（以醫師為準），也帶進問 AI、看診摘要、健康評語；滑囊炎課表避開跑跳、提醒先放鬆小腿',
      c0.hit === 'bursitis' && c0.bph && /septum/.test(c0.ent) && /rhinitis/.test(c0.ent) && /"k":"bursitis"/.test(c1.cond) && /"dr":"溫水泡腳、熱敷要泡到小腿；先放鬆小腿。沒受傷不用照 X 光，組織沒問題不用超音波"/.test(c1.cond)
        && /足底／腳跟滑囊炎醫師交代：溫水泡腳/.test(c1.card) && /醫師交代：溫水泡腳、熱敷要泡到小腿/.test(c1.ai) && /Bursitis of the foot \(heel\)［ICD-10 M71\.57］/.test(c1.ai) && /醫師交代：溫水泡腳/.test(c1.sum) && /Deviated nasal septum/.test(c1.sum)
        && /足底／腳跟滑囊炎：醫師交代：溫水泡腳/.test(c1.hc) && !/run|slowjog|hiit/.test(c1.cardio) && /滑囊炎：先放鬆小腿/.test(c1.W)
        && /🩺 醫師交代（以醫師為準）溫水泡腳、熱敷要泡到小腿/.test(c2) && /水位到小腿/.test(c2) && /先把小腿放鬆/.test(c2) && /通常不需要 X 光或超音波/.test(c2), JSON.stringify({ c0, cond: c1.cond, hc: c1.hc, cardio: c1.cardio }));
    const fx = await page.evaluate(() => { const f = MEM.find(x => x.id === 'f'), K = k => SYM.find(x => x.k === k), now = k => K(k).rf.filter(x => x[1] === 'now').length;
      return { fbph: /data-ck="bph"/.test(condTabHTML(f)), syms: ['stuffy', 'throat', 'skin', 'neck', 'heel'].map(k => `${k}:${now(k)}`).join(), heel: symCtx(me(), 'heel').join('｜'), stuffy: symCtx(me(), 'stuffy').join('｜'), sbar: getComputedStyle($('#sbar')).position,
        icd: ['bursitis', 'achilles', 'septum', 'turbinate', 'sinusitis', 'tinnitus', 'dryeye', 'urticaria', 'atopic', 'hemorrhoid', 'bph'].map(k => CONDK[k]?.icd || '?').join() } });
    check('新病名 11 個都有 ICD-10；女性看不到攝護腺肥大；新症狀（鼻塞躺下更塞、喉嚨沙啞、皮膚紅疹、頸肩痛、腳底腳跟痛）都有立即就醫紅旗；腳跟痛帶入病史、鼻塞帶入鼻中隔彎曲；狀態列有底色',
      fx.icd === 'M71.57,M76.6,J34.2,J34.3,J32.9,H93.1,H04.12,L50.8,L20.9,K64.9,N40' && !fx.fbph && fx.syms === 'stuffy:1,throat:1,skin:2,neck:2,heel:1' && /你的病史：足底／腳跟滑囊炎/.test(fx.heel) && /你的病史：鼻中隔彎曲/.test(fx.stuffy) && fx.sbar === 'fixed', JSON.stringify(fx));
    await page.close();
  }

  // =============== 6x. 改名與版面、回診追蹤（App vs 醫師）、保險（AI 匯入＋防錯）、理賠、匯出匯入（單一成員／加密）、防 AI 讀錯、牙齒口腔、家族史、職業身分 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    const seedA = { id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 70, act: '1.375', goal: 'keep', job: 'civ', role: 'me', earner: true, life: { smoke: 'former', ppd: 1, yrs: 6, quit: 10, betel: 'never', alc: 'some' },
      cond: { items: [{ k: 'cac', y: 2025 }, { k: 'osa', score: 22 }, { k: 'dm' }], meds: 'Aspirin 100 mg', allergy: '無', surg: '' } };
    page = await newPage({ members: [seedA, { id: 'b', name: '小美', sex: 'f', birth: '1986-02-02', h: 160, w: 55, act: '1.375', goal: 'keep', role: 'spouse', job: 'lab' }], active: 'a',
      labs: { a: [{ id: 'l1', t: '2026-09-14', hospital: '甲醫院', items: { ldl: { v: 165 }, tc: { v: 230 }, alt: { v: 80 } }, extra: [] }] } });
    const ia = await page.evaluate(() => ({ title: document.title, logo: $('.logo').textContent, nav: [...document.querySelectorAll('#nav button')].map(b => b.textContent.trim()).join('|'),
      sub: [...document.querySelectorAll('#v-body .subnav [data-sub]')].map(b => b.dataset.sub + ':' + b.firstChild.textContent).join(','), ins: [...document.querySelectorAll('#v-ins .subnav [data-sub]')].map(b => b.firstChild.textContent).join('|'),
      self: (go('self'), $('.view.on').id + ':' + !$('#v-body .subp[data-sub="self"]').hidden), todo: (go('dash'), $('#todoCard').textContent), ldlMsg: labEval(labsOf(me())[0], me()).find(i => i.k === 'ldl').msg, tools: (renderTool(), document.querySelectorAll('#toolBody .card').length) }));
    check('改名「Kinwell」；底部 總覽｜健康｜飲食｜運動｜保險；健康頁 狀況｜紀錄｜追蹤｜病史｜自測（舊「自我檢測」連結導到這裡）；保險頁 保單｜保障｜理賠｜AI 工具（7 種提示詞）；總覽有待辦與急症入口；LDL 165 不再說「對一般人可能正常」',
      /^Kinwell/.test(ia.title) && ia.logo === 'Kinwell' && ia.nav === '總覽|健康|飲食|運動|保險' && ia.sub === 'now:狀況,rec:紀錄,plan:追蹤,cond:病史,self:自測' && ia.ins === '保單|保障|理賠|AI 工具' && ia.self === 'v-body:true' && ia.tools === 7
        && /待辦/.test(ia.todo) && /急症自我檢測/.test(ia.todo) && /項異常還沒記下醫師怎麼說/.test(ia.todo) && !/對一般人可能正常/.test(ia.ldlMsg) && /冠狀動脈鈣化/.test(ia.ldlMsg), JSON.stringify(ia));
    // 回診追蹤：實際點畫面
    await page.evaluate(() => go('body', 'plan')); await page.waitForTimeout(200);
    const f0 = await page.evaluate(() => [...document.querySelectorAll('#fuBody [data-fuadd]')].map(b => b.dataset.fuadd).join());
    await page.click('#fuBody [data-fuadd="ldl"]'); await page.waitForTimeout(300);
    const f1 = await page.evaluate(() => ({ app: $('#sheetBody .hl').textContent, open: $('#sheetBody details.box.ai').open }));
    await page.fill('#fv-hosp', '乙醫院'); await page.fill('#fv-dept', '心臟內科'); await page.fill('#fv-dx', '冠狀動脈鈣化，LDL 目標 <70，開始用藥'); await page.fill('#fv-plan', 'Rosuvastatin 10 mg；3 個月後抽血');
    await page.selectOption('#fv-rel', 'match'); await page.selectOption('#fv-st', 'treat'); await page.fill('#fv-next', T(-90)); await page.click('#fv-save'); await page.waitForTimeout(300);
    const f2 = await page.evaluate(() => { const x = fuOf(me()).find(z => z.k === 'ldl'); return { st: x.st, next: x.next, log: x.log.length, rel: x.log[0].rel, sheet: $('#sheetBody').textContent } });
    const f3 = await page.evaluate(() => { const m = me(), sg = fuSuggest(m), alt = fuAdd(m, sg.find(s => s.k === 'alt')); alt.log.push({ id: 'x1', d: '2026-10-01', dept: '腸胃肝膽科', dx: '超音波正常，運動後暫時升高', rel: 'over', st: 'ruled', next: '' }); alt.st = 'ruled';
      const dc = fuAdd(m, { k: 'doc:1', name: '牙周病', src: 'doc', app: null }); dc.log.push({ id: 'x2', d: '2026-10-05', dept: '牙科', dx: '中度牙周病', rel: 'missed', st: 'treat', next: '' }); dc.st = 'treat';
      const cd = fuAdd(m, sg.find(s => s.k === 'cond:cac')); cd.next = '2026-01-01'; cd.st = 'watch'; fuSave();
      return { stats: fuStats(m), todo: (renderTodo(), $('#todoCard').textContent), sum: summaryText(m), ai: aiPrompt(m, { topic: 'visit', cond: true }), body: $('#fuBody').textContent } });
    check('回診追蹤：App 建議追蹤 LDL、GPT（異常）；點「＋ 追蹤」保存 App 當時的判斷（數值、等級、版本）；填回診紀錄（醫師診斷、處置、和 App 判斷相符、治療中、下次回診）',
      /ldl/.test(f0) && /alt/.test(f0) && /App 當時的判斷/.test(f1.app) && /165/.test(f1.app) && /判讀版本/.test(f1.app) && f1.open && f2.st === 'treat' && f2.log === 1 && f2.rel === 'match' && f2.next === T(-90) && /冠狀動脈鈣化，LDL 目標 <70/.test(f2.sheet) && /和 App：相符/.test(f2.sheet),
      JSON.stringify({ f0, app: f1.app.slice(0, 80), st: f2.st, next: f2.next, rel: f2.rel }));
    check('App vs 醫師統計：相符 1、App 提醒過度 1（醫師排除）、App 漏判 1（醫師發現）；逾期的追蹤上總覽待辦；看診摘要與 AI 都帶入醫師的判斷',
      f3.stats.match === 1 && f3.stats.over === 1 && f3.stats.missed === 1 && /回診逾期：冠狀動脈鈣化/.test(f3.todo) && /■ 回診追蹤 Follow-up（醫師的判斷）/.test(f3.sum) && /低密度膽固醇 LDL：治療中；.*乙醫院 心臟內科：冠狀動脈鈣化，LDL 目標 <70/.test(f3.sum)
        && /【回診追蹤（醫師的判斷，以醫師為準）】/.test(f3.ai) && /牙周病（醫師發現，App 原本沒提醒）：治療中/.test(f3.ai) && /App 提醒過度 1/.test(f3.body) && /App 漏判（醫師發現） 1/.test(f3.body), JSON.stringify({ stats: f3.stats, todo: f3.todo.slice(0, 120) }));
    // 保險：AI 匯入（含防錯檢查）
    const polJSON = { type: 'jiaankang.policy', v: 1, policies: [
      { insurer: '甲人壽', product: '安心醫療終身保險', policyNoLast4: '12345678', insuredHint: '本人', start: '110/03/05', payYears: 20, payFreq: '年繳', premium: 24000, status: '有效',
        coverages: [{ name: '住院醫療日額', kind: 'main', cat: 'hosp_day', amount: 2000, unit: '元/日', waitingDays: 30, renewable: '保證續保', quote: '住院醫療保險金：每日 2,000 元', page: 3 },
          { name: '癌症初次罹患保險金', kind: 'rider', cat: 'cancer', amount: 30, unit: '萬元', maxAge: 75, quote: '初次罹患癌症保險金 30 萬元', page: 5 }], notes: '要保人身分證 A123456789' },
      { insurer: '乙產險', product: '傷害保險', insuredHint: '配偶', start: '2024-01-10', payFreq: '月繳', premium: 500,
        coverages: [{ name: '意外身故', cat: 'accident', amount: 500, unit: '萬元', quote: '意外身故保險金 300 萬元' }, { name: '意外醫療', cat: 'acc_med', amount: 3, unit: '萬元' }] },
      { insurer: '丙人壽', product: '住院日額附約', start: '2023-05-01', payFreq: '年繳', premium: 3000, coverages: [{ name: '住院日額', cat: 'hosp_day', amount: 1000, unit: '元/日', quote: '每日給付 1,000 元', waitingDays: 30 }] }], unreadable: ['第 4 頁右下角被手指擋住'] };
    await page.evaluate(() => { closeSheet(); go('ins', 'pol') }); await page.waitForTimeout(200);
    await page.click('#polBody [data-poladd]'); await page.waitForTimeout(300);
    const pp = await page.evaluate(() => promptPolicy());
    await page.fill('#pi-in', '```json\n' + JSON.stringify(polJSON) + '\n```'); await page.click('#pi-go'); await page.waitForTimeout(300);
    const i0 = await page.evaluate(() => ({ out: $('#pi-out').textContent, checks: [...document.querySelectorAll('#pi-out [data-pi]')].map(c => c.checked ? 1 : 0).join(''), mids: [...document.querySelectorAll('#pi-out [data-pim]')].map(s => s.value).join() }));
    await page.click('#pi-save'); await page.waitForTimeout(400);
    const i1 = await page.evaluate(() => ({ a: JSON.stringify(insOf(MEM[0]).map(p => ({ s: p.start, a: polAnnual(p), no: p.no4, chk: p.chk, n: p.items.length, note: p.note }))), b: insOf(MEM[1]).map(p => polAnnual(p) + ':' + p.warn.length).join(), view: $('.view.on').id, badge: $('#v-ins .subnav [data-sub="pol"] .bd')?.textContent, lv: insOf(MEM[0]).map(p => polLv(p, MEM[0])).join() }));
    check('保單 AI 匯入：提示詞要逐字原文＋頁碼、民國年換算、不輸出身分證；貼上（含 ``` 也可以）→ 防錯：保單號碼只留末 4 碼、身分證自動刪除、列出 AI 看不清楚的、金額在原文找不到會警告、沒附原文會提醒；依稱謂分給配偶；月繳 500 → 年繳 6,000；匯入後有要核對的才是「待核對」（金額都在原文找得到、沒有要補的，App 自動核對）',
      /民國年請加 1911/.test(pp) && /quote/.test(pp) && /身分證字號/.test(pp) && /"type":"kinwell.policy"/.test(pp) && /保單號碼只保留末 4 碼/.test(i0.out) && /偵測到身分證字號，已自動刪除/.test(i0.out) && /AI 說看不清楚：第 4 頁右下角被手指擋住/.test(i0.out)
        && /「意外身故」的金額 500 在原文裡找不到：可能讀錯/.test(i0.out) && /「意外醫療」沒有附原文/.test(i0.out) && /防錯檢查通過/.test(i0.out) && i0.checks === '111' && i0.mids === 'a,b,a'
        && i1.a === JSON.stringify([{ s: '2021-03-05', a: 24000, no: '5678', chk: false, n: 2, note: '要保人身分證 ＊＊＊' }, { s: '2023-05-01', a: 3000, no: '', chk: false, n: 1, note: '' }]) && /^6000:[2-9]/.test(i1.b) && i1.view === 'v-ins' && !i1.badge && i1.lv === 'ok,ok', JSON.stringify({ i0: { ...i0, out: i0.out.slice(0, 160) }, i1 }));
    const pid = await page.evaluate(() => insOf(MEM[0])[0].id);
    await page.evaluate(id => openPol(id), pid); await page.waitForTimeout(200); await page.click('#pd-chk'); await page.waitForTimeout(200);
    await page.evaluate(() => { closeSheet(); go('ins', 'cov') }); await page.waitForTimeout(200);
    const c0 = await page.evaluate(() => ({ cov: $('#covBody').textContent, map: [...document.querySelectorAll('#covBody table.imap tr')].map(r => [...r.children].map(c => c.textContent).join('/')).join('|'), end: insEnding(me()).map(r => r.t).join('｜'), chk: insOf(me())[0].chk }));
    await page.evaluate(() => openPolImport()); await page.waitForTimeout(200); await page.fill('#pi-in', JSON.stringify(polJSON)); await page.click('#pi-go'); await page.waitForTimeout(300);
    const dup = await page.evaluate(() => ({ checks: [...document.querySelectorAll('#pi-out [data-pi]')].map(c => c.checked ? 1 : 0).join(''), out: $('#pi-out').textContent }));
    const man = await page.evaluate(() => { closeSheet(); const { p, err } = polCheck({ insurer: '丁人壽', product: '定期壽險', start: '2030-01-01', payFreq: '年', premium: 2000000, payYears: 99, coverages: [{ name: '身故', cat: 'life', amount: 500, unit: '萬元', maxAge: 30 }] }, me(), true); return { err: err.length, warn: p.warn.join('｜'), py: p.payYears } });
    check('打 ✔ 的是核對過的（App 自動核對或自己按）：住院日額 2 張加總 3,000 元/日、癌症 30 萬；全家保障地圖（本人醫療、癌症 ✔；配偶意外 ✕：AI 讀的 500 萬和原文 300 萬對不上）；繳費期滿倒數；同一張再匯入預設不勾；手動輸入也檢查（未來生效日、年期、年繳 200 萬、超過續保年齡）',
      c0.chk && /住院日額3,000 元\/日/.test(c0.cov) && /癌症30 萬/.test(c0.cov) && /王小明\/—\/—\/✔\/✔\/—\/—\/—/.test(c0.map) && /小美\/—\/✕\/—\/—\/—\/—\/—/.test(c0.map) && /繳費到 2040 年/.test(c0.end)
        && dup.checks === '000' && /已經有同一張保單/.test(dup.out) && man.err === 0 && /在未來/.test(man.warn) && /繳費年期 99 不合理/.test(man.warn) && /年繳保費約 200 萬/.test(man.warn) && /最高到 30 歲/.test(man.warn) && !/沒有附原文/.test(man.warn) && man.py === null,
      JSON.stringify({ map: c0.map, end: c0.end, dup: dup.checks, man }));
    // 理賠
    const cl = await page.evaluate(() => { const m = me(), p1 = insOf(m)[0], p3 = insOf(m)[1], e = { id: 'e1', type: 'ad', d: '2026-10-01', end: '2026-10-04', hosp: '乙醫院', dx: '肺炎', cost: 12000, claims: [] };
      CLM[m.id] = [e]; p3.start = '2026-09-20'; S.set('ins', INS); const M = evtMatch(m, e); e.claims.push({ pid: p1.id, st: 'docs' }); S.set('clm', CLM); renderClm(); renderTodo();
      return { m: M.map(x => x.p.insurer + ':' + x.its.map(i => (i.est || '') + '|' + i.w.join('/')).join(';')).join('｜'), todo: $('#todoCard').textContent, pr: promptClaim(m, e), pd: promptClaim(m, e, true) } });
    check('理賠：住院 3 天 → 找到 2 張有住院日額的保單，粗估 2,000 × 3 = 6,000；剛生效 11 天的保單標「等待期內」「還沒核對」；補件上總覽待辦；理賠分析與拒賠申訴提示詞帶入事件與 App 的檢查',
      /甲人壽:粗估 6,000 元（2,000 元\/日 × 3 天）\|/.test(cl.m) && /丙人壽:粗估 3,000 元（1,000 元\/日 × 3 天）\|等待期內（生效 11 天，等待期 30 天）：可能不賠\/保單還沒核對/.test(cl.m) && /理賠補件：肺炎/.test(cl.todo)
        && /【事件】2026-10-01 到 2026-10-04 住院；診斷：肺炎；自付 12000 元/.test(cl.pr) && /A\. 被保險人角度/.test(cl.pr) && /App 提醒：等待期內/.test(cl.pr) && /拒賠理由/.test(cl.pd) && /60 天內/.test(cl.pd), JSON.stringify({ m: cl.m, todo: cl.todo.slice(0, 100) }));
    // 匯出匯入：單一成員、加密
    const ex = await page.evaluate(async () => { const d = packData('b'), enc = await encPack(packData(null), 'secret12'); let bad = ''; try { await decPack(enc, 'wrong-pw') } catch (e) { bad = 'fail' } const dec = await decPack(enc, 'secret12');
      return { kind: d.kind, mem: d.members.map(m => m.id).join(), ins: Object.keys(d.ins).join(), labs: Object.keys(d.labs).join(), enc: !!enc.data && !/王小明|甲人壽/.test(JSON.stringify(enc)), bad, dec: dec.members.length + ':' + Object.keys(dec.ins).length, name: fileName('b', true) } });
    const memFile = path.join(require('os').tmpdir(), 'jak-member.json'), encFile = path.join(require('os').tmpdir(), 'jak-enc.json');
    fs.writeFileSync(memFile, await page.evaluate(() => JSON.stringify(packData('b'))));
    fs.writeFileSync(encFile, await page.evaluate(async () => JSON.stringify(await encPack(packData(null), 'secret12'))));
    await page.close();
    page = await newPage({ members: [{ id: 'z9', name: '別人', sex: 'f', birth: '1990-01-01', h: 160, w: 50, act: '1.375', goal: 'keep' }], active: 'z9' });
    await page.setInputFiles('#importFile', memFile); await page.waitForTimeout(400);
    const im0 = await page.evaluate(() => $('#sheetBody').textContent);
    await page.click('#sheetBody [data-imp="merge"]'); await page.waitForTimeout(300);
    const im1 = await page.evaluate(() => ({ mem: MEM.map(m => m.name).join(), act: me().name, ins: insOf(MEM.find(m => m.id === 'b')).length }));
    await page.setInputFiles('#importFile', memFile); await page.waitForTimeout(400);
    const im2 = await page.evaluate(() => [...document.querySelectorAll('#sheetBody [data-imp]')].map(b => b.dataset.imp).join());
    await page.click('#sheetBody [data-imp="new"]'); await page.waitForTimeout(300);
    const im3 = await page.evaluate(() => { const n = MEM.find(m => m.name === '小美（匯入）'); return { n: MEM.length, ins: n ? insOf(n).length : -1, act: me().name } });
    await page.setInputFiles('#importFile', encFile); await page.waitForTimeout(400);
    const im4 = await page.evaluate(() => !!$('#dp-pw'));
    await page.fill('#dp-pw', 'wrong'); await page.click('#dp-go'); await page.waitForTimeout(900);
    const im5 = await page.evaluate(() => $('#toast').textContent);
    await page.fill('#dp-pw', 'secret12'); await page.click('#dp-go'); await page.waitForTimeout(1000);
    const im6 = await page.evaluate(() => [...document.querySelectorAll('#sheetBody [data-imp]')].map(b => b.dataset.imp).join());
    await page.click('#sheetBody [data-imp="merge"]'); await page.waitForTimeout(300);
    const im7 = await page.evaluate(() => ({ n: MEM.length, names: MEM.map(m => m.name).join(), fu: fuOf(MEM.find(m => m.id === 'a')).length, labs: labsOf(MEM.find(m => m.id === 'a')).length }));
    fs.unlinkSync(memFile); fs.unlinkSync(encFile);
    check('匯出匯入：單一成員檔（只含她的保單）匯入到別人手機 → 新增成員；再匯入同一人 → 可合併／取代／另存新成員；加密備份看不到明文、密碼錯打不開、正確密碼解開後可合併',
      ex.kind === 'member' && ex.mem === 'b' && ex.ins === 'b' && ex.labs === '' && ex.enc && ex.bad === 'fail' && ex.dec === '2:2' && /^kinwell-小美-\d{4}-\d{2}-\d{2}-enc\.json$/.test(ex.name)
        && /新增成員「小美」/.test(im0) && im1.mem === '別人,小美' && im1.act === '小美' && im1.ins === 1 && im2 === 'merge,replace1,new' && im3.n === 3 && im3.ins === 1 && im3.act === '小美（匯入）'
        && im4 && /密碼錯誤/.test(im5) && im6 === 'merge,replace' && im7.n === 4 && /王小明/.test(im7.names) && im7.fu === 4 && im7.labs === 1, JSON.stringify({ ex, im1, im2, im3, im5, im6, im7 }));
    // 防 AI 讀錯
    const ck = await page.evaluate(() => { const m = MEM.find(x => x.id === 'a');
      return { s: scaleCheck({ weight: 70, bmi: 26.5, fat: 20, fatMass: 18, muscle: 72, skeletal: 30, lean: 52 }, m).join('｜'), l: labCheck({ tc: { v: 150 }, ldl: { v: 170 }, sbp: { v: 80 }, dbp: { v: 120 }, cr: { v: 1.0 }, egfr: { v: 30 } }, m, '2031-01-01').join('｜'),
        ok: labCheck({ tc: { v: 200 }, ldl: { v: 120 }, sbp: { v: 120 }, dbp: { v: 80 }, cr: { v: 1.0 }, egfr: { v: 90 } }, m, '2026-01-01').length, w: watchCheck({ rhr: 95, walkhr: 80 }).join() } });
    await page.evaluate(() => { ACT = 'a'; renderAll(); openLabSheet() }); await page.waitForTimeout(300); await page.click('details.box.ai > summary');
    await page.fill('#ai-in', JSON.stringify({ type: 'jiaankang.lab', v: 1, date: '2026-09-14', items: { tc: { value: 150 }, ldl: { value: 170 }, sbp: { value: 80 }, dbp: { value: 120 } } }));
    await page.click('#ai-go'); await page.waitForTimeout(200);
    const lm = await page.evaluate(() => $('#ai-msg').textContent);
    await page.click('#lSave'); await page.waitForTimeout(400);
    const ld = await page.evaluate(() => ({ sheet: $('#sheetBody').textContent, chk: (labsOf(me()).find(r => r.chk) || { chk: [] }).chk.length }));
    check('防 AI 讀錯：BMI 和體重身高對不起來、體脂率和脂肪量對不起來、肌肉量大於體重；LDL 比總膽固醇高、收縮壓比舒張壓低、eGFR 和肌酸酐差很多、日期在未來；靜止心率比步行心率高；正常資料不誤報；匯入訊息提醒同一天已有報告，存檔後詳情顯示疑點',
      /BMI 26.5 和體重 70 kg、身高 172 cm 算出來的 23.7/.test(ck.s) && /體脂率 20%/.test(ck.s) && /肌肉量 72 kg 不可能/.test(ck.s) && !/去脂體重/.test(ck.s)
        && /LDL 170 比總膽固醇 150 還高/.test(ck.l) && /收縮壓 80 應該比舒張壓 120 高/.test(ck.l) && /eGFR 30 和肌酸酐 1 算出來的約 96/.test(ck.l) && /在未來/.test(ck.l) && ck.ok === 0 && /靜止心率 95 比步行平均心率 80/.test(ck.w)
        && /防 AI 讀錯檢查/.test(lm) && /LDL 170 比總膽固醇 150/.test(lm) && /2026-09-14 已經有一份報告/.test(lm) && /防錯檢查的疑點（2）/.test(ld.sheet) && ld.chk === 2, JSON.stringify({ ck, lm: lm.slice(0, 160), chk: ld.chk }));
    // 牙齒口腔、家族史、睡眠呼吸中止 AHI、職業身分與最低保障提示詞
    const dn = await page.evaluate(() => { closeSheet(); const m = MEM.find(x => x.id === 'a'); ACT = 'a'; m.fh = { ca: [], chr: [], early: false, mbc: true, gene: false };
      const P = yearPlan(m).items.map(o => `${o.pr}|${o.t}|${o.why}|${o.when}`), osa = condOf(m).items.find(c => c.k === 'osa');
      return { dg: COND.filter(x => x.g === 'dental').map(x => x.k).join(), cg: CONDG.some(g => g[0] === 'dental'), dental: P.find(x => /洗牙＋牙周檢查/.test(x)) || '', oral: P.find(x => /口腔黏膜/.test(x)) || '', brca: P.find(x => /遺傳諮詢（BRCA 評估）/.test(x)) || '',
        gum: symCtx(m, 'gum').join('｜'), mouthRf: SYM.find(x => x.k === 'mouth').rf.map(r => r[1]).join(), osaLine: condLine(osa), osaDyn: CONDK.osa.dyn(osa, m).join(), ai: aiPrompt(m, { topic: 'all', fh: true }), mp: promptMinProt() } });
    await page.evaluate(() => openMemberEdit('z9')); await page.waitForTimeout(300);
    await page.selectOption('#m-job', 'mil'); await page.selectOption('#m-role', 'parent'); await page.click('#m-earner'); await page.click('#m-save'); await page.waitForTimeout(300);
    const je = await page.evaluate(() => { const z = MEM.find(x => x.id === 'z9'); return `${z.job}|${z.role}|${z.earner}` });
    check('牙齒口腔：病史「牙周病」「口腔白斑／紅斑」；症狀「嘴破」「牙齦流血」有紅旗，牙齦症狀帶入糖尿病與阿斯匹靈；健檢建議洗牙（糖尿病每 3 個月）；已戒菸的口腔癌篩檢改成「向院所確認」',
      dn.dg === 'perio,oralpm' && dn.cg && /^3\|洗牙＋牙周檢查\|.*每 3 個月 1 次.*\|每 3 個月$/.test(dn.dental) && /^3\|口腔黏膜檢查（口腔癌篩檢）\|已戒菸.*向院所確認/.test(dn.oral) && /有糖尿病或血糖偏高/.test(dn.gum) && /抗凝血或抗血小板藥/.test(dn.gum) && dn.mouthRf === 'soon,soon', JSON.stringify({ dental: dn.dental, oral: dn.oral, gum: dn.gum }));
    check('家族史「男性家人乳癌」→ BRCA 遺傳諮詢、AI 也帶入；睡眠呼吸中止填 AHI 22 → 中度；最低保障提示詞：去識別化、有身分與可能的社會保險；設定可填職業身分、家庭角色、主要收入者',
      /^2\|遺傳諮詢（BRCA 評估）/.test(dn.brca) && /（有男性家人得過乳癌）/.test(dn.ai) && /・AHI 22/.test(dn.osaLine) && /AHI 22（中度 15–29）/.test(dn.osaDyn) && /（本人、男、42 歲、公務人員、家庭主要收入者）/.test(dn.mp) && /公教人員保險（公保）/.test(dn.mp) && /（配偶、女、40 歲、勞工（受僱））/.test(dn.mp) && !/王小明|小美|別人/.test(dn.mp) && je === 'mil|parent|true',
      JSON.stringify({ brca: dn.brca, osa: dn.osaLine, je, mp: dn.mp.slice(-400) }));
    await page.close();
  }

  // =============== 6y. 家系表（每位家人）、用藥結構化、核保除外與既往症、候選商品（建議書）比較、理賠時間軸與請求權時效 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    const REL = [{ r: 'father', dx: 'crc', age: 52 }, { r: 'mother', dx: 'breast', age: 38, gene: 'brca' }, { r: 'pgm', dx: 'ovary', age: 60 }, { r: 'uncp', dx: 'pancreas', age: 55 }, { r: 'father', dx: 'mi', age: 50 }];
    const MEDS = [{ n: 'Warfarin', dose: '3 mg', why: '心房顫動' }, { n: 'Bisoprolol 2.5 mg' }, { n: 'Ibuprofen' }, { n: 'Glimepiride 2 mg' }, { n: 'Levofloxacin 500 mg' }, { n: 'Atorvastatin 20 mg' }];
    page = await newPage({ members: [{ id: 'g', name: '測', sex: 'f', birth: '1990-03-01', h: 160, w: 55, act: '1.375', goal: 'keep', fh: { ca: [], chr: [], early: false, rel: REL },
        cond: { items: [{ k: 'disc', y: 2019 }, { k: 'ckd' }], medsL: MEDS, meds: '魚油', allergy: '無', surg: '' } },
      { id: 'h', name: '乙', sex: 'f', birth: '1990-03-01', h: 160, w: 55, act: '1.375', goal: 'keep', fh: { ca: [], chr: [], rel: REL.map(r => ({ ...r, gene: '' })) } }], active: 'g' });
    const fa = await page.evaluate(() => { const g = MEM[0], h = MEM[1], f = fhOf(g), P = m => yearPlan(m).items.map(o => `${o.pr}|${o.t}|${o.why}`);
      return { ca: f.ca.join(), chr: f.chr.join(), early: f.early, gene: f.gene, mbc: f.mbc, pg: P(g), ph: P(h), ai: aiPrompt(g, { topic: 'all', fh: true }), sum: summaryText(g) } });
    const has = (L, re) => L.find(x => re.test(x)) || '';
    check('家系表：父親 52 歲大腸癌、母親 38 歲乳癌（BRCA 陽性）、祖母卵巢癌、伯叔胰臟癌、父親 50 歲心肌梗塞 → 一等親癌症只算父母、早發、早發心血管、致病基因都自動推導；大腸鏡 40 歲開始每 5 年；乳房可提早到 30 歲；有致病基因 → 優先遺傳諮詢；Lp(a)',
      fa.ca === 'crc,breast' && /cvd/.test(fa.chr) && fa.early && fa.gene && !fa.mbc && /^3\|大腸鏡：40 歲開始、每 5 年\|一等親 52 歲確診大腸癌（60 歲前）/.test(has(fa.pg, /大腸鏡：40/)) && /^2\|乳房檢查：可以提早到 30 歲開始/.test(has(fa.pg, /乳房檢查：可以提早/))
        && /^1\|遺傳諮詢（家族已驗出致病基因）/.test(has(fa.pg, /家族已驗出/)) && !!has(fa.pg, /Lp\(a\)/), JSON.stringify({ ca: fa.ca, chr: fa.chr, pg: fa.pg.filter(x => /大腸鏡：|乳房檢查|遺傳|Lp/.test(x)) }));
    check('沒驗基因時：遺傳諮詢理由合併成一條（卵巢癌、胰臟癌、50 歲前乳癌、父系 2 位）；林奇症候群也合併理由（父系 3 位）；AI 與看診摘要列出每位家人（不寫名字）',
      /遺傳諮詢（BRCA 基因評估）\|.*有家人得卵巢癌、有家人得胰臟癌、有家人 50 歲以前得乳癌、父系有 2 位家人得乳癌、卵巢癌、胰臟癌或攝護腺癌/.test(has(fa.ph, /BRCA/)) && fa.ph.filter(x => /BRCA/.test(x)).length === 1
        && /^2\|遺傳諮詢（林奇症候群評估）\|.*父系有 3 位家人得大腸癌、子宮內膜癌等林奇相關癌症/.test(has(fa.ph, /林奇/)) && /【家族史（一、二等親）】父親：大腸癌（52 歲確診）、母親：乳癌（38 歲確診），BRCA1／BRCA2 陽性、祖母（父系）：卵巢癌（60 歲確診）/.test(fa.ai) && /家族史：父親：大腸癌（52 歲確診）/.test(fa.sum),
      JSON.stringify({ brca: fa.ph.filter(x => /BRCA|林奇/.test(x)) }));
    // 家系表：實際點畫面新增一位家人
    await page.evaluate(() => openMemberEdit('h', 'fh')); await page.waitForTimeout(300);
    await page.click('#m-fradd'); await page.waitForTimeout(100);
    const n0 = await page.evaluate(() => document.querySelectorAll('#m-frel [data-fri]').length);
    await page.selectOption(`#m-frel [data-fri="${n0 - 1}"] [data-ff="r"]`, 'brother'); await page.selectOption(`#m-frel [data-fri="${n0 - 1}"] [data-ff="dx"]`, 'stomach'); await page.fill(`#m-frel [data-fri="${n0 - 1}"] [data-ff="age"]`, '41');
    await page.click('#m-save'); await page.waitForTimeout(400);
    const fu = await page.evaluate(() => { const h = MEM.find(x => x.id === 'h'); return { n: h.fh.rel.length, last: JSON.stringify(h.fh.rel[h.fh.rel.length - 1]), ca: fhOf(h).ca.join() } });
    check('家系表表單：「＋ 新增一位家人」選兄弟、胃癌、41 歲 → 存檔後一等親癌症多了胃癌', fu.n === 6 && fu.last === JSON.stringify({ r: 'brother', dx: 'stomach', age: 41, gene: '' }) && /stomach/.test(fu.ca), JSON.stringify(fu));
    // 用藥結構化
    const md = await page.evaluate(() => { ACT = 'g'; const m = me(), F = fitPlan(m), N = nutriPlan(m); renderBody();
      return { cls: medCls('Warfarin').join() + '|' + medCls('保栓通').join() + '|' + medCls('維他命').join(), warn: medWarn(m).join('｜'), W: F.W.map(x => x.t).join('｜'), N: N.F.map(f => f.t).join('｜'), gum: symCtx(m, 'gum').join('｜'), heel: symCtx(m, 'heel').join('｜'),
        sum: summaryText(m), decl: healthDecl(m).join('｜'), card: $('#condBody').textContent, cl: JSON.stringify(cleanCond({ items: [], medsL: [{ n: '<b>X</b>', start: '2026-13', dose: 'a'.repeat(60) }, { n: '' }, null] }).medsL) } });
    check('用藥：一種藥一筆，App 辨識類別（Warfarin＝抗凝血、保栓通＝抗血小板）；交互作用提醒（抗凝血＋止痛藥、腎臟病吃止痛藥、Quinolone 跟腱）；病史頁列出用藥與提醒',
      md.cls === 'Warfarin 抗凝血|抗血小板|' && /抗凝血或抗血小板藥再加止痛消炎藥/.test(md.warn) && /腎功能不好：避免長期吃止痛消炎藥/.test(md.warn) && /Quinolone/.test(md.warn) && /目前用藥Warfarin 3 mg（心房顫動）/.test(md.card) && /💊 抗凝血或抗血小板藥再加止痛消炎藥/.test(md.card),
      JSON.stringify({ cls: md.cls, warn: md.warn }));
    check('用藥接進其他功能：乙型阻斷劑 → 運動改說話測試；降血糖藥 → 注意低血糖；Warfarin → 維生素 K 穩定；Atorvastatin → 避免葡萄柚；牙齦與腳跟症狀帶入；看診摘要、健康告知列出；用藥資料會被清洗',
      /吃乙型阻斷劑：心率會偏低/.test(md.W) && /低血糖/.test(md.W) && /吃 Warfarin（抗凝血）/.test(md.N) && /吃的藥怕葡萄柚/.test(md.N) && /抗凝血或抗血小板藥/.test(md.gum) && /quinolone/.test(md.heel)
        && /■ 目前用藥 Medications\n・Warfarin 3 mg（心房顫動）\n・Bisoprolol 2.5 mg/.test(md.sum) && /\n魚油/.test(md.sum) && /目前用藥：Warfarin 3 mg（心房顫動）/.test(md.decl) && /^\[\{"id":"[\w-]+","n":"<b>X<\/b>","dose":"a{40}","why":"","start":"","act":true\}\]$/.test(md.cl), JSON.stringify({ W: md.W, N: md.N, cl: md.cl }));
    await page.evaluate(() => { closeSheet(); openMemberEdit('g', 'cond') }); await page.waitForTimeout(300);
    const m0 = await page.evaluate(() => document.querySelectorAll('#m-medl [data-mi]').length);
    await page.click('#m-medadd'); await page.fill(`#m-medl [data-mi="${m0}"] [data-mf="n"]`, 'Rosuvastatin'); await page.fill(`#m-medl [data-mi="${m0}"] [data-mf="dose"]`, '10 mg 每晚'); await page.fill(`#m-medl [data-mi="${m0}"] [data-mf="why"]`, '降血脂');
    await page.click('#m-save'); await page.waitForTimeout(400);
    const m1 = await page.evaluate(() => { const L = condOf(MEM.find(x => x.id === 'g')).medsL; return { n: L.length, last: `${L[L.length - 1].n}|${L[L.length - 1].dose}|${L[L.length - 1].why}`, meds: condOf(MEM.find(x => x.id === 'g')).meds } });
    check('用藥表單：「＋ 新增藥物」填 Rosuvastatin 10 mg 降血脂 → 存檔；原本的用藥補充文字保留', m0 === 6 && m1.n === 7 && m1.last === 'Rosuvastatin|10 mg 每晚|降血脂' && m1.meds === '魚油', JSON.stringify({ m0, m1 }));
    // 核保除外、既往症
    const uw = await page.evaluate(() => { closeSheet(); const m = MEM.find(x => x.id === 'g'); ACT = 'g';
      const { p } = polCheck({ insurer: '甲人壽', product: '醫療險', start: '2021-03-05', payFreq: '年繳', premium: 10000, uwResult: '除外承保', uwExclusion: '對腰椎疾病不負給付責任', coverages: [{ name: '住院日額', cat: 'hosp_day', amount: 1500, unit: '元/日', quote: '每日 1,500 元' }] }, m);
      p.chk = true; INS.g = [p]; S.set('ins', INS); const e = { id: 'e1', type: 'ad', d: '2026-10-01', end: '2026-10-03', hosp: '乙醫院', dx: '椎間盤突出', claims: [] }; CLM.g = [e]; S.set('clm', CLM);
      const M = evtMatch(m, e); openPol(p.id); const det = $('#sheetBody').textContent; closeSheet();
      return { uw: JSON.stringify(p.uw), pw: M[0].pw.join('｜'), det, pr: promptClaim(m, e), pp: promptPolicy() } });
    check('核保紀錄：AI 讀到「除外承保、對腰椎疾病不負給付責任」→ 存成核保結果；保單詳情顯示；理賠時提醒除外約定，並提醒既往症（2019 年椎間盤突出早於 2021 年投保）；理賠提示詞也帶入；保單提示詞要求抄批註',
      uw.uw === JSON.stringify({ res: 'excl', excl: '對腰椎疾病不負給付責任', decl: '' }) && /投保時有除外約定：「對腰椎疾病不負給付責任」/.test(uw.pw) && /既往症提醒：「椎間盤突出／坐骨神經痛」2019 年確診，早於這張保單生效（2021 年）/.test(uw.pw)
        && /核保除外承保（有批註）：對腰椎疾病不負給付責任/.test(uw.det) && /App 提醒：投保時有除外約定/.test(uw.pr) && /uwExclusion/.test(uw.pp) && /批註書、除外約定/.test(uw.pp), JSON.stringify({ uw: uw.uw, pw: uw.pw }));
    // 候選商品（建議書）：實際點畫面匯入
    await page.evaluate(() => go('ins', 'pol')); await page.waitForTimeout(200); await page.click('#polBody [data-poladd]'); await page.waitForTimeout(300);
    await page.click('#pi-kind [data-v="quote"]');
    await page.fill('#pi-in', JSON.stringify({ type: 'jiaankang.policy', v: 1, policies: [{ insurer: '乙人壽', product: '癌症險建議書', payFreq: '年繳', premium: 8000,
      coverages: [{ name: '癌症一次金', cat: 'cancer', amount: 50, unit: '萬元', quote: '罹患癌症一次給付 50 萬元' }, { name: '住院日額', cat: 'hosp_day', amount: 1000, unit: '元/日', quote: '每日 1,000 元', renewable: '不保證續保' }] }] }));
    await page.click('#pi-go'); await page.waitForTimeout(300); await page.click('#pi-save'); await page.waitForTimeout(400);
    const q0 = await page.evaluate(() => { const m = me(), q = insOf(m).find(p => p.status === 'quote'); renderTodo();
      return { st: q?.status, view: $('.view.on').id + '/' + !$('#v-ins .subp[data-sub="cov"]').hidden, cov: $('#covBody').textContent, sum: covSum(m).map(s => s.cat).join(), todo: $('#todoCard').textContent, pol: (renderPol(), $('#polBody').textContent), qid: q?.id, qm: evtMatch(m, CLM.g[0]).some(x => x.p.status === 'quote') } });
    await page.evaluate(id => openPol(id), q0.qid); await page.waitForTimeout(200); await page.click('#pd-buy'); await page.waitForTimeout(200);
    const q1 = await page.evaluate(id => { const q = insFind(me(), id); return `${q.status}|${q.start === ymd(new Date())}|${q.chk}|${covSum(me()).map(s => s.cat).join()}` }, q0.qid);
    check('建議書（還沒買）匯入成「候選」：不算進目前保障、不算待核對；「保障」頁顯示加買後：癌症「補缺口」、住院日額 1,500 → 2,500「加碼」、不保證續保提醒；候選不參與理賠比對；買了以後一鍵轉成正式保單',
      q0.st === 'quote' && q0.view === 'v-ins/true' && /如果加買候選商品/.test(q0.cov) && /癌症沒有 → 50 萬 補缺口/.test(q0.cov) && /住院日額1,500 元\/日 → 2,500 元\/日 加碼（和現有重複）/.test(q0.cov) && /「住院日額」不保證續保/.test(q0.cov)
        && q0.sum === 'hosp_day' && !q0.qm && !/保單待核對/.test(q0.todo) && /候選商品（建議書／DM，還沒買）/.test(q0.pol) && /^active\|true\|false\|hosp_day,cancer/.test(q1), JSON.stringify({ q0: { ...q0, cov: q0.cov.slice(0, 200), todo: '', pol: '' }, q1 }));
    // 理賠時間軸與時效
    await page.evaluate(() => { closeSheet(); openEvt('e1') }); await page.waitForTimeout(200);
    const pid = await page.evaluate(() => insOf(me()).find(p => p.insurer === '甲人壽').id);
    await page.selectOption(`#sheetBody [data-cst="${pid}"]`, 'prep'); await page.waitForTimeout(100); await page.selectOption(`#sheetBody [data-cst="${pid}"]`, 'sent'); await page.waitForTimeout(100);
    const tl = await page.evaluate(() => { openEvt('e1'); const t = $('#sheetBody').textContent; const m = me(); return { t, log: clmOf(m)[0].claims[0].log.map(l => l.st).join() } });
    const st2 = await page.evaluate(([d, e]) => { closeSheet(); const m = me(); CLM.g.push({ id: 'e2', type: 'ad', d, end: e, hosp: '丙醫院', dx: '肺炎', claims: [] }); S.set('clm', CLM); renderTodo(); renderClm(); return { todo: $('#todoCard').textContent, list: $('#clmBody').textContent, due: evtDue(CLM.g[1]), cb: JSON.stringify(cleanCLM({ g: [{ id: 'x', type: 'ad', d: '2026-01-01', claims: [{ pid: 'p', st: 'sent', log: [{ st: 'sent', d: '2026-01-05' }, { st: 'evil', d: '2026-01-06' }, 5] }] }] }, v => typeof v === 'string' && /^[\w-]{1,40}$/.test(v)).g[0].claims[0].log) } }, [T(705), T(700)]);
    check('理賠時間軸：住院→出院→準備文件→已送件依日期排；請求權時效約到出院後 2 年（2028-10-03）；快過時效又還沒申請的事件上總覽待辦；備份還原時進度紀錄會被清洗',
      tl.log === 'prep,sent' && /時間軸/.test(tl.t) && /2026-10-01住院・乙醫院・椎間盤突出/.test(tl.t) && /2026-10-03出院/.test(tl.t) && /甲人壽：準備文件/.test(tl.t) && /甲人壽：已送件/.test(tl.t) && /請求權時效約到 2028-10-03/.test(tl.t)
        && /⏳ 理賠時效快到：肺炎/.test(st2.todo) && /時效剩 \d+ 天/.test(st2.list) && st2.cb === JSON.stringify([{ st: 'sent', d: '2026-01-05' }]), JSON.stringify({ log: tl.log, todo: st2.todo.slice(0, 160), due: st2.due, cb: st2.cb }));
    await page.close();
  }

  // =============== 6z. Kinwell：保單顏色分級（錯誤／待核對／已核對）＋怎麼修正、保障加總（單位／計畫、豁免不算金額，日額只寫元當每日）、繳費期滿不算保費、保險公司更新 → 重新匯入取代＋變更紀錄＋復原、保障缺口、時間軸、桌機寬度 ===============
  {
    const POLS = [
      { id: 'p1', insurer: '甲人壽', product: '安心終身壽險', start: '1978-03-01', payYears: 20, payFreq: '年', prem: 30000, status: 'active', items: [{ name: '身故保險金', kind: 'main', cat: 'life', amt: 100, unit: '萬元', quote: '身故保險金 100 萬元' }], src: 'ai', chk: true, warn: [], t: '2026-11-01' },
      { id: 'p2', insurer: '乙人壽', product: '醫療終身保險', start: '2020-01-01', payYears: 20, payFreq: '年', prem: 20000, status: 'paidup', items: [
        { name: '住院日額', kind: 'main', cat: 'hosp_day', amt: 1000, unit: '元', quote: '住院日額 1,000 元' }, { name: '住院醫療計畫', kind: 'rider', cat: 'hosp_real', amt: 2, unit: '計畫', quote: '計畫二' },
        { name: '豁免保費', kind: 'rider', cat: 'waiver', amt: 20000, unit: '元', quote: '豁免保險費 20,000 元' }], src: 'ai', chk: false, warn: ['AI 說看不清楚：第 3 頁模糊'], t: '2026-11-01' },
      { id: 'p3', insurer: '丙人壽', product: '定期壽險', start: '2000-01-01', payYears: 20, payFreq: '年', prem: 10000, status: 'paidup', items: [{ name: '身故', cat: 'life', amt: 300, unit: '萬元', maxAge: 75, quote: '身故保險金 300 萬元' }], src: 'ai', chk: true, warn: [], t: '2026-11-01' },
      { id: 'p4', insurer: '丁產險', product: '傷害保險', start: '2024-01-10', payFreq: '年', prem: 3000, status: 'active', items: [{ name: '意外身故', cat: 'accident', amt: 500, unit: '萬元', quote: '意外身故保險金 300 萬元' }], src: 'ai', chk: false, warn: [], t: '2026-11-01' }];
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 70, act: '1.375', goal: 'keep', job: 'lab', role: 'me', earner: true, inc: 80, debt: 600 },
      { id: 'k', name: '小寶', sex: 'm', birth: '2018-06-01', h: 120, w: 22, act: '1.375', goal: 'keep', role: 'child' }], active: 'a', ins: { a: POLS },
      clm: { a: [{ id: 'e9', type: 'acc', d: '2026-05-01', dx: '扭傷', claims: [{ pid: 'p4', st: 'paid' }] }] } });
    const z0 = await page.evaluate(() => { go('ins', 'pol'); const m = me();
      return { rows: [...document.querySelectorAll('#polBody .rec')].map(x => x.className.match(/plv-(\w+)/)[1] + ':' + x.querySelector('.tg').textContent).join(), bd: $('#v-ins .subnav [data-sub="pol"] .bd').textContent + '|' + $('#v-ins .subnav [data-sub="pol"] .bd').className,
        legend: $('#polBody .plegend').textContent, lv: insOf(m).map(p => polLv(p, m)).join(), todo: (renderTodo(), $('#todoCard').textContent), app: APP_ID, ids: APP_IDS.join(), fn: fileName(null, false), ics: fitICS(m, fitPlan(m)).includes('PRODID:-//Kinwell//'), pp: promptPolicy() } });
    check('改名 Kinwell（備份 id、檔名 kinwell-…、提示詞 type kinwell.*、行事曆 PRODID）；舊名 JiaAnKang、NutriCore 的備份照樣接受；保單清單用顏色分級：生效日早於出生、繳費期滿卻還在繳、金額和原文對不上＝🔴 錯誤，已核對＝🟢；徽章紅色；總覽待辦列出錯誤與保障不足',
      z0.app === 'Kinwell' && z0.ids === 'Kinwell,JiaAnKang,NutriCore' && /^kinwell-all-\d{4}-\d{2}-\d{2}\.json$/.test(z0.fn) && z0.ics && /"type":"kinwell.policy"/.test(z0.pp)
        && z0.rows === 'err:🔴 錯誤,err:🔴 錯誤,ok:🟢 已核對,err:🔴 錯誤' && z0.bd === '3|bd r' && /錯誤：資料矛盾/.test(z0.legend) && /待核對：對照保單確認/.test(z0.legend) && z0.lv === 'err,err,ok,err'
        && /🔴 3 張保單資料有錯誤/.test(z0.todo) && /🛡 保障不足：壽險低於目標、意外險低於目標/.test(z0.todo), JSON.stringify({ ...z0, pp: '', todo: z0.todo.slice(0, 120) }));
    const z1 = await page.evaluate(() => { openPol('p1'); const a = $('#sheetBody').textContent, bar = $('#sheetBody .plvbar').className; openPol('p2'); const b = $('#sheetBody').textContent, log = $('#sheetBody details[open]')?.textContent || '';
      return { a, bar, b, log, ci: [...document.querySelectorAll('#sheetBody .cdet')].map(c => (c.className.match(/ci-(\w+)/) || [, '-'])[1]).slice(0, 3).join() } });
    check('保單明細：顏色條＋逐項「怎麼修正」（生效日早於出生 → 選錯家人或民國年；繳費期滿矛盾；「計畫」不是金額要換算；日額只寫「元」當每日；豁免保費不算金額）；有問題的保障項目標顏色；未核對時展開匯入紀錄；「終身」顯示；保險公司更新的處理步驟',
      /plv-err/.test(z1.bar) && /生效日 1978-03-01 早於被保險人（王小明）出生日 1984-05-05/.test(z1.a) && /匯入到錯的家人/.test(z1.a) && /民國年＋1911/.test(z1.a) && /保障到終身（依名稱判斷）/.test(z1.a)
        && /狀態是「繳費期滿」，但 2020-01-01 生效、繳 20 年，最後一期在 2039-01/.test(z1.b) && /「住院醫療計畫」以「計畫」計，不是金額/.test(z1.b) && /2 單位 × 每單位 1,000 元\/日 → 2,000 元\/日/.test(z1.b)
        && /「住院日額」單位寫「元」，App 當成每日給付/.test(z1.b) && /「豁免保費」是豁免保費：不算保障金額/.test(z1.b) && /年繳保費20,000 元（狀態寫繳費期滿，但還沒繳完/.test(z1.b) && /第 3 頁模糊/.test(z1.log) && z1.ci === '-,chk,-'
        && /保險公司更新了條款、保費或保額，怎麼改/.test(z1.b) && /保險存摺/.test(z1.b) && /用新資料更新這張/.test(z1.b), JSON.stringify({ bar: z1.bar, ci: z1.ci, b: z1.b.slice(0, 200) }));
    // 我已核對：還有錯誤要先確認；金額對不上原文的錯誤核對後消失，資料矛盾的不會
    const z2 = await page.evaluate(() => { const m = me(); let msg = ''; const c0 = window.confirm; window.confirm = t => { msg = t; return true }; openPol('p4'); $('#pd-chk').click(); openPol('p2'); $('#pd-chk').click(); window.confirm = c0; closeSheet();
      return { msg, lv: insOf(m).map(p => polLv(p, m)).join(), chk: insOf(m).map(p => p.chk ? 1 : 0).join('') } });
    check('按「我已核對」時還有錯誤會先跳確認；金額對不上原文（AI 讀錯）核對後消失 → 綠；繳費期滿矛盾核對後仍是紅色，直到資料改正',
      /還有 1 個錯誤/.test(z2.msg) && /繳費期滿/.test(z2.msg) && /資料矛盾的紅色會留著/.test(z2.msg) && z2.lv === 'err,err,ok,ok' && z2.chk === '1111', JSON.stringify(z2));
    await page.evaluate(() => go('ins', 'cov')); await page.waitForTimeout(150);
    const z3 = await page.evaluate(() => { const m = me(), svg = $('#covBody svg[role="img"]');
      return { cov: $('#covBody').textContent, gap: [...document.querySelectorAll('#covBody .gap')].map(g => g.className.match(/g-(\w+)/)[1]).join(), sum: covSum(m).map(s => s.cat + ':' + (s.nm ? 'nm' + s.n : s.v + s.per)).join(), label: svg?.getAttribute('aria-label'), fade: [...(svg?.querySelectorAll('rect') || [])].some(r => +r.getAttribute('opacity') < 1),
        map: [...document.querySelectorAll('#covBody table.imap tr')].map(r => [...r.children].map(c => c.textContent).join('/')).join('|'), er: document.querySelectorAll('#covBody table.imap td.er').length, gp: [...document.querySelectorAll('#covBody table.imap td.gp1,#covBody table.imap td.gp2')].map(t => t.className).join(),
        gauge: !!$('#covBody .pgauge'), mp: promptMinProt(), pc: promptCompare(m) } });
    check('保障加總：單位／計畫、豁免保費不加進金額（另計項數）；住院日額只寫「元」當作每日；壽險 100＋300＝400 萬含錯誤；繳費期滿的不算每年保費（只算還在繳的 3,000 元）；提示詞帶年收入、只算還在繳的保費',
      /壽險（身故）400 萬 含錯誤/.test(z3.cov) && /住院日額1,000 元\/日 含錯誤/.test(z3.cov) && /住院醫療費用（實支實付）1 項不是金額（看條款）/.test(z3.cov) && /豁免保費1 項（不算金額）/.test(z3.cov) && /意外身故／失能500 萬(?! 含)/.test(z3.cov)
        && z3.sum === 'life:4000000,hosp_day:1000day,hosp_real:nm1,waiver:nm1,accident:5000000' && /王小明 每年3,000 元/.test(z3.cov) && /已經繳完、保障還在：甲人壽 安心終身壽險、乙人壽 醫療終身保險、丙人壽 定期壽險/.test(z3.cov)
        && /年收入約 80 萬、負債約 600 萬/.test(z3.mp) && /每年保費約 3,000 元（繳費期滿的不算）/.test(z3.mp) && /住院醫療費用（實支實付） 1 項金額算不出來（以單位／計畫／倍數計，或沒寫金額）/.test(z3.pc), JSON.stringify({ sum: z3.sum, cov: z3.cov.slice(0, 300) }));
    check('保障缺口：壽險目標＝年收入 80 萬 × 10 與負債 600 萬取大的（800 萬），有 400 萬 → 不足；實支實付只有「計畫」→ 金額不明；日額 1,000／2,000 不足；癌症、重大疾病沒有；失能扶助（照顧費 3 萬＋月收入一半，每月）、長照（每月 3 萬）沒有；圖示：缺口進度條、保障到幾歲時間軸（終身、部分到期變淡）、保費占年收入量表、全家地圖（✕ 有錯、缺口數，小孩缺實支實付 → 紅色）',
      z3.gap === 'low,low,other,low,none,none,none,none' && /有 400 萬／目標 800 萬・年收入 80 萬 × 10、負債 600 萬，取大的/.test(z3.cov) && /實支實付醫療（每次限額）金額不明/.test(z3.cov) && /雙十原則/.test(z3.cov)
        && /壽險保到 終身/.test(z3.label) && /醫療保到 終身/.test(z3.label) && /意外保到 ？/.test(z3.label) && z3.fade && z3.gauge && /王小明 保費占年收入0\.4%/.test(z3.cov)
        && /王小明\/✕\/✔\/✕\/—\/—\/—\/—\/8/.test(z3.map) && /小寶\/—\/—\/—\/—\/—\/—\/—\/2/.test(z3.map) && /\/缺口$/.test(z3.map.split('|')[0]) && z3.er === 2 && z3.gp === 'gp2,gp1', JSON.stringify({ gap: z3.gap, label: z3.label, map: z3.map, er: z3.er, gp: z3.gp }));
    // 保險公司更新：同一張保單重新匯入 → 列出差異、預設「用新資料更新這張」；匯到小孩的父母保單 → 生效日早於出生，預設不勾
    await page.evaluate(() => { go('ins', 'pol'); openPolImport() }); await page.waitForTimeout(200);
    await page.fill('#pi-in', JSON.stringify({ type: 'kinwell.policy', v: 1, policies: [
      { insurer: '丁產險', product: '傷害保險', start: '2024-01-10', payFreq: '年繳', premium: 3300, coverages: [{ name: '意外身故', cat: 'accident', amount: 300, unit: '萬元', quote: '意外身故保險金 300 萬元' }, { name: '意外醫療', cat: 'acc_med', amount: 3, unit: '萬元', quote: '意外醫療 3 萬元' }] },
      { insurer: '戊人壽', product: '終身壽險', insuredHint: '子女', start: '1980-02-02', payYears: 20, payFreq: '年繳', premium: 12000, coverages: [{ name: '身故', cat: 'life', amount: 100, unit: '萬元', quote: '身故保險金 100 萬元' }] }] }));
    await page.click('#pi-go'); await page.waitForTimeout(300);
    const z4 = await page.evaluate(() => ({ checks: [...document.querySelectorAll('#pi-out [data-pi]')].map(c => c.checked ? 1 : 0).join(''), mode: $('#pi-out [data-pimode]').value, out: $('#pi-out').textContent }));
    await page.click('#pi-save'); await page.waitForTimeout(300);
    const z5 = await page.evaluate(() => { const m = me(), q = insFind(m, 'p4'); openPol('p4'); return { n: insOf(m).length, kid: insOf(MEM[1]).length, prem: q.prem, chk: q.chk, it: q.items.map(c => c.name + c.amt).join(), hist: q.hist.map(h => h.why + ':' + h.d.prem + ':' + h.d.chk).join(), claim: !!insFind(m, CLM.a[0].claims[0].pid), toast: $('#toast').textContent, sheet: $('#sheetBody').textContent } });
    check('保險公司更新保費、保額：重新匯入同一張 → 列出差異（保費 3,000 → 3,300、意外身故 500 → 300 萬、新增意外醫療），預設「用新資料更新這張」：保單 id 不變（理賠紀錄還連得到）、舊版存進變更紀錄、要重新核對；匯到小孩名下但生效日早於出生 → 紅字、預設不匯入',
      z4.checks === '10' && z4.mode === 'upd' && /這次有 3 處不同/.test(z4.out) && /保費 3,000 元 → 3,300 元/.test(z4.out) && /「意外身故」500 萬元 → 300 萬元/.test(z4.out) && /新增「意外醫療」3 萬元/.test(z4.out) && /生效日 1980-02-02 早於被保險人（小寶）出生日/.test(z4.out)
        && z5.n === 4 && z5.kid === 0 && z5.prem === 3300 && z5.chk === false && z5.it === '意外身故300,意外醫療3' && z5.hist === 'import:3000:true' && z5.claim && /已更新 1 張（舊版存在變更紀錄）/.test(z5.toast)
        && /變更紀錄（1）/.test(z5.sheet) && /重新匯入更新/.test(z5.sheet) && /保費 3,000 元 → 3,300 元/.test(z5.sheet), JSON.stringify({ z4: { ...z4, out: z4.out.slice(0, 200) }, z5: { ...z5, sheet: '' } }));
    // 復原、編輯也存變更紀錄、核對狀態不會因為編輯就自動變成已核對
    await page.evaluate(() => $('#sheetBody [data-prest="0"]').click()); await page.waitForTimeout(200);
    const z6 = await page.evaluate(() => { const q = insFind(me(), 'p4'); return { prem: q.prem, chk: q.chk, it: q.items.map(c => c.name + c.amt).join(), hist: q.hist.map(h => h.why + ':' + h.d.prem).join() } });
    await page.evaluate(() => openPol('p2')); await page.click('#pd-edit'); await page.waitForTimeout(200); await page.selectOption('#pe-st', 'active'); await page.click('#pe-save'); await page.waitForTimeout(200);
    const z7 = await page.evaluate(() => { const m = me(), q = insFind(m, 'p2'); return { st: q.status, chk: q.chk, lv: polLv(q, m), warn: q.warn.join(), hist: q.hist.map(h => h.why + ':' + h.d.status).join(), sheet: $('#sheetBody').textContent, annual: insOf(m).filter(p => polPaying(p)).map(p => p.id).join() } });
    check('「復原到這版」回到更新前（保費 3,000、意外身故 500 萬、已核對），更新後的版本也存進紀錄；編輯（繳費期滿 → 有效）也存變更紀錄、保留匯入紀錄、不會自動標成已核對；改正後紅色消失，保費開始算進每年保費',
      z6.prem === 3000 && z6.chk === true && z6.it === '意外身故500' && z6.hist === 'restore:3300' && z7.st === 'active' && z7.chk === true && z7.lv === 'ok' && /第 3 頁模糊/.test(z7.warn) && z7.hist === 'edit:paidup' && /手動編輯/.test(z7.sheet) && /狀態 繳費期滿（保障還在） → 有效/.test(z7.sheet) && z7.annual === 'p2,p4',
      JSON.stringify({ z6, z7: { ...z7, sheet: '' } }));
    // 調整目標；備份來回：變更紀錄、年收入、目標都保留，壞資料被清掉
    await page.evaluate(() => { closeSheet(); go('ins', 'cov') }); await page.waitForTimeout(150); await page.click('#covBody [data-gapedit]'); await page.waitForTimeout(200);
    await page.fill('#gp-inc', '100'); await page.fill('#sheetBody [data-gk="life"]', '0'); await page.fill('#sheetBody [data-gk="hosp_real"]', 'abc'); await page.click('#gp-save'); await page.waitForTimeout(200);
    const z8 = await page.evaluate(() => { const m = me(), G = covGap(m), d = cleanBackup(JSON.parse(JSON.stringify({ ...packData(null), members: [{ ...MEM[0], covT: { life: 0, cancer: -5, evil: 9 }, inc: 'x' }, MEM[1]] })));
      return { inc: m.inc, covT: JSON.stringify(m.covT), life: G.find(g => g.k === 'life').st, acc: G.find(g => g.k === 'accident').tg, cov: $('#covBody').textContent, todo: (renderTodo(), $('#todoCard').textContent),
        bk: JSON.stringify({ covT: d.mem[0].covT, inc: d.mem[0].inc, hist: d.ins.a.find(p => p.id === 'p4').hist.map(h => h.why + ':' + h.d.prem).join(), h2: d.ins.a.find(p => p.id === 'p2').hist.length }) } });
    check('調整目標：年收入改 100 萬 → 意外目標 1,000 萬；壽險目標填 0 ＝不急；亂填的目標不存；備份還原保留變更紀錄與目標，負數、未知欄位、非數字年收入被清掉',
      z8.inc === 100 && z8.covT === '{"life":0}' && z8.life === 'na' && z8.acc === 1000 && /有 500 萬／目標 1,000 萬/.test(z8.cov) && /🛡 保障不足：意外險低於目標/.test(z8.todo) && !/壽險低於目標/.test(z8.todo)
        && z8.bk === JSON.stringify({ covT: { life: 0 }, inc: '', hist: 'restore:3300', h2: 1 }), JSON.stringify(z8.bk) + ' ' + z8.covT);
    // 小孩：壽險不急（保險法第 107 條）
    const z9 = await page.evaluate(() => { ACT = 'k'; renderAll(); const G = covGap(me()); ACT = 'a'; return G.map(g => g.k + ':' + g.st).join() + '|' + G[0].why });
    check('未滿 15 歲：壽險不急（身故保險金滿 15 歲才生效，保險法第 107 條）；沒有保單也算出缺口（實支實付、住院日額）', /^life:na,accident:adv,hosp_real:none,hosp_day:none,cancer:adv,critical:adv/.test(z9) && /第 107 條/.test(z9), z9);
    // 電腦寬螢幕：內容維持手機寬度置中
    await page.setViewportSize({ width: 900, height: 860 }); await page.waitForTimeout(200);
    const z10 = await page.evaluate(() => { openPol('p1'); const r = { body: Math.round(document.body.getBoundingClientRect().width), nav: Math.round($('#nav').getBoundingClientRect().width), sheet: Math.round($('.sheet-panel').getBoundingClientRect().width), left: Math.round(document.body.getBoundingClientRect().left) }; closeSheet(); return r });
    check('平板橫放（寬 900）：內容、底部選單、彈出視窗維持手機寬度置中（不會拉滿整個螢幕）', z10.body === 640 && z10.nav === 620 && z10.sheet === 640 && z10.left === 130, JSON.stringify(z10));
    await page.close();
  }

  // =============== 6za. 下拉選單配色、電腦版（左側選單＋雙欄＋右側抽屜）、實際資料暴露的錯誤：成年人沒填收入不能說壽險「不急」、沒有目標的進度條不能是滿的、保費 0、急症自測沒上待辦、已知脂肪肝不再叫你照超音波、蛋白質目標與「加 6 顆蛋」、握力抄成範圍下限、X 光原文正常、eGFR 可由肌酸酐算、體脂機身高設定不同 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    page = await newPage({ members: [{ id: 'u', name: '測試甲', sex: 'm', birth: '1984-05-05', h: 171.8, w: 74, act: '1.375', goal: 'auto', fit: { lim: [], lvl: 'new', days: 3, min: 30, like: [], time: '07:00' },
        cond: { items: [{ k: 'nafld', y: 2026, st: 'fu' }, { k: 'cac', st: 'fu' }], meds: '', allergy: '無', surg: '' } }], active: 'u',
      scale: { u: [{ id: 's1', t: T(1) + 'T20:21', weight: 74.6, bmi: 24.9, fat: 21.2, visceral: 6, muscle: 55.6, status: { visceral: '警戒', fat: '偏高' } }] },
      labs: { u: [{ id: 'l1', t: T(50), hospital: '甲醫院', items: { cr: { v: 0.95 }, ldl: { v: 112, hi: 130 }, grip_r: { v: 36, lo: 36, hi: 44, ref: '36~44 kgf' }, grip_l: { v: 34, lo: 34, hi: 41, ref: '34~41 kgf' },
        cxr: { v: '輕微變化（如主動脈鈣化、陳舊病灶）', ref: '原文：胸部X光檢查：肺部無明顯異常(疑輕度脊椎側彎)' }, us_liver: { v: '輕度脂肪肝', ref: '原文：腹部超音波：輕度脂肪肝' } }, extra: [] }] },
      self: { u: [{ id: 'h1', k: 'heart', t: T(0), a: [null, 0, 0, 0, null, 0, 0, 0, 1, null, 0, 61, 0, null, 0] }] },
      ins: { u: [{ id: 'q1', insurer: '甲人壽', product: '終身壽險', start: '2013-06-18', payYears: 20, payFreq: '年', prem: 0, status: 'active', items: [{ name: '終身壽險', kind: 'main', cat: 'life', amt: 15.5, unit: '萬元', quote: '保險金額 15.5 萬元' }], src: 'ai', chk: false, warn: [], t: T(0) },
        { id: 'q2', insurer: '乙產險', product: '傷害保險', start: '2020-01-01', payFreq: '年', prem: 2000, status: 'active', items: [{ name: '意外身故', cat: 'accident', amt: 110, unit: '萬元', quote: '意外身故 110 萬元' }], src: 'ai', chk: true, warn: [], t: T(0) }] } });
    const y0 = await page.evaluate(() => { const m = me(); openPolEdit('q1'); const opt = $('#pe-st option'), sel = $('#pe-st'), bg = getComputedStyle(opt).backgroundColor, fg = getComputedStyle(opt).color; closeSheet();
      const lum = c => { const [r, g, b] = (c.match(/\d+(\.\d+)?/g) || [255, 255, 255]).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 };
      return { scheme: getComputedStyle(document.documentElement).colorScheme, bg, bgL: lum(bg), fgL: lum(fg), selBg: getComputedStyle(sel).backgroundColor } });
    check('下拉選單：整頁宣告深色（color-scheme: dark），選項是深底淺字（電腦版 Chrome 不再白底淺字看不到）',
      /dark/.test(y0.scheme) && /^rgb\(/.test(y0.bg) && y0.bgL < 0.25 && y0.fgL > 0.7, JSON.stringify(y0));
    const y1 = await page.evaluate(() => { const m = me(); go('ins', 'cov'); const G = covGap(m), life = G.find(g => g.k === 'life'), acc = G.find(g => g.k === 'accident');
      const rowOf = k => [...document.querySelectorAll('#covBody .gap')][GAPK.findIndex(g => g.k === k)];
      return { life: life.st + '|' + life.why, acc: acc.st, lifeBar: rowOf('life').querySelector('.gbar').className + '|' + rowOf('life').querySelector('.gbar i').style.width, accBar: rowOf('accident').querySelector('.gbar').className + '|' + rowOf('accident').querySelector('.gbar i').style.width,
        flags: polFlags(insFind(m, 'q1'), m).map(f => f.lv + ':' + f.t).join('｜') } });
    check('保障缺口：成年人沒填年收入、負債時，壽險不能顯示「不急」，要說「填年收入、負債就能算目標」；沒有目標的列不畫滿格進度條（虛線＝還不能判斷）；有效保單每期保費 0 要提醒（參考：不影響保障）',
      !/^na/.test(y1.life) && /填年收入、負債就能算目標/.test(y1.life) && /unk/.test(y1.lifeBar) && /\|0%$/.test(y1.lifeBar) && /unk/.test(y1.accBar) && /\|0%$/.test(y1.accBar) && /info:每期保費是 0/.test(y1.flags), JSON.stringify(y1));
    const y2 = await page.evaluate(() => { const m = me(); go('dash'); const c = calc(m), sc = scaleEval(scalesOf(m)[0], m).map(i => i.k).join();
      go('menu', 'menu'); return { todo: $('#todoCard').innerHTML, prot: Math.round(c.prot), w: c.w, sc, menu: $('#menuSum').textContent } });
    check('總覽待辦：心臟警訊自測結果是「儘快」→ 上待辦（點了打開結果）；已知脂肪肝（病史或超音波）不再出現「內臟脂肪 → 建議超音波確認脂肪肝」；新手減脂的蛋白質不超過每公斤 1.6 g；補蛋白質不再叫你「加 6 顆蛋」',
      /心臟警訊/.test(y2.todo) && /data-self="heart"/.test(y2.todo) && !/visceral_liver/.test(y2.sc) && /visceral/.test(y2.sc) && y2.prot <= Math.round(y2.w * 1.6) + 1 && !/加 [2-9] 顆蛋/.test(y2.menu),
      JSON.stringify({ todo: y2.todo.replace(/<[^>]+>/g, ' ').slice(0, 160), prot: y2.prot, w: y2.w, sc: y2.sc, menu: y2.menu.slice(-90) }));
    const y3 = await page.evaluate(() => { const m = me(), r = labsOf(m)[0], W = labCheck(r.items, m, r.t), d = derivedOf(m).find(x => x.k === 'egfr_calc'), ai = aiPrompt(m, { topic: 'visit' }), sk = scaleCheck(scalesOf(m)[0], m);
      openLabDetail(r.id); const det = $('#sheetBody').textContent; closeSheet(); return { W: W.join('｜'), egfr: d ? d.val + '|' + d.lv : '', miss: (ai.match(/【這份報告沒有驗】[^\n]*/) || [''])[0], sk: sk.join('｜'), det, lp: promptLab() } });
    check('防 AI 讀錯：握力剛好等於參考範圍下限（把 InBody「推估握力」範圍當成測量值）、X 光原文寫肺部無明顯異常卻選「輕微變化」都提醒（舊紀錄打開也看得到）；eGFR 沒驗但有肌酸酐 → App 用 CKD-EPI 2021 算（約 102，正常），AI 提示詞不再說「沒有驗 eGFR」；體脂機 BMI 推回的身高 173 cm 和 171.8 cm 不同要提醒；體檢提示詞教 AI 不要把推估握力當測量值',
      /握力.*範圍下限/.test(y3.W) && /原文寫.*無明顯異常/.test(y3.W) && /握力.*範圍下限/.test(y3.det) && /^10[0-4]\|0$/.test(y3.egfr) && !/eGFR/.test(y3.miss) && /體脂機用的身高約 173 cm/.test(y3.sk) && /推估握力/.test(y3.lp),
      JSON.stringify({ W: y3.W, egfr: y3.egfr, miss: y3.miss, sk: y3.sk }));
    // 電腦版：≥1024px 左側直式選單、內容雙欄、彈出視窗改成右側抽屜；平板寬度維持手機版置中
    await page.setViewportSize({ width: 1280, height: 860 }); await page.waitForTimeout(200);
    const y4a = await page.evaluate(() => { go('ins', 'cov'); const nav = $('#nav').getBoundingClientRect(), main = $('#v-ins .subp[data-sub="cov"]'), cols = getComputedStyle(main).columnCount, cards = [...main.querySelectorAll('#covBody > .card')].map(c => Math.round(c.getBoundingClientRect().left));
      openPol('q1'); return { navV: nav.height > nav.width * 2, navL: Math.round(nav.left), navR: Math.round(nav.right), cols, lefts: [...new Set(cards)].length, body: Math.round(document.body.getBoundingClientRect().width) } });
    await page.waitForTimeout(500);   // 等抽屜滑進來
    const y4 = { ...y4a, ...(await page.evaluate(() => { const sp = $('.sheet-panel').getBoundingClientRect(); closeSheet(); go('dash'); return { spR: Math.round(sp.right), spW: Math.round(sp.width), spH: Math.round(sp.height), dc: getComputedStyle($('#v-dash')).columnCount } })) };
    await page.setViewportSize({ width: 820, height: 1100 }); await page.waitForTimeout(200);
    const y5 = await page.evaluate(() => ({ body: Math.round(document.body.getBoundingClientRect().width), cols: getComputedStyle($('#v-dash')).columnCount, navH: $('#nav').getBoundingClientRect().height < 100 }));
    check('電腦版：寬 1280 時左側直式選單、保障頁與總覽內容分兩欄、彈出視窗改成右側抽屜（貼齊右邊、整個高度）；寬 820（平板）維持手機版置中、底部選單',
      y4.navV && y4.navL >= 16 && y4.cols === '2' && y4.dc === '2' && y4.lefts >= 2 && y4.spR === 1280 && y4.spW <= 600 && y4.spH >= 850 && y5.body === 640 && y5.cols === 'auto' && y5.navH, JSON.stringify({ y4, y5 }));
    await page.close();
  }

  // =============== 6zb. 品質門檻（CONSTRAINTS.md）：單檔大小、開 App 時「其他項目」比對效能、每個按鈕動作都有處理程式 ===============
  {
    const html0 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), kb = Math.round(Buffer.byteLength(html0) / 1024);
    const attrs = [...new Set([...html0.matchAll(/<button[^>]*?\sdata-([a-z][a-z0-9-]*)/g)].map(x => x[1]))], MOD = ['fh', 'fit', 'vax', 'diet'];   // 修飾用（跟著 data-editmem 決定開哪個分頁）
    const camel = a => a.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), noH = attrs.filter(a => !MOD.includes(a) && ![`'${camel(a)}' in d`, `d.${camel(a)}`, `[data-${a}]`, `dataset.${camel(a)}`, `[data-${a}=`].some(p => html0.includes(p)));
    page = await newPage({ members: [{ id: 'p', name: '效能', sex: 'm', birth: '1980-01-01', h: 170, w: 70, act: '1.375', goal: 'keep' }], active: 'p' });
    const perf = await page.evaluate(() => { const L = []; for (let i = 0; i < 30; i++) L.push({ id: 'x' + i, t: '2026-01-01', items: {}, extra: Array.from({ length: 40 }, (_, k) => ({ name: ['其他項目', '細胞外液', '阻抗 5kHz 右上肢', '腰圍(InBody)', '總膽固醇 T-CHO'][k % 5] + k, value: k, unit: '' })) });
      RKC.clear(); ALIASN = null; const cdpLess = performance.now(); for (const r of L) promoteExtras(r); return Math.round(performance.now() - cdpLess) });
    await page.close();
    check(`品質門檻：index.html ${kb} KB ≤ 900 KB；30 份體檢×40 個其他項目比對 ${perf} ms ≤ 100 ms（CPU 沒降速；以前要 1 秒以上）；${attrs.length} 種按鈕動作都有處理程式`,
      kb <= 900 && perf <= 100 && !noH.length, JSON.stringify({ kb, perf, noH }));
  }

  // =============== 6zc. 審查找到的問題：壞掉的 chk 不能讓紀錄打不開、舊紀錄不用現在身高亂警告、算出來的 eGFR 也要影響飲食、補蛋白質避開不吃的食物、X 光原文有鈣化不叫你改正常、電腦版抽屜避開狀態列、地板守衛不誤擋、待辦不白算 ===============
  {
    page = await newPage({ members: [{ id: 'g', name: '奶奶', sex: 'f', birth: '1955-03-01', h: 155, w: 55, act: '1.2', goal: 'keep', diet: { no: ['chicken', 'fish', 'soy'], ban: [] } },
        { id: 'c', name: '小孩', sex: 'm', birth: '2018-01-01', h: 150, w: 40, act: '1.375', goal: 'keep' }, { id: 'u', name: '成人', sex: 'm', birth: '1985-01-01', h: 172, w: 68, act: '1.375', goal: 'keep' }], active: 'g',
      scale: { g: [{ id: 's1', t: '2026-11-01T08:00', weight: 55, bmi: 22.9, chk: true }], c: [{ id: 's2', t: '2025-01-01T08:00', weight: 32, bmi: 16.3 }],
        u: [{ id: 's3', t: '2026-11-01T08:00', weight: 67.9, bmi: 23 }, { id: 's4', t: '2026-11-02T08:00', weight: 68, bmi: 23.5, derived: ['bmi'] }] },
      labs: { g: [{ id: 'l1', t: '2026-10-01', hospital: '甲醫院', items: { cr: { v: 1.05 } }, extra: [], chk: { a: 1 } }] } });
    const w0 = await page.evaluate(() => { const r = {}; const tryOpen = f => { try { f(); const t = $('#sheetBody').textContent; closeSheet(); return t } catch (e) { return 'ERR ' + e.message } };
      r.scale = tryOpen(() => openScaleDetail('s1')); r.lab = tryOpen(() => openLabDetail('l1'));
      const d = cleanBackup({ app: 'Kinwell', members: [MEM[0]], scale: { g: [{ id: 'z1', t: '2026-11-01T08:00', weight: 55, chk: 'abc' }] }, labs: { g: [{ id: 'z2', t: '2026-10-01', items: {}, chk: [1, 'ok', { x: 1 }] }] } });
      r.clean = JSON.stringify([d.scale.g[0].chk ?? null, d.labs.g[0].chk ?? null]); return r });
    check('壞掉的「防錯疑點」（chk 不是陣列，例如舊版或被改過的備份）不會讓體脂、體檢紀錄打不開（打不開就連刪除都按不到）；匯入備份時 chk 只留文字',
      !/^ERR/.test(w0.scale) && /體脂紀錄/.test(w0.scale) && !/^ERR/.test(w0.lab) && /體檢分析/.test(w0.lab) && w0.clean === JSON.stringify([null, ['ok']]), JSON.stringify({ s: w0.scale.slice(0, 40), l: w0.lab.slice(0, 40), c: w0.clean }));
    const w1 = await page.evaluate(() => { const u = MEM.find(x => x.id === 'u'), c = MEM.find(x => x.id === 'c'), S = id => scalesOf(MEM.find(x => scalesOf(x).some(r => r.id === id))).find(r => r.id === id);
      ACT = 'c'; let child = ''; try { openScaleDetail('s2'); child = $('#sheetBody').textContent; closeSheet() } catch (e) { child = 'ERR' } ACT = 'g';
      return { int: scaleCheck({ weight: 67.9, bmi: 23 }, { h: 170 }).join('｜') + scaleCheck(S('s3'), u).join('｜'), der: scaleCheck(S('s4'), u).join('｜'), child: /差很多|身高約/.test(child), word: scaleCheck({ weight: 74.6, bmi: 24.9 }, { h: 171.8 }).join('') } });
    check('體脂機身高檢查不誤報：體脂機只顯示整數 BMI（23）時容許誤差放寬；BMI 是 App 自己算的不檢查；小孩長高後的舊紀錄不用現在身高警告；提醒寫「確認體脂機 App 或成員資料的身高」',
      w1.int === '' && w1.der === '' && !w1.child && /體脂機用的身高約 173 cm/.test(w1.word) && /確認體脂機 App 或成員資料的身高/.test(w1.word), JSON.stringify(w1));
    const w2 = await page.evaluate(() => { const m = me(), d = derivedOf(m).find(x => x.k === 'egfr_calc'), md = dietMode(m), c = calc(m);
      return { e: d ? d.val + '|' + d.lv + '|' + d.txt : '', mild: md.kidneyMild, tags: md.tags.join(), pk: Math.round(c.prot / c.w * 100) / 100, tip: protTip(40, { heart: false }, ['chicken', 'fish', 'soy']), tip2: protTip(30, { heart: true }, ['chicken', 'fish', 'soy', 'dairy']) } });
    check('算出來的 eGFR（71 歲女性、肌酸酐 1.05 → 約 57）和實際驗的一樣影響飲食：標「顧腎」、蛋白質 ≤1.0 g/kg；補蛋白質避開不吃的雞、魚、黃豆，補不夠會說還差多少',
      /^5[67]\|1\|/.test(w2.e) && w2.mild === true && /顧腎/.test(w2.tags) && w2.pk <= 1.0 && !/雞|魚|豆腐|豆漿/.test(w2.tip) && /優格/.test(w2.tip) && /約補 15 g/.test(w2.tip) && !/雞|魚|豆|優格|蛋（/.test(w2.tip2) && /主菜/.test(w2.tip2),
      JSON.stringify(w2));
    const w3 = await page.evaluate(() => { const m = me(), opt = '輕微變化（如主動脈鈣化、陳舊病灶）';
      const a = labCheck({ cxr: { v: opt, ref: '原文：肺部無明顯異常。主動脈弓鈣化。' } }, m).join('｜'), b = labCheck({ cxr: { v: opt, ref: '原文：胸部X光檢查：肺部無明顯異常(疑輕度脊椎側彎)' } }, m).join('｜');
      let n = 0; const o = selfF; selfF = (...x) => { n++; return o(...x) }; renderTodo(); selfF = o; return { a, b, n } });
    const css = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/@media \(min-width:1024px\)\{[^\n]*/)?.[0] || '';
    const fg = require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'tests', 'floor-guard.mjs'), '--selftest'], { cwd: ROOT, encoding: 'utf8' });
    check('X 光原文寫肺部正常但另外有「主動脈弓鈣化」時，AI 選「輕微變化（如主動脈鈣化）」是對的，不叫你改正常；電腦版抽屜避開 iPad 狀態列（safe-area）；地板守衛自我測試全過（刪過期例外、同一列新增門檻、單位換算、千分位、「以下」、/* */ 註解）；沒有自我檢測結果時待辦不白算',
      w3.a === '' && /原文寫無明顯異常/.test(w3.b) && /\.sheet-panel\{[^}]*padding-top:calc\(env\(safe-area-inset-top\) \+ 8px\)/.test(css) && fg.status === 0 && /自我測試全部通過/.test(fg.stdout) && w3.n === 0,
      JSON.stringify({ a: w3.a, n: w3.n, fg: (fg.stdout || '').trim().split('\n').slice(-2).join(' ') }));
    await page.close();
  }

  // =============== 6zd. 一鍵修正：保單（改狀態、填保費、移到其他家人）、體檢（握力移到其他項目、影像改正常）；已確診睡眠呼吸中止的 STOP-Bang；保單「已繳完」字樣；體重趨勢圖 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    const SC = Array.from({ length: 30 }, (_, i) => ({ id: 'w' + i, t: T(i * 2) + 'T07:30', weight: 76 - i * 0.05 + (i % 3) * 0.3, fat: 22 + (i % 4) * 0.2, bmi: 25.1 }));
    page = await newPage({ members: [{ id: 'a', name: '爸爸', sex: 'm', birth: '1975-01-01', h: 172, w: 75, act: '1.375', goal: 'keep', cond: { items: [{ k: 'osa', y: 2024 }], meds: '', allergy: '無', surg: '' } },
        { id: 'k', name: '小孩', sex: 'm', birth: '2018-01-01', h: 120, w: 22, act: '1.375', goal: 'keep', role: 'child' }], active: 'a', scale: { a: SC },
      labs: { a: [{ id: 'l1', t: T(40), hospital: '甲醫院', items: { grip_r: { v: 36, lo: 36, hi: 44, ref: '36~44 kgf' }, grip_l: { v: 34, lo: 34, hi: 41, ref: '34~41 kgf' },
        cxr: { v: '輕微變化（如主動脈鈣化、陳舊病灶）', ref: '原文：胸部X光檢查：肺部無明顯異常(疑輕度脊椎側彎)' } }, extra: [], chk: ['握力剛好等於參考範圍下限（右 36、左 34 kg）：可能把 InBody 的「推估握力」範圍當成測量值；報告沒有實際測握力就刪掉這兩項'] }] },
      ins: { a: [{ id: 'p1', insurer: '甲人壽', product: '終身壽險', start: '2013-06-18', payYears: 20, payFreq: '年', prem: 24000, status: 'paidup', items: [{ name: '身故', kind: 'main', cat: 'life', amt: 100, unit: '萬元', quote: '身故保險金 100 萬元' }], src: 'ai', chk: false, warn: [], t: T(0) },
          { id: 'p2', insurer: '乙人壽', product: '醫療險', start: '2020-01-01', payFreq: '年', prem: 0, status: 'active', items: [{ name: '住院日額', cat: 'hosp_day', amt: 1000, unit: '元/日', quote: '每日 1,000 元' }], src: 'ai', chk: false, warn: [], t: T(0) }],
        k: [{ id: 'p3', insurer: '丙人壽', product: '定期壽險', start: '1980-02-02', payYears: 20, payFreq: '年', prem: 12000, status: 'active', items: [{ name: '身故', cat: 'life', amt: 100, unit: '萬元', quote: '身故保險金 100 萬元' }], src: 'ai', chk: false, warn: [], t: T(0) }] } });
    const v1 = await page.evaluate(() => { const m = me(); openPol('p1'); const before = $('#sheetBody').textContent, btn = [...document.querySelectorAll('#sheetBody [data-pfix]')].map(b => b.dataset.pfix).join();
      document.querySelector('#sheetBody [data-pfix="st_active"]')?.click(); const p = insFind(m, 'p1'); const after = { st: p.status, hist: (p.hist || []).map(h => h.why + ':' + h.d.status).join(), err: polFlags(p, m).some(f => f.lv === 'err') };
      const pr = window.prompt; window.prompt = () => '24,000'; openPol('p2'); const btn2 = [...document.querySelectorAll('#sheetBody [data-pfix]')].map(b => b.dataset.pfix).join(); document.querySelector('#sheetBody [data-pfix="prem"]')?.click(); window.prompt = pr;
      return { before, btn: btn + '|' + btn2, after, prem: insFind(m, 'p2').prem, phist: (insFind(m, 'p2').hist || []).length } });
    check('一鍵修正保單：「繳費期滿卻還在繳」直接按「還在繳：改成有效」、保費 0 直接填（輸入 24,000）；改之前存進變更紀錄可以復原；修正前「年繳保費」標「狀態寫繳費期滿，但還沒繳完」，不再寫「已繳完」',
      /st_active/.test(v1.btn.split('|')[0]) && /prem/.test(v1.btn.split('|')[1]) && v1.after.st === 'active' && v1.after.hist === 'edit:paidup' && !v1.after.err && v1.prem === 24000 && v1.phist === 1 && /狀態寫繳費期滿，但還沒繳完/.test(v1.before) && !/24,000 元（已繳完）|0 元（已繳完）/.test(v1.before),
      JSON.stringify({ btn: v1.btn, after: v1.after, prem: v1.prem }));
    const v2 = await page.evaluate(() => { ACT = 'k'; renderAll(); openPol('p3'); const btn = !!document.querySelector('#sheetBody [data-pfix="move"]'); document.querySelector('#sheetBody [data-pfix="move"]')?.click();
      const sheet = $('#sheetBody').textContent; document.querySelector('#sheetBody [data-pmv="a"]')?.click(); const r = { btn, sheet: /移到其他家人/.test(sheet), kid: insOf(MEM.find(x => x.id === 'k')).length, dad: insOf(MEM.find(x => x.id === 'a')).map(p => p.id).join(), toast: $('#toast').textContent };
      ACT = 'a'; renderAll(); const p3 = insFind(me(), 'p3'); r.err = p3 ? polFlags(p3, me()).some(f => f.lv === 'err') : 'missing'; return r });
    check('一鍵修正保單：生效日早於被保險人出生（爸爸的保單放到小孩名下）→「移到其他家人」選爸爸，保單搬過去、錯誤消失',
      v2.btn && v2.sheet && v2.kid === 0 && /p3/.test(v2.dad) && !v2.err && /已移到 爸爸/.test(v2.toast), JSON.stringify(v2));
    const v3 = await page.evaluate(() => { const m = me(); openLabDetail('l1'); const btn = [...document.querySelectorAll('#sheetBody [data-lfix]')].map(b => b.dataset.lfix).join();
      document.querySelector('#sheetBody [data-lfix="grip"]')?.click(); document.querySelector('#sheetBody [data-lfix="opt:cxr"]')?.click();
      const r = labsOf(m)[0], ex = r.extra.find(e => /推估握力範圍（右手/.test(e.name));
      return { btn, grip: 'grip_r' in r.items || 'grip_l' in r.items, ex: ex ? ex.name + '=' + ex.value : '', rk: ex ? resolveKey(ex.name) : 'none', cxr: r.items.cxr.v + '|' + /肺部無明顯異常/.test(r.items.cxr.ref), W: labCheck(r.items, m).join('｜'), chk: (r.chk || []).length,
        promoted: (promoteExtras(r), 'grip_r' in r.items) } });
    check('一鍵修正體檢：握力（推估範圍）移到「其他項目」並保留範圍、開 App 時不會又被搬回握力；X 光改成「正常」並保留原文；修好的疑點不再顯示',
      /grip/.test(v3.btn) && /opt:cxr/.test(v3.btn) && !v3.grip && /36~44/.test(v3.ex) && v3.rk === null && v3.cxr === '正常|true' && v3.W === '' && v3.chk === 0 && !v3.promoted, JSON.stringify(v3));
    const v4 = await page.evaluate(() => { const m = me(), F = selfF(m), noOsa = { ...m, cond: { items: [] } };
      const a = selfRate('sleep', [1, 1, 1, 0, 0, 0, 0, 1], m, F), b = selfRate('sleep', [0, 0, 0, 0, 0, 1, 0, 1], m, F), c = selfRate('sleep', [1, 1, 1, 0, 0, 0, 0, 1], noOsa, selfF(noOsa));
      return { a: a.lv + '|' + a.head, b: b.lv + '|' + b.head, c: c.lv + '|' + c.head } });
    check('STOP-Bang：已確診睡眠呼吸中止時不再當成「篩檢高風險 → 門診」，改看治療有沒有效（還在打鼾、白天很睏 → 回診確認治療；症狀不多 → 照原本回診）；沒確診的人照原本判斷',
      /^2\|已確診睡眠呼吸中止：症狀還在/.test(v4.a) && /^0\|已確診睡眠呼吸中止：目前症狀不多/.test(v4.b) && /^2\|睡眠呼吸中止：高風險/.test(v4.c), JSON.stringify(v4));
    const v5 = await page.evaluate(() => { recTab = 'scale'; go('body', 'rec'); renderRecs(); const g = $('#recList svg.trend');
      return { has: !!g, band: !!g?.querySelector('rect.band'), avg: !!g?.querySelector('polyline.avg'), dots: g ? g.querySelectorAll('circle').length : 0, label: g?.getAttribute('aria-label') || '', fat: !!$('#recList svg.trend.fat') } });
    check('體重趨勢圖：近 90 天每一筆的點＋7 天平均線、健康體重範圍色帶、體脂率另一張；讀螢幕的說明寫出最新平均與變化',
      v5.has && v5.band && v5.avg && v5.dots >= 25 && /近 90 天/.test(v5.label) && /kg/.test(v5.label) && v5.fat, JSON.stringify(v5));
    await page.close();
  }

  // =============== 6ze. 第二輪審查：搬保單時的理賠紀錄、搬錯可以再搬、只搬等於下限的握力、保費輸入（萬、太低）、存檔失敗不報成功、滑鼠點分頁不亂捲、趨勢圖 30 天比較與壞資料、兒童色帶說明、確診後症狀多要門診 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    page = await newPage({ members: [{ id: 'a', name: '爸爸', sex: 'm', birth: '1975-01-01', h: 172, w: 75, act: '1.375', goal: 'keep', cond: { items: [{ k: 'osa' }], meds: '', allergy: '無', surg: '' } },
        { id: 'k', name: '小孩', sex: 'm', birth: '2015-01-01', h: 145, w: 38, act: '1.375', goal: 'keep', role: 'child' }, { id: 'n', name: '無身高', sex: 'f', birth: '1990-01-01', w: 55, act: '1.375', goal: 'keep' }], active: 'k',
      ins: { k: [{ id: 'p3', insurer: '丙人壽', product: '定期壽險', start: '1980-02-02', payYears: 20, payFreq: '年', prem: 12000, status: 'paidup', items: [{ name: '住院日額', cat: 'hosp_day', amt: 1000, unit: '元/日', quote: '每日 1,000 元' }], src: 'ai', chk: false, warn: [], t: T(0) }] },
      clm: { k: [{ id: 'e1', type: 'ad', d: T(20), end: T(18), hosp: '乙醫院', dx: '肺炎', claims: [{ pid: 'p3', st: 'docs' }] }] },
      labs: { a: [{ id: 'l1', t: T(30), items: { grip_r: { v: 26, lo: 26, hi: 40, ref: '26~40 kgf' }, grip_l: { v: 31, lo: 24, hi: 36, ref: '24~36 kgf' } }, extra: [] }] },
      scale: { a: [{ id: 'x1', t: T(89) + 'T07:00', weight: 80 }, { id: 'x2', t: T(88) + 'T07:00', weight: 80 }, { id: 'x3', t: T(1) + 'T07:00', weight: 70 }, { id: 'x4', t: T(0) + 'T07:00', weight: 70 },
          { id: 'x5', t: T(2) + 'T07:00', weight: '70 kg' }, { id: 'x6', t: '2026-13-45T07:00', weight: 71 }, { id: 'x7', t: T(-30) + 'T07:00', weight: 90 }],
        k: Array.from({ length: 6 }, (_, i) => ({ id: 'k' + i, t: T(i * 5) + 'T07:00', weight: 38 + i * 0.1, fat: 20 })), n: Array.from({ length: 6 }, (_, i) => ({ id: 'n' + i, t: T(i * 5) + 'T07:00', weight: 55, fat: 25 })) } });
    const u1 = await page.evaluate(() => { let asked = ''; const cf = window.confirm; window.confirm = t => { asked = t; return true };
      openPol('p3'); document.querySelector('#sheetBody [data-pfix="move"]')?.click(); document.querySelector('#sheetBody [data-pmv="a"]')?.click(); window.confirm = cf;
      const todo = (renderTodo(), $('#todoCard').textContent); openEvt('e1'); const ev = $('#sheetBody').textContent, orph = !!document.querySelector('#sheetBody [data-corph]');
      document.querySelector('#sheetBody [data-corph]')?.click(); const left = (clmOf(me()).find(e => e.id === 'e1').claims || []).length;
      ACT = 'a'; renderAll(); const p = insFind(me(), 'p3'); openPol('p3'); const always = !!document.querySelector('#sheetBody [data-pfix="move"]'), hist = (p?.hist || []).map(h => h.why + ':' + (h.from || '')).join(), histTxt = $('#sheetBody').textContent; closeSheet();
      return { asked, todo: /理賠補件/.test(todo), ev: /保單已不在/.test(ev), orph, left, always, hist, histTxt: /原本在 小孩/.test(histTxt) } });
    check('搬保單：先問一次（提到理賠紀錄）、記進變更紀錄（原本在小孩）、沒有錯誤的保單也能「移到其他家人」（搬錯可以再搬）；留下的理賠紀錄不再出現在待辦，打開事件看得到「保單已不在」並可以移除',
      /移到 爸爸/.test(u1.asked) && /1 筆理賠紀錄/.test(u1.asked) && !u1.todo && u1.ev && u1.orph && u1.left === 0 && u1.always && u1.hist === 'move:小孩' && u1.histTxt, JSON.stringify(u1));
    const u2 = await page.evaluate(() => { const m = me(), r = labsOf(m)[0]; labFix(r, 'grip'); return { r: 'grip_r' in r.items, l: 'grip_l' in r.items ? r.items.grip_l.v : null, ex: r.extra.map(e => e.name + '=' + e.value).join() } });
    check('握力只搬「剛好等於下限」的那一隻手：右手 26（範圍 26–40）搬走，左手 31 是真的測量值留著',
      u2.r === false && u2.l === 31 && /推估握力範圍（右手/.test(u2.ex) && !/左手/.test(u2.ex), JSON.stringify(u2));
    const u3 = await page.evaluate(() => { const m = me(); INS.a.push({ id: 'p9', insurer: '丁人壽', product: '醫療', start: '2020-01-01', payFreq: '年', prem: 0, status: 'active', items: [{ name: '日額', cat: 'hosp_day', amt: 1000, unit: '元/日', quote: '每日 1,000 元' }], src: 'ai', chk: false, warn: [] });
      const p = insFind(m, 'p9'), pr = window.prompt, out = []; for (const v of ['2.5萬', '1e4', '0.5', '24,000']) { window.prompt = () => v; out.push(polFix(m, p, 'prem') + ':' + p.prem) } window.prompt = pr;
      const s0 = S.set; S.set = () => false; const st0 = (p.status = 'paidup', p.status); openPol('p9'); toast(''); const ok = polFix(m, p, 'st_active'); S.set = s0; return { out: out.join(','), fail: ok + ':' + p.status + ':' + st0 } });
    check('填保費：「2.5萬」→ 25,000；「1e4」「0.5」這種看不懂或太低的不存；存檔失敗時不報成功、資料退回原狀',
      u3.out === 'true:25000,false:25000,false:25000,true:24000' && u3.fail === 'false:paidup:paidup', JSON.stringify(u3));
    const u4 = await page.evaluate(() => { go('body', 'now'); window.scrollTo(0, 400); const y0 = scrollY, b = document.querySelector('#v-body .subnav button'); b.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); return { y0, y1: scrollY } });
    check('滑鼠或手指點分頁（不是鍵盤 Tab）不會讓畫面亂捲', u4.y0 === u4.y1, JSON.stringify(u4));
    const u5 = await page.evaluate(() => { const one = id => { ACT = id; recTab = 'scale'; go('body', 'rec'); renderRecs(); const g = $('#recList svg.trend'); return { svg: g ? g.outerHTML : '', note: $('#recList .card .note')?.textContent || '' } };
      const a = one('a'), k = one('k'), n = one('n'); ACT = 'a'; return { aNaN: /NaN/.test(a.svg), a30: (a.svg.match(/>7 天平均[^<]*/) || [''])[0], aFuture: /90\.0/.test(a.svg), kNote: k.note, kBand: /rect class="band"/.test(k.svg), nBand: /rect class="band"/.test(n.svg), nNote: n.note } });
    check('趨勢圖：30 天比較用 30 天前的平均（80 → 70：▼ 10.0）；「70 kg」字串、2026-13-45 這種壞日期、未來日期都跳過不畫 NaN；小孩的色帶說明不寫「BMI 18.5–24」；沒填身高不畫健康範圍色帶',
      !u5.aNaN && /30 天▼ 10\.0/.test(u5.a30) && !u5.aFuture && u5.kBand && !/18\.5–24/.test(u5.kNote) && /兒童/.test(u5.kNote) && !u5.nBand && !/綠色帶/.test(u5.nNote), JSON.stringify(u5));
    const u6 = await page.evaluate(() => { const m = MEM.find(x => x.id === 'a'), F = selfF(m); return [selfRate('sleep', [1, 1, 1, 0, 0, 1, 0, 1], m, F), selfRate('sleep', [1, 0, 0, 0, 0, 1, 0, 1], m, F)].map(r => r.lv + '|' + r.head).join('；') });
    check('已確診睡眠呼吸中止：症狀 2 項以上 → 建議門診（回診確認治療）、只有 1 項 → 注意', /^2\|已確診睡眠呼吸中止：症狀還在.*；1\|已確診睡眠呼吸中止：症狀還在/.test(u6), u6);
    await page.close();
  }

  // =============== 6zf. 保單狀態（減額繳清、展期定期、已解約、滿期）、保單健診表的欄位（險種代碼、每項狀態／保費／始期／繳費終期、要保人、繳到幾歲、類型）、傷害醫療分類、理賠比對的年齡、整個檔案沒有註解吃掉程式碼、正壓呼吸器紀錄 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    const P = (id, o) => ({ id, insurer: '甲人壽', product: '終身壽險', start: '2010-03-01', payYears: 20, payFreq: '年', prem: 30000, status: 'active', src: 'ai', chk: false, warn: [], t: T(0), ...o });
    const LIFE = { name: '身故保險金', kind: 'main', cat: 'life', amt: 50, unit: '萬元', quote: '身故保險金 50 萬元' }, RID = { name: '住院醫療附約', kind: 'rider', cat: 'hosp_day', amt: 1000, unit: '元/日', quote: '每日 1,000 元' };
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', cond: { items: [{ k: 'osa', y: 2024 }], meds: '', allergy: '無', surg: '' },
          cpap: [{ id: 'c1', d: T(3), h: 3.2, n: 4, ahi: 12.5 }, { id: 'c2', d: T(10), h: 6, n: 7, ahi: 2 }] },
        { id: 'g', name: '阿公', sex: 'm', birth: '1946-03-01', h: 165, w: 60, act: '1.2', goal: 'keep' }], active: 'a',
      ins: { a: [P('r1', { status: 'reduced', items: [LIFE, RID] }), P('r2', { product: '儲蓄險', status: 'surr', items: [{ ...LIFE, amt: 200, quote: '身故保險金 200 萬元' }] }),
          P('r3', { product: '醫療終身', start: '2020-01-01', status: 'paidup', items: [{ ...RID, kind: 'main' }] }),
          P('r4', { product: '健康保險', start: '2015-06-01', payYears: null, prem: null, items: [{ name: '傷害醫療保險金日額', kind: 'rider', cat: 'hosp_day', amt: 1000, unit: '元/日', prem: 1200, code: 'HIR', quote: '每日 1,000 元' },
            { name: '一年期住院醫療附約', kind: 'rider', cat: 'hosp_day', amt: 2000, unit: '元/日', prem: 3000, st: 'ended', quote: '每日 2,000 元' }, { name: '疾病及傷害住院日額', kind: 'main', cat: 'hosp_day', amt: 500, unit: '元/日', prem: 800, payEnd: '2040-06-01', quote: '每日 500 元' },
            { name: '一年期手術附約', kind: 'rider', cat: 'surgery', amt: 10, unit: '萬元', prem: 500, quote: '手術保險金 10 萬元' }] }),
          P('r5', { insurer: '乙產險', product: '員工團體保險', start: '2015-01-10', payYears: null, prem: 5000, payAge: 65, type: 'grp', holder: '公司', items: [{ name: '團體壽險', kind: 'main', cat: 'life', amt: 100, unit: '萬元', quote: '壽險 100 萬元' }] }),
          P('r6', { product: '終身壽險B', status: 'extended', items: [{ ...LIFE }, { ...RID }] })],
        g: [P('g1', { product: '醫療保險', start: '2000-01-01', items: [{ name: '住院日額', kind: 'main', cat: 'hosp_day', amt: 1000, unit: '元/日', maxAge: 75, quote: '每日 1,000 元' },
            { name: '手術附約', kind: 'rider', cat: 'surgery', amt: 5, unit: '萬元', wait: 30, start: T(10), quote: '手術 5 萬元' }, { name: '實支實付附約', kind: 'rider', cat: 'hosp_real', amt: 10, unit: '萬元', st: 'ended', quote: '每次 10 萬元' }] })] },
      clm: { g: [{ id: 'e1', type: 'ad', d: T(5), end: T(3), hosp: '乙醫院', dx: '肺炎', claims: [] }] } });
    const f1 = await page.evaluate(() => { const m = me(), st = s => polCheck({ insurer: '甲', product: '乙', status: s, coverages: [{ name: '身故', cat: 'life', amount: 1, unit: '萬元', quote: '身故 1 萬元' }] }, m).p.status;
      return ['減額繳清', '展期定期', '已解約', '契約滿期', '滿期', '正常繳費件', '繳費期滿', '停效', '終止', ''].map(st).join() + '|' + POL_ST.map(x => x[0]).join() });
    check('保單狀態看得懂保單健診表的寫法：減額繳清、展期定期、已解約、契約滿期／滿期、正常繳費件、繳費期滿、停效、終止；狀態選單多了「減額繳清」「展期定期」「已解約」「滿期」',
      f1 === 'reduced,extended,surr,matured,matured,active,paidup,lapsed,ended,active|active,paidup,reduced,extended,waived,lapsed,surr,matured,ended,quote', f1);
    const f2 = await page.evaluate(() => { const m = me(), p = id => insFind(m, id), F = id => polFlags(p(id), m);
      const sum = covSum(m), hd = sum.find(s => s.cat === 'hosp_day' && s.per === 'day'), lf = sum.find(s => s.cat === 'life' && !s.nm);
      openPol('r1'); const t1 = $('#sheetBody').textContent, b1 = [...document.querySelectorAll('#sheetBody [data-pfix]')].map(b => b.dataset.pfix + (b.dataset.pci ?? '')).join();
      openPol('r6'); const t6 = $('#sheetBody').textContent; closeSheet(); go('ins', 'cov'); const cov = $('#covBody').textContent;
      return { live: ['r1', 'r2', 'r6'].map(id => polLive(p(id)) + ':' + polPaying(p(id)) + ':' + polLv(p(id), m)).join(), err1: F('r1').filter(f => f.lv === 'err').length, life: lf ? lf.v : 0, hd: hd ? hd.v : 0,
        t1: /減額繳清/.test(t1) && /減額後的保額/.test(t1) && /主約減額繳清後通常已經終止/.test(t1), b1, t6: /展期定期/.test(t6) && /只保身故/.test(t6), cov } });
    check('減額繳清、展期定期：保障還在、不用再繳（不算每年保費）、提醒確認金額是減額後的保額、附約通常已經終止（一鍵「這項已終止」）；展期只保身故；已解約灰色不算保障；壽險加總 200 萬（不含解約的那張）',
      f2.live === 'true:false:chk,false:false:off,true:false:chk' && f2.err1 === 0 && f2.life === 2e6 && f2.hd === 2500 && f2.t1 && f2.b1 === 'c_act1,c_end1,move' && f2.t6 && /王小明 每年7,500 元/.test(f2.cov), JSON.stringify({ ...f2, cov: f2.cov.slice(0, 80) }));
    const f3 = await page.evaluate(() => { const m = me(); openPol('r3'); const b = [...document.querySelectorAll('#sheetBody [data-pfix]')].map(x => x.dataset.pfix).join(); document.querySelector('#sheetBody [data-pfix="st_reduced"]')?.click();
      const p = insFind(m, 'r3'); return { b, st: p.status, err: polFlags(p, m).filter(f => f.lv === 'err').length, hist: (p.hist || []).map(h => h.why + ':' + h.d.status).join(), txt: /減額繳清/.test($('#sheetBody').textContent) } });
    check('「繳費期滿」但還沒繳完：除了「還在繳：改成有效」，也可以一鍵改成「減額繳清」（不用再繳、保額變小）；改完紅色錯誤消失、舊的存進變更紀錄',
      /st_active/.test(f3.b) && /st_reduced/.test(f3.b) && f3.st === 'reduced' && f3.err === 0 && f3.hist === 'edit:paidup' && f3.txt, JSON.stringify(f3));
    const f4 = await page.evaluate(() => { const m = me(), p = insFind(m, 'r4'), F = polFlags(p, m), pe = payEnd(p);
      openPol('r4'); const t = $('#sheetBody').textContent, btn = [...document.querySelectorAll('#sheetBody [data-pfix][data-pci]')].map(b => b.dataset.pfix + b.dataset.pci).join();
      document.querySelector('#sheetBody [data-pfix="c_accmed"]')?.click(); const after = covSum(m), hd = after.find(s => s.cat === 'hosp_day' && s.per === 'day'), am = after.find(s => s.cat === 'acc_med');
      return { ann: polAnnual(p), pe, noPrem: F.some(f => /沒有保費/.test(f.t)), acc: F.filter(f => /可能只賠意外受傷/.test(f.t)).map(f => f.ci + f.lv).join(), one: F.filter(f => /每年續保/.test(f.t)).map(f => f.ci + f.lv).join(),
        t: /HIR/.test(t) && /已終止/.test(t) && /1,200 元/.test(t) && /2040-06-01/.test(t), btn, cat: p.items[0].cat, hd: hd ? hd.v : 0, am: am ? am.v + am.per : '', hist: (p.hist || []).length } });
    check('保單健診表的每一項：保費（整張沒寫時加總各項）、繳費終期、險種代碼、狀態（已終止的不算保障也不算保費）；名稱有「傷害」的住院日額 → 待核對＋一鍵「改成意外醫療」（改完住院日額不再多算）；一年期附約提醒每年續保',
      f4.ann === 2500 && f4.pe === '2040-06-01' && !f4.noPrem && f4.acc === '0chk' && f4.one === '3info' && f4.t && f4.btn === 'c_accmed0' && f4.cat === 'acc_med' && f4.hd === 1500 && f4.am === '1000day' && f4.hist === 1, JSON.stringify(f4));
    const f5 = await page.evaluate(() => { const m = me(), p = insFind(m, 'r5'), F = polFlags(p, m); openPol('r5'); const t = $('#sheetBody').textContent; closeSheet(); go('ins', 'cov'); const cov = $('#covBody').textContent;
      return { pe: payEnd(p), line: polLine(p), grp: F.some(f => f.lv === 'info' && /團體保險/.test(f.t)), t: /要保人公司/.test(t) && /團體保險/.test(t) && /繳到 65 歲/.test(t), cov: /團體保險/.test(cov) && /離職/.test(cov) } });
    check('要保人、類型（團體保險：離職後就沒有，保障缺口也提醒）、「繳到 65 歲」用生日推算繳費到哪一年',
      f5.pe === '2048-01-10' && /繳到 2048 年/.test(f5.line) && f5.grp && f5.t && f5.cov, JSON.stringify(f5));
    const f6 = await page.evaluate(() => { const m = me(); openPolEdit('r4'); const has = ['#pe-holder', '#pe-type', '#pe-payage', '#pe-end'].every(s => $(s)) && ['code', 'st', 'start', 'payEnd', 'prem'].every(k => document.querySelector(`#pe-cov [data-cf="${k}"]`));
      if (has) { $('#pe-holder').value = '本人'; $('#pe-type').value = 'inv'; const row = document.querySelectorAll('#pe-cov [data-ci]')[2]; row.querySelector('[data-cf="st"]').value = 'surr'; row.querySelector('[data-cf="prem"]').value = '900'; $('#pe-save').click() }
      const p = insFind(m, 'r4'), h0 = (p.hist || [])[0], d = h0 ? polDiff(h0.d, p).join('｜') : '', b = cleanBackup({ app: 'Kinwell', members: [MEM[0]], active: 'a', ins: { a: [JSON.parse(JSON.stringify(p))] } }), q = b.ins?.a?.[0] || { items: [] }, it = q.items[2] || {}, pp = promptPolicy(); closeSheet();
      return { has, holder: p.holder, type: p.type, st: p.items[2].st, prem: p.items[2].prem, d, keep: [q.holder, q.type, it.st, it.prem, it.payEnd, q.items[0]?.code].join(),
        pp: ['"holderHint"', '"policyType"', '"payToAge"', '"code"', '"payEnd"', '減額繳清', '展期定期', '解約', '名稱有「傷害」', '燒燙傷'].filter(k => !pp.includes(k)).join() } });
    check('編輯保單：要保人、類型、繳到幾歲、到期日；每一項的險種代碼、狀態、保費、始期、繳費終期都能改，變更紀錄寫出差別；備份還原時保留；AI 提示詞要抄這些欄位、看得懂減額繳清／展期／解約、名稱有「傷害」的醫療用意外醫療',
      f6.has && f6.holder === '本人' && f6.type === 'inv' && f6.st === 'surr' && f6.prem === 900 && /要保人/.test(f6.d) && /投資型/.test(f6.d) && /已解約/.test(f6.d) && /800 → 900/.test(f6.d) && f6.keep === '本人,inv,surr,900,2040-06-01,HIR' && f6.pp === '', JSON.stringify(f6));
    const f7 = await page.evaluate(() => { const m = me(), r = polCheck({ insurer: '', product: '丙人壽變額壽險', holderHint: '本人', policyType: '投資型', payToAge: 100, status: '正常繳費件',
        coverages: [{ name: '身故保險金', cat: 'life', amount: 100, unit: '萬元', quote: '身故保險金 100 萬元', code: 'VNL1', status: '終止', start: '2015/06/01', payEnd: '民國129年6月1日', premium: '1,200' }] }, m), p = r.p, c = p.items[0],
        bad = polCheck({ insurer: '丙', product: '丁', payToAge: 200, coverages: [] }, m).p;
      return [r.err.length, p.insurer, p.holder, p.type, p.payAge, p.status, c.code, c.st, c.start, c.payEnd, c.prem, bad.payAge ?? 'null', bad.warn.some(w => /繳到 200 歲/.test(w)), polFlags(p, m).some(f => /投資型/.test(f.t))].join() });
    check('AI 讀的保單健診：保險公司沒寫時從商品名稱取（丙人壽）；要保人、投資型、繳到 100 歲；每一項的險種代碼、狀態（終止）、始期、繳費終期（民國年）、保費（1,200）；繳到 200 歲不合理會清空；投資型提醒保費含投資',
      f7 === '0,丙人壽,本人,inv,100,active,VNL1,ended,2015-06-01,2040-06-01,1200,null,true,true', f7);
    const f8 = await page.evaluate(() => { ACT = 'g'; const m = me(), e = clmOf(m)[0]; let r; try { r = evtMatch(m, e).flatMap(x => x.its.map(i => i.c.name + ':' + i.w.join('/'))).join('｜') } catch (err) { r = 'ERR ' + err.message } ACT = 'a'; return r });
    check('理賠比對：保障有「最高到幾歲」時不會當掉（以前年齡的宣告被註解吃掉）；80 歲住院 → 住院日額標「事故時已超過 75 歲」；附約用自己的投保始期算等待期；已終止的項目標出來',
      /住院日額:[^｜]*事故時已超過 75 歲/.test(f8) && /手術附約:[^｜]*等待期內（生效 5 天，等待期 30 天）/.test(f8) && /實支實付附約:[^｜]*已經終止/.test(f8), f8);
    const sc = require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'tests', 'floor-guard.mjs'), '--scan', path.join(ROOT, 'index.html')], { cwd: ROOT, encoding: 'utf8' });
    check('整個 index.html 沒有「註解吃掉程式碼」（不只新增的行；理賠比對的年齡就是這樣失效）', sc.status === 0 && /有 0 處/.test(sc.stdout), (sc.stdout || sc.stderr || '').slice(-300));
    const f9 = await page.evaluate(() => { const m = me(), F = selfF(m), rate = selfRate('sleep', [0, 0, 0, 0, 0, 1, 0, 1], m, F); renderTodo(); const todo = $('#todoCard').textContent;
      openCond('osa'); const t = $('#sheetBody').textContent, has = !!$('#cp-add');
      if (has) { $('#cp-h').value = '30'; $('#cp-n').value = '5'; $('#cp-add').click() } const n0 = (m.cpap || []).length;
      if (has) { $('#cp-h').value = '6.5'; $('#cp-n').value = '6'; $('#cp-ahi').value = '3'; $('#cp-add').click() } const n1 = (m.cpap || []).length, saved = (JSON.parse(localStorage.getItem('nc_members'))[0].cpap || []).length;
      renderTodo(); const todo2 = $('#todoCard').textContent, t2 = $('#sheetBody').textContent; closeSheet();
      const b = cleanBackup({ app: 'Kinwell', members: [{ ...MEM[0], cpap: [{ d: '2026-11-01', h: '5', n: 5 }, { d: 'bad', h: 5, n: 5 }, { d: '2026-11-02', h: 30, n: 5 }, { d: '2026-11-03', h: 5, n: 9 }, { d: '2026-11-04', h: 5, n: 5, ahi: 'x' }, '<img>'] }] });
      return { rate: rate.lv + '|' + rate.head, todo: /正壓呼吸器/.test(todo) && /3\.2 小時/.test(todo), t: /正壓呼吸器使用紀錄/.test(t) && /每晚 3\.2 小時/.test(t) && /AHI 12\.5/.test(t), has, n0, n1, saved, todo2: /正壓呼吸器/.test(todo2),
        sum: /正壓呼吸器/.test(summaryText(m)), ai: condText(m).some(x => /正壓呼吸器/.test(x)), t2: /每晚 6\.5 小時/.test(t2), clean: (b.mem[0].cpap || []).map(x => x.d + ':' + x.h + ':' + x.n + ':' + (x.ahi ?? '-')).join() } });
    check('正壓呼吸器紀錄（一週一筆：每晚幾小時、7 晚用幾晚、AHI）：低於每晚 4 小時、一週 5 晚 → 待辦提醒、STOP-Bang 改「注意」；病史頁可以記一筆（不合理的數字不存）、存進手機；看診摘要、問 AI 都帶上；備份檔的紀錄會清洗',
      f9.rate === '1|已確診睡眠呼吸中止：症狀不多，但呼吸器戴的時間不夠' && f9.todo && f9.t && f9.has && f9.n0 === 2 && f9.n1 === 3 && f9.saved === 3 && !f9.todo2 && f9.sum && f9.ai && f9.t2 && f9.clean === '2026-11-01:5:5:-,2026-11-04:5:5:-', JSON.stringify(f9));
    // 彈出視窗：背後畫面 inert、Tab 留在視窗內、Esc 關閉後焦點回原按鈕、標籤配對；設定裡的「匯入」照樣打得開選檔
    await page.evaluate(() => { closeSheet(); go('dash') }); await page.focus('#gearBtn'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    const m1 = await page.evaluate(() => ({ inert: ['header', '#v-dash', '#nav'].map(s => document.querySelector(s).inert).join(), upd: document.querySelector('#updBar').inert, file: document.querySelector('#importFile').inert, inSheet: document.querySelector('.sheet-panel').contains(document.activeElement) }));
    let tabOut = 0; for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => document.activeElement === document.body || document.querySelector('#sheet').contains(document.activeElement)))) tabOut++ }
    const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null), page.click('#sheetBody [data-import]', { timeout: 3000 }).catch(() => {})]);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const m2 = await page.evaluate(() => ({ open: document.querySelector('#sheet').classList.contains('on'), back: document.activeElement?.id, inert: document.querySelector('#nav').inert }));
    await page.evaluate(() => openPolEdit('r1')); const m3 = await page.evaluate(() => { const L = [...document.querySelectorAll('#sheetBody label')].filter(l => { const c = l.nextElementSibling; return c && /^(INPUT|SELECT|TEXTAREA)$/.test(c.tagName) }), un = L.filter(l => !l.control).length; closeSheet(); return un + '/' + L.length });
    check('彈出視窗：背後畫面不能操作（Tab 不會跑到被遮住的按鈕）、「有新版本」和選檔案不受影響；設定裡按「匯入」照樣跳出選檔；Esc 關閉後焦點回到原本的按鈕；表單的標籤都連到輸入框（螢幕閱讀器念得出欄位名稱）',
      m1.inert === 'true,true,true' && m1.upd === false && m1.file === false && m1.inSheet && !tabOut && !!fc && !m2.open && m2.back === 'gearBtn' && m2.inert === false && /^0\/[1-9]/.test(m3), JSON.stringify({ m1, tabOut, fc: !!fc, m2, m3 }));
    await page.close();
  }

  // =============== 6zg. 第三輪審查：減額繳清／展期的附約預設不算（核對後提醒也不消失）、已繳完的項目保費不算、保單健診更多寫法、錯誤訊息不出現 null、繳到幾歲比生效時年紀小、合併匯入保留兩邊的呼吸器紀錄、保單條款審查帶各項狀態、AHI 偏高的說明、記一筆後畫面停在紀錄、Esc 與輸入法、焦點回到重畫後的保單 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    const P = (id, o) => ({ id, insurer: '甲人壽', product: '終身壽險', start: '2010-03-01', payYears: 20, payFreq: '年', prem: 30000, status: 'active', src: 'ai', chk: true, warn: [], t: T(0), ...o });
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', cond: { items: [{ k: 'osa', y: 2024 }], meds: '', allergy: '無', surg: '' },
          cpap: [{ id: 'c1', d: T(3), h: 6, n: 6, ahi: 12.3 }] }, { id: 'k', name: '小孩', sex: 'm', birth: '2015-01-01', h: 140, w: 35, act: '1.375', goal: 'keep', role: 'child' }], active: 'a',
      ins: { a: [P('x1', { status: 'extended', items: [{ name: '身故保險金', kind: 'main', cat: 'life', amt: 50, unit: '萬元', quote: '身故保險金 50 萬元' }, { name: '實支實付附約', kind: 'rider', cat: 'hosp_real', amt: 20, unit: '萬元', quote: '每次 20 萬元' }] }),
          P('x2', { status: 'paidup', start: '2015-03-01', payYears: null, payAge: 70, items: [{ name: '身故', kind: 'main', cat: 'life', amt: 10, unit: '萬元', quote: '身故 10 萬元' }] }),
          P('x3', { start: '2015-03-01', payYears: null, payAge: 20, items: [{ name: '身故', kind: 'main', cat: 'life', amt: 10, unit: '萬元', quote: '身故 10 萬元' }] })] },
      clm: { a: [{ id: 'e1', type: 'ad', d: T(5), end: T(3), hosp: '乙醫院', dx: '肺炎', claims: [] }] } });
    const g1 = await page.evaluate(() => { const m = me(), p = insFind(m, 'x1'), F = polFlags(p, m), real0 = covSum(m).some(s => s.cat === 'hosp_real'), ev0 = evtMatch(m, clmOf(m)[0]).flatMap(x => x.its.map(i => i.c.name + ':' + i.w.join('/'))).join('｜');
      const lv = polLv(p, m); openPol('x1'); const btn = [...document.querySelectorAll('#sheetBody [data-pfix][data-pci]')].map(b => b.dataset.pfix + b.dataset.pci).join(); document.querySelector('#sheetBody [data-pfix="c_act"]')?.click();
      const real1 = covSum(m).some(s => s.cat === 'hosp_real'), F1 = polFlags(p, m); closeSheet();
      return { flag: F.filter(f => /通常已經沒有|通常已經終止/.test(f.t)).map(f => f.ci + f.lv).join(), lv, real0, ev0, btn, st: p.items[1].st, real1, gone: !F1.some(f => /通常已經沒有|通常已經終止/.test(f.t)) } });
    check('展期定期（減額繳清的附約也一樣）：沒寫狀態的非身故項目預設不算保障、理賠時提醒；按過「我已核對」提醒也不會消失，要按「還有效」或「確定已終止」才結束；按「還有效」就算回保障',
      g1.flag === '1chk' && g1.lv === 'chk' && !g1.real0 && /實支實付附約:[^｜]*通常已經終止/.test(g1.ev0) && g1.btn === 'c_act1,c_end1' && g1.st === 'active' && g1.real1 && g1.gone, JSON.stringify(g1));
    const g2 = await page.evaluate(() => { const m = me(), r = polCheck({ insurer: '丙人壽', product: '醫療', status: '有效', payFreq: '年', coverages: [{ name: '主約', cat: 'life', amount: 10, unit: '萬元', quote: '身故 10 萬元', status: '繳費期滿', premium: 20000 },
        { name: '附約', cat: 'hosp_day', amount: 1000, unit: '元/日', quote: '每日 1,000 元', premium: 3000 }] }, m).p, st = s => { try { return stParse(s, 'active') } catch (e) { return 'ERR' } };
      return polAnnual(r) + '|' + ['效力停止', '停止效力', '保險期間屆滿', '撤銷件', '豁免保費件', '有效（附約已終止）', '正常（部分解約）', '繳費期間屆滿', '期滿'].map(st).join() });
    check('保費：已經繳完的那一項不算（只算還在繳的附約 3,000）；保單健診更多寫法：效力停止／停止效力＝停效、保險期間屆滿＝滿期、撤銷件＝終止、豁免保費件＝豁免（不用再繳）、括號裡的補充說明不影響整張的狀態',
      g2 === '3000|lapsed,lapsed,matured,ended,waived,active,active,paidup,paidup', g2);
    const g3 = await page.evaluate(() => { const m = me(), F2 = polFlags(insFind(m, 'x2'), m), p3 = insFind(m, 'x3'), F3 = polFlags(p3, m), pe3 = payEnd(p3);
      openPol('x3'); const b = [...document.querySelectorAll('#sheetBody [data-pfix]')].map(x => x.dataset.pfix).join(); document.querySelector('#sheetBody [data-pfix="pay_yrs"]')?.click(); closeSheet();
      return { e2: F2.filter(f => f.lv === 'err').map(f => f.t).join('｜'), e3: F3.filter(f => f.lv === 'err').map(f => f.t).join('｜'), pe3, b, yrs: p3.payYears + ':' + (p3.payAge ?? 'null'), pe3b: payEnd(p3) } });
    check('「繳費期滿」錯誤訊息在沒寫年期時也通順（不出現 null）；繳到 20 歲但生效時已經 30 歲 → 錯誤（多半是繳 20 年）＋一鍵改成繳費年期，不會算出早於生效日的最後一期',
      !/null|但 +生效/.test(g3.e2) && /最後一期在 2053-03/.test(g3.e2) && /繳到 20 歲，但 2015-03-01 生效時已經 30 歲/.test(g3.e3) && g3.pe3 === '' && /pay_yrs/.test(g3.b) && g3.yrs === '20:null' && g3.pe3b === '2034-03-01', JSON.stringify(g3));
    const g5 = await page.evaluate(() => { const m = me(), F = selfF(m), r = selfRate('sleep', [0, 0, 0, 0, 0, 1, 0, 1], m, F), r2 = selfRate('sleep', [1, 1, 0, 0, 0, 1, 0, 1], m, F);
      return { h: r.lv + '|' + r.head, t: r.txt + r.todo.join(), t2: r2.txt + r2.todo.join() } });
    check('呼吸器戴得夠（每晚 6 小時、6 晚）但 AHI 12.3：說明改成請醫師看壓力和面罩，不再說「戴不住」「每晚戴 4 小時以上」；也不誇大成保護心血管',
      g5.h === '1|已確診睡眠呼吸中止：症狀不多，但呼吸器顯示的 AHI 偏高' && !/戴不住|每晚戴 4 小時/.test(g5.t) && /壓力|面罩/.test(g5.t) && !/保護心血管/.test(g5.t + g5.t2) && /AHI 還在 10 以上/.test(g5.t2), JSON.stringify(g5));
    const g4 = await page.evaluate(() => { const y = addDays(todayS(), -1), d = { app: 'Kinwell', v: 1, members: [{ ...JSON.parse(JSON.stringify(MEM[0])), cpap: [{ id: 'n1', d: y, h: 7, n: 7 }, { id: 'n2', d: MEM[0].cpap[0].d, h: 1, n: 1 }] }] };
      applyImport(cleanBackup(d), d, 'merge'); const m = me(), cp = cpapOf(m).map(x => x.d + ':' + x.h).join();
      const pk = polPack({ insurer: '甲', product: '乙', payFreq: '年', prem: null, status: 'active', items: [{ name: 'A', cat: 'life', amt: 1, unit: '萬元', prem: 100 }, { name: 'B', cat: 'hosp_day', amt: 1, unit: '元/日', prem: 50, st: 'ended' }] });
      return { cp, pk: pk.premium + '|' + pk.coverages.map(c => c.name + ':' + (c.status || '') + ':' + c.counted).join() } });
    check('合併匯入：兩邊的呼吸器紀錄都保留（同一天以手機上的為準）；「保單條款審查」提示詞帶上各項狀態、已終止的標「不算」、整張沒寫保費時用各項加總',
      /^\d{4}-\d{2}-\d{2}:7,\d{4}-\d{2}-\d{2}:6$/.test(g4.cp) && g4.pk === '100|A::true,B:已終止:false', JSON.stringify(g4));
    const g6 = await page.evaluate(() => { openCond('osa'); $('#cp-h').value = '5'; $('#cp-n').value = '5'; $('#cp-add').click(); const r = $('#cp-add').getBoundingClientRect(), pr = $('.sheet-panel').getBoundingClientRect(), vis = r.top >= pr.top && r.bottom <= pr.bottom;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true })); const still = $('#sheet').classList.contains('on'); closeSheet(); return { vis, still } });
    await page.evaluate(() => go('ins', 'pol')); await page.focus('#polBody [data-pol="x1"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    await page.evaluate(() => renderIns()); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const g7 = await page.evaluate(() => document.activeElement?.dataset?.pol || document.activeElement?.tagName);
    const fg2 = require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'tests', 'floor-guard.mjs'), '--scan', 'no-such-file.html'], { cwd: ROOT, encoding: 'utf8' });
    check('記一筆呼吸器紀錄後畫面停在紀錄那裡（不跳回最上面）；輸入法選字時按 Esc 不會關掉視窗；保單清單重畫後按 Esc，焦點回到同一張保單；地板守衛找不到檔案時直接報錯（不會假裝 0 處）',
      g6.vis && g6.still && g7 === 'x1' && fg2.status === 2, JSON.stringify({ g6, g7, fg: fg2.status }));
    await page.close();
  }

  // =============== 6zh. 保單核對：每個錯誤附「去哪裡找」、核對清單、複製「核對錯誤」提示詞（匯出的 JSON 可以直接匯回）；缺口列出算不出金額的項目；理賠：突發狀況先選情況 → 勾補充 → 複製提示詞問 AI、問醫師的話 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    const P = (id, o) => ({ id, insurer: '甲人壽', product: '終身壽險', start: '2010-03-01', payYears: 20, payFreq: '年', prem: 30000, status: 'active', src: 'ai', chk: false, warn: [], t: T(0), ...o });
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep' }, { id: 'k', name: '小孩', sex: 'm', birth: '2015-01-01', h: 140, w: 35, act: '1.375', goal: 'keep', role: 'child' }], active: 'a',
      ins: { a: [P('q1', { product: '甲人壽安心醫療', start: T(10), payYears: 10, prem: 12000, bene: '王大明', note: 'secret-note', items: [{ name: '住院醫療計畫', kind: 'rider', cat: 'hosp_real', amt: 2, unit: '計畫', quote: '計畫二' },
            { name: '住院日額', kind: 'main', cat: 'hosp_day', amt: 1000, unit: '元/日', wait: 30, quote: '每日 1,000 元' }, { name: '手術附約', kind: 'rider', cat: 'surgery', amt: null, unit: '' }] }),
          P('q2', { insurer: '乙人壽', start: '1978-03-01', items: [{ name: '身故保險金', kind: 'main', cat: 'life', amt: 100, unit: '萬元', quote: '身故保險金 100 萬元' }] }),
          P('q3', { insurer: '丙人壽', product: '變額壽險', status: 'reduced', type: 'inv', payAge: 80, payYears: null, holder: '本人', uw: { res: 'excl', excl: '對腰椎疾病不負給付責任', decl: '' }, items: [{ name: '身故', kind: 'main', cat: 'life', amt: 50, unit: '萬元', quote: '身故保險金 50 萬元', code: 'WL' },
            { name: '住院附約', kind: 'rider', cat: 'hosp_day', amt: 1000, unit: '元/日', quote: '每日 1,000 元', st: 'active', code: 'HR', prem: 2000, renew: 'yes', payEnd: '2030-01-01' }] })] } });
    const k1 = await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__clip = t; return Promise.resolve() } }, configurable: true });
      go('ins', 'pol'); const box = $('#polBody details')?.textContent || '', allBtn = !!$('#polBody [data-polchk="all"]');
      openPol('q1'); const t = $('#sheetBody').textContent, one = !!$('#sheetBody [data-polchk="q1"]'); closeSheet(); return { box, allBtn, t, one } });
    check('每個錯誤／待核對都附「去哪裡找」：以「計畫」計 → 條款最後的給付表；沒有金額 → 保額欄、實支實付看限額表、手術多半是日額 × 倍數；生效日早於出生 → 保單首頁的被保險人；保單清單上方有「要核對的地方」清單',
      /📍 去哪裡找：條款最後面的「給付表」/.test(k1.t) && /手術多半是「日額 × 倍數」/.test(k1.t) && /要核對的地方（\d+ 項）/.test(k1.box) && /保單首頁（保險單面頁）的「被保險人」/.test(k1.box) && /甲人壽安心醫療/.test(k1.box) && !/甲人壽 甲人壽安心醫療/.test(k1.box) && k1.allBtn && k1.one,
      JSON.stringify({ box: k1.box.slice(0, 200), allBtn: k1.allBtn, one: k1.one }));
    await page.evaluate(() => { const d = $('#polBody details'); if (d) d.open = true; window.__clip = '' });
    await page.click('#polBody [data-polchk="all"]', { timeout: 3000 }).catch(() => {}); await page.waitForTimeout(200);
    const k2 = await page.evaluate(() => { const c = window.__clip || '', j = c.slice(c.indexOf('{"type":"kinwell.policy"')); let n = -1; try { n = JSON.parse(j).policies.length } catch (e) {}
      return { head: /保單資料核對助手/.test(c),計畫: /以「計畫」計.*（App 建議去看：條款最後面的「給付表」/.test(c), birth: /生效日 1978-03-01 早於被保險人/.test(c), n, name: /保單 1：甲人壽安心醫療/.test(c), priv: !/王大明|secret-note|王小明|1984-05-05/.test(c), all: /全部保障項目/.test(c) } });
    check('「核對錯誤」提示詞：寫出每個問題和 App 建議去看哪裡、請 AI 對照文件寫出原文與正確值、附約沒金額分「本來就沒有」和「沒抄到」；附上和匯入格式相同的 JSON（受益人、備註不附），請 AI 改完整張列出來貼回 App 更新',
      k2.head && k2.計畫 && k2.birth && k2.n === 3 && k2.name && k2.priv && k2.all, JSON.stringify(k2));
    const k3 = await page.evaluate(() => { try { const m = me(), p = insFind(m, 'q3'), r = polCheck(polExport(p), m).p;
      return [r.status, r.type, r.payAge, r.holder, r.uw?.res, r.items.map(c => [c.st, c.code, c.prem, c.renew, c.cat, c.kind, c.payEnd].join('/')).join('|')].join() } catch (e) { return 'ERR ' + e.message } });
    check('核對提示詞裡的 JSON 匯回 App 不會走樣：狀態、類型、繳到幾歲、要保人、核保結果、每一項的狀態／代碼／保費／續保／類別／主附約／繳費終期都一樣',
      k3 === 'reduced,inv,80,本人,excl,/WL///life/main/|active/HR/2000/yes/hosp_day/rider/2030-01-01', k3);
    const k4 = await page.evaluate(() => { go('ins', 'cov'); return $('#covBody').textContent });
    const k4x = await page.evaluate(() => { const m = me(); insFind(m, 'q2').items.push({ name: '<img src=x onerror="window.__xss=1">', kind: 'rider', cat: 'life', amt: 1, unit: '單位', quote: '1 單位' }); go('ins', 'cov'); renderCov();
      return { img: !!$('#covBody img'), xss: window.__xss === 1, txt: /另有 \d+ 項金額算不出來（[^）]*<img/.test($('#covBody').textContent) } });
    await page.waitForTimeout(100);
    check('保障缺口列出的項目名稱經過 esc()：AI 匯入的名稱含 HTML 也只當文字顯示、不會執行', !k4x.img && !k4x.xss && k4x.txt && !(await page.evaluate(() => window.__xss === 1)), JSON.stringify(k4x));
    check('保障缺口寫出是哪幾項金額算不出來（例如「住院醫療計畫」以計畫計）；保險公司名已經在商品名稱裡時不重複顯示',
      /另有 1 項金額算不出來（住院醫療計畫）/.test(k4) && /甲人壽安心醫療：繳費到/.test(k4) && !/甲人壽 甲人壽安心醫療/.test(k4), k4.slice(0, 300));
    const k5 = await page.evaluate(() => { go('ins', 'clm'); const chips = [...document.querySelectorAll('#scnBody [data-cscn]')].map(b => b.dataset.cscn).join(); document.querySelector('#scnBody [data-cscn="ad"]')?.click();
      const t = $('#sheetBody').textContent; document.querySelector('#sheetBody [data-scadd="0"]')?.click(); document.querySelector('#sheetBody [data-scadd="2"]')?.click();
      if ($('#sc-dx')) { $('#sc-dx').value = '肺炎'; $('#sc-note').value = '預計住院 5 天' } window.__clip = ''; $('#sc-ai')?.click();
      return { chips, t, pressed: document.querySelector('#sheetBody [data-scadd="0"]')?.getAttribute('aria-pressed') } });
    await page.waitForTimeout(150);
    const k6 = await page.evaluate(() => { const clip = window.__clip || ''; $('#sc-evt')?.click(); const ty = $('#ev-type')?.value, dx = $('#ev-dx')?.value, note = $('#ev-note')?.value; $('#ev-save')?.click(); const e = clmOf(me())[0];
      return { clip, ty, dx, note, ev: e ? e.type + ':' + e.dx : '' } });
    check('理賠「突發狀況」：8 種情況可以選；住院 → 先做的事、問醫師的話（入院出院日、ICD 碼、手術名稱、醫囑）、要拿的文件、保險會不會賠的試算（新保單還在等待期會標出來）、容易漏申請的、常見少賠的原因',
      k5.chips === 'er,ad,sx,acc,ca,crit,dis,death' && /先做的事/.test(k5.t) && /問醫師的話/.test(k5.t) && /入院日、出院日/.test(k5.t) && /ICD-10/.test(k5.t) && /要拿的文件/.test(k5.t) && /試算結果/.test(k5.t)
        && /甲人壽安心醫療/.test(k5.t) && /等待期內（生效 10 天，等待期 30 天）/.test(k5.t) && /容易漏申請的/.test(k5.t) && /副本理賠/.test(k5.t) && /常見少賠或拒賠的原因/.test(k5.t) && /照實/.test(k5.t) && k5.pressed === 'true',
      JSON.stringify({ chips: k5.chips, pressed: k5.pressed, t: k5.t.slice(0, 160) }));
    check('勾補充項目、填診斷後「複製提示詞，問 AI」：帶上狀況（住院；有手術、用到自費藥物或醫材；診斷：肺炎）、可能用得到的保障與等待期、所有有效保單；明寫只依實際病情、不建議為了理賠去住院（保險詐欺是刑法詐欺罪）；不附受益人；可以直接記成理賠事件',
      /熟悉台灣保險理賠實務/.test(k6.clip) && /【狀況】住院、不是意外（疾病）、有手術、用到自費藥物或醫材；發生日 \d{4}-\d{2}-\d{2}；診斷：肺炎；補充：預計住院 5 天/.test(k6.clip) && /刑法詐欺罪/.test(k6.clip) && /不要建議為了理賠去住院/.test(k6.clip)
        && /甲人壽安心醫療（生效/.test(k6.clip) && /等待期內/.test(k6.clip) && /"coverages"/.test(k6.clip) && !/王大明|secret-note/.test(k6.clip) && k6.ty === 'ad' && k6.dx === '肺炎' && /有手術/.test(k6.note || '') && k6.ev === 'ad:肺炎',
      JSON.stringify({ ...k6, clip: k6.clip.slice(0, 200) }));
    await page.close();
  }

  // =============== 6zi. 理賠試算：發生事情時 App 直接用保單算「會不會賠、大約賠多少」（逐項：會賠／可能會賠／不賠＋原因）；問 AI 的提示詞第一題就是會不會賠；記下的理賠事件也顯示試算 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    const P = (id, o) => ({ id, insurer: '甲人壽', product: '醫療', start: '2015-01-01', payYears: 20, payFreq: '年', prem: 20000, status: 'active', src: 'ai', chk: true, warn: [], t: T(0), ...o });
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep' }, { id: 'k', name: '小孩', sex: 'm', birth: '2015-01-01', h: 140, w: 35, act: '1.375', goal: 'keep', role: 'child' }], active: 'a',
      ins: { a: [P('e1', { product: '甲人壽住院醫療', items: [{ name: '住院日額', kind: 'main', cat: 'hosp_day', amt: 2000, unit: '元/日', quote: '每日 2,000 元' }, { name: '實支實付', kind: 'rider', cat: 'hosp_real', amt: 10, unit: '萬元', quote: '限額 10 萬元' },
            { name: '手術', kind: 'rider', cat: 'surgery', amt: 10, unit: '倍', quote: '10 倍' }, { name: '傷害醫療', kind: 'rider', cat: 'acc_med', amt: 5, unit: '萬元', quote: '傷害醫療 5 萬元' }] }),
          P('e2', { insurer: '乙人壽', product: '防癌險', start: T(30), items: [{ name: '初次罹癌', kind: 'main', cat: 'cancer', amt: 30, unit: '萬元', wait: 90, quote: '30 萬元' }, { name: '癌症住院日額', kind: 'rider', cat: 'cancer', amt: 2000, unit: '元/日', wait: 90, quote: '每日 2,000 元' }] }),
          P('e3', { insurer: '丙人壽', product: '定期壽險', start: '2010-01-01', items: [{ name: '身故保險金', kind: 'main', cat: 'life', amt: 300, unit: '萬元', quote: '300 萬元' }, { name: '意外身故', kind: 'rider', cat: 'accident', amt: 500, unit: '萬元', quote: '500 萬元' }] }),
          P('e4', { insurer: '丁人壽', product: '舊醫療', status: 'surr', items: [{ name: '住院日額', kind: 'main', cat: 'hosp_day', amt: 1000, unit: '元/日', quote: '每日 1,000 元' }] }),
          P('e5', { insurer: '戊人壽', product: '終身壽險', status: 'reduced', items: [{ name: '身故', kind: 'main', cat: 'life', amt: 20, unit: '萬元', quote: '20 萬元' }, { name: '住院附約', kind: 'rider', cat: 'hosp_day', amt: 1500, unit: '元/日', quote: '每日 1,500 元' }] })] },
      clm: { a: [{ id: 'v1', type: 'ad', d: T(10), end: T(5), hosp: '乙醫院', dx: '肺炎', cost: 8000, claims: [] }] } });
    const i1 = await page.evaluate(() => { try { const m = me(), R = claimEst(m, { k: 'ad', d: todayS(), days: '5', icu: '1', cost: '8000', self: '20000', sx: true, acc: false });
      const f = n => { for (const o of R.out) for (const r of o.its) if (polName(o.p) + '/' + r.c.name === n) return r.v + ':' + (r.amt ?? '') + ':' + r.txt + (r.why.length ? '〔' + r.why.join('；') + '〕' : ''); return '-' };
      return { sum: R.sum, n: [R.nY, R.nM, R.nN].join(), day: f('甲人壽住院醫療/住院日額'), real: f('甲人壽住院醫療/實支實付'), sx: f('甲人壽住院醫療/手術'), acc: f('甲人壽住院醫療/傷害醫療'), surr: f('丁人壽 舊醫療/住院日額'), red: f('戊人壽 終身壽險/住院附約'), life: f('丙人壽 定期壽險/身故保險金') } } catch (e) { return { err: e.message } } });
    check('理賠試算（住院 5 天、加護病房 1 天、有手術、收據 2.8 萬、不是意外）：住院日額會賠 2,000 × 5 ≈ 10,000 元（提醒加護病房可能加倍）、實支實付依收據 ≈ 28,000 元（上限 10 萬）、手術是日額 × 倍數要看條款、傷害醫療不是意外不列、已解約的不賠、減額繳清的附約可能會賠；合計會賠 2 項約 38,000 元',
      i1.sum === 38000 && i1.n === '2,2,1' && i1.day === 'yes:10000:每日 2,000 元 × 5 天 ≈ 10,000 元〔住加護病房：有些保單另外加倍（看條款）〕' && /^yes:28000:依收據實支：收據 28,000 元，上限 10 萬 → ≈ 28,000 元/.test(i1.real)
        && i1.sx === 'maybe::10 倍：日額 × 倍數，看條款的倍數表' && i1.acc === '-' && i1.surr === 'no::事故時保單是「已解約」' && /^maybe:7500:/.test(i1.red) && /通常已經終止/.test(i1.red) && i1.life === '-', JSON.stringify(i1));
    const i2 = await page.evaluate(() => { try { const m = me(), R = claimEst(m, { k: 'ca', d: todayS(), days: '3' }); return R.out.flatMap(o => o.its.map(r => polName(o.p) + '/' + r.c.name + ':' + r.v + ':' + r.txt)).join('｜') } catch (e) { return 'ERR ' + e.message } });
    check('確診癌症但防癌險才生效 30 天（等待期 90 天）→ 初次罹癌、癌症住院都標「不賠：等待期內」；住院日額照樣會賠 2,000 × 3 天',
      /乙人壽 防癌險\/初次罹癌:no:等待期內（生效 30 天，等待期 90 天）/.test(i2) && /乙人壽 防癌險\/癌症住院日額:no:等待期內/.test(i2) && /甲人壽住院醫療\/住院日額:yes:每日 2,000 元 × 3 天 ≈ 6,000 元/.test(i2), i2);
    const i3 = await page.evaluate(() => { try { const m = me(), a = claimEst(m, { k: 'death', d: todayS(), acc: true }), b = claimEst(m, { k: 'death', d: todayS(), acc: false });
      return [a.sum, b.sum, a.out.flatMap(o => o.its.map(r => r.c.name + ':' + r.v)).join()].join('|') } catch (e) { return 'ERR ' + e.message } });
    check('家人過世：意外身故時壽險 300 萬＋意外身故 500 萬都會賠（約 800 萬）、疾病身故只有壽險 300 萬；減額繳清的壽險標「可能」（以減額後的保額為準）',
      i3 === '8000000|3000000|身故保險金:yes,意外身故:yes,身故:maybe', i3);
    const i4 = await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__clip = t; return Promise.resolve() } }, configurable: true });
      go('ins', 'clm'); const card = $('#scnBody')?.closest('.card')?.querySelector('h2')?.textContent || ''; document.querySelector('#scnBody [data-cscn="ad"]')?.click();
      const set = (id, v) => { const e = $('#ce-' + id); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })) } };
      set('days', '5'); set('icu', '1'); set('cost', '8000'); set('self', '20000'); document.querySelector('#sheetBody [data-cech="sx"]')?.click();
      const out = $('#ce-out')?.textContent || ''; window.__clip = ''; $('#sc-ai')?.click(); return { card, head: $('#sheetBody h3')?.textContent || '', out } });
    await page.waitForTimeout(150);
    const i5 = await page.evaluate(() => window.__clip || '');
    check('理賠頁「發生事情了：保險會不會賠？」→ 選住院、填天數和收據金額、按「有手術」→ 馬上顯示：會賠 2 項約 38,000 元、可能會賠 2 項、不賠 1 項，逐項寫算式和原因；註明是 App 粗估、不是保險公司核定',
      /保險會不會賠/.test(i4.card) && /住院：保險會不會賠/.test(i4.head) && /✅ 會賠 2 項，App 估算約 38,000 元/.test(i4.out) && /🟠 可能會賠 2 項/.test(i4.out) && /⛔ 不賠 1 項/.test(i4.out)
        && /每日 2,000 元 × 5 天 ≈ 10,000 元/.test(i4.out) && /收據 28,000 元/.test(i4.out) && /日額 × 倍數/.test(i4.out) && /事故時保單是「已解約」/.test(i4.out) && /主約減額繳清後這項通常已經終止/.test(i4.out) && /不是保險公司的核定/.test(i4.out),
      JSON.stringify({ card: i4.card, head: i4.head, out: i4.out.slice(0, 300) }));
    check('問 AI 的提示詞第一題就是「會不會賠、大約賠多少」：附上狀況（住院 5 天、加護病房 1 天、不是意外、有手術、收據金額）和 App 的逐項試算，請 AI 對照條款確認或更正；不附姓名生日',
      /最想知道：我的保險會不會賠、大約賠多少/.test(i5) && /A\. 會不會賠、大約賠多少/.test(i5) && /【App 的試算/.test(i5) && /住院日額【會賠】每日 2,000 元 × 5 天 ≈ 10,000 元/.test(i5)
        && /住院、住院 5 天、加護病房 1 天、不是意外（疾病）、有手術、健保自付 8000 元、自費 20000 元/.test(i5) && !/王小明|1984-05-05/.test(i5), i5.slice(0, 400));
    const i6 = await page.evaluate(() => { closeSheet(); openEvt('v1'); const t = $('#sheetBody').textContent; closeSheet(); return t });
    check('已經記下的理賠事件（住院 5 天、自付 8,000 元）打開時，最上面也有「App 試算：保險會不會賠」', /App 試算：保險會不會賠/.test(i6) && /每日 2,000 元 × 5 天 ≈ 10,000 元/.test(i6) && /收據 8,000 元/.test(i6), i6.slice(0, 300));
    await page.close();
  }

  // =============== 6zj. 條款規則：下載條款交給 AI 抄成規則 → 貼回 App；理賠試算改用條款（加護病房倍數、實支實付分項限額、每次最多天數、計畫換算、只賠意外、門診也賠、門診手術比例、原位癌比例、條款的等待期）；編輯、備份、重新匯入都保留 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    const P = (id, o) => ({ id, insurer: '甲人壽', product: '醫療', start: '2015-01-01', payYears: 20, payFreq: '年', prem: 20000, status: 'active', src: 'ai', chk: true, warn: [], t: T(0), ...o });
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep' }, { id: 'k', name: '小孩', sex: 'm', birth: '2015-01-01', h: 140, w: 35, act: '1.375', goal: 'keep', role: 'child' }], active: 'a',
      ins: { a: [P('t1', { product: '甲人壽住院醫療', items: [{ name: '住院日額', kind: 'main', cat: 'hosp_day', amt: 2000, unit: '元/日', quote: '每日 2,000 元' }, { name: '實支實付', kind: 'rider', cat: 'hosp_real', amt: 20, unit: '萬元', quote: '20 萬元' },
            { name: '手術', kind: 'rider', cat: 'surgery', amt: 10, unit: '倍', quote: '10 倍' }, { name: '傷害醫療', kind: 'rider', cat: 'acc_med', amt: 5, unit: '萬元', quote: '5 萬元' },
            { name: '住院醫療計畫', kind: 'rider', cat: 'hosp_day', amt: 2, unit: '計畫', quote: '計畫二' }, { name: '癌症一次金', kind: 'rider', cat: 'cancer', amt: 50, unit: '萬元', quote: '50 萬元' }] }),
          P('t2', { insurer: '乙人壽', product: '新醫療', start: T(10), items: [{ name: '住院日額', kind: 'main', cat: 'hosp_day', amt: 1000, unit: '元/日', quote: '每日 1,000 元' }] }),
          P('t3', { insurer: '丙人壽', product: '防護醫療', start: T(20), items: [{ name: '住院日額', kind: 'main', cat: 'hosp_day', amt: 1500, unit: '元/日', quote: '每日 1,500 元' }],
            terms: { ver: '丙人壽防護醫療 v1', t: T(0), rules: [{ name: '住院日額', pay: 'daily', waitIll: 30, quote: '等待期間 30 日', clause: '第五條', sub: [], excl: [] }], warn: [] } })] } });
    const TJ = { type: 'kinwell.terms', v: 1, ver: '甲人壽住院醫療保險附約 112.01.01 備查', product: '甲人壽住院醫療', rules: [
      { name: '住院日額', pay: 'daily', maxDays: 3, icuX: 2, waitIll: 30, quote: '每日給付住院日額，加護病房期間按二倍給付，每次住院最高 3 日', clause: '第八條' },
      { name: '實支實付', pay: 'expense', limit: 300000, sub: [{ name: '病房費', amt: 2000, unit: '元/日' }, { name: '雜費', amt: 100000, unit: '元/次' }, { name: '手術費', amt: 50000, unit: '元/次' }], copyClaim: true, quote: '病房費每日 2,000 元、雜費 10 萬、手術費 5 萬', clause: '第九條' },
      { name: '手術', pay: 'table', outSx: 0.5, quote: '門診手術按手術表二分之一給付', clause: '第十條' },
      { name: '傷害醫療', pay: 'expense', accOnly: true, outpatient: true, quote: '因意外傷害事故門診亦給付', clause: '第十一條' },
      { name: '住院醫療計畫', pay: 'daily', perUnit: { amt: 1000, unit: '元/日' }, quote: '每計畫每日 1,000 元', clause: '第十二條' },
      { name: '癌症一次金', pay: 'lump', inSitu: 0.1, waitIll: 90, quote: '原位癌按百分之十給付', clause: '第十三條' },
      { name: '壞的', icuX: 99, waitIll: -5, maxDays: 0, quote: '' }, { name: '條款才有的', pay: 'lump', extra: true, quote: 'x' }], unreadable: ['第 5 頁模糊', '<img src=x onerror="window.__tx=1">'] };
    const j1 = await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__clip = t; return Promise.resolve() } }, configurable: true });
      openPol('t1'); const before = $('#sheetBody').textContent, has = !!document.querySelector('#sheetBody [data-termscopy]') && !!document.querySelector('#sheetBody [data-termsimp]'); window.__clip = ''; document.querySelector('#sheetBody [data-termscopy]')?.click(); return { before, has } });
    await page.waitForTimeout(100);
    const j2 = await page.evaluate(TJ => { const clip = window.__clip || ''; document.querySelector('#sheetBody [data-termsimp]')?.click(); if (!$('#tm-in')) return { clip, prev: '', n: -1, bad: '', after: '', img: false };
      $('#tm-in').value = '```json\n' + JSON.stringify(TJ) + '\n```'; $('#tm-go').click(); const prev = $('#tm-out').textContent, img = !!$('#tm-out img'); $('#tm-save')?.click(); const p = insFind(me(), 't1'), after = $('#sheetBody').textContent;
      return { clip, prev, img, n: p.terms?.rules?.length, bad: JSON.stringify((p.terms?.rules || []).find(r => r.name === '壞的') || null), after } }, TJ);
    await page.waitForTimeout(100);
    check('保單明細「📜 條款規則」：還沒匯入時說明去哪裡下載條款；複製擷取提示詞（附這張保單的保障項目、不附姓名生日）→ 貼回 AI 的結果 → 核對（對到幾項、看不清楚的、異常值清掉、HTML 只當文字）→ 存入；明細顯示每一項的條款規則',
      /還沒匯入條款/.test(j1.before) && j1.has && /保單條款規則擷取器/.test(j2.clip) && /"name":"住院醫療計畫"/.test(j2.clip) && /kinwell\.terms/.test(j2.clip) && !/王小明|1984-05-05/.test(j2.clip)
        && /對到 6／6 項保障/.test(j2.prev) && /第 5 頁模糊/.test(j2.prev) && !j2.img && !(await page.evaluate(() => window.__tx === 1)) && j2.n === 8 && /"icuX":null/.test(j2.bad) && /"waitIll":null/.test(j2.bad) && /"maxDays":null/.test(j2.bad)
        && /甲人壽住院醫療保險附約 112\.01\.01 備查/.test(j2.after) && /加護病房 2 倍/.test(j2.after) && /門診手術 50%/.test(j2.after) && /原位癌 10%/.test(j2.after) && /只賠意外/.test(j2.after) && /可以用收據副本/.test(j2.after),
      JSON.stringify({ before: j1.before.slice(0, 60), has: j1.has, n: j2.n, bad: j2.bad, prev: j2.prev.slice(0, 160), img: j2.img }));
    const j3 = await page.evaluate(() => { try { const m = me(), R = claimEst(m, { k: 'ad', d: todayS(), days: '5', icu: '2', cost: '50000', self: '250000', sx: true }), f = n => { for (const o of R.out) for (const r of o.its) if (polName(o.p) + '/' + r.c.name === n) return r.v + ':' + (r.amt ?? '') + ':' + r.txt + (r.terms ? '｜條款' : ''); return '-' };
      return { day: f('甲人壽住院醫療/住院日額'), real: f('甲人壽住院醫療/實支實付'), plan: f('甲人壽住院醫療/住院醫療計畫'), sx: f('甲人壽住院醫療/手術'), t2: f('乙人壽 新醫療/住院日額'), t3: f('丙人壽 防護醫療/住院日額'), nNoT: R.nNoT } } catch (e) { return { err: e.message } } });
    check('理賠試算改用條款（住院 5 天、加護病房 2 天、收據 30 萬、有手術）：住院日額每次最多 3 天＋加護病房加倍 ≈ 10,000 元；實支實付照分項限額（病房費 × 5 天＋雜費＋手術費）≈ 160,000 元；「計畫二」用條款換算成每日 2,000 元；條款的等待期 30 天也會擋；沒匯入條款的照舊用保單金額',
      /^yes:10000:每日 2,000 元 × 3 天 ＋ 加護病房 2 天再加 1 倍 ≈ 10,000 元（條款每次最多 3 天）/.test(j3.day) && /｜條款$/.test(j3.day) && /^yes:160000:依條款分項限額（病房費 2,000 元×5 天＋雜費 10 萬＋手術費 5 萬＝160,000 元）/.test(j3.real)
        && /^yes:10000:每日 2,000 元 × 5 天 ≈ 10,000 元/.test(j3.plan) && /｜條款$/.test(j3.plan) && /^maybe::10 倍：日額 × 倍數/.test(j3.sx) && /^yes:5000:每日 1,000 元 × 5 天 ≈ 5,000 元$/.test(j3.t2)
        && /^no::等待期內（生效 20 天，等待期 30 天，依條款第五條）：疾病通常不賠/.test(j3.t3) && j3.nNoT === 1, JSON.stringify(j3));
    const j4 = await page.evaluate(() => { try { const m = me(), g = (x, n) => { const R = claimEst(m, { d: todayS(), ...x }); for (const o of R.out) for (const r of o.its) if (polName(o.p) + '/' + r.c.name === n) return r.v + ':' + (r.amt ?? '') + ':' + r.txt + (r.why.length ? '〔' + r.why.join('；') + '〕' : ''); return '-' };
      return { outSx: g({ k: 'sx', sxOut: true }, '甲人壽住院醫療/手術'), accOut: g({ k: 'acc', days: '0', cost: '3000' }, '甲人壽住院醫療/傷害醫療'), insitu: g({ k: 'ca', inSitu: true }, '甲人壽住院醫療/癌症一次金'), ca: g({ k: 'ca' }, '甲人壽住院醫療/癌症一次金') } } catch (e) { return { err: e.message } } });
    check('條款的細節：門診手術條款給付 50%；意外門診條款寫「門診也賠」→ 傷害醫療依收據 ≈ 3,000 元；原位癌條款給付 10% ≈ 5 萬；一般癌症照 50 萬並註明原位癌只給 10%',
      /門診手術：條款給付 50%/.test(j4.outSx) && /^yes:3000:依收據實支：收據 3,000 元，上限 5 萬 → ≈ 3,000 元/.test(j4.accOut) && /門診也賠/.test(j4.accOut) && /^yes:50000:原位癌依條款給付 10%/.test(j4.insitu)
        && /^yes:500000:50 萬（初次罹癌以病理報告日期為準；原位癌只給 10%）/.test(j4.ca), JSON.stringify(j4));
    const j5 = await page.evaluate(() => { const m = me(), p = insFind(m, 't1'); openPolEdit('t1'); $('#pe-save').click(); const afterEdit = (insFind(m, 't1').terms?.rules || []).length;
      const b = cleanBackup({ app: 'Kinwell', members: [MEM[0]], active: 'a', ins: { a: [JSON.parse(JSON.stringify(insFind(m, 't1')))] } }), bk = (b.ins?.a?.[0]?.terms?.rules || []).length;
      const np = polCheck({ insurer: '甲人壽', product: '甲人壽住院醫療', start: '2015-01-01', coverages: [{ name: '住院日額', cat: 'hosp_day', amount: 2500, unit: '元/日', quote: '每日 2,500 元' }] }, m).p, mg = (polMerge(insFind(m, 't1'), np, { status: '' }).terms?.rules || []).length;
      const pp = promptClaimPrep(m, CLAIM_SCN.find(x => x.k === 'ad'), { k: 'ad', d: todayS(), days: '5', add: [], note: '', dx: '' }); closeSheet(); go('ins', 'pol');
      return { afterEdit, bk, mg, pp: /【已匯入的條款規則/.test(pp) && /第八條/.test(pp), line: $('#polBody').textContent } });
    const j6 = await page.evaluate(() => { const m = me(), mk = acc => ({ id: 'z', insurer: '甲', product: '乙', start: '2015-01-01', status: 'active', src: 'ai', chk: false, items: [{ name: '傷害住院日額', cat: 'hosp_day', amt: 1000, unit: '元/日', quote: '每日 1,000 元' }, { name: '住院日額', cat: 'hosp_day', amt: 1000, unit: '元/日', quote: '每日 1,000 元' }],
        terms: { ver: 'v', t: todayS(), rules: [{ name: '傷害住院日額', accOnly: acc, clause: '第三條', sub: [], excl: [] }, { name: '住院日額', accOnly: true, clause: '第四條', sub: [], excl: [] }], warn: [] } });
      const f = p => polAudit(p, m).filter(x => /只賠意外/.test(x.t)).map(x => x.ci + ':' + x.t).join('｜'); return f(mk(false)) + '#' + f(mk(true)) });
    check('保單檢查跟著條款：條款寫生病也賠 → 名稱有「傷害」也不再提醒；條款寫只賠意外 → 提醒「生病住院不賠」並附條號（名稱沒有「傷害」也會提醒）',
      j6 === '1:「住院日額」條款寫只賠意外傷害（第四條）：生病住院不賠#0:「傷害住院日額」條款寫只賠意外傷害（第三條）：生病住院不賠｜1:「住院日額」條款寫只賠意外傷害（第四條）：生病住院不賠', j6);
    check('條款規則在編輯保單、備份還原、重新匯入更新後都保留；問 AI 的提示詞附上用得到的條款規則（原文與條號）；保單清單標「📜 已匯入條款」',
      j5.afterEdit === 8 && j5.bk === 8 && j5.mg === 8 && j5.pp && /📜 已匯入條款/.test(j5.line), JSON.stringify({ ...j5, line: j5.line.slice(0, 120) }));
    await page.close();
  }

  // =============== 6zk. 和保險存摺對帳：「金額算不出來」的項目在缺口直接填金額、匯入條款後缺口也用條款換算、單位寫「萬元（B型）」照算、意外身故連同壽險、已解約不寫已繳完 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    const P = (id, o) => ({ id, insurer: '甲人壽', product: '醫療', start: '2015-01-01', payYears: 20, payFreq: '年', prem: 20000, status: 'active', src: 'ai', chk: false, warn: [], t: T(0), ...o });
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', inc: 80 }, { id: 'k', name: '小孩', sex: 'm', birth: '2015-01-01', h: 140, w: 35, act: '1.375', goal: 'keep', role: 'child' }], active: 'a',
      ins: { a: [P('v1', { insurer: '丙人壽', product: '變額萬能壽險', items: [{ name: '身故保險金', kind: 'main', cat: 'life', amt: 500, unit: '萬元（B型）', quote: '保險金額 500 萬元' }] }),
          P('v2', { product: '甲人壽住院醫療', items: [{ name: '住院醫療附約', kind: 'rider', cat: 'hosp_real', amt: 2, unit: '計畫', quote: '計畫二' }, { name: '住院日額附約', kind: 'rider', cat: 'hosp_day', amt: 3, unit: '單位', quote: '3 單位' }] }),
          P('v3', { insurer: '乙人壽', product: '定期壽險', items: [{ name: '壽險', kind: 'main', cat: 'life', amt: 10, unit: '萬元', quote: '10 萬元' }, { name: '意外身故', kind: 'rider', cat: 'accident', amt: 110, unit: '萬元', quote: '110 萬元' }] }),
          P('v4', { insurer: '丁人壽', product: '舊壽險', status: 'surr', start: '1982-11-05', items: [{ name: '身故', kind: 'main', cat: 'life', amt: 20, unit: '萬元', quote: '20 萬元' }] }),
          P('v5', { insurer: '戊人壽', product: '實支實付', items: [{ name: '醫療附約', kind: 'rider', cat: 'hosp_real', amt: 1, unit: '計畫', quote: '計畫一' }, { name: '日額附約', kind: 'rider', cat: 'hosp_day', amt: 2, unit: '單位', quote: '2 單位' }],
            terms: { ver: 'v1', t: T(0), rules: [{ name: '醫療附約', pay: 'expense', limit: 300000, quote: '每次限額 30 萬', clause: '第九條', sub: [], excl: [] }, { name: '日額附約', pay: 'daily', perUnit: { amt: 1000, unit: '元/日' }, quote: '每單位每日 1,000 元', clause: '第八條', sub: [], excl: [] }], warn: [] } })] } });
    const k1 = await page.evaluate(() => { const m = me(), S0 = covSum(m), f = (c, per) => { const s = S0.find(x => x.cat === c && !x.nm && x.per === per); return s ? s.v : 0 };
      return { life: f('life', ''), real: f('hosp_real', ''), day: f('hosp_day', 'day'), bType: covUnit({ unit: '萬元（B型）', cat: 'life' }).nm || '', onlyB: covUnit({ unit: 'B型', cat: 'life' }).nm || '' } });
    check('保障加總：單位寫「萬元（B型）」照算 500 萬（只寫「B型」才當成算不出來）；匯入條款的附約，缺口也用條款換算（實支實付每次 30 萬、2 單位 × 每單位 1,000 元/日 → 2,000 元/日）',
      k1.life === 5100000 && k1.real === 300000 && k1.day === 2000 && k1.bType === '' && k1.onlyB === 'unit', JSON.stringify(k1));
    const k2 = await page.evaluate(() => { go('ins', 'cov'); const t = $('#covBody').textContent, btn = [...document.querySelectorAll('#covBody [data-gapfix]')].map(b => b.dataset.gapfix).join();
      const pr = window.prompt; window.prompt = () => '20萬/次'; document.querySelector('#covBody [data-gapfix="v2:0"]')?.click(); window.prompt = () => '4200/日'; document.querySelector('#covBody [data-gapfix="v2:1"]')?.click(); window.prompt = pr;
      const m = me(), p = insFind(m, 'v2'), t2 = $('#covBody').textContent;
      return { t, btn, it: p.items.map(c => c.amt + ' ' + c.unit).join('|'), hist: (p.hist || []).length, err: polFlags(p, m).filter(f => f.lv === 'err').length, t2 } });
    check('保障缺口直接「✏️ 填金額」：算不出來的項目各有按鈕 → 照保險存摺填「20萬/次」「4200/日」→ 存成 20 萬元/次、4,200 元/日、記進變更紀錄、不會變成「金額在原文找不到」的錯誤；缺口馬上重算（實支實付 50 萬、日額 6,200 元）；意外身故列寫出連同壽險共多少（和保險存摺「含一般身故」對得上）',
      k2.btn === 'v2:0,v2:1' && /✏️ 填「住院醫療附約」的金額/.test(k2.t) && k2.it === '20 萬元/次|4200 元/日' && k2.hist === 2 && k2.err === 0
        && /有 50 萬/.test(k2.t2) && /有 6,200 元/.test(k2.t2) && /意外身故時連同壽險共 620 萬/.test(k2.t2), JSON.stringify({ btn: k2.btn, it: k2.it, hist: k2.hist, err: k2.err, t2: k2.t2.slice(0, 400) }));
    const k3 = await page.evaluate(() => { const m = me(); return polLine(insFind(m, 'v4')) });
    check('已解約的保單清單上不再寫「已繳完」', !/已繳完/.test(k3) && /已解約/.test(k3), k3);
    await page.close();
  }

  // =============== 6zl. 減額繳清不再問繳別、繳費方式另存一欄、要保人／受益人只寫稱謂、原文裡的家人姓名刪掉、外幣保單要填匯率、「核對錯誤」和「保單條款審查」都能貼回 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    const P = (id, o) => ({ id, insurer: '甲人壽', product: '甲人壽終身壽險', start: '2013-06-18', payYears: 20, payFreq: '', prem: 0, status: 'reduced', src: 'ai', chk: false, warn: [], t: T(0), ...o });
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', inc: 80 }, { id: 'b', name: '林美華', sex: 'f', birth: '1986-02-02', h: 160, w: 52, act: '1.375', goal: 'keep', role: 'spouse' }], active: 'a',
      ins: { a: [P('r1', { items: [{ name: '身故保險金', kind: 'main', cat: 'life', amt: 38270, unit: '元', quote: '被保險人王小明 減額繳清後保險金額 38,270 元' }] }),
          P('r2', { insurer: '乙人壽', product: '乙人壽醫療', status: 'active', prem: 12000, start: '2020-01-01', items: [{ name: '住院日額', kind: 'main', cat: 'hosp_day', amt: 1000, unit: '元/日', quote: '每日 1,000 元' }] })] } });
    const k1 = await page.evaluate(() => { const m = me(), F = id => polFlags(insFind(m, id), m).map(f => f.t).join('|');
      const a = polCheck({ insurer: '甲人壽', product: '甲人壽終身壽險', status: '減額繳清', payFreq: '銀行轉帳', premium: 0, start: '2013-06-18', holderHint: '王小明', beneficiary: '法定繼承人', coverages: [{ name: '身故保險金', cat: 'life', amount: 38270, unit: '元', quote: '要保人王小明 被保險人王小明 林美華 減額後保險金額 38,270 元' }] }, m).p;
      const b = polCheck({ insurer: '甲人壽', product: '甲人壽醫療', status: '有效', payFreq: '年繳（信用卡）', premium: 8000, start: '2020-01-01', beneficiary: '王大同', coverages: [{ name: '住院日額', cat: 'hosp_day', amount: 1000, unit: '元/日', quote: '每日 1,000 元' }] }, m).p;
      return { r1: F('r1'), r2: F('r2'), a: { f: a.payFreq, by: a.payBy, st: a.status, h: a.holder, bene: a.bene, q: a.items[0].quote, w: a.warn.join('|') }, b: { f: b.payFreq, by: b.payBy, w: b.warn.join('|') } } });
    check('減額繳清（不用再繳、保費 0）不再出現「繳別不明」；還在繳的保單沒寫繳別照樣提醒；AI 把「銀行轉帳」寫在繳別 → 存成繳費方式、不當繳別；「年繳（信用卡）」→ 年繳＋信用卡',
      !/繳別不明/.test(k1.r1) && /繳別不明/.test(k1.r2) && k1.a.f === '' && k1.a.by === '銀行轉帳' && k1.a.st === 'reduced' && !/繳別不明/.test(k1.a.w) && k1.b.f === '年' && k1.b.by === '信用卡', JSON.stringify(k1));
    check('要保人、受益人可以存姓名（只在手機裡）：要保人寫姓名照存、不再提醒；原文裡的家人姓名改成「被保險人」「家人」（AI 照抄時的防線）',
      k1.a.h === '王小明' && k1.a.bene === '法定繼承人' && !/王小明|林美華/.test(k1.a.q) && /被保險人/.test(k1.a.q) && /家人/.test(k1.a.q) && !/受益人只要寫關係|要保人只要寫稱謂/.test(k1.b.w + k1.a.w), JSON.stringify(k1.a) + JSON.stringify(k1.b));
    const k2 = await page.evaluate(() => { const m = me(), L = INS[m.id];
      const { p } = polCheck({ insurer: '丙人壽', product: '丙人壽美元利率變動型終身壽險', currency: 'TWD', status: '有效', payFreq: '年繳', premium: 3000, start: '2022-01-01', coverages: [{ name: '身故保險金', kind: 'main', cat: 'life', amount: 10, unit: '萬元', quote: '保險金額 10 萬元' }] }, m);
      p.id = 'u1'; L.push(p); S.set('ins', INS); renderIns();
      const life = () => { const s = covSum(m).find(x => x.cat === 'life' && !x.nm && x.per === ''); return s ? s.v : 0 };
      const before = { cur: p.cur, w: p.warn.join('|'), life: life(), ann: polAnnual(p), fl: polFlags(p, m).map(f => f.t).join('|') };
      go('ins', 'cov'); const gap = $('#covBody').textContent, fxBtn = !!$('#covBody [data-pfix="fx"][data-ppol="u1"]');
      const pr = window.prompt; window.prompt = () => '31'; const ok = polFix(m, p, 'fx'); window.prompt = pr;
      return { before, gap: /沒填匯率/.test(gap), fxBtn, ok, fx: p.fx, life: life(), ann: polAnnual(p), fl: polFlags(p, m).map(f => f.t).join('|') } });
    check('外幣保單：商品名稱有「美元」就當美元保單（AI 照舊範本寫 TWD 也一樣）→ 沒填匯率前保障和保費不加總、缺口寫出「沒填匯率」並有「💱 填匯率」按鈕；填匯率 31 → 10 萬美元算成 310 萬、年繳 3,000 美元算成 93,000 元',
      k2.before.cur === 'USD' && /美元/.test(k2.before.w) && k2.before.life === 38270 && k2.before.ann === 0 && /美元保單：沒有匯率/.test(k2.before.fl) && k2.gap && k2.fxBtn && k2.ok && k2.fx === 31 && k2.life === 38270 + 3100000 && k2.ann === 93000, JSON.stringify(k2));
    const k3 = await page.evaluate(() => { const m = me(), r1 = insFind(m, 'r1'), pp = promptPolicy(), ck = promptPolCheck(m, [r1]), rv = promptPolReview(r1), ex = polExport(r1);
      return { pp: ['"payMethod"', '"uwDeclared"', '"currency":null', '可以寫姓名', '法定繼承人', '不是繳費方式'].filter(k => !pp.includes(k)).join(), ck: ['appId', '不是繳費方式', '貼回'].filter(k => !ck.includes(k)).join(), nm: /王小明/.test(ck + rv), rv: /"type":"kinwell\.terms"/.test(rv), ex: [ex.appId, ex.payMethod, ex.currency, 'beneficiary' in ex].join() } });
    check('匯入提示詞補齊：繳費方式、幣別（不預設台幣）、投保時告知、要保人和受益人照文件寫、繳別不是繳費方式；核對提示詞帶 appId 對回同一張、寫出貼回哪裡；條款審查最後附條款規則 JSON；提示詞不帶家人姓名',
      k3.pp === '' && k3.ck === '' && !k3.nm && k3.rv && k3.ex === 'r1,,TWD,true', JSON.stringify(k3));
    const reply = 'A. 問題清單\n保單 1｜繳別不明｜繳費通知｜銀行轉帳｜銀行轉帳\n\nD. JSON：\n```json\n' + JSON.stringify({ type: 'kinwell.policy', v: 1, policies: [{ appId: 'r1', insurer: '甲人壽', product: '甲人壽終身壽險', start: '2013-06-19', payFreq: '銀行轉帳', premium: 0, status: '減額繳清', holderHint: null, beneficiary: '法定繼承人', coverages: [{ name: '身故保險金', kind: 'main', cat: 'life', amount: 38270, unit: '元', quote: '被保險人王小明 減額繳清 保險金額 38,270 元' }] }] }) + '\n```\n以上 JSON 可以貼回 App。';
    const k4 = await page.evaluate(async (reply) => { const m = me(); openPol('r1'); const btn = $('#sheetBody [data-polchkin="r1"]'), lab = btn?.textContent || ''; if (!btn) return { lab }; btn.click(); await new Promise(r => setTimeout(r, 400));
      const head = $('#sheetBody').textContent; $('#pi-in').value = reply; $('#pi-go').click(); const out = $('#pi-out').textContent, mode = $('#pi-out [data-pimode]')?.value, on = $('#pi-out [data-pi]')?.checked;
      $('#pi-save')?.click(); const L = insOf(m), p = insFind(m, 'r1');
      return { lab, head: /貼回 AI 的核對結果/.test(head), out: /已經有同一張保單/.test(out), mode, on, n: L.filter(x => x.product === '甲人壽終身壽險').length, by: p.payBy, f: p.payFreq, st: p.start, bene: p.bene, q: p.items[0].quote, hist: (p.hist || []).length, fl: polFlags(p, m).map(f => f.t).join('|') } }, reply);
    check('核對錯誤可以貼回：保單裡「📥 貼回 AI 的核對結果」→ 整段 AI 回覆貼上（文字＋JSON）→ 用 appId 認出同一張（生效日改了也認得）→ 更新這張、不會多一張；銀行轉帳存成繳費方式、受益人帶進來、原文姓名刪掉、不再問繳別',
      /貼回/.test(k4.lab) && k4.head && k4.out && k4.mode === 'upd' && k4.on === true && k4.n === 1 && k4.by === '銀行轉帳' && k4.f === '' && k4.st === '2013-06-19' && k4.bene === '法定繼承人' && !/王小明/.test(k4.q) && k4.hist === 1 && !/繳別不明/.test(k4.fl), JSON.stringify(k4));
    const rv = '1. 條款版本：甲人壽終身壽險（2014 版）\n2. 身故保險金：一次給付\n審查結論：條款和保單一致。\n\n```json\n' + JSON.stringify({ type: 'kinwell.terms', v: 1, ver: '甲人壽終身壽險 103.01.01 備查', product: '甲人壽終身壽險', rules: [{ name: '身故保險金', pay: 'lump', quote: '依保險金額給付身故保險金', clause: '第十五條', excl: [] }], unreadable: [] }) + '\n```';
    const k5 = await page.evaluate(async (rv) => { const m = me(); openPol('r1'); const btn = $('#sheetBody [data-polrvin="r1"]'), lab = btn?.textContent || ''; if (!btn) return { lab }; btn.click(); await new Promise(r => setTimeout(r, 400));
      $('#tm-in').value = rv; $('#tm-go').click(); const out = $('#tm-out').textContent; $('#tm-save')?.click(); const p = insFind(m, 'r1'); openPol('r1'); const t = $('#sheetBody').textContent;
      openTermsImport('r2', { review: 1 }); $('#tm-in').value = '這張醫療險的條款：<img src=x onerror="window.__rvx=1">住院日額每日 1,000 元，等待期 30 天。'; $('#tm-go').click(); const out2 = $('#tm-out').textContent; $('#tm-save')?.click(); const p2 = insFind(m, 'r2');
      openPol('r2'); await new Promise(r => setTimeout(r, 300)); const img = $('#sheetBody img');
      return { lab, out: /對到 1／1 項保障/.test(out), rules: p.terms?.rules?.length, rvt: p.review?.text || '', shown: /AI 條款審查結果/.test(t), out2, r2: p2.review?.text || '', r2t: !!p2.terms, xss: !!window.__rvx || !!img } }, rv);
    check('條款審查可以貼回：保單裡「📥 貼回 AI 的審查結果」→ 整段回覆貼上 → 最後的條款規則 JSON 存進「📜 條款規則」、審查文字存在這張保單（不含 JSON），打開保單看得到；只有文字沒有 JSON 也能存；文字不會被當成 HTML 執行',
      /貼回/.test(k5.lab) && k5.out && k5.rules === 1 && /審查結論/.test(k5.rvt) && !/kinwell\.terms/.test(k5.rvt) && k5.shown && /只存審查文字/.test(k5.out2) && /等待期 30 天/.test(k5.r2) && !k5.r2t && !k5.xss, JSON.stringify(k5));
    const k6 = await page.evaluate(() => { const m = me(); openPolEdit('r1'); const fv = $('#pe-freq').value, has = ['#pe-paym', '#pe-cur', '#pe-fx'].filter(s => !$(s)).join(); $('#pe-save').click(); const p = insFind(m, 'r1');
      const c = polClean(JSON.parse(JSON.stringify(insFind(m, 'u1') || {})), m) || {}, c1 = polClean(JSON.parse(JSON.stringify(p)), m) || {};
      openPol('r1'); const t = $('#sheetBody').textContent; closeSheet(); insFind(m, 'r2').items[0].quote = ''; renderIns(); go('ins', 'pol'); const chkIn = !!$('#polBody [data-polchkin="all"]');
      return { fv, has, f: p.payFreq, by: p.payBy, rv: !!p.review, c: [c.cur, c.fx].join(), c1: [c1.payBy, !!c1.review].join(), kv: /減額繳清：不用再繳/.test(t) && /銀行轉帳/.test(t), chkIn } });
    check('編輯保單：繳別空白時選「不明／不用繳」（不再預設成年繳、存檔也不會偷偷變年繳）；有繳費方式、幣別、匯率欄位；存檔保留審查結果；備份還原保留繳費方式、幣別、匯率、審查結果；保單寫「減額繳清：不用再繳」和繳費方式；保單清單的核對清單也有「貼回」',
      k6.fv === '' && k6.has === '' && k6.f === '' && k6.by === '銀行轉帳' && k6.rv && k6.c === 'USD,31' && k6.c1 === '銀行轉帳,true' && k6.kv && k6.chkIn, JSON.stringify(k6));
    await page.close();
  }

  // =============== 6zm. 保障缺口「🧮 怎麼算的」：點一列 → 目標怎麼來、算進去的每一項（保單、原本寫多少、算成多少）、沒算進去的與原因、不算保障的與原因；明細加總＝缺口上的數字 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    const P = (id, o) => ({ id, insurer: '甲人壽', product: '醫療', start: '2015-01-01', payYears: 20, payFreq: '年', prem: 20000, status: 'active', src: 'ai', chk: false, warn: [], t: T(0), ...o });
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', inc: 80 }], active: 'a',
      ins: { a: [P('g1', { insurer: '丙人壽', product: '變額萬能壽險', items: [{ name: '身故保險金', kind: 'main', cat: 'life', amt: 500, unit: '萬元（B型）', quote: '500 萬元' }] }),
          P('g2', { insurer: '乙人壽', product: '定期壽險', items: [{ name: '壽險', kind: 'main', cat: 'life', amt: 10, unit: '萬元', quote: '10 萬元' }, { name: '意外身故', kind: 'rider', cat: 'accident', amt: 110, unit: '萬元', quote: '110 萬元' }, { name: '<img src=x onerror="window.__gdx=1">', kind: 'rider', cat: 'life', amt: 1, unit: '萬元', maxAge: 30, quote: '1 萬元' }] }),
          P('g3', { insurer: '丁人壽', product: '終身壽險', status: 'reduced', prem: 0, items: [{ name: '身故', kind: 'main', cat: 'life', amt: 5, unit: '萬元', quote: '5 萬元' }, { name: '住院日額附約', kind: 'rider', cat: 'hosp_day', amt: 1000, unit: '元/日', quote: '每日 1,000 元' }] }),
          P('g4', { insurer: '戊人壽', product: '舊壽險', status: 'surr', items: [{ name: '身故', kind: 'main', cat: 'life', amt: 20, unit: '萬元', quote: '20 萬元' }] }),
          P('g5', { insurer: '己人壽', product: '住院醫療', items: [{ name: '住院醫療附約', kind: 'rider', cat: 'hosp_real', amt: 2, unit: '計畫', quote: '計畫二' }, { name: '病房費', kind: 'rider', cat: 'hosp_real', amt: 2000, unit: '元/日', quote: '每日 2,000 元' }, { name: '住院日額', kind: 'main', cat: 'hosp_day', amt: 1000, unit: '元/日', quote: '每日 1,000 元' }] })] } });
    const z = await page.evaluate(async () => { try { const m = me(); go('ins', 'cov'); const rowBtn = !!$('#covBody [data-gapk="life"]');
      const G = covGap(m), bad = G.filter(g => g.pers && Math.abs(g.inL.reduce((a, x) => a + x.v, 0) / (g.u === '萬' ? 1e4 : 1) - g.have) > 1e-6).map(g => g.k).join();
      document.querySelector('#covBody .gap .sub')?.click(); await new Promise(r => setTimeout(r, 300)); const life = $('#sheetBody').textContent, img = !!$('#sheetBody img'), polgo = $$('#sheetBody [data-polgo]').length;
      openGapDetail('hosp_real'); const real = $('#sheetBody').textContent, fixBtn = !!$('#sheetBody [data-gapfix="g5:0"]');
      const pr = window.prompt; window.prompt = () => '20萬/次'; $('#sheetBody [data-gapfix="g5:0"]')?.click(); window.prompt = pr; await new Promise(r => setTimeout(r, 200)); const real2 = $('#sheetBody').textContent;
      openGapDetail('hosp_day'); const day = $('#sheetBody').textContent;
      return { rowBtn, bad, life, img, polgo, real, fixBtn, real2, day, xss: !!window.__gdx } } catch (e) { return { err: e.message } } });
    check('點保障缺口一列 →「怎麼算的」：目標寫出年收入 80 萬 × 10；算進去的逐項列出保單、保單寫多少、算成多少（500 萬元（B型）→ 500 萬、10 萬元 → 10 萬），合計 515 萬（含減額繳清後的 5 萬）；已解約的、超過最高年齡的列在「不算保障」並寫原因；每一項點了打開保單；名稱不會被當成 HTML',
      z.rowBtn && /年收入 80 萬 × 10/.test(z.life || '') && /算進去的（3 項，合計 515 萬）/.test(z.life) && /保單寫 500 萬元（B型） → 算 500 萬/.test(z.life) && /變額萬能壽險/.test(z.life) && /保單已解約/.test(z.life) && /最高到 30 歲/.test(z.life) && z.polgo >= 5 && !z.img && !z.xss, JSON.stringify({ ...z, life: (z.life || '').slice(0, 700), real: '', real2: '', day: '' }));
    check('「怎麼算的」也寫出沒算進去的原因：實支實付的「計畫二」以計畫計（有 ✏️ 填金額，填 20萬/次 後明細馬上重算、算進去）、病房費是每日給付不算進每次限額；減額繳清的附約通常已終止、不算住院日額；每一類明細加總都等於缺口上的數字',
      /以「計畫」計，不是金額/.test(z.real || '') && /給付方式是每日/.test(z.real) && z.fixBtn && /算進去的（1 項，合計 20 萬）/.test(z.real2 || '') && /主約減額繳清後，附約通常已經終止/.test(z.day || '') && /算進去的（1 項，合計 1,000 元）/.test(z.day) && z.bad === '', JSON.stringify({ bad: z.bad, err: z.err, real: (z.real || '').slice(0, 500), real2: (z.real2 || '').slice(0, 300), day: (z.day || '').slice(0, 400) }));
    await page.close();
  }

  // =============== 6zn. 在配偶名下匯入、AI 寫被保險人「本人」→ 預設留在目前這位（不再跑到另一位家人）；放到別人名下時提示寫出是誰；完整保單號碼只留末 4 碼 ===============
  {
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', role: 'me' }, { id: 'b', name: '林美華', sex: 'f', birth: '1986-02-02', h: 160, w: 52, act: '1.375', goal: 'keep', role: 'spouse' }, { id: 'k', name: '小寶', sex: 'm', birth: '2016-01-01', h: 130, w: 28, act: '1.375', goal: 'keep', role: 'child' }], active: 'b' });
    const J = { type: 'kinwell.policy', v: 1, policies: [{ insurer: '甲人壽', product: '甲人壽醫療', insuredHint: '本人', start: '2020-01-01', payFreq: '年繳', premium: 8000, coverages: [{ name: '住院日額', cat: 'hosp_day', amount: 1000, unit: '元/日', quote: '每日 1,000 元' }] },
      { insurer: '乙人壽', product: '乙人壽兒童醫療', insuredHint: '子女', start: '2017-01-01', payFreq: '年繳', premium: 3000, coverages: [{ name: '住院日額', cat: 'hosp_day', amount: 1000, unit: '元/日', quote: '每日 1,000 元' }] }], unreadable: ['丙人壽 1234509876：保費看不清楚'] };
    const n1 = await page.evaluate((J) => { go('ins', 'pol'); openPolImport(); $('#pi-in').value = JSON.stringify(J); $('#pi-go').click();
      const sel = [...document.querySelectorAll('#pi-out [data-pim]')].map(s => s.value).join(), note = $('#pi-out').textContent; $('#pi-save').click();
      const w = [...insOf(MEM[1]), ...insOf(MEM[2])].flatMap(p => p.warn).join('|');
      return { sel, note: /AI 判斷被保險人是「子女」：預設放到 小寶/.test(note), b: insOf(MEM[1]).length, k: insOf(MEM[2]).length, a: insOf(MEM[0]).length, toast: $('#toast').textContent, list: /甲人壽醫療/.test($('#polBody').textContent), w } }, J);
    check('在配偶名下匯入、AI 寫被保險人「本人」→ 預設留在目前這位（清單馬上看得到），寫「子女」的才預設放到小孩並標出來；匯入後的提示寫出有幾張在別人名下、怎麼切換；AI 寫出的完整保單號碼只留末 4 碼',
      n1.sel === 'b,k' && n1.note && n1.b === 1 && n1.k === 1 && n1.a === 0 && n1.list && /1 張在「小寶」名下/.test(n1.toast) && /右上角/.test(n1.toast) && !/1234509876/.test(n1.w) && /9876/.test(n1.w), JSON.stringify(n1));
    await page.close();
  }

  // =============== 6zo. 繳費終期其實是保障到期日（繳到 100 歲以上、和保障到期日同一天）→ 不再誤報「繳費期滿但還沒繳完」、一鍵清掉；要保人／受益人存姓名、提示詞只給關係；受益人與遺產、稅的提醒；App 驗證過的自動核對、一次全部確認 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    const P = (id, o) => ({ id, insurer: '甲人壽', product: '終身壽險', start: '2015-03-01', payYears: 20, payFreq: '年', prem: 10000, status: 'active', src: 'ai', chk: false, warn: [], t: T(0), holder: '王小明', bene: '王大同', ...o });
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', role: 'me', inc: 80 }, { id: 'b', name: '林美華', sex: 'f', birth: '1986-02-02', h: 160, w: 52, act: '1.375', goal: 'keep', role: 'spouse' }], active: 'a',
      ins: { a: [P('t1', { insurer: '乙人壽', status: 'paidup', payYears: null, prem: null, endDate: '2094-03-01', items: [{ name: '身故保險金', kind: 'main', cat: 'life', amt: 100, unit: '萬元', quote: '保險金額 100 萬元', payEnd: '2094-03-01' }] }),
          P('t2', { insurer: '丙人壽', product: '醫療終身', payYears: null, prem: null, start: '2018-01-01', items: [{ name: '住院日額', kind: 'main', cat: 'hosp_day', amt: 1000, unit: '元/日', quote: '每日 1,000 元', prem: 5000, payEnd: '2090-01-01' }] }),
          P('t3', { insurer: '丁人壽' }, ),
          P('t4', { insurer: '戊人壽', holder: '林美華', bene: '' }),
          P('t5', { insurer: '己人壽', bene: '法定繼承人' }),
          P('t6', { insurer: '庚人壽', bene: '本人' })].map(p => p.items ? p : { ...p, items: [{ name: '身故保險金', kind: 'main', cat: 'life', amt: 50, unit: '萬元', quote: '身故保險金 50 萬元' }] }) } });
    const o1 = await page.evaluate(() => { const m = me(), F = id => polFlags(insFind(m, id), m), t = id => F(id).map(f => f.lv + ':' + f.t).join('|');
      const t1 = insFind(m, 't1'), before = { pe: payEnd(t1), f1: t(1 && 't1'), f2: t('t2'), lv: polLv(t1, m) };
      openPol('t1'); const s1 = $('#sheetBody').textContent; openPol('t2'); const s2 = $('#sheetBody').textContent;
      return { before, s1: /保障到 2094 年（\d+ 歲，等於終身）/.test(s1) && !/繳費到 2094/.test(s1), s2: /保障到 2090 年（105 歲，等於終身）/.test(s2), lv2: polLv(insFind(me(), 't2'), me()) } });
    check('繳費終期其實是保障到期日（和保障到期日同一天、或繳到 100 歲以上）：不再誤報「繳費期滿，但最後一期在 2094」、不用處理，直接寫成「保障到 2094 年（等於終身）」，不算繳到哪一年',
      o1.before.pe === '' && !/狀態是「繳費期滿」|不合理/.test(o1.before.f1 + o1.before.f2) && o1.s1 && o1.s2 && o1.lv2 === 'ok', JSON.stringify(o1));
    const o2 = await page.evaluate(() => { const m = me(), t = id => polFlags(insFind(m, id), m).map(f => f.lv + ':' + f.t).join('|'), t3 = insFind(m, 't3');
      const imp = polCheck({ insurer: '甲人壽', product: '醫療', holderHint: '王小明', beneficiary: '身故：王大同 50%、林美華 50%', start: '2020-01-01', coverages: [{ name: '住院日額', cat: 'hosp_day', amount: 1000, unit: '元/日', quote: '每日 1,000 元' }] }, m).p;
      const ex = polExport(t3), ck = promptPolCheck(m, insOf(m)); openPol('t3'); const s3 = $('#sheetBody').textContent;
      return { lv3: polLv(t3, m), auto: /App 自動核對/.test(s3), holder: /要保人王小明/.test(s3), ih: imp.holder, ib: imp.bene, iw: imp.warn.join('|'), exh: ex.holderHint, exb: ex.beneficiary, leak: /王大同|王小明|林美華/.test(ck),
        f4: t('t4'), f5: t('t5'), f6: t('t6') } });
    check('要保人、受益人存姓名（匯入時照存、不再提醒）；給 AI 的提示詞只給關係（要保人是被保險人 → 本人，受益人寫姓名的不給），整段提示詞沒有家人和受益人姓名',
      o2.ih === '王小明' && o2.ib === '身故：王大同 50%、林美華 50%' && !/姓名/.test(o2.iw) && o2.exh === '本人' && o2.exb === null && !o2.leak && o2.holder, JSON.stringify(o2));
    check('受益人與遺產、稅的提醒（參考）：要保人不是被保險人本人（要保人過世時保單價值算要保人的遺產、生存金可能算贈與）；受益人沒填；寫「法定繼承人」；身故受益人寫「本人」等於沒指定、算遺產',
      /info:要保人是「林美華」，不是被保險人本人/.test(o2.f4) && /info:身故受益人還沒填/.test(o2.f4) && /info:身故受益人是「法定繼承人」/.test(o2.f5) && /info:身故受益人寫「本人」/.test(o2.f6) , JSON.stringify({ f4: o2.f4, f5: o2.f5, f6: o2.f6 }));
    check('App 驗證過的保單自動核對：沒有錯誤、沒有待核對項目（金額都在原文找得到）→ 🟢 已核對，寫「App 自動核對」', o2.lv3 === 'ok' && o2.auto, JSON.stringify({ lv3: o2.lv3, auto: o2.auto }));
    const o3 = await page.evaluate(() => { const m = me(); renderIns(); go('ins', 'pol'); const b = $('#polBody [data-polall]'), lab = b?.textContent || ''; b?.click(); const L = insOf(m).map(p => polLv(p, m)).join();
      return { lab, L, chk: insOf(m).filter(p => p.chk).length } });
    check('保單清單「✅ 我都對照過了」：沒有待核對時不出現（App 驗證過的都自動核對了）', !o3.lab && !/chk/.test(o3.L), JSON.stringify(o3));
    await page.close();
  }

  // =============== 6zp. 保障健檢：保太多／重複（日額太高、實支實付太多張、手術已足夠、癌症與重大傷病重疊）、依條件建議補什麼；新生兒、75 歲以上、軍人、榮民、低收入或繳不出健保費的建議；匯入畫面「看提示詞」 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    const P = (id, it, o) => ({ id, insurer: '甲人壽', product: '醫療' + id, start: '2015-01-01', payYears: 20, payFreq: '年', prem: 20000, status: 'active', src: 'manual', chk: true, warn: [], t: T(0), items: it, ...o });
    const D = (n, a) => ({ name: n, kind: 'main', cat: 'hosp_day', amt: a, unit: '元/日', quote: a + ' 元' }), R = n => ({ name: n, kind: 'rider', cat: 'hosp_real', amt: 20, unit: '萬元', quote: '20 萬元' });
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', role: 'me', job: 'mil', earner: true, inc: 80, debt: 600 },
        { id: 'k', name: '小寶', sex: 'm', birth: T(100), h: 60, w: 6, act: '1.2', goal: 'keep', role: 'child' }, { id: 'g', name: '阿公', sex: 'm', birth: '1946-03-03', h: 165, w: 60, act: '1.2', goal: 'keep', role: 'parent', job: 'vet' }], active: 'a',
      ins: { a: [P('h1', [D('住院日額', 2000), R('實支實付'), { name: '手術', kind: 'rider', cat: 'surgery', amt: 10, unit: '倍', quote: '10 倍' }]), P('h2', [D('住院日額', 2000), R('實支實付')]), P('h3', [D('住院日額', 2000), R('實支實付')]),
          P('c1', [{ name: '重大傷病', kind: 'main', cat: 'critical', amt: 100, unit: '萬元', quote: '100 萬元' }, { name: '癌症', kind: 'rider', cat: 'cancer', amt: 100, unit: '萬元', quote: '100 萬元' }, { name: '壽險', kind: 'rider', cat: 'life', amt: 100, unit: '萬元', quote: '100 萬元' }])] } });
    const p1 = await page.evaluate(() => { go('ins', 'cov'); const t = $('#covBody').textContent; return { t } });
    const has = (re) => re.test(p1.t);
    check('保障健檢「可能保太多」：住院日額 6,000 元/日是目標的 3 倍（門診為主的人日額用不太到）、實支實付 3 張要有副本理賠、手術已有支應不用再加、癌症和重大傷病重疊；保費占年收入的比例',
      has(/保障健檢/) && has(/住院日額每日 6,000 元：是目標的 3 倍/) && has(/門診/) && has(/實支實付 3 張/) && has(/副本理賠/) && has(/手術已有支應/) && has(/重大傷病通常包含癌症/) && has(/保費約占年收入/), p1.t.slice(p1.t.indexOf('保障健檢'), p1.t.indexOf('保障健檢') + 900));
    check('保障健檢「建議補強」依條件排順序：主要收入、有負債 → 定期壽險補到目標、意外險、失能扶助；軍人 → 軍保給付（死亡 36～48 個基數、退伍給付）與「最低保障規劃」提示詞',
      has(/建議補強/) && has(/定期壽險/) && has(/意外險/) && has(/失能扶助/) && has(/軍人保險/) && has(/48 個基數/) && has(/退伍給付/), p1.t.slice(p1.t.indexOf('建議補強'), p1.t.indexOf('建議補強') + 700));
    const p2 = await page.evaluate(() => { const r = {}; for (const id of ['k', 'g']) { ACT = id; renderAll(); go('ins', 'cov'); r[id] = $('#covBody').textContent } ACT = 'a'; renderAll(); go('ins', 'cov'); return r });
    check('新生兒（0 歲）：出生前就可以投保、未滿 15 歲壽險只賠喪葬費、先買實支實付與住院醫療、新生兒用媽媽的健保卡（出生 60 日內）；75 歲以上：小額終老（多數到 84 歲）、保留保證續保、長照 2.0、自己準備醫療預備金；榮民：榮民醫院、國軍醫院部分負擔補助、無職業榮民健保費補助、喪葬補助問榮服處',
      /新生兒/.test(p2.k) && /未滿 15 歲/.test(p2.k) && /喪葬/.test(p2.k) && /60 日/.test(p2.k) && /75 歲以上/.test(p2.g) && /小額終老/.test(p2.g) && /84 歲/.test(p2.g) && /長照 2\.0/.test(p2.g) && /榮民/.test(p2.g) && /部分負擔/.test(p2.g) && /榮民服務處/.test(p2.g),
      JSON.stringify({ k: p2.k.slice(p2.k.indexOf('保障健檢'), p2.k.indexOf('保障健檢') + 300), g: p2.g.slice(p2.g.indexOf('保障健檢'), p2.g.indexOf('保障健檢') + 300) }));
    check('沒有保險、低收入、健保費繳不出來：低收入戶健保費政府全額補助、免部分負擔；欠費不鎖卡、可以分期（最多 48 期）、紓困無息貸款；微型保險（壽險、意外 50 萬、實支實付 3 萬）；重大傷病證明免部分負擔；民間急難救助',
      has(/低收入戶/) && has(/全額補助/) && has(/不鎖卡/) && has(/48 期/) && has(/紓困/) && has(/微型保險/) && has(/重大傷病證明/) && has(/急難救助/), '');
    const p3 = await page.evaluate(async () => { go('ins', 'pol'); openPolImport(); await new Promise(r => setTimeout(r, 300)); $('#sheetBody [data-show="policy"]').click(); const pre = $('#sheetBody #pv-policy');
      return { shown: !!pre && !pre.hidden && /保單資料擷取器/.test(pre.textContent), mp: promptMinProt() } });
    check('匯入畫面按「看提示詞」真的顯示在畫面上（AI 工具分頁也有同一份，不會打開到看不見的那份）；最低保障規劃提示詞也請 AI 找保太多的、考慮新生兒、75 歲以上、軍人、榮民、低收入',
      p3.shown && /保太多/.test(p3.mp) && /榮民/.test(p3.mp) && /75 歲以上/.test(p3.mp) && /新生兒/.test(p3.mp) && /低收入/.test(p3.mp), JSON.stringify({ shown: p3.shown }));
    await page.close();
  }

  // =============== 6zq. 保障金額不能漏：以「單位／計畫」計的請 AI 依給付表一併算（App 交叉驗算：單位數 × 每單位、原文裡找得到）；只影響保費的（繳別不明、沒有保費）改成參考；檢查說明收起來 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', role: 'me', inc: 80 }], active: 'a' });
    const q1 = await page.evaluate(() => { const m = me(), L = INS[m.id] || (INS[m.id] = []);
      const mk = (id, calc, o = {}) => { const { p } = polCheck({ insurer: '甲人壽', product: '住院醫療' + id, start: '2020-01-01', status: '有效', payFreq: '', premium: 6000, ...o, coverages: [{ name: '住院醫療計畫', kind: 'rider', cat: 'hosp_day', amount: 2, unit: '計畫', quote: '計畫二', calc }] }, m); p.id = id; L.push(p); return p };
      const ok = mk('u1', { amount: 2000, unit: '元/日', perUnit: 1000, formula: '計畫二 = 2 × 每計畫 1,000 元/日', quote: '計畫一 住院日額每日 1,000 元', page: 12 });
      const bad = mk('u2', { amount: 4000, unit: '元/日', perUnit: 1000, formula: '?', quote: '計畫一 住院日額每日 1,000 元' });
      const noq = mk('u3', { amount: 3000, unit: '元/日', perUnit: 1500, formula: '2 × 1,500', quote: '計畫一 住院日額每日 1,000 元' });
      const pe = polCheck({ insurer: '乙人壽', product: '終身醫療', start: '2018-01-01', coverages: [{ name: '住院日額', cat: 'hosp_day', amount: 1000, unit: '元/日', quote: '每日 1,000 元', payEnd: '2090-01-01' }] }, m).p;
      S.set('ins', INS); renderIns();
      const fl = p => polFlags(p, m).map(f => f.lv + ':' + f.t).join('|'), day = covSum(m).filter(x => x.cat === 'hosp_day' && !x.nm && x.per === 'day').reduce((t, x) => t + x.v, 0);
      openPol('u1'); const s1 = $('#sheetBody'), direct = s1.querySelectorAll('.flag > .fix').length, det = s1.querySelectorAll('.flag details').length, t1 = s1.textContent;
      return { f1: fl(ok), lv1: polLv(ok, m), f2: fl(bad), f3: fl(noq), day, direct, det, t1: /AI 依給付表算成 2,000 元\/日/.test(t1) && /計畫二 = 2 × 每計畫 1,000 元\/日/.test(t1), pe: [pe.items[0].payEnd, pe.items[0].endDate].join(), pp: promptPolicy(), ck: POLCHK_HEAD } });
    check('以「計畫」計的保障：AI 依給付表一併算（2 × 每計畫 1,000 元/日 = 2,000 元/日、附給付表原文）→ App 驗算對得上就直接算進保障、不用審查（只留參考說明）',
      /info:「住院醫療計畫」以「計畫」計：AI 依給付表算成 2,000 元\/日/.test(q1.f1) && q1.lv1 === 'ok' && q1.t1 && q1.day === 2000, JSON.stringify({ f1: q1.f1, lv1: q1.lv1, day: q1.day }));
    check('交叉驗算：AI 算的金額和「單位數 × 每單位」對不起來 → 待核對、不算進保障；每單位金額在給付表原文裡找不到 → 待核對、不算進保障（保障加總只有對得上的 2,000 元/日）',
      /chk:「住院醫療計畫」AI 算的 4,000 元\/日 和 2 × 1,000 對不起來/.test(q1.f2) && /chk:「住院醫療計畫」每單位 1,500 在給付表原文裡找不到/.test(q1.f3) && q1.day === 2000, JSON.stringify({ f2: q1.f2, f3: q1.f3, day: q1.day }));
    check('只影響保費的不用審查：繳別不明改成參考「每年保費先不算（不影響保障）」；匯入時繳費終期是保障到期日（繳到 100 歲以上）→ 直接改成保障到期日；檢查說明收進「怎麼做」（點開才看）',
      /info:繳別不明：每年保費先不算（不影響保障）/.test(q1.f1) && q1.pe === ',2090-01-01' && q1.direct === 0 && q1.det >= 1, JSON.stringify({ f1: q1.f1, pe: q1.pe, direct: q1.direct, det: q1.det }));
    check('匯入與核對提示詞：以單位／計畫計的請 AI 依給付表算出 calc（金額、每單位、算式、給付表原文、頁碼），沒有給付表就填 null',
      /"calc":null/.test(q1.pp) && /給付表/.test(q1.pp) && /perUnit/.test(q1.pp) && /formula/.test(q1.pp) && /calc/.test(q1.ck), '');
    await page.close();
  }

  // =============== 6zr. 批次刪除（可以復原）；失能扶助、長照有建議金額與公式；依身分顯示說明（軍人含榮民）；預算有限的最低組合；「依我的身分規劃」提示詞 ===============
  {
    const td = new Date(), T = n => { const d = new Date(td); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` };
    const P = (id, it) => ({ id, insurer: '甲人壽', product: '保單' + id, start: '2015-01-01', payYears: 20, payFreq: '年', prem: 10000, status: 'active', src: 'manual', chk: true, warn: [], t: T(0), items: it });
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', role: 'me', job: 'mil', earner: true, inc: 80, debt: 600 },
        { id: 'b', name: '林美華', sex: 'f', birth: '1986-02-02', h: 160, w: 52, act: '1.375', goal: 'keep', role: 'spouse', job: 'lab' }], active: 'a',
      ins: { a: [P('d1', [{ name: '失能扶助', kind: 'main', cat: 'disability', amt: 2, unit: '萬元/月', quote: '每月 2 萬元' }]), P('d2', [{ name: '壽險', kind: 'main', cat: 'life', amt: 100, unit: '萬元', quote: '100 萬元' }]), P('d3', [{ name: '實支實付', kind: 'rider', cat: 'hosp_real', amt: 20, unit: '萬元', quote: '20 萬元' }])] } });
    const r1 = await page.evaluate(() => { const m = me(); go('ins', 'cov'); const G = covGap(m), dis = G.find(g => g.k === 'disability'), ltc = G.find(g => g.k === 'ltc'), t = $('#covBody').textContent;
      const id = $('#idGuides')?.textContent || '', oth = $('#othGuides')?.textContent || ''; const pr = typeof promptIdPlan === 'function' ? promptIdPlan(m) : '';
      ACT = 'b'; renderAll(); go('ins', 'cov'); const id2 = $('#idGuides')?.textContent || '', oth2 = $('#othGuides')?.textContent || ''; ACT = 'a'; renderAll();
      return { dis: [dis.tg, dis.have, dis.st].join(), dwhy: dis.why, ltc: [ltc.tg, ltc.st].join(), t, id, oth, id2, oth2, pr } });
    check('失能扶助、長照有建議金額與公式：失能扶助每月＝照顧費約 3 萬＋主要收入者月收入的一半（80 萬 → 33,000）＝ 63,000 元/月，現有 2 萬元/月 → 不足；長照 40 歲起每月 3 萬；健檢的建議補強寫出算法',
      r1.dis === '63000,20000,low' && /照顧費每月約 3 萬 ＋ 月收入的一半 33,000 元/.test(r1.dwhy) && r1.ltc === '30000,none' && /失能扶助（每月）/.test(r1.t) && /有 20,000 元\/月／目標 63,000 元\/月/.test(r1.t) && /失能扶助險（每月 63,000 元\/月）/.test(r1.t) && /算法：照顧費每月約 3 萬/.test(r1.t),
      JSON.stringify({ dis: r1.dis, dwhy: r1.dwhy, ltc: r1.ltc }));
    check('依身分顯示：軍人先看「軍人與榮民」（軍保、國軍團體意外保險、意外險職業等級與戰爭軍事行動除外、服現役滿 10 年退伍才是榮民、第二類、榮民就醫、補助補不到的自費、預算有限怎麼補）和預算有限的最低組合；勞工的說明收在「其他身分」；配偶（勞工）則相反',
      /軍人與榮民/.test(r1.id) && /服現役滿 10 年、退伍/.test(r1.id) && /第二類退除役官兵/.test(r1.id) && /國軍團體意外保險/.test(r1.id) && /戰爭、軍事行動/.test(r1.id) && /病房升等/.test(r1.id) && /預算有限的最低保險組合/.test(r1.id) && /先保大、後保小/.test(r1.id)
        && /勞工/.test(r1.oth) && !/勞保普通事故/.test(r1.id) && /勞保普通事故/.test(r1.id2) && /軍人與榮民/.test(r1.oth2) && !/軍人與榮民/.test(r1.id2), JSON.stringify({ id: r1.id.slice(0, 120), id2: r1.id2.slice(0, 120) }));
    check('「依我的身分規劃保險」提示詞：帶身分、現有保障與健檢結果，留預算讓使用者填，請 AI 列制度（不確定標要確認）、自費風險、依預算排方案、保太多的、投保前要問的（戰爭或軍事行動除外）；不含姓名生日',
      /我的預算/.test(r1.pr) && /軍人保險/.test(r1.pr) && /要確認/.test(r1.pr) && /戰爭或軍事行動/.test(r1.pr) && /失能扶助（每月）/.test(r1.pr) && !/王小明|1984-05-05/.test(r1.pr), '');
    const r2 = await page.evaluate(async () => { const m = me(); go('ins', 'pol'); const btn = $('#polBody [data-poldel]'); if (!btn) return { btn: false }; btn.click(); await new Promise(r => setTimeout(r, 300));
      const cbs = [...document.querySelectorAll('#sheetBody [data-pdl]')]; cbs.filter(c => ['d1', 'd2'].includes(c.dataset.pdl)).forEach(c => { c.checked = true; c.dispatchEvent(new Event('change')) }); const lab = $('#pdl-go').textContent; $('#pdl-go').click();
      const n1 = insOf(m).length, undo = $('#polBody [data-polundo]')?.textContent || ''; $('#polBody [data-polundo]')?.click(); const n2 = insOf(m).length, saved = JSON.parse(localStorage.getItem('nc_ins')).a.length;
      if (typeof openPolDel !== 'function') return { btn: false }; openPolDel(); $('#pdl-all').checked = true; $('#pdl-all').dispatchEvent(new Event('change')); const all = $$('#sheetBody [data-pdl]:checked').length; closeSheet();
      return { btn: true, cbs: cbs.length, lab, n1, undo, n2, saved, all } });
    check('保單批次刪除：勾選 2 張 → 按鈕寫「刪除勾選的 2 張保單」→ 確認後刪掉；保單清單上方「↩︎ 復原剛刪除的 2 張保單」可以救回來（存檔也回來）；可以全選',
      r2.btn && r2.cbs === 3 && /刪除勾選的 2 張保單/.test(r2.lab) && r2.n1 === 1 && /復原剛刪除的 2 張保單/.test(r2.undo) && r2.n2 === 3 && r2.saved === 3 && r2.all === 3, JSON.stringify(r2));
    await page.close();
  }

  // =============== 6zs. 一個附約有好幾種給付：提示詞請 AI 每種給付各列一項（各自的類別）、拆開後各算進自己的缺口；編輯時可以「複製這項」再改類別 ===============
  {
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', role: 'me', inc: 80 }], active: 'a' });
    const s1 = await page.evaluate(() => { const m = me(), L = INS[m.id] || (INS[m.id] = []);
      const cv = (n, cat, calc) => ({ name: '康富醫療附約：' + n, kind: 'rider', cat, amount: 4, unit: '計畫', quote: '計畫 4', calc });
      const { p } = polCheck({ insurer: '甲人壽', product: '甲人壽終身壽險', start: '2020-01-01', status: '有效', payFreq: '年', premium: 20000, coverages: [
        cv('住院日額', 'hosp_day', { amount: 4000, unit: '元/日', perUnit: 1000, formula: '4 × 每計畫 1,000 元/日', quote: '計畫一 住院日額保險金每日 1,000 元', page: 8 }),
        cv('住院醫療費用', 'hosp_real', { amount: 40, unit: '萬元', perUnit: 10, formula: '4 × 每計畫 10 萬元', quote: '計畫一 每次住院醫療費用限額 10 萬元', page: 8 })] }, m);
      p.id = 's1'; L.push(p); S.set('ins', INS); renderIns();
      const S0 = covSum(m), v = (c, per) => S0.filter(x => x.cat === c && !x.nm && x.per === per).reduce((t, x) => t + x.v, 0);
      openPolEdit('s1'); const before = $$('#pe-cov [data-ci]').length; $('#pe-cov [data-cicp="0"]')?.click(); const after = $$('#pe-cov [data-ci]').length, copied = $$('#pe-cov [data-cf="name"]')[1]?.value || '';
      $$('#pe-cov [data-cf="cat"]')[1].value = 'surgery'; $('#pe-save').click(); const p2 = insFind(m, 's1');
      return { day: v('hosp_day', 'day'), real: v('hosp_real', ''), lv: polLv(p, m), before, after, copied, n2: p2.items.length, cats: p2.items.map(c => c.cat).join(), pp: promptPolicy(), ck: POLCHK_HEAD } });
    check('一個附約有好幾種給付：拆成每種給付一項（住院日額、住院醫療費用各自的類別）→ 各算進自己的缺口（日額 4 × 1,000 = 4,000 元/日、實支實付 4 × 10 萬 = 40 萬）；匯入和核對提示詞都寫明每種給付各列一筆',
      s1.day === 4000 && s1.real === 400000 && s1.lv === 'ok' && /每一種給付各列一筆/.test(s1.pp) && /每種給付一筆/.test(s1.ck), JSON.stringify({ day: s1.day, real: s1.real, lv: s1.lv }));
    check('編輯保單時「⧉ 複製這項」：同一個附約的另一種給付，複製後改類別（例如改成手術）再存',
      s1.before === 2 && s1.after === 3 && /康富醫療附約：住院日額/.test(s1.copied) && s1.n2 === 3 && s1.cats === 'hosp_day,surgery,hosp_real', JSON.stringify({ before: s1.before, after: s1.after, copied: s1.copied, n2: s1.n2, cats: s1.cats }));
    await page.close();
  }

  // =============== 6zt. 換算驗算：條款國字數字（十萬、一千二百、百分之一）、倍數（日額 × 10 倍）、每單位另附原文、萬元保額、非單位項目的換算（主約保額 × 1% 每月）；失能／長照沒寫每月還是一次 → 提醒＋一鍵選 ===============
  {
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', role: 'me', inc: 80, earner: true }], active: 'a' });
    const t1 = await page.evaluate(() => { const m = me(), L = INS[m.id] || (INS[m.id] = []);
      const cv = (name, cat, amount, unit, calc) => ({ name, kind: 'rider', cat, amount, unit, quote: `${name} ${amount}${unit}`, calc });
      const { p } = polCheck({ insurer: '甲人壽', product: '甲人壽綜合保險', start: '2020-01-01', status: '有效', payFreq: '年', premium: 20000, coverages: [
        cv('癌症附約：罹患癌症', 'cancer', 6, '單位', { amount: 600000, unit: '元', perUnit: 100000, formula: '6 × 十萬', quote: '每一保險單位新台幣十萬元' }),
        cv('癌症附約：癌症住院', 'cancer', 6, '單位', { amount: 7200, unit: '元/日', perUnit: 1200, formula: '6 × 一千二百', quote: '每一保險單位每日新台幣一千二百元' }),
        cv('醫療主約：住院手術', 'surgery', 10, '計畫', { amount: 10000, unit: '元/次', perUnit: 100, multiplier: 10, formula: '10 × 100 × 10 倍', quote: '住院醫療保險金日額的十倍', perUnitQuote: '每一計畫日額新臺幣 100 元' }),
        cv('醫療主約：住院日額', 'hosp_day', 10, '計畫', { amount: 1000, unit: '元/日', perUnit: 100, formula: '10 × 100', quote: '住院醫療保險金日額乘以實際住院日數', perUnitQuote: '每一計畫日額新臺幣 100 元' }),
        cv('附加條款：殘廢生活扶助', 'disability', 5000000, '元', { amount: 50000, unit: '元/月', perUnit: 0.01, formula: '500 萬 × 1%', quote: '主保險契約保險金額的百分之一按月給付' }),
        cv('重大傷病附約', 'critical', 100, '萬元', { amount: 250000, unit: '元', perUnit: 0.25, formula: '100 萬 × 25%', quote: '保險金額的百分之二十五' }),
        cv('倍數對不上', 'surgery', 10, '計畫', { amount: 9000, unit: '元/次', perUnit: 100, multiplier: 10, formula: '?', quote: '日額的十倍', perUnitQuote: '每一計畫日額新臺幣 100 元' }),
        { name: '失能照護附約', kind: 'rider', cat: 'disability', amount: 40000, unit: '元', quote: '失能照護附約 40,000 元' }] }, m);
      p.id = 'c1'; L.push(p); S.set('ins', INS); renderIns();
      const sum = () => { const S0 = covSum(m), v = (c, per) => S0.filter(x => x.cat === c && !x.nm && x.per === per).reduce((t, x) => t + x.v, 0);
        return [v('cancer', ''), v('cancer', 'day'), v('surgery', 'time'), v('hosp_day', 'day'), v('disability', 'month'), v('critical', '')].join() };
      const fl = () => polFlags(p, m).filter(f => f.lv !== 'info').map(f => f.lv + ':' + f.t).join('|'), before = { sum: sum(), fl: fl() };
      openPol('c1'); const btn = !!$('#sheetBody [data-pfix="c_month"]'), btn2 = !!$('#sheetBody [data-pfix="c_lump"]'); closeSheet();
      const ok = polFix(m, p, 'c_month', 7); const after = { sum: sum(), fl: fl(), unit: p.items[7].unit };
      const q = polCheck({ insurer: '乙', product: '乙', coverages: [{ name: 'x', cat: 'disability', amount: 1, unit: '萬元', quote: '1 萬元', calc: { amount: 1, unit: '萬元/月', perUnit: 1, multiplier: 1, perUnitQuote: 'a', formula: 'f', quote: 'q' } }] }, m).p.items[0].calc;
      return { before, btn, btn2, ok, after, keep: [q.multiplier, q.perUnitQuote].join(), pp: promptPolicy(), ck: POLCHK_HEAD } });
    check('換算驗算看得懂條款的國字數字和百分比、支援倍數與每單位另附原文：十萬、一千二百、日額 × 十倍、主約保額的百分之一（每月 5 萬）、100 萬元 × 百分之二十五 → 都算進保障；倍數算錯的照樣待核對、不算',
      t1.before.sum === '600000,7200,10000,1000,50000,250000' && !/罹患癌症|癌症住院|住院手術|住院日額|殘廢生活扶助|重大傷病/.test(t1.before.fl) && /chk:「倍數對不上」AI 算的 9,000 元\/次 和 10 × 100 × 10 對不起來/.test(t1.before.fl) && t1.keep === '1,a',
      JSON.stringify(t1.before));
    check('失能扶助、長照的給付沒寫每月還是一次 → 待核對＋一鍵「每月給付」「一次給付」；選每月 → 單位改成元/月、算進每月的失能扶助',
      /chk:「失能照護附約」沒寫是每月還是一次給付/.test(t1.before.fl) && t1.btn && t1.btn2 && t1.ok && t1.after.unit === '元/月' && t1.after.sum.split(',')[4] === '90000' && !/每月還是一次/.test(t1.after.fl), JSON.stringify(t1.after));
    check('匯入提示詞：calc 可以寫倍數（multiplier）、每單位另附原文（perUnitQuote）、百分比寫成小數；失能、長照的給付寫清楚每月（元/月）還是一次',
      /multiplier/.test(t1.pp) && /perUnitQuote/.test(t1.pp) && /小數/.test(t1.pp) && /元\/月/.test(t1.pp) && /multiplier/.test(t1.ck), '');
    await page.close();
  }

  // =============== 6zu. 手動改的金額蓋過 AI 換算（calc）；重新匯入只改換算／一次給付／給付說明也要列差異；匯入提示詞和檢查規則一致（lump、元/年、元/倍） ===============
  {
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', role: 'me', inc: 80 }], active: 'a' });
    // 每張保單各算多少（covSum 明細 L 的 pid），避免別張保單混進總額
    const u1 = await page.evaluate(async () => { const m = me(), L = INS[m.id] || (INS[m.id] = []), wait = t => new Promise(r => setTimeout(r, t));
      const vp = (pid, cat, per) => covSum(m).filter(x => x.cat === cat && !x.nm && (per == null || x.per === per)).flatMap(x => x.L).filter(l => l.pid === pid).reduce((t, l) => t + l.v, 0);
      const fl = id => polFlags(insFind(m, id), m).filter(f => f.lv !== 'info').map(f => f.t).join('|');
      const { p } = polCheck({ insurer: '甲人壽', product: '甲人壽醫療終身', start: '2020-01-01', status: '有效', payFreq: '年', premium: 10000, coverages: [
        { name: '醫療主約：住院日額', kind: 'main', cat: 'hosp_day', amount: 10, unit: '計畫', quote: '計畫 10', calc: { amount: 1000, unit: '元/日', perUnit: 100, formula: '10 × 100', quote: '住院醫療保險金日額乘以實際住院日數' } }] }, m);
      p.id = 'u1'; L.push(p); S.set('ins', INS); renderIns();
      const b = { day: vp('u1', 'hosp_day', 'day'), fl: fl('u1') };
      go('ins', 'cov'); await wait(100); const btn = document.querySelector('#covBody [data-gapfix="u1:0"]'), pr = window.prompt;
      // 存檔失敗（手機空間滿）：金額、單位、原文、換算都要還原
      const ss = S.set; S.set = () => false; window.prompt = () => '1000元/日'; btn?.click(); S.set = ss; const q0 = insFind(m, 'u1').items[0], fail = [q0.amt, q0.unit, !!q0.calc].join();
      window.prompt = () => '1000元/日'; document.querySelector('#covBody [data-gapfix="u1:0"]')?.click(); window.prompt = pr;
      const q = insFind(m, 'u1'), a = { btn: !!btn, fail, day: vp('u1', 'hosp_day', 'day'), fl: fl('u1'), calc: !!q.items[0].calc, unit: q.items[0].unit };
      openPol('u1'); await wait(150); $('#sheetBody [data-prest="0"]')?.click(); await wait(150);
      const r = insFind(m, 'u1'), rs = { calc: r.items[0].calc?.amount ?? null, amt: r.items[0].amt, unit: r.items[0].unit };
      closeSheet(); return { b, a, rs } });
    check('「✏️ 填金額」手動填的優先：AI 換算對不上（🟠 每單位 100 找不到）→ 填 1000元/日 → 🟠 消失、住院日額每日 +1,000；存檔失敗時金額和換算一起還原；從變更紀錄復原後換算回來',
      /每單位 100 在給付表原文裡找不到/.test(u1.b.fl) && u1.b.day === 0 && u1.a.btn && u1.a.fail === '10,計畫,true' && u1.a.day === 1000 && !/給付表原文|對不起來/.test(u1.a.fl) && u1.a.calc === false && u1.a.unit === '元/日'
        && u1.rs.calc === 1000 && u1.rs.amt === 10 && u1.rs.unit === '計畫', JSON.stringify(u1));
    const u2 = await page.evaluate(async () => { const m = me(), L = INS[m.id], wait = t => new Promise(r => setTimeout(r, t));
      const vp = (pid, cat) => covSum(m).filter(x => x.cat === cat && !x.nm).flatMap(x => x.L).filter(l => l.pid === pid).reduce((t, l) => t + l.v, 0);
      const { p } = polCheck({ insurer: '乙人壽', product: '乙人壽醫療附約', start: '2020-01-01', status: '有效', payFreq: '年', premium: 5000, coverages: [
        { name: '醫療附約：住院日額', kind: 'rider', cat: 'hosp_day', amount: 2, unit: '計畫', quote: '計畫 2', calc: { amount: 1000, unit: '元/日', perUnit: null, formula: '計畫二 = 1,000 元/日', quote: '住院日額 500 1,000 1,500' } },
        { name: '醫療附約：住院醫療費用', kind: 'rider', cat: 'hosp_real', amount: 2, unit: '計畫', quote: '計畫 2', calc: { amount: 100000, unit: '元', perUnit: null, formula: '計畫二 = 10 萬', quote: '住院醫療費用限額 50,000 100,000 150,000' } }] }, m);
      p.id = 'u2'; L.push(p); S.set('ins', INS); renderIns();
      const calcs = () => insFind(m, 'u2').items.map(c => c.calc ? c.calc.amount : '-').join();
      const s0 = { day: vp('u2', 'hosp_day'), real: vp('u2', 'hosp_real') };
      openPolEdit('u2'); $('#pe-save').click(); const same = calcs();                       // 什麼都沒改：換算都保留（輸入框是字串 "2"，不能當成改過）
      openPolEdit('u2'); $$('#pe-cov [data-cf="amt"]')[0].value = '3'; $('#pe-save').click(); const p3 = insFind(m, 'u2');
      const s1 = { calcs: calcs(), day: vp('u2', 'hosp_day'), real: vp('u2', 'hosp_real'), amt: p3.items[0].amt };
      openPolEdit('u2'); $('#pe-cov [data-cicp="1"]').click(); $('#pe-save').click(); const cp = calcs();      // 複製出來的是另一種給付：不帶換算
      openPolEdit('u2'); $('#pe-cov [data-cirm="0"]').click(); $('#pe-save').click(); const rm = calcs();       // 刪掉前面一項：後面那項沒改，換算照樣保留（不能用位置比對）
      openPolEdit('u2'); $$('#pe-cov [data-cf="unit"]')[0].value = '計畫 '; $('#pe-save').click(); const ws = calcs();   // 單位只多了空白：不算改過
      closeSheet(); return { s0, same, s1, cp, rm, ws } });
    check('「編輯」改了金額或單位的項目不再用舊的 AI 換算：2 計畫改成 3 計畫 → 住院日額不再算 1,000（改成待核對），沒改的住院醫療費用照樣 10 萬；沒改就存檔、單位只多空白不會弄丟換算；「⧉ 複製這項」複製出來的不帶換算；刪掉前一項後，沒改的那項換算保留',
      u2.s0.day === 1000 && u2.s0.real === 100000 && u2.same === '1000,100000' && u2.s1.calcs === '-,100000' && u2.s1.day === 0 && u2.s1.real === 100000 && u2.s1.amt === 3
        && u2.cp === '-,100000,-' && u2.rm === '100000,-' && u2.ws === '100000,-', JSON.stringify(u2));
    // 重新匯入：只改了換算（元/次 → 元/年）也要列差異、預設更新
    const pol = calc => ({ type: 'kinwell.policy', v: 1, policies: [{ insurer: '丙人壽', product: '丙人壽癌症附約', start: '2021-03-01', status: '有效', payFreq: '年', premium: 3000, coverages: [
      { name: '癌症附約：癌症治療', kind: 'rider', cat: 'cancer', amount: 1, unit: '單位', quote: '1 單位', calc: { perUnit: null, formula: '1 單位', quote: '每次 40,000 元；每年 48,000 元', ...calc } }] }] });
    await page.evaluate(J => { const m = me(), { p } = polCheck(J.policies[0], m); p.id = 'u3'; INS[m.id].push(p); S.set('ins', INS); renderIns(); go('ins', 'pol'); openPolImport() }, pol({ amount: 40000, unit: '元/次' }));
    await page.waitForTimeout(200); await page.fill('#pi-in', JSON.stringify(pol({ amount: 48000, unit: '元/年' }))); await page.click('#pi-go'); await page.waitForTimeout(300);
    const u3 = await page.evaluate(() => ({ on: $('#pi-out [data-pi]')?.checked, mode: $('#pi-out [data-pimode]')?.value, out: $('#pi-out').textContent }));
    await page.click('#pi-save'); await page.waitForTimeout(300);
    const u4 = await page.evaluate(() => { const m = me(), S0 = covSum(m), v = per => S0.filter(x => x.cat === 'cancer' && !x.nm && x.per === per).flatMap(x => x.L).filter(l => l.pid === 'u3').reduce((t, l) => t + l.v, 0);
      const it = c => ({ name: '甲：一次金', cat: 'disability', amt: 50, unit: '萬元', ...c }), d = polDiff({ items: [it({ limit: '', lump: false })] }, { items: [it({ limit: '每次最高 10 萬', lump: true, calc: { amount: 500000, unit: '元' } })] }).join('｜');
      const d2 = polDiff({ items: [it({ calc: { amount: 500000, unit: '元', perUnit: 10, multiplier: 1 } })] }, { items: [it({ calc: { amount: 500000, unit: '元', perUnit: 10, multiplier: 2 } })] }).join('｜');
      const d3 = polDiff({ items: [it({ calc: { amount: 500000, unit: '元' } })] }, { items: [it({})] }).join('｜');
      return { year: v('year'), time: v('time'), n: insOf(m).filter(p => p.product === '丙人壽癌症附約').length, d, d2, d3 } });
    check('重新匯入只改了換算（每次 4 萬 → 每年 4.8 萬）：預覽列出差異、預設勾「用新資料更新這張」，匯入後這項算在每年；換算的每單位、倍數、新增或拿掉換算、一次給付、給付說明改了也列差異',
      u3.on === true && u3.mode === 'upd' && /「癌症附約：癌症治療」換算 4 萬\/次 → 4\.8 萬\/年/.test(u3.out) && !/內容一樣/.test(u3.out) && u4.year === 48000 && u4.time === 0 && u4.n === 1
        && /一次給付/.test(u4.d) && /給付說明/.test(u4.d) && /新增換算/.test(u4.d) && /倍數 1 → 2/.test(u4.d2) && /拿掉換算/.test(u4.d3), JSON.stringify({ u3: { ...u3, out: u3.out.slice(0, 300) }, u4 }));
    // 提示詞和檢查一致：一次給付填 lump、每年給付寫元/年、看手術表的倍數寫元/倍（不加進總額）
    const u5 = await page.evaluate(() => { const m = me(), { p } = polCheck({ insurer: '丁人壽', product: '丁人壽失能險', start: '2020-01-01', status: '有效', payFreq: '年', premium: 3000, coverages: [
        { name: '失能險：失能保險金', cat: 'disability', amount: 50, unit: '萬元', lump: true, quote: '50 萬元' },
        { name: '醫療附約：住院手術', kind: 'rider', cat: 'surgery', amount: 1, unit: '計畫', quote: '計畫 1', calc: { amount: 1000, unit: '元/倍', perUnit: null, formula: '日額 1,000 元 × 附表手術倍數', quote: '住院日額 1,000 元乘以附表所載倍數' } }] }, m);
      p.id = 'u5'; INS[m.id].push(p); S.set('ins', INS); const S0 = covSum(m), fl = polFlags(p, m).map(f => f.lv + ':' + f.t).join('|');
      return { fl, sx: S0.filter(x => x.cat === 'surgery' && !x.nm).flatMap(x => x.L).filter(l => l.pid === 'u5').length, nmx: S0.filter(x => x.cat === 'surgery' && x.nm).flatMap(x => x.L).filter(l => l.pid === 'u5').length, pp: promptPolicy(), ck: POLCHK_HEAD } });
    check('匯入、核對提示詞都寫：一次給付的失能／長照填 "lump": true、每年給付寫「元/年」、依手術倍數表的寫「元/倍」；照提示詞匯入的一次給付失能險不會被問「每月還是一次」，元/倍的換算不加進總額',
      /"lump":\s*true/.test(u5.pp) && /"lump":\s*true/.test(u5.ck) && /元\/年/.test(u5.pp) && /元\/年/.test(u5.ck) && /元\/倍/.test(u5.pp) && /元\/倍/.test(u5.ck)
        && !/每月還是一次/.test(u5.fl) && u5.sx === 0 && u5.nmx === 1 && !/元倍/.test(u5.fl), JSON.stringify({ fl: u5.fl, sx: u5.sx, nmx: u5.nmx }));
    await page.close();
  }

  // =============== 6zv. 失能扶助、長照「每年給付」換算成每月（÷ 12）一起加總，明細寫出換算；一次給付的照舊不算每月 ===============
  {
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', role: 'me', inc: 80, earner: true }], active: 'a' });
    const u1 = await page.evaluate(() => { const m = me(), L = INS[m.id] || (INS[m.id] = []);
      const { p } = polCheck({ insurer: '甲人壽', product: '甲人壽失能照護終身保險', start: '2020-01-01', status: '有效', payFreq: '年', premium: 10000, coverages: [
        { name: '失能照護：失能安養扶助保險金', kind: 'main', cat: 'disability', amount: 10000, unit: '元', quote: '10,000 元', calc: { amount: 120000, unit: '元/年', perUnit: 12, formula: '1 萬 × 12 倍，每年', quote: '保險金額的十二倍' } },
        { name: '失能照護：一至六級失能保險金', kind: 'main', cat: 'disability', amount: 500000, unit: '元', quote: '500,000 元', lump: true },
        { name: '失能照護附約', kind: 'rider', cat: 'disability', amount: 30000, unit: '元/月', quote: '30,000 元' },
        { name: '雙重照護：特定傷病扶助保險金', kind: 'main', cat: 'ltc', amount: 40, unit: '萬元', quote: '40 萬', calc: { amount: 40000, unit: '元/年', perUnit: 0.1, formula: '40 萬 × 10%，每年', quote: '保險金額的百分之十' } }] }, m);
      p.id = 'y1'; L.push(p); S.set('ins', INS); renderIns();
      const G = covGap(m), d = G.find(g => g.k === 'disability'), l = G.find(g => g.k === 'ltc'); openGapDetail('disability'); const t = $('#sheetBody').textContent;
      return { d: d.have, l: l.have, inv: Math.abs(d.inL.reduce((a, x) => a + x.v, 0) - d.have) < 1e-6, t: /每年 12 萬 ÷ 12/.test(t) && /算 1 萬\/月/.test(t) && /一至六級失能保險金/.test(t) } });
    check('失能扶助、長照每年給付的 ÷ 12 換算成每月一起加總（每年 12 萬 → 每月 1 萬，加每月 3 萬 ＝ 4 萬；長照每年 4 萬 → 每月 3,333）；明細寫出「每年 12 萬 ÷ 12」；一次給付的照舊列在沒算進去',
      u1.d === 40000 && Math.round(u1.l) === 3333 && u1.inv && u1.t, JSON.stringify(u1));
    await page.close();
  }

  // =============== 6zw. 限女性的給付男性不算；擇一給付只算一次（自動提醒＋一鍵）；B 型身故＝保額＋帳戶價值；每日給付不同情況分開列 ===============
  {
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', role: 'me', inc: 80, earner: true }], active: 'a' });
    const w1 = await page.evaluate(() => { const m = me(), L = INS[m.id] || (INS[m.id] = []);
      const mk = (id, r) => { const { p } = polCheck({ insurer: '甲人壽', start: '2020-01-01', status: '有效', payFreq: '年', premium: 10000, ...r }, m); p.id = id; L.push(p); return p };
      mk('w1', { product: '甲人壽一年定期防癌保險', coverages: [
        { name: '防癌附約：義乳重建保險金', kind: 'rider', cat: 'cancer', amount: 36, unit: '萬元', quote: '36 萬' },
        { name: '防癌附約：初次罹癌保險金', kind: 'rider', cat: 'cancer', amount: 30, unit: '萬元', quote: '30 萬' },
        { name: '防癌附約：癌症住院保險金', kind: 'rider', cat: 'cancer', amount: 2000, unit: '元/日', quote: '2,000 元' },
        { name: '防癌附約：癌症出院療養保險金', kind: 'rider', cat: 'cancer', amount: 3600, unit: '元/日', quote: '3,600 元' },
        { name: '防癌附約：癌症門診保險金', kind: 'rider', cat: 'cancer', amount: 3600, unit: '元/日', quote: '3,600 元' }] });
      const p2 = mk('w2', { product: '甲人壽重大傷病終身保險', coverages: [
        { name: '重大疾病保險金', kind: 'main', cat: 'critical', amount: 100, unit: '萬元', quote: '100 萬' },
        { name: '重大傷病保險金', kind: 'main', cat: 'critical', amount: 100, unit: '萬元', quote: '100 萬' }] });
      const p3 = mk('w3', { product: '甲人壽變額萬能壽險', accountValue: 55000, accountValueDate: '2026-02-24', coverages: [
        { name: '身故保險金', kind: 'main', cat: 'life', amount: 500, unit: '萬元', quote: '500 萬', plusAV: true }] });
      S.set('ins', INS); renderIns();
      const G = () => Object.fromEntries(covGap(m).map(g => [g.k, g.have])), g0 = G(), ca = covGap(m).find(g => g.k === 'cancer');
      const f2 = polFlags(p2, m).map(f => f.t).join('|'), btn = PFIX.some(([re, a]) => a === 'c_oneof' && polFlags(p2, m).some(f => re.test(f.t)));
      polFix(m, p2, 'c_oneof', 0); const g1 = G(), cr = covGap(m).find(g => g.k === 'critical');
      const avOff = (delete p3.av, G().life), f3 = polFlags(p3, m).map(f => f.t).join('|');
      go('ins', 'cov'); renderCov(); const cov = $('#covBody').textContent;
      m.sex = 'f'; const gf = G().cancer;
      return { c0: g0.cancer, ex: ca.exL.map(x => x.why).join('|'), cr0: g0.critical, f2, btn, cr1: g1.critical, crx: cr.exL.map(x => x.why).join('|'), life: g0.life, avOff, f3, gf,
        day: /各項合計/.test(cov) && /看單項：住院 2,000 元療養 3,600 元門診 3,600 元/.test(cov), pp: promptPolicy(), ck: POLCHK_HEAD, dif: polDiff({ items: [{ name: 'x', cat: 'life', amt: 1, unit: '萬元' }] }, { items: [{ name: 'x', cat: 'life', amt: 1, unit: '萬元', plusAV: true, oneOf: 'g', sex: 'f' }] }).join('|') } });
    check('限女性的給付（義乳重建）男性被保險人不算進癌症、寫原因；改成女性才算',
      w1.c0 === 30 && /限女性被保險人/.test(w1.ex) && w1.gf === 66, JSON.stringify({ c0: w1.c0, ex: w1.ex, gf: w1.gf }));
    check('同一張保單重大疾病、重大傷病各 100 萬：提醒可能重複算＋「擇一給付」按鈕；按了只算 100 萬，另一項寫「擇一給付，不重複算」',
      w1.cr0 === 200 && /會重複算/.test(w1.f2) && w1.btn && w1.cr1 === 100 && /擇一給付/.test(w1.crx), JSON.stringify({ cr0: w1.cr0, f2: w1.f2, btn: w1.btn, cr1: w1.cr1, crx: w1.crx }));
    check('B 型身故＝保額 500 萬＋帳戶價值 5.5 萬＝505.5 萬；沒填帳戶價值先算 500 萬並提醒',
      Math.abs(w1.life - 505.5) < 1e-9 && w1.avOff === 500 && /還沒填帳戶價值/.test(w1.f3), JSON.stringify({ life: w1.life, avOff: w1.avOff, f3: w1.f3 }));
    check('癌症每日給付顯示「各項合計」，並分開列住院、療養、門診（不同情況不會同一天都領）', w1.day, '');
    check('匯入、核對提示詞有 sex、oneOf、plusAV、accountValue；重新匯入時這些改了也列差異',
      [w1.pp, w1.ck].every(t => /"sex"/.test(t) && /oneOf/.test(t) && /plusAV/.test(t) && /accountValue/.test(t)) && /加計帳戶價值/.test(w1.dif) && /擇一給付/.test(w1.dif) && /限定性別/.test(w1.dif), w1.dif);
    await page.close();
  }

  // =============== 6zx. 體檢判讀：「*」標記看數值方向（三酸甘油酯偏低不算異常）；MCH 輕微偏高不給貧血建議；範圍值取較高的一端；50 歲以下骨密度看 Z 值 ===============
  {
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 71, act: '1.375', goal: 'keep', role: 'me' }], active: 'a' });
    const x1 = await page.evaluate(() => { const m = me(), one = (o) => { LABS[m.id] = []; openLabSheet(); fillLab({ type: 'kinwell.lab', v: 1, date: '2024-03-01', ...o }); saveLab(); return labsOf(m)[0] };
      const r1 = one({ items: { tg: { value: 38, unit: 'mg/dl', ref: '45~200', lo: 45, hi: 200, flag: '*' }, mch: { value: 33.4, unit: 'pg', ref: '27~32', lo: 27, hi: 32, flag: '*' }, hb: { value: 15.2, unit: 'g/dl', lo: 14, hi: 18 },
        urbc: { value: '2-8', unit: 'HPF', ref: '0~5', lo: 0, hi: 5 }, hbsab: { value: '陽性' }, dxa: { value: -1.5 } } });
      const i1 = labEval(r1, m), t1 = $('#sheetBody').textContent;
      const r2 = one({ items: { dxa: { value: -1.5 } }, extra: [{ name: '骨密度(Z-score) 腰椎', value: -0.3 }, { name: '骨密度(Z-score) 股骨頸', value: -0.6 }] }), i2 = labEval(r2, m);
      m.birth = '1964-05-05'; const r3 = one({ items: { dxa: { value: -1.5 } } }), i3 = labEval(r3, m); m.birth = '1984-05-05';
      return { k1: i1.map(i => i.k + ':' + i.dir + ':' + i.dept).join('|'), urbc: r1.items.urbc?.v, ref: r1.items.urbc?.ref || '', dxa1: i1.find(i => i.k === 'dxa')?.msg || '', tip: /貧血可多吃紅肉/.test(t1), unit: /B型肝炎表面抗體陽性 mIU/.test(t1),
        z: r2.items.dxaz?.v, i2: i2.map(i => i.k).join(), rk: resolveKey('骨密度(Z-score)'), i3: i3.find(i => i.k === 'dxa')?.lv ?? 0, pr: promptLab() } });
    check('「*」標記看數值在參考範圍哪一邊：三酸甘油酯 38（下限 45）偏低不算異常，不會寫成「偏高」；MCH 33.4 偏高建議家醫科，血紅素正常不給貧血飲食建議；「陽性」後面不接單位',
      !/tg:/.test(x1.k1) && /mch:hi:家醫科/.test(x1.k1) && !x1.tip && !x1.unit, JSON.stringify({ k1: x1.k1, tip: x1.tip, unit: x1.unit }));
    check('檢驗值是範圍（尿沉渣紅血球 2-8 /HPF）取較高的 8 判讀並寫原文，不再只取 2', x1.urbc === 8 && /原文 2-8/.test(x1.ref) && /urbc:hi/.test(x1.k1), JSON.stringify({ urbc: x1.urbc, ref: x1.ref }));
    check('50 歲以下男性：只有 T 值 -1.5 時提醒看 Z 值（不說骨質缺乏）；有 Z 值（取最低 -0.6）就不算異常；「骨密度(Z-score)」對到 Z 值；60 歲照常用 T 值',
      /要看 Z 值/.test(x1.dxa1) && x1.z === -0.6 && !/dxa/.test(x1.i2) && x1.rk === 'dxaz' && x1.i3 >= 1 && /dxaz/.test(x1.pr), JSON.stringify({ dxa1: x1.dxa1, z: x1.z, i2: x1.i2, rk: x1.rk, i3: x1.i3 }));
    await page.close();
  }

  // =============== 6zy. 實支實付收據正本／副本：2024/7/1 以後的新契約推定限正本、舊保單（一年期續保）提醒不要斷、張數與申請順序、提示詞 ===============
  {
    page = await newPage({ members: [{ id: 'a', name: '王小明', sex: 'm', birth: '1984-05-05', h: 172, w: 75, act: '1.375', goal: 'keep', role: 'me', inc: 80 }], active: 'a' });
    const y1 = await page.evaluate(() => { const m = me(), L = INS[m.id] || (INS[m.id] = []);
      const mk = (id, start, ins, c) => { const { p } = polCheck({ insurer: ins, product: ins + '醫療保險', start, status: '有效', payFreq: '年', premium: 3000, coverages: [{ name: '住院醫療費用保險金', kind: 'rider', cat: 'hosp_real', amount: 10, unit: '萬元/次', quote: '10 萬', ...c }] }, m); p.id = id; L.push(p); return p };
      const A = mk('ra', '2019-01-01', '甲人壽', { renewable: '不保證續保' }), B = mk('rb', '2020-01-01', '乙人壽', { claimDoc: '可用副本' }), C = mk('rc', '2025-03-01', '丙人壽', {}), D = mk('rd', '2025-06-01', '丁人壽', { claimDoc: 'orig' });
      S.set('ins', INS); renderIns();
      const rp = realPols(m).map(x => x.p.id + ':' + x.v).join(), G = covGap(m), ck = covCheckup(m, G), html = checkupHTML(m, G);
      const R = claimEst(m, { k: 'ad', d: todayS(), days: 3 }), ce = ceHTML(R);
      openPolEdit('rb'); const sel = !!document.querySelector('#pe-cov [data-cf="claimDoc"]') && document.querySelector('#pe-cov [data-cf="claimDoc"]').value; closeSheet();
      return { rp, O: ck.O.map(x => x[0]).join('|'), N: ck.N.map(x => x.join('：')).join('|'), gd: GUIDE_OF(m).includes('real') && /理賠差額證明/.test(html) && /3＋1/.test(html),
        fa: polFlags(A, m).map(f => f.lv + ':' + f.t).join('|'), fc: polFlags(C, m).map(f => f.lv + ':' + f.t).join('|'), lvc: polLv(C, m), ro: R.ro, ce: /收據正本給/.test(ce),
        sel, dif: polDiff({ items: [{ name: 'x', cat: 'hosp_real', amt: 1, unit: '萬元' }] }, { items: [{ name: 'x', cat: 'hosp_real', amt: 1, unit: '萬元', claimDoc: 'copy' }] }).join('|'), pp: promptPolicy(), ckp: POLCHK_HEAD } });
    check('實支實付收據：條款寫可用副本 → 副本；2024/7/1 以後生效 → 推定限正本；以前又沒寫 → 不確定；編輯畫面可以選',
      y1.rp === 'ra:?,rb:copy,rc:orig,rd:orig' && y1.sel === 'copy', JSON.stringify({ rp: y1.rp, sel: y1.sel }));
    check('保障健檢：4 張實支實付列出可用副本、限正本、不確定各幾張；2 張 2024/7/1 以前的提醒不要斷掉（不保證續保的點名）；身分說明多一段「實支實付：收據正本、副本、張數」',
      /實支實付 4 張（可用副本 1、限正本 2、不確定 1）/.test(y1.O) && /2 張 2024\/7\/1 以前的實支實付/.test(y1.N) && /甲人壽醫療保險」不保證續保/.test(y1.N) && y1.gd, JSON.stringify({ O: y1.O, N: y1.N, gd: y1.gd }));
    check('單張保單：舊的寫「每年續保照原條款、斷掉重買只能正本」，新的寫「只能用收據正本理賠」；都是參考，不會變成待核對',
      /info:「住院醫療費用保險金」2024\/7\/1 以前的實支實付：看條款能不能用收據副本/.test(y1.fa) && /info:「住院醫療費用保險金」2024\/7\/1 以後的實支實付：只能用收據正本理賠/.test(y1.fc) && y1.lvc === 'ok', JSON.stringify({ fa: y1.fa, fc: y1.fc, lvc: y1.lvc }));
    check('理賠試算：好幾張實支實付時寫申請順序（正本給限正本的、副本給可用副本的、其他限正本拿差額證明、不確定的看條款）',
      /收據正本給 「丙人壽醫療保險」/.test(y1.ro) && /「乙人壽醫療保險」 可以用醫院蓋章的收據副本/.test(y1.ro) && /「丁人壽醫療保險」 也限正本/.test(y1.ro) && /❔ 「甲人壽醫療保險」/.test(y1.ro) && y1.ce, y1.ro);
    check('匯入、核對提示詞有 claimDoc；重新匯入時收據正本／副本改了列差異',
      /"claimDoc"/.test(y1.pp) && /"claimDoc"/.test(y1.ckp) && /收據：不明 → 可用副本/.test(y1.dif), y1.dif);
    await page.close();
  }

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
  // 地板守衛（CONSTRAINTS.md）：結束碼 1＝有降低門檻的改動；2＝沒辦法檢查（不是 git、沒有 origin/main），只提醒不擋
  { const g = require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'tests', 'floor-guard.mjs')], { cwd: ROOT, encoding: 'utf8' });
    if (g.status === 2) console.log('（地板守衛沒辦法檢查：' + (g.stderr || '').trim() + '）');
    else check('地板守衛：沒有刪測試、跳過測試、放寬 CONSTRAINTS.md 門檻或新增 eval／document.write', g.status === 0, (g.stdout || '').trim().split('\n').slice(-3).join(' ')) }
  console.log(results.join('\n'));
  if (errs.length) console.log('\n頁面錯誤：\n' + errs.join('\n'));
  const fail = results.filter(r => r.startsWith('FAIL')).length + errs.length;
  console.log(`\n${results.length - results.filter(r => r.startsWith('FAIL')).length}/${results.length} 通過${errs.length ? `，${errs.length} 個頁面錯誤` : ''}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('測試程式出錯', e); process.exit(2) });
