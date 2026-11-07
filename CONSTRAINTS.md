# Kinwell 品質門檻（CONSTRAINTS）

這份是「夠好才能上線」的底線，用數字寫死，避免改著改著被悄悄放寬。門檻由 Claude 依現況與常見標準先訂（使用者可以改）；**只能收緊，要放寬必須先寫原因並經使用者同意**。`node tests/floor-guard.mjs` 會比對還沒推上 `origin/main` 的改動，發現放寬或刪掉就擋下（`node tests/e2e.js` 最後會自動跑）。

| 規則 | 門檻 | 怎麼驗 |
|---|---|---|
| 端對端測試 | 全部通過；`check(` 數量 ≥ 226（不能刪測試、不能註解掉、不能加 if (false)） | `node tests/e2e.js`、floor-guard |
| 單檔大小 | index.html ≤ 900 KB（現在約 710 KB；iPhone 每次更新都要重新下載） | e2e「品質門檻」 |
| 開 App 速度 | 30 份體檢×40 個「其他項目」比對 ≤ 100 ms（CPU 沒降速；修正前要 1 秒以上）。重資料（5 人、各 300 筆體脂、6 份體檢、12 張保單）CPU 降速 4 倍時載入約 0.9 s、renderAll 約 0.18 s | e2e「品質門檻」 |
| 按鈕都有作用 | 每個按鈕上的 data-* 動作都找得到處理程式（App 用事件委派，按鈕本身沒有 onclick） | e2e「品質門檻」 |
| 文字對比 | 主要色票在深色底、卡片、彈窗、警示框上 ≥ 4.5（WCAG 2.2 AA；停用的選項不受限） | design-qa rendered_audit＋色票計算 |
| 焦點不被遮住 | 用 Tab 移動時，焦點不被頂端分頁列或底部選單蓋住（scroll-padding） | design-qa rendered_audit：BLOCKER ≤ 0 |
| 不安全的寫法 | index.html 不新增 eval、new Function、document.write；使用者資料進畫面一律經 esc() | floor-guard、e2e「惡意備份檔被清洗」 |
| 個資 | 健康與保險資料只存在手機；金鑰不進前端或 repo；使用者給的真實資料不進 repo、不進測試 | guardrails audit 必修 ≤ 0、人工 |
| 防禦準則 | app-guardrails-audit 必修 ≤ 0 | `python3 .claude/skills/app-guardrails-audit/scripts/guardrails_audit.py audit .` |

## 例外

（目前沒有。要加例外：寫一列「編號｜規則｜原因｜到期日」，並在對話中取得使用者同意。）
