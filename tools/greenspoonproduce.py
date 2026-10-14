"""Distinct photos for imported/local and similar paired produce, taken from Greenspoon's listings (their API: greenspoon.co.ke/wp-json/wc/store/v1/products).
Usage: python3 -I tools/greenspoonproduce.py <rows.json>   (rows: [listing name, image url, local file, size])"""
import json, os, re, sys
import cv2, numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = json.load(open(sys.argv[1])); base = os.path.dirname(os.path.abspath(sys.argv[1]))
byname = {r[0]: r for r in rows}
MAP = {  # shop product -> Greenspoon listing
 'Lemons (Imported)': 'Imported Yellow Lemons – 500g', 'Lemons (Local)': 'Fresh Local Rough Lemons – 500g',
 'Oranges (Imported)': 'Imported Oranges – 1 Piece', 'Oranges (Local)': 'Organic Local Oranges – 1Kg',
 'Tangerines (Imported)': 'Imported Tangerines – 1 Piece',
 'Cucumber (English)': 'Kajiado English Cucumber – Per Piece', 'Cucumber (Local)': 'Narok Local Cucumber – 2 Pieces (Approx. 300g – 500g)',
 'Garlic': 'Imported Garlic – 125g', 'Garlic (Local)': 'Narok Local Garlic – 125g',
 'Potatoes': 'Kinangop Irish Potatoes – 1Kg', 'Potatoes (New)': 'Organic Baby Potatoes – 1Kg',
 'Carrots': 'Organic Carrots – 500g', 'Carrots (Normal)': 'Nyandarua Carrots – 500g',
 'Bananas (Sweet)': 'Meru Sweet Banana – Bunch / Approx. 12 Pieces', 'Bananas Normal': 'Meru Banana Bunch – Approx. 0.8Kg – 1.2Kg',
}
def crop_obj(img, pad=.14):
    h, w = img.shape[:2]; edge = np.concatenate([img[0], img[-1], img[:, 0], img[:, -1]]); bg = np.median(edge, axis=0)
    m = np.abs(img.astype(float) - bg).sum(axis=2) > 45; ys, xs = np.where(m)
    if len(xs) < 50: return img
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max(); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = max((x1 - x0) * 3 / 4, y1 - y0) * (1 + pad * 2); bw = side * 4 / 3
    return img[int(max(0, cy - side / 2)):int(min(h, cy + side / 2)), int(max(0, cx - bw / 2)):int(min(w, cx + bw / 2))]
def tile(img, W=800, H=600):
    h, w = img.shape[:2]; edge = np.concatenate([img[0], img[-1], img[:, 0], img[:, -1]]); bgc = np.median(edge, axis=0).astype(np.uint8)
    s = min(W / w, H / h); r = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    out = np.full((H, W, 3), bgc, np.uint8); y, x = (H - r.shape[0]) // 2, (W - r.shape[1]) // 2; out[y:y + r.shape[0], x:x + r.shape[1]] = r; return out
t = open(ROOT + '/data/catalogue.js').read(); cat = json.loads(t[t.index('=') + 1:].rstrip().rstrip(';'))
slug = {p['name']: p['slug'] for p in cat['products']}
sp = json.load(open(ROOT + '/images/sources_web.json'))
for ours, theirs in MAP.items():
    s = slug.get(ours); r = byname.get(theirs)
    if not s or not r: print('MISSING', ours, '|', theirs); continue
    path = r[2] if os.path.exists(r[2]) else os.path.join(base, 'img', os.path.basename(r[2]))
    img = cv2.imread(path)
    cv2.imwrite(f'{ROOT}/images/{s}.jpg', tile(crop_obj(img)), [cv2.IMWRITE_JPEG_QUALITY, 90]); sp[s] = {'host': 'greenspoon.co.ke', 'image_url': r[1], 'title': theirs}; print('ok', ours, '->', s)
json.dump(sp, open(ROOT + '/images/sources_web.json', 'w'), indent=1)
# point the product list at the new files (a catalogue rebuild also prefers images/<slug>.jpg, so this stays true)
done = {slug[o] for o in MAP if o in slug and MAP[o] in byname}
for p in cat['products']:
    if p['slug'] in done: p['img'] = 'images/%s.jpg' % p['slug']
open(ROOT + '/data/catalogue.js', 'w').write('window.CATALOGUE = ' + json.dumps(cat, ensure_ascii=False, indent=1) + ';\n')
print('catalogue updated for', len(done), 'products')
