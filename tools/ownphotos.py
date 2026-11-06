"""Owner-supplied product photos -> 800x600 tiles in images/<slug>.jpg.
  python3 tools/ownphotos.py <folder with 8.jpg..27.jpg>
Each entry: slug, source file, crop (fractions l,t,r,b) to drop baked-in captions, mode fill (cover) | fit (whole, on page colour)."""
import os, sys, json
from PIL import Image, ImageOps, ImageFilter, ImageChops
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]; ONLY = set(sys.argv[2:])        # optional: only rebuild these slugs
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
 ('celery',                        35, (0,0,1,1),       'blur@rot'),
 ('potatoes-sweet',                36, (0,0,1,1),       'fill@0.3'),
 ('arrow-root',                    37, (0,0,1,1),       'trim'),
 ('spinach-normal',                38, (0,0,1,1),       'trim'),
 ('coriander',                     39, (0,0,1,1),       'trim'),
 ('onions-white',                  40, (0,0,1,1),       'fill@0.4'),
 ('maize-green-soft',              41, (0,0,1,1),       'fill'),
]
for slug, n, (l,t,r,b), mode in TILES:
    if ONLY and slug not in ONLY: continue
    im = Image.open(f'{SRC}/{n}.jpg').convert('RGB'); w, h = im.size
    im = im.crop((int(l*w), int(t*h), int(r*w), int(b*h)))
    if mode == 'trim':                                                 # white-background shot: cut to the product, centre on white
        bg0 = im.getpixel((3, 3)); diff = ImageChops.difference(im, Image.new('RGB', im.size, bg0)).convert('L').point(lambda v: 255 if v > 28 else 0)
        bb = diff.getbbox(); im = im.crop(bb) if bb else im
        mode = 'fit-exact'
    if mode.startswith('blur'):
        if mode.endswith('rot'): im = im.rotate(90, expand=True)         # a tall bunch lying on a table: turn it to fill a landscape tile                                                 # photo on a table: product over a soft blur of its own scene
        out = ImageOps.fit(im, (800, 600)).filter(ImageFilter.GaussianBlur(35))
        sc = min(760/im.width, 580/im.height); im2 = im.resize((int(im.width*sc), int(im.height*sc)), Image.LANCZOS)
        out.paste(im2, ((800-im2.width)//2, (600-im2.height)//2)); out.save(f'{ROOT}/images/{slug}.jpg', quality=84, optimize=True, progressive=True); print('wrote', slug); continue
    if mode.startswith('fill'):
        cy = float(mode.split('@')[1]) if '@' in mode else 0.5
        out = ImageOps.fit(im, (800, 600), centering=(0.5, cy))
    else:
        px = [im.getpixel(p) for p in [(2,2),(im.width-3,2),(2,im.height-3),(im.width-3,im.height-3)]]
        bg = tuple(sorted(c[i] for c in px)[2] for i in range(3))
        if min(bg) > 215 and mode != 'fit-exact': bg = (250, 250, 250)
        out = Image.new('RGB', (800, 600), bg)
        s = min(760/im.width, 560/im.height); im2 = im.resize((int(im.width*s), int(im.height*s)), Image.LANCZOS)
        out.paste(im2, ((800-im2.width)//2, (600-im2.height)//2))
    out.save(f'{ROOT}/images/{slug}.jpg', quality=84, optimize=True, progressive=True)
    print('wrote', slug)
