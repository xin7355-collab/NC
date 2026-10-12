# NutriCore：Claude 工作規則

- 回覆一律繁體中文（台灣用語），精簡、行動導向；使用者用 iPhone 操作，介面 Mobile-first。
- `index.html` 的 `const APP_VER='dev'` 不要手改：部署時 workflow 會換成 commit 編號，App 回到前景時用它自動更新。
- **改完、測試通過就直接 commit 並 push 到 `main`**：不開分支、不開 PR、不用再問。推上 `main` 後，GitHub Actions（`.github/workflows/pages-sync.yml`）會同步到 `gh-pages` 並自動發布到 https://xin7355-collab.github.io/NC/ ；不要手動改 `gh-pages`。
- 推之前必跑 `node tests/e2e.js`（全部 PASS 才推）。改到 App 內 AI 提示詞時，跑 `node tests/e2e.js --update-prompts` 同步 `PROMPTS.md`。
- 架構：單檔 `index.html`，沒有建置步驟。健康資料只存在使用者手機（localStorage，圖片在 IndexedDB），不得上傳；任何 API Key 不得進前端或 repo，一律經 `gas/Code.gs` 代理。
- 判讀規則、資料結構、公費篩檢資格見 `PLAN.md`；規則改了要同步更新 `PLAN.md`。
- 外部 API：單一佇列、指數退避、失敗可略過，不可瞬間併發；GAS 寫入用 LockService。
- 回報要誠實：哪些驗過、哪些沒驗到分開講；範圍外的問題簡短提出，不擅自擴大範圍。
- 先重現再修：用 Playwright（`tests/e2e.js` 同一套）重現，修完用同方法驗證並補一條測試。
- 錯誤訊息要說使用者能做什麼，不是只丟 HTTP 代碼；「還沒設定」和「真的壞掉」要分開。
- iPhone 下載／分享檔案只用 `navigator.share({files:[f]})`，不要同時帶 `title`（iOS 會丟掉檔案）。
- 已安裝的技能在 `.claude/skills/`（來源 xin7355-collab/skl），開工時 hook 會自動跑防禦健檢；更新技能：`git clone --depth 1 https://github.com/xin7355-collab/skl /tmp/skl && python3 /tmp/skl/xin-toolkit/skills/app-bootstrap/scripts/bootstrap_app.py update --target .`
