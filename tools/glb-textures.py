#!/usr/bin/env python3
"""把 GLB 裡的貼圖依用途縮小、改成 JPEG（有透明的保留 PNG），檔案大約小 3–5 倍。
用法：python3 tools/glb-textures.py in.glb out.glb [著作權聲明]   （需要 Pillow：pip install pillow）
規則：身體顏色 2048、頭部顏色 1024、身體法線 1024、頭部法線 512、透明貼圖（頭髮）1024 PNG 256 色。"""
import io, json, struct, sys
from PIL import Image

def read_glb(p):
    b = open(p, 'rb').read(); magic, ver, total = struct.unpack_from('<III', b, 0); assert magic == 0x46546C67 and ver == 2, '不是 GLB 2.0'
    off, js, binc = 12, None, b''
    while off < total:
        ln, typ = struct.unpack_from('<II', b, off); chunk = b[off + 8: off + 8 + ln]; off += 8 + ln
        if typ == 0x4E4F534A: js = json.loads(chunk.decode('utf-8'))
        elif typ == 0x004E4942: binc = chunk
    return js, binc

def write_glb(p, js, binc):
    j = json.dumps(js, ensure_ascii=False, separators=(',', ':')).encode('utf-8'); j += b' ' * (-len(j) % 4); binc += b'\0' * (-len(binc) % 4)
    with open(p, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(binc))); f.write(struct.pack('<II', len(j), 0x4E4F534A)); f.write(j)
        f.write(struct.pack('<II', len(binc), 0x004E4942)); f.write(binc)

def main(src, dst, copyright=None):
    js, binc = read_glb(src); views = js['bufferViews']; role = {}
    if copyright: js.setdefault('asset', {})['copyright'] = copyright   # 授權要求的著作權聲明也寫進檔案本身
    for m in js.get('materials', []):
        name = m.get('name', '').lower(); head = 'head' in name; alpha = m.get('alphaMode') in ('MASK', 'BLEND') or 'opacity' in name
        def mark(t, kind):
            if t is None: return
            img = js['textures'][t['index']]['source']; role[img] = (kind, head, alpha)
        mark(m.get('pbrMetallicRoughness', {}).get('baseColorTexture'), 'color'); mark(m.get('normalTexture'), 'normal')
    new_bytes = {}
    for i, im in enumerate(js.get('images', [])):
        v = views[im['bufferView']]; raw = binc[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
        kind, head, alpha = role.get(i, ('color', False, False)); size = {('color', False): 2048, ('color', True): 1024, ('normal', False): 1024, ('normal', True): 512}[(kind, head)]
        if alpha: size = 1024
        img = Image.open(io.BytesIO(raw)); img.load()
        if max(img.size) > size: img = img.resize((size, size), Image.LANCZOS)
        out = io.BytesIO()
        if alpha: img.convert('RGBA').quantize(256, method=Image.Quantize.FASTOCTREE).save(out, 'PNG', optimize=True); im['mimeType'] = 'image/png'   # 頭髮透明貼圖：256 色調色盤（含透明度）
        else: img.convert('RGB').save(out, 'JPEG', quality=90 if kind == 'normal' else 85, optimize=True, progressive=False); im['mimeType'] = 'image/jpeg'
        new_bytes[im['bufferView']] = out.getvalue()
        print(f'  貼圖 {i}：{kind}{"（頭部）" if head else ""}{"（透明）" if alpha else ""} {len(raw)//1024} KB → {size}px {len(out.getvalue())//1024} KB')
    nb = bytearray()
    for vi, v in enumerate(views):
        data = new_bytes.get(vi) or binc[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
        nb += b'\0' * (-len(nb) % 4); v['byteOffset'] = len(nb); v['byteLength'] = len(data); nb += data
    js['buffers'][0]['byteLength'] = len(nb) + (-len(nb) % 4)
    write_glb(dst, js, bytes(nb))

if __name__ == '__main__': main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
