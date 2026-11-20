#!/usr/bin/env python3
"""在 Rocketbox 女性模型加一根馬尾骨頭 Bip01_Ponytail（掛在 Bip01_Head 底下）。

原檔的馬尾整條綁在頭骨上：站著沒問題，躺下（臀橋）時會跟著頭一起轉、插進地板。
加一根骨頭後，動畫可以讓馬尾平貼地面；沒有動畫控制時骨頭停在原位，外觀跟原檔一模一樣。
只改骨架（多一個節點、一個反綁定矩陣）和馬尾頂點的蒙皮權重；頂點位置、貼圖、材質都不動。

用法：python3 tools/glb-add-ponytail.py 3d/models/female.glb [輸出檔（預設覆寫輸入檔）]
需要：numpy
"""
import json
import struct
import sys

import numpy as np

NAME = 'Bip01_Ponytail'
BELOW_CM, BEHIND_CM, BLEND_CM = 3.0, 4.0, 5.0   # 頭關節下方 3 公分、後腦後方 4 公分以外＝馬尾；從馬尾根部往下 5 公分內漸進改綁新骨頭
COMP = {5126: '<f4', 5123: '<u2', 5121: 'u1', 5125: '<u4'}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    b = open(path, 'rb').read()
    magic, ver, total = struct.unpack('<4sII', b[:12])
    assert magic == b'glTF' and ver == 2 and total == len(b), '不是 glTF 2.0 的 GLB'
    jl, jt = struct.unpack('<I4s', b[12:20])
    assert jt == b'JSON'
    gj = json.loads(b[20:20 + jl])
    bl, bt = struct.unpack('<I4s', b[20 + jl:28 + jl])
    assert bt == b'BIN\x00'
    return gj, bytearray(b[28 + jl:28 + jl + bl])


def view(gj, binb, i):
    """回傳 accessor 的 (numpy 陣列, 位移, 間距, dtype)；陣列是複本"""
    a = gj['accessors'][i]
    bv = gj['bufferViews'][a['bufferView']]
    dt, n = np.dtype(COMP[a['componentType']]), NCOMP[a['type']]
    st = bv.get('byteStride', dt.itemsize * n)
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    arr = np.array([np.frombuffer(binb, dtype=dt, count=n, offset=off + k * st) for k in range(a['count'])])
    return arr, off, st, dt


def write_back(binb, arr, off, st, dt):
    for k, row in enumerate(arr):
        binb[off + k * st:off + k * st + row.size * dt.itemsize] = row.astype(dt).tobytes()


