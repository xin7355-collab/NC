# 第三方素材與程式授權（3D 真人示範）

App 的 3D 功能使用以下第三方素材與程式。每一項的來源、授權、能否商用、能否修改、能否隨 App 公開散布，機器可讀版本在 `assets.json`。
規則：授權不明的素材一律不用；付費素材多半禁止讓使用者下載原始檔，而本網站是公開的，所以只用 MIT、CC0、CC BY 這類允許公開散布的授權。

## 1. 人物模型：Microsoft Rocketbox Avatar Library

- 使用：`3d/models/male.glb`（Sports_Male_04）、`3d/models/female.glb`（Sports_Female_02），以及預覽圖 `male.jpg`、`female.jpg`
- 來源：https://github.com/microsoft/Microsoft-Rocketbox（commit 0943055db6ec570bcef9f2c8b41c9e5467c808f9）
- 授權：MIT（可商用、可修改、可散布；條件是附上下面的著作權與授權聲明）
- 修改內容：FBX 轉 GLB；3ds Max 材質（底色為黑）改成白底 PBR；貼圖縮小並改 JPEG（頭髮透明貼圖改 256 色 PNG）；合併重複頂點；公分換算公尺；腳底貼地。轉檔工具：`tools/build-3d-models.js`
- 女性另外加一根馬尾骨頭 `Bip01_Ponytail`：原檔的馬尾整條綁在頭骨上，躺下（臀橋）時會插進地板。只改骨架和馬尾頂點的蒙皮權重，頂點、貼圖不動，靜止時外觀跟原檔一樣。工具：`tools/glb-add-ponytail.py`

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

## 3. 運動動畫：CMU 動作捕捉資料庫（徒手深蹲、弓箭步）

- 使用：`3d/anims/squat.glb`（86_02）、`3d/anims/lunge.glb`（144_17）
- 來源：https://mocap.cs.cmu.edu/ ；BVH 版由 Bruce Hahne（cgspeed）轉檔，取自 GitHub 鏡像 https://github.com/una-dinosauria/cmu-mocap （commit 09a07f54f3bbb58797325f009282d0b2048a2871）
- 授權：CMU「This dataset of motions is free for all uses.」「You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form.」；FAQ「The motion capture data may be copied, modified, or redistributed without permission.」；轉檔者「I (Bruce) place no additional restrictions on the use of this particular BVH conversion.」
- 致謝（CMU 希望標註）：The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.
- 修改內容：轉到 Rocketbox 骨架、腳鎖定與貼地、可循環；弓箭步的手臂改成自然下垂。轉檔工具：`tools/build-3d-anims.js`

## 4. 運動動畫：Mesh2Motion（伏地挺身）

- 使用：`3d/anims/pushup.glb`
- 來源：https://github.com/Mesh2Motion/mesh2motion-app （commit 1632e1a7e009600500d436628075aa3a0e8b36ac，`static/assets/human/animations/pushup.glb`）
- 授權：CC0（README：「The art assets (3d models, rigs, animations) are all licensed under CC0.」）
- 修改內容：轉到 Rocketbox 骨架、手掌與腳尖固定在地上、可循環

## 5. 自製動畫（棒式、臀橋）

`3d/anims/plank.glb`（趴著 → 撐起 → 撐住 → 放下）、`3d/anims/bridge.glb`（躺好 → 抬臀 → 停住 → 放下）由本專案自製（`tools/build-3d-anims.html`），沒有第三方素材。尚未經專業人員審核，App 內標示「自製草稿・待專業審核」。

## 6. 專業審核資料包的截圖與影片

`3d/review/media/`（截圖 JPEG、影片 MP4）是用上面的人物（Microsoft Rocketbox，MIT）與動畫（CMU 動作捕捉、Mesh2Motion CC0、Kinwell 自製）在 App 的 3D 檢視器裡算圖產生（`tools/build-review.js`），授權與致謝同上；審核資料包頁面（`review/`）底部附素材授權說明。
