"""Turn owner-supplied pack shots (images/_originals_branded/, WhatsApp names) into clean 4:3 product tiles.
Removes the Google Lens / magnifier overlay icons, pads onto the photo's own background colour."""
import os, re, sys, json
import cv2, numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = ROOT + '/images/_originals_branded'
T = lambda h, i=None: None
# WhatsApp timestamp (+ optional copy no.) -> product name as it appears in data/catalogue.js
MAP = {
 '4.39.34 PM': 'Biscuits (Rosemary) 200g', '4.39.35 PM (1)': 'Biscuits (Charcoal Crackers) 200g',
 '4.39.35 PM (3)': 'Water (500mls) Carton', '4.39.35 PM': 'Water (Still) 1 Litre (Carton)',
 '4.39.36 PM (1)': 'Salmon Portion (Approx. 200g/Pc)', '4.39.36 PM (2)': 'Water (20 Lts Bottle)',
 '4.39.36 PM (3)': 'Streaky Bacon 400g', '4.39.36 PM (4)': 'Minced Beef (High Grade) 500g',
 '4.39.36 PM': 'Water (Sparkling) 12 x 750ml (Glass) Crate', '4.39.37 PM (1)': 'Droewors (Beef) 55g',
 '4.39.37 PM (2)': 'Premium Pork Sausages 400gms', '4.39.37 PM (4)': 'Mozzarella 200g',
 '4.39.37 PM': 'String (Stick) Cheese 180g', '4.39.38 PM (1)': 'Passion Juice',
 '4.39.38 PM (2)': 'Cream Cheese (Soft) 250g', '4.39.38 PM (3)': 'Bocconcini 250g',
 '4.39.38 PM': 'Mango Juice', '4.39.39 PM (1)': 'Cocktail Juice',
}   # not mapped: 4.39.35 PM (2) amaranth crackers, 4.39.37 PM (3) + 4.39.39 PM beef sausages 1kg (not on the sheet)

def _blob(mask, region):
    """Largest connected blob of `mask` inside `region`, returned as a filled, dilated mask."""
    sub = (mask & region).astype(np.uint8) * 255
    sub = cv2.morphologyEx(sub, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(sub)
    if n < 2: return None
    k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    if st[k, cv2.CC_STAT_AREA] < 300: return None
    cnt, _ = cv2.findContours((lab == k).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = np.zeros(mask.shape, np.uint8); cv2.fillPoly(out, [cv2.convexHull(np.vstack(cnt))], 255)
    return cv2.dilate(out, np.ones((21, 21), np.uint8))

def clean(img):
    h, w = img.shape[:2]; m = np.zeros((h, w), np.uint8)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    # Google Lens icon: translucent dark-grey disc, bottom-left
    reg = np.zeros((h, w), bool); reg[int(h * .68):, :int(w * .20)] = True
    b = _blob((hsv[..., 1] < 75) & (hsv[..., 2] > 35) & (hsv[..., 2] < 150), reg)
    if b is not None: m |= b
    # magnifier glyph, top right
    reg2 = np.zeros((h, w), bool); reg2[:int(h * .28), int(w * .72):] = True
    b = _blob(hsv[..., 2] < 100, reg2)
    if b is not None: m |= b
    return cv2.inpaint(img, m, 7, cv2.INPAINT_TELEA) if m.any() else img

def tile(img, W=800, H=600, pad=.06):
    h, w = img.shape[:2]
    edge = np.concatenate([img[0], img[-1], img[:, 0], img[:, -1]]); bg = np.median(edge, axis=0).astype(np.uint8)
    s = min(W * (1 - 2 * pad) / w, H * (1 - 2 * pad) / h)
    r = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    out = np.full((H, W, 3), bg, np.uint8); y, x = (H - r.shape[0]) // 2, (W - r.shape[1]) // 2
    out[y:y + r.shape[0], x:x + r.shape[1]] = r
    return out

def main():
    t = open(ROOT + '/data/catalogue.js').read(); cat = json.loads(t[t.index('=') + 1:].rstrip().rstrip(';'))
    slug = {p['name']: p['slug'] for p in cat['products']}
    for f in sorted(os.listdir(SRC)):
        m = re.match(r'WhatsApp Image .* at (\d+\.\d+\.\d+\s[AP]M)( \(\d+\))?\.jpe?g$', f)
        if not m: continue
        key = re.sub(r'\s', ' ', m.group(1)) + (m.group(2) or ''); name = MAP.get(key)
        if not name: print('skip', f); continue
        if name not in slug: print('NOT IN CATALOGUE', name); continue
        img = cv2.imread(SRC + '/' + f); out = tile(clean(img))
        cv2.imwrite(f"{ROOT}/images/{slug[name]}.jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 88]); print('ok', slug[name])
main()
