"""Brown's / Delia's pack shots from Greenspoon (greenspoon.co.ke WooCommerce store API). Not licence-cleared: prototype only.
Usage: python3 -I tools/greenspoonpacks.py <rows.json>   (rows: [display name, image url, local file])"""
import json, os, re, sys
import cv2, numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = json.load(open(sys.argv[1])); base = os.path.dirname(os.path.abspath(sys.argv[1]))
IDX = {i: r for i, r in enumerate(rows)}
MAP = {  # our sheet name -> index into rows (alphabetical Greenspoon listing)
 'Bleu-De-Brun Portion 150g': 0, 'Bleu-De-Brun (Half Cheese)': 29, 'Brie Portion 150g': 2, 'Camembert 200g': 4, 'Cheddar (Limuru) 250g': 20,
 'Cheddar (Cheese Love) White 250g': 5, 'Cottage Cheese 200g': 8, 'Feta 200g': 11, 'Feta (Lemon Pepper) 200g': 19, 'Gouda (Portion) 200g': 13,
 'Greek Yogurt (250g)': 22, 'Halloumi  200g': 16, 'Pizella 200g': 23, 'Ricotta 420g': 28, 'Sour Cream (250g)': 25,
 'Dip (Smoked Egg Plant) 250g': 24, 'Dip  (whipped Feta) 300g': 27,
 'Caramel Ice- Cream  500 ml (Tub)': 39, 'Chocolate Chip Fudge Ice Cream 500ml (Tub)': 30, 'Cookies And Cream 500ml': 31,
 'Vanilla Bean Ice Cream 500 ml (Tub)': 43, 'Vanilla Bean Ice Cream 2L': 43, 'Chocolate Ice Cream 2L': 34,
}
def crop_obj(img, pad=.22):
    h, w = img.shape[:2]; edge = np.concatenate([img[0], img[-1], img[:, 0], img[:, -1]]); bg = np.median(edge, axis=0)
    m = np.abs(img.astype(float) - bg).sum(axis=2) > 45
    ys, xs = np.where(m)
    if len(xs) < 50: return img
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max(); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = max((x1 - x0) * 3 / 4, y1 - y0) * (1 + pad * 2); bw = side * 4 / 3
    X0, Y0 = int(max(0, cx - bw / 2)), int(max(0, cy - side / 2)); X1, Y1 = int(min(w, cx + bw / 2)), int(min(h, cy + side / 2))
    return img[Y0:Y1, X0:X1]
def tile(img, W=800, H=600):
    h, w = img.shape[:2]; edge = np.concatenate([img[0], img[-1], img[:, 0], img[:, -1]]); bgc = np.median(edge, axis=0).astype(np.uint8)
    s = min(W / w, H / h); r = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    out = np.full((H, W, 3), bgc, np.uint8); y, x = (H - r.shape[0]) // 2, (W - r.shape[1]) // 2; out[y:y + r.shape[0], x:x + r.shape[1]] = r; return out
t = open(ROOT + '/data/catalogue.js').read(); cat = json.loads(t[t.index('=') + 1:].rstrip().rstrip(';'))
norm = lambda s: re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip(); by = {}
for p in cat['products']:
    for v in p['variants']: by[norm(v['src'])] = p['slug']
sp = json.load(open(ROOT + '/images/sources_web.json'))
for ours, i in MAP.items():
    s = by.get(norm(ours))
    if not s: print('MISSING', ours); continue
    n, url, f = IDX[i]; img = cv2.imread(os.path.join(base, os.path.basename(f)))
    cv2.imwrite(f'{ROOT}/images/{s}.jpg', tile(crop_obj(img)), [cv2.IMWRITE_JPEG_QUALITY, 90])
    sp[s] = {'host': 'greenspoon.co.ke', 'image_url': url, 'title': n}; print('ok', s)
json.dump(sp, open(ROOT + '/images/sources_web.json', 'w'), indent=1)
