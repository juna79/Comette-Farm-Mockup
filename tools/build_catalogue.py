"""Turn the weekly Excel order list into data/catalogue.js (merged variants, clean categories).
Usage: python3 -I tools/build_catalogue.py "<path to .xls>"   (needs xlrd)"""
import json, os, re, sys, xlrd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photo_subjects import RULES

SRC = sys.argv[1]
IMG_DIR = __file__.rsplit('/tools/', 1)[0] + '/images'
OUT = __file__.rsplit('/tools/', 1)[0] + '/data/catalogue.js'

CATEGORY = {
    "Vegetable": "Vegetables", "Fruit": "Fruit", "Fruit Berries": "Fruit",
    "Herbs": "Herbs & Salad", "Herbs - Salad": "Herbs & Salad",
    "Herbs (Live)": "Live Plants", "Plants (Live)": "Live Plants",
    "Brown's Cheese": "Dairy, Cheese & Eggs", "Brown's Cheese - Ice-Creams": "Dairy, Cheese & Eggs",
    "Dairy": "Dairy, Cheese & Eggs",
    "Farmers Choice": "Meat & Fish", "Meat": "Meat & Fish", "Meat (Fish)": "Meat & Fish",
    "Meat (Fish) Portions Oven cook For 20 Minutes": "Meat & Fish", "Meat (Pieces)": "Meat & Fish",
    "Meats- Droewors, Tanda": "Meat & Fish",
    "Juice - Kombucha": "Drinks", "Juices": "Drinks", "Mayer's": "Drinks",
    "Kampi Kitchen": "Pantry", "Oil (Cold Pressed Canola)": "Pantry", "Others": "Pantry",
    "Flowers": "Flowers",
}
BRAND = {"Brown's Cheese": "Brown's Cheese", "Brown's Cheese - Ice-Creams": "Brown's Cheese",
         "Farmers Choice": "Farmers Choice", "Mayer's": "Mayer's", "Kampi Kitchen": "Kampi Kitchen"}
ITEM_CAT = {"Eggs": "Dairy, Cheese & Eggs", "Honey": "Pantry", "Tea": "Pantry", "Onion Jam": "Pantry",
            "Hummus": "Dairy, Cheese & Eggs", "Dip": "Dairy, Cheese & Eggs"}
FIX = [("Corriander", "Coriander"), ("Mozarella", "Mozzarella"), ("Brussel Sprouts", "Brussels Sprouts"),
       ("Chillis", "Chillies"), ("Lollo Bioda", "Lollo Biondo"), ("Water Cress", "Watercress"),
       ("Bleu-De-Brun", "Bleu de Brun"), ("Passion (", "Passion Fruit ("), ("Blue Berries", "Blueberries"),
       ("Mountain Oil", "Mountain Oil"), ("Salad Pack) H", "Salad Pack)")]

def tidy(s):
    s = re.sub(r"\s+", " ", s).strip(" .")
    s = re.sub(r"\(\s+", "(", s); s = re.sub(r"\s+\)", ")", s)
    s = re.sub(r"\(\s*\)", "", s)
    return re.sub(r"\s+", " ", s).strip(" .-")

def base_of(name):
    n = name
    ripe = bool(re.search(r"half ripe", n, re.I))
    n = re.sub(r"\(\s*half ripe\s*\)", " ", n, flags=re.I)
    n = re.sub(r"\s*half ripe", "", n, flags=re.I)
    n = re.sub(r"\(\s*by the (piece|pc|kg|packet|punnet)s?\s*\)", " ", n, flags=re.I)
    n = re.sub(r"\s*by the (piece|pc|kg|packet|punnet)s?", "", n, flags=re.I)
    n = re.sub(r"\(\s*(kg|pc|bunch|punnet)\s*\)", " ", n, flags=re.I)
    n = re.sub(r"\s(pc|kg|bunch)$", "", n.strip(), flags=re.I)
    n = re.sub(r"\(\s*\)", "", n)
    return tidy(n), ripe

UNIT = {"Kg's": "kg", "Pieces": "piece", "Bunch": "bunch", "Pack": "pack", "Unit": "unit", "Punnet": "punnet",
        "Litres": "litre", "Jar": "jar", "Bag": "bag", "Bottles": "bottle", "Carton": "carton",
        "Crate": "crate", "Tray": "tray", "Dozen": "dozen"}
