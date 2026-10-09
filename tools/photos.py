"""Source product photos from Wikimedia Commons (free licences only), review them, build images/.
  python3 -I tools/photos.py search  [key ...]   # find candidates -> $WORK/cands.json + thumbs
  python3 -I tools/photos.py sheets  [key ...]   # contact sheets for eyeballing -> $WORK/sheets/
  python3 -I tools/photos.py build               # download picked files (tools/picks.json) -> images/ + credits
WORK = scratch dir (env GG_WORK). Needs pillow."""
import io, json, os, re, sys, time, urllib.parse, urllib.request
from PIL import Image, ImageDraw, ImageFont, ImageOps
sys.path.insert(0, os.path.dirname(__file__))
from photo_subjects import SUBJECTS, RULES
RETRIES = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'retries.json')))
if os.environ.get('GG_RETRY'): SUBJECTS.update(RETRIES)   # GG_RETRY=1 -> use the refined queries

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.environ.get('GG_WORK', '/tmp/gg_work')
API = 'https://commons.wikimedia.org/w/api.php'
UA = {'User-Agent': 'GreensGreensPrototype/0.1 (shop image sourcing script; free-licence images only)'}
OK_LICENSE = re.compile(r'^(cc0|public domain|pd\b|cc[- ]by(-sa)?\b|attribution)', re.I)
BAD_TITLE = re.compile(r'drawing|painting|illustration|diagram|map\b|logo|flag|stamp|poster|plate|herbari|cartoon|sketch|book|engraving|print\b|icon|vector|tile|mosaic|fossil|seed packet|label|menu|recipe|packaging', re.I)

_last = [0.0]
def get(url, binary=False):
    """Polite fetch: >=1.1s between requests, honour 429 Retry-After, a few retries."""
    for i in range(6):
        wait = 1.1 - (time.time() - _last[0])
        if wait > 0: time.sleep(wait)
        _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                d = r.read(); return d if binary else json.loads(d)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(min(int(e.headers.get('Retry-After', 30)) + 5, 120)); continue
            time.sleep(3 * (i + 1))
        except Exception:
            time.sleep(3 * (i + 1))
    raise RuntimeError('fetch failed ' + url)

def search(query, width=480, limit=40):
    p = dict(action='query', format='json', generator='search', gsrnamespace=6, gsrlimit=limit,
             gsrsearch=query + ' filetype:bitmap', prop='imageinfo', iiprop='url|size|mime|extmetadata', iiurlwidth=width,
             iiextmetadatafilter='LicenseShortName|Artist|ImageDescription|ObjectName')
    d = get(API + '?' + urllib.parse.urlencode(p)).get('query', {}).get('pages', {})
    out = []
    for pg in sorted(d.values(), key=lambda x: x.get('index', 99)):
        ii = (pg.get('imageinfo') or [{}])[0]; md = ii.get('extmetadata', {})
        lic = md.get('LicenseShortName', {}).get('value', '')
        if ii.get('mime') != 'image/jpeg' or ii.get('width', 0) < 900 or ii.get('height', 0) < 600: continue
        if not OK_LICENSE.search(lic) or BAD_TITLE.search(pg['title']): continue
        out.append(dict(title=pg['title'], thumb=ii.get('thumburl'), page=ii.get('descriptionurl'), license=lic,
                        author=re.sub(r'<[^>]+>', '', md.get('Artist', {}).get('value', '')).strip()[:120],
                        w=ii['width'], h=ii['height']))
    return out

def score(c, query):
    toks = [t.rstrip('s') for t in re.findall(r'[a-z]+', query.lower()) if len(t) > 2]
    title = c['title'].lower()
    return sum(t in title for t in toks)

