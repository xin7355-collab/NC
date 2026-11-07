# Kinwell（舊名：家安康、NutriCore）：Claude 工作規則

- 回覆一律繁體中文（台灣用語），精簡、行動導向；使用者用 iPhone 操作，介面 Mobile-first。
- `index.html` 的 `const APP_VER='dev'` 不要手改：部署時 workflow 會換成 commit 編號，App 回到前景時用它自動更新。
- **改完、測試通過就直接 commit 並 push 到 `main`**：不開分支、不開 PR、不用再問。推上 `main` 後，GitHub Actions（`.github/workflows/pages-sync.yml`）會同步到 `gh-pages` 並自動發布到 https://xin7355-collab.github.io/NC/ ；不要手動改 `gh-pages`。
- 推之前必跑 `node tests/e2e.js`（全部 PASS 才推；最後會自動跑 `tests/floor-guard.mjs`，擋下刪測試、跳過測試、放寬 `CONSTRAINTS.md` 門檻、新增 eval／document.write）。品質門檻寫在 `CONSTRAINTS.md`，只能收緊，要放寬先問使用者。改到 App 內 AI 提示詞時，跑 `node tests/e2e.js --update-prompts` 同步 `PROMPTS.md`。
- 架構：單檔 `index.html`，沒有建置步驟。健康資料只存在使用者手機（localStorage，圖片在 IndexedDB），不得上傳；任何 API Key 不得進前端或 repo，一律經 `gas/Code.gs` 代理。
- 判讀規則、資料結構、公費篩檢資格見 `PLAN.md`；規則改了要同步更新 `PLAN.md`。
- 外部 API：單一佇列、指數退避、失敗可略過，不可瞬間併發；GAS 寫入用 LockService。
- 回報要誠實：哪些驗過、哪些沒驗到分開講；範圍外的問題簡短提出，不擅自擴大範圍。
- 先重現再修：用 Playwright（`tests/e2e.js` 同一套）重現，修完用同方法驗證並補一條測試（red-green-proof：先看到測試紅、修完變綠、把修正拿掉再紅一次）。
- 使用者給的真實資料（備份檔、截圖）只能在本機分析，不得 commit、不得放進測試或 PROMPTS／PLAN；測試一律用合成資料重現，回覆不要重複真實姓名。
- 介面改完先用 design-qa 的方法檢查：手機 320／390 寬與電腦 1280 寬各看一次（焦點不被遮住、對比、按鈕都有作用），再說完成。
- 錯誤訊息要說使用者能做什麼，不是只丟 HTTP 代碼；「還沒設定」和「真的壞掉」要分開。
- iPhone 下載／分享檔案只用 `navigator.share({files:[f]})`，不要同時帶 `title`（iOS 會丟掉檔案）。
- 已安裝的技能在 `.claude/skills/`（來源 xin7355-collab/skl，15 個：防禦健檢、除錯、驗證、e2e、無障礙、Apple HIG、介面細節、錯誤處理，加上 design-qa、red-green-proof、adversarial-reviewer、qa-acceptance、tw-writing、performance-optimization、constraint-driven-development），開工時 hook 會自動跑防禦健檢；更新技能：`git clone --depth 1 https://github.com/xin7355-collab/skl /tmp/skl && python3 /tmp/skl/xin-toolkit/skills/app-bootstrap/scripts/bootstrap_app.py update --target .`
