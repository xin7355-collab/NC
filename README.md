# NutriCore 健康飲食站

家庭健康紀錄＋每日菜單的單頁 App（iPhone 優先），資料只存在手機瀏覽器，不上傳。

- **網址**：https://xin7355-collab.github.io/NC/
- **安裝**：iPhone Safari 開網址 → 分享 → 加入主畫面（避免 Safari 7 天清除資料），並定期在「我的」頁匯出備份。

| 檔案 | 用途 |
|---|---|
| `index.html` | 整個 App（單檔，無金鑰） |
| `icon-180.png` | 加入主畫面的圖示 |
| `PLAN.md` | 架構與判讀規則 |
| `PROMPTS.md` | AI 截圖擷取提示詞（與 App 內相同） |

更新方式：改完 `index.html` 推到 `main`，GitHub Actions 會自動同步到 `gh-pages` 發布，約 1 分鐘後網站更新（手機若看到舊版，關掉分頁重開）。`gh-pages` 分支不要手動改。