def main():
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src
    gj, binb = read_glb(src)
    nodes, skin = gj['nodes'], gj['skins'][0]
    if any(n.get('name') == NAME for n in nodes):
        print('已經有馬尾骨頭，不用再加')
        return
    head = next(i for i, n in enumerate(nodes) if n.get('name') == 'Bip01_Head')
    joints = skin['joints']
    jh, jnew = joints.index(head), len(joints)
    prims = gj['meshes'][0]['primitives']
    at = prims[0]['attributes']
    assert all(p['attributes'][k] == at[k] for p in prims for k in ('POSITION', 'JOINTS_0', 'WEIGHTS_0')), '各材質區塊要共用同一份頂點'
    P, *_ = view(gj, binb, at['POSITION'])
    J, joff, jst, jdt = view(gj, binb, at['JOINTS_0'])
    W, woff, wst, wdt = view(gj, binb, at['WEIGHTS_0'])
    ibm_i = skin['inverseBindMatrices']
    IBM, *_ = view(gj, binb, ibm_i)
    assert jnew <= np.iinfo(jdt).max

    # 頂點換到頭骨的座標（單位公分；+X 往頭頂、+Y 往臉的方向、Z 左右）
    Mh = IBM[jh].reshape(4, 4).T.astype(np.float64)
    ph = (Mh @ np.c_[P, np.ones(len(P))].T).T[:, :3]
    dom = J[np.arange(len(J)), W.argmax(1)]
    tail = (dom == jh) & (ph[:, 0] < -BELOW_CM) & (ph[:, 1] < -BEHIND_CM)
    if tail.sum() < 50:
        sys.exit(f'找不到馬尾（只有 {tail.sum()} 個頂點），不處理')
    q = ph[tail]
    root = np.array([-BELOW_CM + 0.5, float(np.median(q[q[:, 0] > -8, 1])), 0.0])
    tip = q[q[:, 0] < q[:, 0].min() + 2].mean(0)

    # 權重：馬尾頂點原本 100% 綁頭骨，依離根部的距離把一部分（5 公分外全部）改綁新骨頭
    s = np.clip((root[0] - ph[:, 0]) / BLEND_CM, 0, 1)
    s = s * s * (3 - 2 * s)
    moved = 0
    for k in np.nonzero(tail)[0]:
        slot = int(np.nonzero(J[k] == jh)[0][0])
        free = [c for c in range(4) if W[k, c] == 0 and c != slot]
        if not free:
            continue
        wh = W[k, slot]
        W[k, slot], W[k, free[0]], J[k, free[0]] = wh * (1 - s[k]), wh * s[k], jnew
        moved += 1
    write_back(binb, J, joff, jst, jdt)
    write_back(binb, W, woff, wst, wdt)

    # 新節點：在頭骨座標裡只平移到馬尾根部（不旋轉）；反綁定矩陣＝ L⁻¹ × 頭骨的反綁定矩陣
    Lm = np.eye(4)
    Lm[:3, 3] = root
    ibm_new = np.linalg.inv(Lm) @ Mh
    nodes.append({'name': NAME, 'matrix': [float(x) for x in Lm.T.reshape(-1)],
                  'extras': {'tip': [float(x) for x in (tip - root)], 'note': 'Kinwell 加的馬尾骨頭（tip＝馬尾末端相對根部，骨頭座標，公分）'}})
    nodes[head].setdefault('children', []).append(len(nodes) - 1)
    joints.append(len(nodes) - 1)

    # 重新排 BIN：反綁定矩陣多一個，其他資料照順序搬，位移重算（4 位元組對齊）
    ia = gj['accessors'][ibm_i]
    ibv = ia['bufferView']
    assert sum(1 for a in gj['accessors'] if a.get('bufferView') == ibv) == 1
    allm = np.vstack([IBM.astype(np.float64), ibm_new.T.reshape(1, 16)]).astype('<f4')
    out = bytearray()
    for i, bv in sorted(enumerate(gj['bufferViews']), key=lambda x: x[1].get('byteOffset', 0)):
        data = allm.tobytes() if i == ibv else binb[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        out += b'\0' * (-len(out) % 4)
        bv['byteOffset'], bv['byteLength'] = len(out), len(data)
        out += data
    out += b'\0' * (-len(out) % 4)
    gj['buffers'][0]['byteLength'] = len(out)
    ia['count'], ia['byteOffset'] = len(allm), 0
    ia['min'], ia['max'] = [float(x) for x in allm.min(0)], [float(x) for x in allm.max(0)]
    ja = gj['accessors'][at['JOINTS_0']]
    if 'max' in ja:
        ja['max'] = [int(x) for x in J.max(0)]
        ja['min'] = [int(x) for x in J.min(0)]

    js = json.dumps(gj, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    js += b' ' * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON') + js)
        f.write(struct.pack('<I4s', len(out), b'BIN\x00') + bytes(out))
    print(f'{dst}：馬尾 {tail.sum()} 個頂點（改權重 {moved} 個），根部 {root.round(1)} 公分，末端方向 {(tip - root).round(1)}；骨架 {len(joints)} 個關節，檔案 {total / 1024:.0f} KB')


if __name__ == '__main__':
    main()
