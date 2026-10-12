# NutriCore 健康飲食站

家庭健康紀錄、今年健檢與疫苗建議、營養師飲食建議與菜單、健身教練課表的單頁 App（iPhone 優先）。健康資料只存在手機瀏覽器，不會上傳。

- **網址**：https://xin7355-collab.github.io/NC/
- **安裝**：iPhone Safari 開網址 → 分享 → 加入主畫面（避免 Safari 7 天清除資料），並定期在「我的」頁匯出備份。

| 檔案 | 用途 |
|---|---|
| `index.html` | 整個 App（單檔，無金鑰） |
| `icon-180.png` | 加入主畫面的圖示 |
| `gas/Code.gs` | 選用的圖片後端（Google Apps Script → Cloudflare Workers AI 免費額度） |
| `tests/e2e.js` | 端對端測試：`node tests/e2e.js` |
| `PLAN.md` | 架構、判讀規則、公費篩檢資格 |
| `PROMPTS.md` | AI 截圖擷取提示詞（與 App 內相同） |
| `CLAUDE.md` | 給 Claude 的工作規則（改完測試通過直接推 `main`） |

**更新方式**：改完 `index.html` 推到 `main`，GitHub Actions 會把版本號（commit 編號）寫進 `APP_VER` 並同步到 `gh-pages` 發布，約 1 分鐘後網站更新。App 每次回到前景會比對線上版本，有新版就自動重新載入（正在填表時改顯示「有新版本」按鈕）。`gh-pages` 分支不要手動改。

## 菜色圖片
- **不用設定**：預設使用 [AI Horde](https://aihorde.net) 社群志工算力（免金鑰），排隊時間依當下人數約 1–10 分鐘。
- **想要 10 秒出圖**（需要電腦操作約 10 分鐘）：
  1. 註冊 Cloudflare（免費），在 My Profile → API Tokens 用「Workers AI」範本建立 Token，並記下帳戶 ID。
  2. 到 [script.google.com](https://script.google.com) 新增專案，貼上 `gas/Code.gs`；專案設定 → 指令碼屬性加入 `CF_ACCOUNT_ID`、`CF_API_TOKEN`（可再加 `DAILY_CAP`，預設每天 60 張，只算成功的張數）。
  3. 部署 → 新增部署作業 → 網頁應用程式（執行身分：我；存取權：所有人），把 `/exec` 網址貼到 App「我的 → 圖片後端」。
  4. 之後 `gas/Code.gs` 有更新時：貼上新程式 → 部署 → 管理部署作業 → 編輯 → 版本選「新版本」（網址不變）。
  - 出錯時 App 會直接說要去哪裡改（例如「還沒設定金鑰」「Token 無效」「網址要用 /exec 結尾」），設定類錯誤不會一直重試。
