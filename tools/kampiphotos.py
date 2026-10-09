"""Kampi Kitchen product photos (via Greenspoon's catalogue, which stocks Kampi). Not licence-cleared: prototype only.
Auto-crops each jar, tiles to 4:3, records sources.  Usage: python3 -I tools/kampiphotos.py <rows.json> (rows: [name, url, file, size])"""
import json, os, re, sys
import cv2, numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = json.load(open(sys.argv[1])); base = os.path.dirname(os.path.abspath(sys.argv[1]))
byname = {r[0]: r for r in rows}
MAP = {  # our product (sheet name) -> Greenspoon/Kampi product
 'Chutney - Mango (500g)': 'Kampi Kitchen Mango Chutney – 450g', 'Chutney - Tomato (500g)': 'Kampi Kitchen Tomato Chutney – 450g',
 'Jam - Blackberry (500 Ml)': 'Kampi Kitchen Blackberry Jam – 340g', 'Jam - Raspberry (500g)': 'Kampi Kitchen Raspberry Jam – 450g',
 'Jam - Strawberry (500g)': 'Kampi Kitchen Strawberry Jam – 450g', 'Marmalade - Orange (500g)': 'Kampi Kitchen Orange Marmalade – 450g',
 'Marmalade - Orange And Lime 500g': 'Kampi Kitchen Orange & Lime Marmalade – 450g',
}
def crop_jar(img, pad=.18):
    h, w = img.shape[:2]; edge = np.concatenate([img[0], img[-1], img[:, 0], img[:, -1]]); bg = np.median(edge, axis=0)
    diff = np.abs(img.astype(float) - bg).sum(axis=2) > 60
    diff[int(h * .93):] = False                                  # ignore the floor shadow/edge at the bottom
    ys, xs = np.where(diff)
    if len(xs) < 50: return img
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max(); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = max(x1 - x0, y1 - y0) * (1 + pad * 2); bw = side * 4 / 3
    X0, Y0 = int(max(0, cx - bw / 2)), int(max(0, cy - side / 2)); X1, Y1 = int(min(w, cx + bw / 2)), int(min(h, cy + side / 2))
    return img[Y0:Y1, X0:X1]
def tile(img, W=800, H=600, pad=.04):
    h, w = img.shape[:2]; edge = np.concatenate([img[0], img[-1], img[:, 0], img[:, -1]]); bgc = np.median(edge, axis=0).astype(np.uint8)
    s = min(W * (1 - 2 * pad) / w, H * (1 - 2 * pad) / h); r = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    out = np.full((H, W, 3), bgc, np.uint8); y, x = (H - r.shape[0]) // 2, (W - r.shape[1]) // 2; out[y:y + r.shape[0], x:x + r.shape[1]] = r; return out
t = open(ROOT + '/data/catalogue.js').read(); cat = json.loads(t[t.index('=') + 1:].rstrip().rstrip(';'))
norm = lambda s: re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip(); bysrc = {}
for p in cat['products']:
    for v in p['variants']: bysrc[norm(v['src'])] = p['slug']
sp = json.load(open(ROOT + '/images/sources_web.json')) if os.path.exists(ROOT + '/images/sources_web.json') else {}
for ours, theirs in MAP.items():
    s = bysrc.get(norm(ours)); r = byname.get(theirs)
    if not s or not r: print('MISSING', ours, theirs); continue
    img = cv2.imread(os.path.join(base, os.path.basename(r[2])))
    cv2.imwrite(f'{ROOT}/images/{s}.jpg', tile(crop_jar(img)), [cv2.IMWRITE_JPEG_QUALITY, 90]); sp[s] = {'host': 'greenspoon.co.ke (Kampi Kitchen)', 'image_url': r[1], 'title': theirs}; print('ok', s)
json.dump(sp, open(ROOT + '/images/sources_web.json', 'w'), indent=1)
