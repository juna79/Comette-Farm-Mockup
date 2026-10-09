"""Second batch of web-search photos: remaining Kampi Kitchen jars (Langata Link Shops / kampikitchen.com) and generic eggs.
Usage: python3 -I tools/extraphotos.py <cand dir> <collect dir>"""
import json, os, re, sys
import cv2, numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAND, COLLECT = sys.argv[1], sys.argv[2]
MAP = {  # our sheet name -> (candidate set, index, crop?)
 'Chutney - Chilli  And Ginger  (500Ml)': ('k_chilligingerchutney', 0, True), 'Jam - Chilli': ('k_chillijam', 0, True), 'Jam- Plum (500g)': ('k_plum', 0, True),
 'Marmalade - Orange and Lemon (500g)': ('k_marmalades', 0, True), 'Marmalade - Orange, Tangerine & Lemon': ('k_marmalades', 5, True),
 'Eggs (15 Pc Pack)': ('e_dozen', 7, False), 'Eggs (By The Tray)': ('e_tray', 9, False), 'Eggs (Free Range)': ('e_basket', 0, False),
}
def crop_obj(img, pad=.16):
    h, w = img.shape[:2]; edge = np.concatenate([img[0], img[-1], img[:, 0], img[:, -1]]); bg = np.median(edge, axis=0)
    m = np.abs(img.astype(float) - bg).sum(axis=2) > 60; ys, xs = np.where(m)
    if len(xs) < 50: return img
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max(); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = max((x1 - x0) * 3 / 4, y1 - y0) * (1 + pad * 2); bw = side * 4 / 3
    return img[int(max(0, cy - side / 2)):int(min(h, cy + side / 2)), int(max(0, cx - bw / 2)):int(min(w, cx + bw / 2))]
def tile(img, W=800, H=600):
    h, w = img.shape[:2]; edge = np.concatenate([img[0], img[-1], img[:, 0], img[:, -1]]); bgc = np.median(edge, axis=0).astype(np.uint8)
    if np.std(edge.astype(float), axis=0).mean() > 18:
        k = max(W / w, H / h); c = cv2.resize(img, (int(w * k) + 1, int(h * k) + 1)); oy, ox = (c.shape[0] - H) // 2, (c.shape[1] - W) // 2; return c[oy:oy + H, ox:ox + W]
    s = min(W / w, H / h); r = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    out = np.full((H, W, 3), bgc, np.uint8); y, x = (H - r.shape[0]) // 2, (W - r.shape[1]) // 2; out[y:y + r.shape[0], x:x + r.shape[1]] = r; return out
t = open(ROOT + '/data/catalogue.js').read(); cat = json.loads(t[t.index('=') + 1:].rstrip().rstrip(';'))
norm = lambda s: re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip(); by = {}
for p in cat['products']:
    for v in p['variants']: by[norm(v['src'])] = p['slug']
sp = json.load(open(ROOT + '/images/sources_web.json'))
for ours, (key, i, crop) in MAP.items():
    s = by.get(norm(ours))
    if not s: print('MISSING', ours); continue
    img = cv2.imread(f'{CAND}/{key}_{i}.jpg'); meta = json.load(open(f'{COLLECT}/{key}.json'))[i]
    cv2.imwrite(f'{ROOT}/images/{s}.jpg', tile(crop_obj(img) if crop else img), [cv2.IMWRITE_JPEG_QUALITY, 90])
    sp[s] = {'host': meta['host'], 'image_url': meta['u'], 'title': meta['t']}; print('ok', s)
json.dump(sp, open(ROOT + '/images/sources_web.json', 'w'), indent=1)