# estimated kg per order unit where the sheet charges per kg but sells by piece/bunch/pack (TO CONFIRM)
EST_KG = [("Chicken (Whole)", 2.5), ("Duck (Whole)", 2.5), ("Brie (Whole)", 1.0), ("Ham", 1.0),
          ("Chicken Breast", .5), ("Chicken Thigh", .4), ("Duck Breast", .5), ("Duck Legs", .5),
          ("Salmon Portion", .2), ("Fish Fillet", .3), ("Pumpkin", 2.0), ("Butter Nut", .8),
          ("Cabbage", 1.0), ("Cauliflower", .8), ("Melon (Water)", 3.0), ("Melon (Sweet)", 1.0),
          ("Pineapple", 1.2), ("Paw Paw", 1.0), ("Bananas", 1.0), ("Apples", .2), ("Oranges", .2),
          ("Lemons", .1), ("Limes", .05), ("Tangerines", .1), ("Passion", .05), ("Pears", .2),
          ("Tree Tomatoes", .1), ("Aubergine", .3), ("Broccoli", .4), ("Carrots", .1), ("Celery", .3),
          ("Chayote", .3), ("Courgette", .2), ("Cucumber", .4), ("Kohl Rabi", .3), ("Leeks", .2),
          ("Onions", .15), ("Pepper", .2), ("Potatoes", .2), ("Rhubarb", .3), ("Tomato", .15),
          ("Fennel", .3), ("Garlic", .05), ("Ginger", .1), ("Turmeric", .05), ("Cheese", 1)]
EMOJI = [("Avocado", "🥑"), ("Apple", "🍎"), ("Banana", "🍌"), ("Matoke", "🍌"), ("Plantain", "🍌"), ("Coconut", "🥥"),
         ("Madafu", "🥥"), ("Grape Fruit", "🍊"), ("Grapes", "🍇"), ("Kiwi", "🥝"), ("Lemon", "🍋"), ("Lime", "🍋"),
         ("Mango", "🥭"), ("Melon", "🍈"), ("Orange", "🍊"), ("Tangerine", "🍊"), ("Passion", "🍈"), ("Paw Paw", "🥭"),
         ("Pear", "🍐"), ("Pineapple", "🍍"), ("Pomegranate", "🍎"), ("Tree Tomato", "🍅"), ("Berries", "🫐"),
         ("Blueberr", "🫐"), ("Strawberr", "🍓"), ("Raspberr", "🍓"), ("Tomato", "🍅"), ("Carrot", "🥕"),
         ("Potato", "🥔"), ("Arrow Root", "🥔"), ("Onion", "🧅"), ("Leek", "🧅"), ("Garlic", "🧄"), ("Ginger", "🫚"),
         ("Turmeric", "🫚"), ("Chilli", "🌶️"), ("Chillies", "🌶️"), ("Pepper", "🫑"), ("Maize", "🌽"), ("Corn", "🌽"),
         ("Cucumber", "🥒"), ("Courgette", "🥒"), ("Aubergine", "🍆"), ("Broccoli", "🥦"), ("Cauliflower", "🥦"),
         ("Cabbage", "🥬"), ("Kale", "🥬"), ("Sukuma", "🥬"), ("Spinach", "🥬"), ("Lettuce", "🥬"), ("Rocket", "🥬"),
         ("Beans", "🫛"), ("Peas", "🫛"), ("Mangetout", "🫛"), ("Okra", "🫛"), ("Mushroom", "🍄"),
         ("Pumpkin", "🎃"), ("Butter Nut", "🎃"), ("Beetroot", "🫜"), ("Radish", "🫜"), ("Egg", "🥚"), ("Honey", "🍯"),
         ("Milk", "🥛"), ("Cream", "🥛"), ("Yogurt", "🥛"), ("Cheese", "🧀"), ("Feta", "🧀"), ("Brie", "🧀"),
         ("Gouda", "🧀"), ("Halloumi", "🧀"), ("Camembert", "🧀"), ("Bocconcini", "🧀"), ("Mozzarella", "🧀"),
         ("Paneer", "🧀"), ("Ricotta", "🧀"), ("Mascarpone", "🧀"), ("Ice Cream", "🍨"), ("Cookies", "🍨"),
         ("Biscuit", "🍪"), ("Hummus", "🥣"), ("Dip", "🥣"), ("Chicken", "🍗"), ("Duck", "🦆"), ("Beef", "🥩"),
         ("Pork", "🥩"), ("Ham", "🥓"), ("Bacon", "🥓"), ("Sausage", "🌭"), ("Boerwors", "🌭"), ("Droewors", "🥓"),
         ("Salmon", "🐟"), ("Snapper", "🐟"), ("Fish", "🐟"), ("Prawn", "🦐"), ("Squid", "🦑"), ("Water", "💧"),
         ("Kombucha", "🍵"), ("Juice", "🧃"), ("Oil", "🫒"), ("Tea", "🍵"), ("Jam", "🍓"), ("Marmalade", "🍊"),
         ("Chutney", "🫙"), ("Harissa", "🌶️"), ("Onion Jam", "🧅"), ("Bouquet", "💐"), ("Edible Flowers", "🌸"),
         ("Strawberry", "🍓"), ("Mint", "🌿"), ("Basil", "🌿"), ("Herb", "🌿"), ("Chives", "🌿"), ("Coriander", "🌿"),
         ("Parsley", "🌿"), ("Thyme", "🌿"), ("Sage", "🌿"), ("Rosemary", "🌿"), ("Oregano", "🌿"), ("Marjoram", "🌿"),
         ("Tarragon", "🌿"), ("Watercress", "🌿"), ("Lemon Grass", "🌿"), ("Sorrel", "🌿"), ("Artichoke", "🌱"),
         ("Gooseberry", "🌱"), ("Rhubarb", "🌱"), ("Radish", "🫜"), ("Celery", "🥬"), ("Chayote", "🥒"),
         ("Kohl", "🥬"), ("Fennel", "🌿"), ("Sweet Corn", "🌽"), ("Salad", "🥗"), ("Endive", "🥬")]