def do_search(keys):
    os.makedirs(WORK + '/thumbs', exist_ok=True)
    path = WORK + f"/cands{os.environ.get('GG_SHARD', '')}.json"; cands = json.load(open(path)) if os.path.exists(path) else {}
    for k in keys:
        if k in cands: continue
        try: res = search(SUBJECTS[k])
        except Exception as e: print(k, 'SEARCH FAILED'); continue
        ranked = sorted(enumerate(res), key=lambda x: (-score(x[1], SUBJECTS[k]), x[0]))
        top = [c for _, c in ranked[:4]]
        for i, c in enumerate(top):
            f = f'{WORK}/thumbs/{k}_{i}.jpg'
            try: open(f, 'wb').write(get(c['thumb'], True)); c['file'] = f
            except Exception: c['file'] = None
        cands[k] = top; json.dump(cands, open(path, 'w'), indent=1)
        print(k, len(res), '->', [c['title'][5:45] for c in top])

def load_cands():
    import glob; out = {}
    for f in sorted(glob.glob(WORK + '/cands*.json')): out.update(json.load(open(f)))
    return out

def do_sheets(keys):
    cands = load_cands(); os.makedirs(WORK + '/sheets', exist_ok=True)
    keys = [k for k in keys if k in cands]; per = 5; T = (320, 240); lab = 150
    try: font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 16)
    except Exception: font = ImageFont.load_default()
    for s in range(0, len(keys), per):
        chunk = keys[s:s + per]
        sheet = Image.new('RGB', (lab + 4 * (T[0] + 6), len(chunk) * (T[1] + 6)), 'white'); d = ImageDraw.Draw(sheet)
        for r, k in enumerate(chunk):
            y = r * (T[1] + 6); d.text((6, y + 6), k, fill='black', font=font); d.text((6, y + 28), SUBJECTS[k][:22], fill='#555', font=font)
            for i, c in enumerate(cands[k]):
                if not c.get('file'): continue
                im = ImageOps.fit(Image.open(c['file']).convert('RGB'), T); x = lab + i * (T[0] + 6)
                sheet.paste(im, (x, y)); d.rectangle([x, y, x + 26, y + 24], fill='black'); d.text((x + 8, y + 3), str(i), fill='white', font=font)
        n = s // per + 1; sheet.save(f'{WORK}/sheets/sheet_{n:02d}.jpg', quality=82)
        print(f'sheet_{n:02d}.jpg:', ', '.join(chunk))

def do_build():
    """Download the picked candidates (960px) to images/<subject>.jpg and write images/credits.json.
    tools/picks.json: subject -> [source, index] (source o/n/s = candidate pools in $WORK/allcands.json)."""
    picks = json.load(open(ROOT + '/tools/picks.json')); pools = json.load(open(WORK + '/allcands.json'))
    os.makedirs(ROOT + '/images', exist_ok=True)
    cpath = ROOT + '/images/credits.json'; credits = json.load(open(cpath)) if os.path.exists(cpath) else {}
    for k, v in picks.items():
        if os.path.exists(f'{ROOT}/images/{k}.jpg') and k in credits: continue          # resume
        src, idx = (v[0], v[1]) if v[0] != 'n_alias' else ('n', v[2])
        c = pools[src if v[0] != 'n_alias' else 'n'][k if v[0] != 'n_alias' else v[1]][idx]
        url = re.sub(r'/\d+px-', '/960px-', c['thumb'])
        try: data = get(url, True)
        except RuntimeError: data = get(c['thumb'], True)
        im = ImageOps.fit(Image.open(io.BytesIO(data)).convert('RGB'), (800, 600), centering=(0.5, 0.45))
        im.save(f'{ROOT}/images/{k}.jpg', quality=82, optimize=True, progressive=True)
        credits[k] = dict(title=c['title'][5:], author=c.get('author', ''), license=c.get('license', ''), page=c.get('page', ''))
        json.dump(credits, open(cpath, 'w'), indent=1)
        print('built', k, os.path.getsize(f'{ROOT}/images/{k}.jpg') // 1024, 'KB', flush=True)

if __name__ == '__main__':
    cmd, keys = sys.argv[1], sys.argv[2:] or list(SUBJECTS)
    {'search': do_search, 'sheets': do_sheets}.get(cmd, lambda k: do_build())(keys)
