"""Product photos picked from web image search (NOT licence-cleared: prototype use only).
Reads the chosen candidates, tiles them to 4:3, writes images/<product-slug>.jpg and images/sources_web.json
(so every web photo can be traced and replaced before launch).  Usage: python3 -I tools/webphotos.py <candidate dir> <collect dir>"""
import io, json, os, sys, urllib.request
import numpy as np, cv2
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAND, COLLECT = sys.argv[1], sys.argv[2]
# product name (as in data/catalogue.js) -> (candidate set, index)
PICK = {
 'Onion Jam 200g': ('onion_generic', 0), 'Biscuits (Cheddar Crackers) 200g': ('cheddar_crackers', 0),
 'Milk (Friesian)': ('milk_glass', 1), 'Milk (Half Cream)': ('milk_plain', 3), 'Milk (Jersey)': ('milk_plain', 2), 'Milk (Skim)': ('milk_plain', 7),
 'Cream': ('cream_jug', 1), 'Cream (0.5 lts)': ('cream_jug', 2),

 'Mountain Oil (1 Litre) Herbal': ('oil', 3), 'Mountain Oil (1 Litre) Pure': ('oil', 3),
 'Tree Tomato Juice': ('tt_juice', 1), 'Water (1 litre) Still': ('water1l', 1), 'Water (500 mls)': ('water500', 7),
 'Oregano': ('oregano', 0), 'Oregano (Live)': ('oregano', 0), 'Rocket': ('rocket', 6), 'Rocket (Live)': ('rocket', 6),
 'Duck (Whole) 2.3 - 2.8kg': ('duck', 1), 'Spinach Italian': ('spinach_leaves', 1),
}
EXTRA = {'Pizella 200g': 'https://greenspoon.co.ke/wp-content/uploads/2022/02/Greenspoon-Pizella-Cheese-Browns-jpg-1024x682.jpg'}
def tile(img, W=800, H=600, pad=.06):
    h, w = img.shape[:2]
    edge = np.concatenate([img[0], img[-1], img[:, 0], img[:, -1]]); bg = np.median(edge, axis=0).astype(np.uint8)
    s = min(W * (1 - 2 * pad) / w, H * (1 - 2 * pad) / h)
    r = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    if np.std(edge.astype(float), axis=0).mean() > 18:           # busy edges: soft blurred backdrop instead of a flat colour
        k = max(W / w, H / h); cover = cv2.resize(img, (int(w * k) + 1, int(h * k) + 1)); oy, ox = (cover.shape[0] - H) // 2, (cover.shape[1] - W) // 2
        out = cv2.GaussianBlur(cover[oy:oy + H, ox:ox + W], (0, 0), 28)
    else:
        out = np.full((H, W, 3), bg, np.uint8)
    y, x = (H - r.shape[0]) // 2, (W - r.shape[1]) // 2
    out[y:y + r.shape[0], x:x + r.shape[1]] = r; return out
t = open(ROOT + '/data/catalogue.js').read(); cat = json.loads(t[t.index('=') + 1:].rstrip().rstrip(';'))
slug = {p['name']: p['slug'] for p in cat['products']}
src_path = ROOT + '/images/sources_web.json'; sources = json.load(open(src_path)) if os.path.exists(src_path) else {}
def save(name, im, origin):
    arr = cv2.cvtColor(np.array(im.convert('RGB')), cv2.COLOR_RGB2BGR)
    cv2.imwrite(f"{ROOT}/images/{slug[name]}.jpg", tile(arr), [cv2.IMWRITE_JPEG_QUALITY, 88]); sources[slug[name]] = origin; print('ok', slug[name])
for name, (key, i) in PICK.items():
    if name not in slug: print('NOT IN CATALOGUE', name); continue
    meta = json.load(open(f'{COLLECT}/{key}.json'))[i]
    save(name, Image.open(f'{CAND}/{key}_{i}.jpg'), {'host': meta['host'], 'image_url': meta['u'], 'title': meta['t']})
for name, url in EXTRA.items():
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=25).read()
    save(name, Image.open(io.BytesIO(data)), {'host': url.split('/')[2], 'image_url': url, 'title': name})
json.dump(sources, open(src_path, 'w'), indent=1)
