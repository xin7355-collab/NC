# 第三方素材與程式授權（3D 真人示範）

App 的 3D 功能使用以下第三方素材與程式。每一項的來源、授權、能否商用、能否修改、能否隨 App 公開散布，機器可讀版本在 `assets.json`。
規則：授權不明的素材一律不用；付費素材多半禁止讓使用者下載原始檔，而本網站是公開的，所以只用 MIT、CC0、CC BY 這類允許公開散布的授權。

## 1. 人物模型：Microsoft Rocketbox Avatar Library

- 使用：四個人物（`3d/models/` 的 GLB 與預覽圖 JPG）
  - `male.glb` 男・短髮＝Sports_Male_04 的身體＋Business_Male_02 的頭
  - `male2.glb` 男・中長髮＝Sports_Male_04 的身體＋Male_Adult_10 的頭
  - `female.glb` 女・馬尾＝Sports_Female_02（原本就是亞洲臉孔）
  - `female2.glb` 女・短髮＝Sports_Female_02 的身體＋Female_Adult_03 的頭
- 來源：https://github.com/microsoft/Microsoft-Rocketbox（commit 0943055db6ec570bcef9f2c8b41c9e5467c808f9；身體在 `Assets/Avatars/Professions/`，Male_Adult_10、Female_Adult_03 在 `Assets/Avatars/Adults/`）
- 授權：MIT（可商用、可修改、可散布；條件是附上下面的著作權與授權聲明）
- 修改內容：FBX 轉 GLB；3ds Max 材質（底色為黑）改成白底 PBR；貼圖縮小並改 JPEG（頭髮透明貼圖改 256 色 PNG）；合併重複頂點；公分換算公尺；腳底貼地；合併同材質區塊（減少繪製次數，外觀不變，`tools/glb-merge-prims.py`）；修正頭部、頭髮跟面方向差太多的頂點法線（原檔打光時頭髮會出現發亮的方塊）。轉檔工具：`tools/build-3d-models.js`
- 換頭（亞洲臉孔）：同性別的 Rocketbox 人物共用同一套 Biped 骨架、頭部網格與頭部 UV 排法，把另一個人物的頭部網格與貼圖逐骨頭對位搬到運動服身體上；脖子接縫用身體原本的脖子補、細三角形縫合，脖子貼圖用身體原本的並在接縫附近漸層對齊膚色。男性不用透明髮片（短髮外觀幾乎一樣）；女・短髮垂在背上的頭髮改綁頭骨。工具：`tools/headswap.js`
- 女性另外加一根馬尾骨頭 `Bip01_Ponytail`：原檔的馬尾整條綁在頭骨上，躺下（臀橋）時會插進地板。只改骨架和馬尾頂點的蒙皮權重，頂點、貼圖不動，靜止時外觀跟原檔一樣（女・短髮只加骨頭、不綁頂點）。工具：`tools/glb-add-ponytail.py`

```
MIT License

Copyright (c) 2020 Microsoft

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 2. 3D 引擎：three.js

- 使用：`3d/vendor/three/`（版本見 `VERSION`；只修改了 `import 'three'` 的路徑）
- 來源：https://github.com/mrdoob/three.js（npm 套件 `three`）
- 授權：MIT

```
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## 3. 運動動畫：CMU 動作捕捉資料庫（徒手深蹲）

- 使用：`3d/anims/squat.glb`（86_02）
- 來源：https://mocap.cs.cmu.edu/ ；BVH 版由 Bruce Hahne（cgspeed）轉檔，取自 GitHub 鏡像 https://github.com/una-dinosauria/cmu-mocap （commit 09a07f54f3bbb58797325f009282d0b2048a2871）
- 授權：CMU「This dataset of motions is free for all uses.」「You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form.」；FAQ「The motion capture data may be copied, modified, or redistributed without permission.」；轉檔者「I (Bruce) place no additional restrictions on the use of this particular BVH conversion.」
- 致謝（CMU 希望標註）：The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.
- 修改內容：轉到 Rocketbox 骨架、腳鎖定與貼地、可循環；上半身依標準動作校正（背打直、前傾不超過 40 度、頭頸中立）。轉檔工具：`tools/build-3d-anims.js`

## 4. 運動動畫：Mesh2Motion（伏地挺身）

- 使用：`3d/anims/pushup.glb`
- 來源：https://github.com/Mesh2Motion/mesh2motion-app （commit 1632e1a7e009600500d436628075aa3a0e8b36ac，`static/assets/human/animations/pushup.glb`）
- 授權：CC0（README：「The art assets (3d models, rigs, animations) are all licensed under CC0.」）
- 修改內容：轉到 Rocketbox 骨架、手掌與腳尖固定在地上、可循環；依標準動作校正手掌位置（肩膀正下方）、手肘角度（往後約 45 度）、頭頸與下降深度

## 5. 自製動畫（棒式、弓箭步、臀橋）

`3d/anims/plank.glb`（趴著 → 撐起 → 撐住 → 放下）、`3d/anims/lunge.glb`（站 → 跨步下蹲 → 推回站直）、`3d/anims/bridge.glb`（躺好 → 抬臀 → 停住 → 放下）由本專案自製（`tools/build-3d-anims.html`），沒有第三方素材。尚未經專業人員審核，App 內標示「自製動畫・待專業審核」。

## 6. 專業審核資料包的截圖與影片

`3d/review/media/`（截圖 JPEG、影片 MP4）是用上面的人物（Microsoft Rocketbox，MIT）與動畫（CMU 動作捕捉、Mesh2Motion CC0、Kinwell 自製）在 App 的 3D 檢視器裡算圖產生（`tools/build-review.js`），授權與致謝同上；審核資料包頁面（`review/`）底部附素材授權說明。
