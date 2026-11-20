# 第三方素材與程式授權（3D 真人示範）

App 的 3D 功能使用以下第三方素材與程式。每一項的來源、授權、能否商用、能否修改、能否隨 App 公開散布，機器可讀版本在 `assets.json`。
規則：授權不明的素材一律不用；付費素材多半禁止讓使用者下載原始檔，而本網站是公開的，所以只用 MIT、CC0、CC BY 這類允許公開散布的授權。

## 1. 人物模型：Microsoft Rocketbox Avatar Library

- 使用：`3d/models/male.glb`（Sports_Male_04）、`3d/models/female.glb`（Sports_Female_02），以及預覽圖 `male.jpg`、`female.jpg`
- 來源：https://github.com/microsoft/Microsoft-Rocketbox（commit 0943055db6ec570bcef9f2c8b41c9e5467c808f9）
- 授權：MIT（可商用、可修改、可散布；條件是附上下面的著作權與授權聲明）
- 修改內容：FBX 轉 GLB；3ds Max 材質（底色為黑）改成白底 PBR；貼圖縮小並改 JPEG（頭髮透明貼圖改 256 色 PNG）；合併重複頂點；公分換算公尺；腳底貼地。轉檔工具：`tools/build-3d-models.js`

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
