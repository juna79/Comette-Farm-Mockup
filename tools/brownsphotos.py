"""Use Brown's Food Co's own product photos (store.brownsfoodco.com/products.json) for the Brown's cheese range.
Not licence-cleared (prototype). Usage: python3 -I tools/brownsphotos.py <rows.json from the download step>"""
import json, os, sys
from PIL import Image, ImageOps
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = json.load(open(sys.argv[1]))                      # [(title, handle, index, file)]
IDX = {(t, i): f for t, h, i, f in rows}
# our product -> (Brown's product title, image index)
MAP = {
 'Brie Portion 150g': ('Brie', 0), 'Brie (Whole) (Ripened)': ('Brie', 1), 'Camembert 200g': ('Camembert', 0),
 'Cottage Cheese 200g': ('Cottage Cheese 200g', 0), 'Halloumi  200g': ('Halloumi', 0),
 'Feta 200g': ('Feta', 0), 'Feta (Lemon Pepper) 200g': ('Feta', 1),
 'Gouda (Half Cheese) Approx. 1kg': ('GOUDA', 0), 'Gouda (Portion) 200g': ('Aged Gouda', 0), 'Gouda Approx 2Kg': ('Wheel of Gouda Non Plastic Packaging (est. weight 2 kg)', 0),
 'Cheddar (Limuru) 250g': ('Limuru Reserve Cheddar', 0), 'Cheddar (Cheese Love) White 250g': ('Wheel of Traditional Cheddar Non Plastic Packaging (est. weight 2.6 kg)', 0),
 'Bleu de Brun Portion 150g': ("Delia's Blue", 0), 'Bleu de Brun (Half Cheese)': ('Gorgonzola', 0),
 'Mascarpone 200g': ('Mascarpone (200g)', 0), 'Ricotta 420g': ('Ricotta (420g)', 0), 'Paneer 250g': ('Paneer 250 g', 0),
 'Greek Yogurt (250g)': ('Greek Yogurt (250g)', 0), 'Hummus (Chick Peas) 250g': ('Chickpea & Garlic Hummus (200g)', 0),
 'Dip (Smoked Egg Plant) 250g': ('Smoky Eggplant Dip', 0), 'Dip  (whipped Feta) 300g': ('Whipped Feta Dip', 0),
 'Caramel Ice- Cream  500 ml (Tub)': ('Salted Caramel Ice Cream 500 ml', 0), 'Vanilla Bean Ice Cream 500 ml (Tub)': ('Vanilla Bean Ice Cream 500 ml', 0),
 'Vanilla Bean Ice Cream 2L': ('Vanilla Bean Ice Cream 500 ml', 0), 'Cookies And Cream 500ml': ('Cookies & Cream Ice Cream 500 ml', 0),
}
t = open(ROOT + '/data/catalogue.js').read(); cat = json.loads(t[t.index('=') + 1:].rstrip().rstrip(';'))
slug = {}
for p in cat['products']:
    for v in p['variants']: slug[v['src'].strip()] = p['slug']; slug[p['name']] = p['slug']
import re
norm = lambda s: re.sub(r'[^a-z0-9]+', ' ', s.lower()).strip()
bysrc = {norm(k): v for k, v in slug.items()}
sp = json.load(open(ROOT + '/images/sources_web.json')) if os.path.exists(ROOT + '/images/sources_web.json') else {}
for ours, (title, i) in MAP.items():
    s = bysrc.get(norm(ours))
    if not s: print('NOT FOUND', ours); continue
    ImageOps.fit(Image.open(IDX[(title, i)]).convert('RGB'), (800, 600), centering=(0.5, 0.5)).save(f'{ROOT}/images/{s}.jpg', quality=88)
    sp[s] = {'host': 'store.brownsfoodco.com', 'image_url': '', 'title': f"Brown's Food Co – {title}"}; print('ok', s)
json.dump(sp, open(ROOT + '/images/sources_web.json', 'w'), indent=1)
