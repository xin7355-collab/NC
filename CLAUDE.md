# NutriCore：Claude 工作規則

- 回覆一律繁體中文（台灣用語），精簡、行動導向；使用者用 iPhone 操作，介面 Mobile-first。
- **改完、測試通過就直接 commit 並 push 到 `main`**：不開分支、不開 PR、不用再問。推上 `main` 後，GitHub Actions（`.github/workflows/pages-sync.yml`）會同步到 `gh-pages` 並自動發布到 https://xin7355-collab.github.io/NC/ ；不要手動改 `gh-pages`。
- 推之前必跑 `node tests/e2e.js`（全部 PASS 才推）。改到 App 內 AI 提示詞時，跑 `node tests/e2e.js --update-prompts` 同步 `PROMPTS.md`。
- 架構：單檔 `index.html`，沒有建置步驟。健康資料只存在使用者手機（localStorage，圖片在 IndexedDB），不得上傳；任何 API Key 不得進前端或 repo，一律經 `gas/Code.gs` 代理。
- 判讀規則、資料結構、公費篩檢資格見 `PLAN.md`；規則改了要同步更新 `PLAN.md`。
- 外部 API：單一佇列、指數退避、失敗可略過，不可瞬間併發；GAS 寫入用 LockService。
