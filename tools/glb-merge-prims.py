#!/usr/bin/env python3
"""把 GLB 裡「共用同一份頂點、同一個材質」的區塊（primitive）合併成一個，減少手機每格的繪製次數（draw call）。

Rocketbox 轉檔後同一個人物被切成很多小區塊（女性 35 塊、男性 7 塊），其實只有 2～3 種材質。
合併＝把同材質區塊的索引（index）接起來；頂點、貼圖、骨架都不動，畫出來一模一樣。
沒用到的舊索引資料會清掉、BIN 重新排列（4 位元組對齊）。

用法：python3 tools/glb-merge-prims.py 3d/models/female.glb [輸出檔（預設覆寫）]
需要：numpy
"""
import json
import struct
import sys

import numpy as np

COMP = {5121: 'u1', 5123: '<u2', 5125: '<u4'}


def read_glb(path):
    b = open(path, 'rb').read()
    magic, ver, total = struct.unpack('<4sII', b[:12])
    assert magic == b'glTF' and ver == 2 and total == len(b), '不是 glTF 2.0 的 GLB'
    jl, jt = struct.unpack('<I4s', b[12:20])
    assert jt == b'JSON'
    gj = json.loads(b[20:20 + jl])
    bl, bt = struct.unpack('<I4s', b[20 + jl:28 + jl])
    assert bt == b'BIN\x00'
    return gj, bytes(b[28 + jl:28 + jl + bl])


def indices(gj, binb, i):
    a = gj['accessors'][i]
    bv = gj['bufferViews'][a['bufferView']]
    dt = np.dtype(COMP[a['componentType']])
    assert bv.get('byteStride', dt.itemsize) == dt.itemsize, '索引不能有間距'
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return np.frombuffer(binb, dtype=dt, count=a['count'], offset=off).astype(np.uint32)


def main():
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src
    gj, binb = read_glb(src)
    extra = bytearray()   # 新的索引資料先放這裡，最後跟舊資料一起重排
    new_views = []
    before = sum(len(m['primitives']) for m in gj['meshes'])
    for mesh in gj['meshes']:
        groups = {}
        for p in mesh['primitives']:
            assert p.get('mode', 4) == 4 and 'targets' not in p and 'indices' in p, '只處理有索引的三角形、沒有變形目標的區塊'
            key = (p.get('material'), json.dumps(p['attributes'], sort_keys=True))
            groups.setdefault(key, []).append(p)
        merged = []
        # 透明（MASK／BLEND）材質排最後
        def alpha(k):
            m = k[0]
            return 0 if m is None else (1 if gj['materials'][m].get('alphaMode', 'OPAQUE') != 'OPAQUE' else 0)
        for key in sorted(groups, key=lambda k: (alpha(k), list(groups).index(k))):
            ps = groups[key]
            if len(ps) == 1:
                merged.append(ps[0])
                continue
            idx = np.concatenate([indices(gj, binb, p['indices']) for p in ps])
            ct = 5123 if idx.max() < 65536 else 5125
            data = idx.astype('<u2' if ct == 5123 else '<u4').tobytes()
            new_views.append((len(gj['bufferViews']) + len(new_views), len(extra), len(data)))
            extra += data + b'\0' * (-len(data) % 4)
            gj['accessors'].append({'bufferView': new_views[-1][0], 'componentType': ct, 'count': int(idx.size), 'type': 'SCALAR', 'min': [int(idx.min())], 'max': [int(idx.max())]})
            p = dict(ps[0])
            p['indices'] = len(gj['accessors']) - 1
            merged.append(p)
        mesh['primitives'] = merged
    after = sum(len(m['primitives']) for m in gj['meshes'])
    for vi, off, n in new_views:
        gj['bufferViews'].append({'buffer': 0, 'byteOffset': len(binb) + (-len(binb) % 4) + off, 'byteLength': n, 'target': 34963})
    binb = binb + b'\0' * (-len(binb) % 4) + bytes(extra)

    # 清掉沒用到的 accessor 和 bufferView，重新編號
    used_acc = set()
    for m in gj['meshes']:
        for p in m['primitives']:
            used_acc.update(p['attributes'].values())
            used_acc.add(p['indices'])
    for s in gj.get('skins', []):
        if 'inverseBindMatrices' in s:
            used_acc.add(s['inverseBindMatrices'])
    for an in gj.get('animations', []):
        for sm in an['samplers']:
            used_acc.update([sm['input'], sm['output']])
    amap = {o: n for n, o in enumerate(sorted(used_acc))}
    gj['accessors'] = [gj['accessors'][o] for o in sorted(used_acc)]
    for m in gj['meshes']:
        for p in m['primitives']:
            p['attributes'] = {k: amap[v] for k, v in p['attributes'].items()}
            p['indices'] = amap[p['indices']]
    for s in gj.get('skins', []):
        if 'inverseBindMatrices' in s:
            s['inverseBindMatrices'] = amap[s['inverseBindMatrices']]
    for an in gj.get('animations', []):
        for sm in an['samplers']:
            sm['input'], sm['output'] = amap[sm['input']], amap[sm['output']]
    used_bv = {a['bufferView'] for a in gj['accessors'] if 'bufferView' in a} | {im['bufferView'] for im in gj.get('images', []) if 'bufferView' in im}
    order = sorted(used_bv, key=lambda i: gj['bufferViews'][i].get('byteOffset', 0))
    vmap, out = {}, bytearray()
    for n, o in enumerate(order):
        bv = gj['bufferViews'][o]
        data = binb[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        out += b'\0' * (-len(out) % 4)
        bv = dict(bv)
        bv['byteOffset'] = len(out)
        out += data
        vmap[o] = (n, bv)
    out += b'\0' * (-len(out) % 4)
    gj['bufferViews'] = [vmap[o][1] for o in order]
    for a in gj['accessors']:
        if 'bufferView' in a:
            a['bufferView'] = vmap[a['bufferView']][0]
    for im in gj.get('images', []):
        if 'bufferView' in im:
            im['bufferView'] = vmap[im['bufferView']][0]
    gj['buffers'][0]['byteLength'] = len(out)

    js = json.dumps(gj, ensure_ascii=False, separators=(',', ':')).encode('utf8')
    js += b' ' * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON') + js)
        f.write(struct.pack('<I4s', len(out), b'BIN\x00') + bytes(out))
    print(f'{dst}：區塊 {before} → {after}，檔案 {total / 1024:.0f} KB')


if __name__ == '__main__':
    main()
