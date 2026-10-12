// NutriCore 端對端測試：用 iPhone 尺寸的無頭 Chromium 操作 index.html（不連外網，外部 API 全部模擬）
// 用法：node tests/e2e.js            跑全部測試
//       node tests/e2e.js --update-prompts   依 App 內提示詞重寫 PROMPTS.md
const path = require('path'), fs = require('fs');
let pw; for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { pw = require(p); break } catch (e) {} }
if (!pw) { console.error('找不到 playwright（npm i -g playwright）'); process.exit(2) }
const ROOT = path.join(__dirname, '..'), PAGE = 'file://' + path.join(ROOT, 'index.html');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGP432ODFTEMLQkAoxxxwW4TzCoAAAAASUVORK5CYII=', 'base64');
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
  await page.click('#nav button[data-v="lab"]'); await page.selectOption('#labDish', 'l2'); await page.click('#labStyle button[data-v="neon"]'); await page.click('#genOne');
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
  await page.click('#nav button[data-v="lab"]'); await page.selectOption('#labDish', 'l4'); await page.click('#genOne');
  for (let i = 0; i < 60 && await page.evaluate(() => !!busy || queue.length > 0); i++) { await page.clock.fastForward(10000); await page.waitForTimeout(80) }
  const hang = await page.evaluate(() => ({ busy: !!busy, q: queue.length, out: document.querySelector('#labOut').textContent }));
  check('AI Horde 不回應：逾時後顯示錯誤、佇列不卡死', !hang.busy && !hang.q && /沒有回應/.test(hang.out), hang.out.slice(0, 50));
  horde.mode = 'ok'; await page.close();
  // GAS：設定錯誤直接停（不重試 3 次、不再等 20 秒），訊息講要去哪裡設定
  page = await newPage({ members: [{ id: 'g1', name: '我', sex: 'm', birth: '1990-01-01', h: 170, w: 65, act: '1.375', goal: 'keep' }], active: 'g1', gas: 'https://script.google.com/macros/s/TEST/exec' });
  const labOut = re => page.waitForFunction(re => new RegExp(re).test(document.querySelector('#labOut').textContent), re.source, { timeout: 15000 }).catch(() => {});
  await page.click('#nav button[data-v="lab"]'); await page.selectOption('#labDish', 'l5'); await page.click('#genOne'); await labOut(/生成失敗/);
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
