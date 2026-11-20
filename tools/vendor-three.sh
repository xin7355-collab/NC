#!/usr/bin/env bash
# 把 3D 執行時需要的 three.js 檔案放進 3d/vendor/three（MIT 授權），並把 import 'three' 改成相對路徑（不需要 import map，舊版 iOS Safari 也能載入）
# 用法：npm pack three@0.187.0 && tar -xzf three-0.187.0.tgz && bash tools/vendor-three.sh package
set -euo pipefail
SRC="${1:?請給 three 套件解開後的資料夾，例如 package}"
DST="$(cd "$(dirname "$0")/.." && pwd)/3d/vendor/three"
VER=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['version'])" "$SRC/package.json")
rm -rf "$DST" && mkdir -p "$DST/build" "$DST/examples/jsm"/{loaders,utils,controls,environments}
cp "$SRC/LICENSE" "$DST/LICENSE"
cp "$SRC/build/three.module.js" "$SRC/build/three.core.js" "$DST/build/"
for f in loaders/GLTFLoader.js utils/BufferGeometryUtils.js utils/SkeletonUtils.js controls/OrbitControls.js environments/RoomEnvironment.js; do
  sed "s#from 'three';#from '../../../build/three.module.js';#" "$SRC/examples/jsm/$f" > "$DST/examples/jsm/$f"
  if grep -q "from 'three'" "$DST/examples/jsm/$f"; then echo "還有沒改到的 import 'three'：$f" >&2; exit 1; fi
done
echo "$VER" > "$DST/VERSION"
echo "three.js $VER → $DST"
