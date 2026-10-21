"""Owner-supplied product photos -> 800x600 tiles in images/<slug>.jpg.
  python3 tools/ownphotos.py <folder with 8.jpg..27.jpg>
Each entry: slug, source file, crop (fractions l,t,r,b) to drop baked-in captions, mode fill (cover) | fit (whole, on page colour)."""
import os, sys, json
from PIL import Image, ImageOps
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
TILES = [
 ('strawberries-fresh',            8,  (0,0,1,1),       'fill'),
 ('kombucha-rosemary-mint',        9,  (0,0,1,1),       'fill@0.12'),
 ('kombucha-hibiscus-ginger',      17, (0,0,1,1),       'fill@0.12'),
 ('marmalade-orange-and-lime-500g',16, (0,0.02,1,0.98), 'fit'),
 ('chutney-mango-500g',            13, (0,0.18,1,0.82), 'fit'),
 ('marmalade-orange-and-lemon-500g',12,(0,0.08,1,0.92), 'fit'),
 ('jam-blackberry-500-ml',         22, (0,0.08,1,0.92), 'fit'),
 ('jam-chilli',                    23, (0,0.08,1,0.92), 'fit'),
 ('honey-pure-bundu',              14, (0,0,1,0.86),    'fill'),
 ('honey-pure-bundu-500g',         21, (0,0,1,0.86),    'fill'),
 ('eggs-free-range',               15, (0,0.05,1,0.95), 'fill'),
 ('eggs-15-pc-pack',               27, (0,0,1,0.86),    'fill'),
 ('bouquet-small',                 18, (0,0,1,0.84),    'fit'),
 ('bouquet-large',                 26, (0,0,1,0.885),   'fill'),
 ('strawberries-frozen',           19, (0,0,1,1),       'fit'),
 ('pineapple-juice',               24, (0,0.02,1,0.98), 'fit'),
 ('pineapple-mint-juice',          25, (0,0.04,1,0.98), 'fit'),
]
for slug, n, (l,t,r,b), mode in TILES:
    im = Image.open(f'{SRC}/{n}.jpg').convert('RGB'); w, h = im.size
    im = im.crop((int(l*w), int(t*h), int(r*w), int(b*h)))
    if mode.startswith('fill'):
        cy = float(mode.split('@')[1]) if '@' in mode else 0.5
        out = ImageOps.fit(im, (800, 600), centering=(0.5, cy))
    else:
        px = [im.getpixel(p) for p in [(2,2),(im.width-3,2),(2,im.height-3),(im.width-3,im.height-3)]]
        bg = tuple(sorted(c[i] for c in px)[2] for i in range(3))
        if min(bg) > 215: bg = (250, 250, 250)
        out = Image.new('RGB', (800, 600), bg)
        s = min(760/im.width, 560/im.height); im2 = im.resize((int(im.width*s), int(im.height*s)), Image.LANCZOS)
        out.paste(im2, ((800-im2.width)//2, (600-im2.height)//2))
    out.save(f'{ROOT}/images/{slug}.jpg', quality=84, optimize=True, progressive=True)
    print('wrote', slug)