def emoji(name, cat):
    for k, e in EMOJI:
        if k.lower() in name.lower(): return e
    return {"Vegetables": "🥬", "Fruit": "🍎", "Herbs & Salad": "🌿", "Live Plants": "🌱",
            "Dairy, Cheese & Eggs": "🧀", "Meat & Fish": "🥩", "Drinks": "🧃", "Pantry": "🫙",
            "Flowers": "💐"}[cat]

def est_kg(base, orderUnit):
    for k, v in EST_KG:
        if k.lower() in base.lower(): return v
    return {"piece": .25, "bunch": .3, "pack": .4}.get(orderUnit, .25)

wb = xlrd.open_workbook(SRC); sh = wb.sheet_by_index(0)
group = ""; rows = []
for r in range(1, sh.nrows):
    g, name, ou, iid, _, _, price, cu = [sh.cell_value(r, c) for c in range(8)]
    g = str(g).strip(); name = str(name).strip()
    if g and not name: group = g; continue
    if not name: continue
    rows.append(dict(group=group, name=name, ou=str(ou).strip(), cu=str(cu).strip(), id=int(iid), price=float(price)))

prods = {}
for it in rows:
    base, ripe = base_of(it["name"])
    for a, b in FIX: base = base.replace(a, b)
    base = tidy(base).replace("Jam- ", "Jam - ")
    if base == "Mangoes": base = "Mangoes (Apple)"
    cat = CATEGORY[it["group"]]
    for k, v in ITEM_CAT.items():
        if base.startswith(k): cat = v
    key = (cat, base)
    p = prods.setdefault(key, dict(name=base, category=cat, brand=BRAND.get(it["group"], ""), variants=[]))
    ou = UNIT.get(it["ou"], it["ou"].lower()); cu = UNIT.get(it["cu"], it["cu"].lower())
    v = dict(sku=it["id"], src=it["name"], unit=ou, price=it["price"], chargeUnit=cu, ripeness="half-ripe" if ripe else "")
    if ou != cu:                      # sold by piece/bunch/pack but priced per kg -> estimate
        v["estKg"] = est_kg(base, ou); v["estimate"] = True
        v["estPrice"] = round(it["price"] * v["estKg"])
    p["variants"].append(v)

out = []
for i, ((cat, base), p) in enumerate(sorted(prods.items(), key=lambda kv: (kv[0][0], kv[0][1].lower()))):
    p["id"] = "p%03d" % (i + 1); p["emoji"] = emoji(base, cat); p["inStock"] = True
    p["slug"] = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")
    subj = next((k for pat, k in RULES if re.search(pat, base)), None)
    if os.path.exists(IMG_DIR + "/" + p["slug"] + ".jpg"): p["img"] = "images/" + p["slug"] + ".jpg"      # owner's own photo wins
    elif subj and os.path.exists(IMG_DIR + "/" + subj + ".jpg"): p["img"] = "images/" + subj + ".jpg"   # sourced stock photo
    out.append(p)
cats = ["Vegetables", "Fruit", "Herbs & Salad", "Dairy, Cheese & Eggs", "Meat & Fish", "Drinks", "Pantry", "Flowers", "Live Plants"]
open(OUT, "w").write("window.CATALOGUE = " + json.dumps(dict(categories=cats, products=out), ensure_ascii=False, indent=1) + ";\n")
print(len(rows), "sheet rows ->", len(out), "products;", sum(1 for p in out for v in p["variants"] if v.get("estimate")), "estimated variants")
for p in out:
    if len(p["variants"]) > 1:
        print(" ", p["category"][:5], "|", p["name"], "->", [(v["unit"], v["ripeness"]) for v in p["variants"]])
