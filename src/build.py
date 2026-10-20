"""Build the one-page site from data.py.

python3 -I build.py  ->  ../index.html
"""
import json, os, re, sys
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import data  # noqa: E402

SITE_URL = "https://abode1997hussein-eng.github.io/abdullah-travel/"

# معلومات الشركة — العناوين والدوام والسوشيال تطلع بالموقع بس إذا انكتبت
COMPANY = {
    "name": "عبدالله حسين علوان",
    "tag": "سفر وسياحة",
    "phone": "9647713310011",
    "phone_display": "+964 771 331 0011",
    "addresses": [],          # مثال: {"title": "الفرع الرئيسي", "text": "بغداد، الكرادة…", "map": "https://maps.app.goo.gl/…"}
    "hours": "",              # مثال: "يومياً من 9 الصبح لحد 9 بالليل"
    "social": {},             # مثال: {"انستغرام": "https://instagram.com/…"}
}

photos = {f[:-5] for f in os.listdir(os.path.join(SITE, "assets/photos")) if f.endswith(".webp")}
flags = {f[:-4] for f in os.listdir(os.path.join(SITE, "assets/flags")) if f.endswith(".svg")}
credits = json.load(open(os.path.join(SITE, "assets/photos/credits.json"), encoding="utf-8"))


def split(s):
    return [x.strip() for x in re.split(r"[;؛\n]+", s or "") if x.strip()]


def groups():
    out, by = [], {}
    for r in data.GROUPS:
        if r["ظاهر"] != "نعم":
            continue
        name = r["الوجهة"]
        if name not in by:
            code = r["الرمز"]
            by[name] = {
                "id": "g%d" % len(out), "title": name, "code": code,
                "kind": "event" if "حفل" in r["النوع"] else "group",
                "region": r["المنطقة"] or "حفلات",
                "dur": r["المدة"], "air": r["الطيران"], "dates": split(r["التواريخ"]),
                "flight": r["تفاصيل الطيران"], "hotels": r["الفنادق"], "inc": split(r["يشمل"]),
                "note": r["ملاحظة"], "req": split(r["المتطلبات"]),
                "child": r["الطفل بدون سرير"], "infant": r["الرضيع"],
                "img": "assets/photos/%s.webp" % code.lower() if code.lower() in photos else "",
                "opts": [],
            }
            out.append(by[name])
        if r["الفندق"] or r["سعر البيع"]:
            by[name]["opts"].append({"h1": r["الفندق"], "h2": r["الفندق الثاني"], "rec": r["ينصح به"] == "نعم",
                                     "p": r["سعر البيع"], "s": r["السنكل"]})
    return out


def visas():
    out, by = [], {}
    for r in data.VISAS:
        c = r["الدولة"]
        if c not in by:
            fl = r["العلم"].lower()
            by[c] = {"c": c, "region": r["المنطقة"] or "أخرى", "alias": r["أسماء للبحث"], "sub": r["تحت الاسم"],
                     "flag": "assets/flags/%s.svg" % fl if fl in flags else "",
                     "req": split(r["المتطلبات"]), "refund": r["الاسترجاع"], "rows": []}
            out.append(by[c])
        by[c]["rows"].append({"t": r["نوع التأشيرة"], "d": r["مدة الإصدار"], "p": r["سعر البيع"],
                              "v": r["الصلاحية"], "n": r["ملاحظات"]})
    return out


G, V = groups(), visas()
used = sorted({g["code"].lower() for g in G if g["img"]})
credit_line = "، ".join(
    f'<a href="{credits[k]["page"]}" target="_blank" rel="noopener">{credits[k]["title"]}</a> '
    f'({credits[k]["artist"] or "مجهول"}، {credits[k]["license"]})' for k in used if k in credits)

tpl = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
page = (tpl.replace("{{DATA}}", json.dumps({"groups": G, "visas": V, "company": COMPANY}, ensure_ascii=False))
           .replace("{{UPDATED}}", date.today().strftime("%d-%m-%Y"))
           .replace("{{CREDITS}}", credit_line)
           .replace("{{SITE_URL}}", SITE_URL)
           .replace("{{NAME}}", COMPANY["name"])
           .replace("{{PHONE}}", COMPANY["phone"])
           .replace("{{PHONE_DISPLAY}}", COMPANY["phone_display"]))
left = re.findall(r"\{\{\w+\}\}", page)
assert not left, left
open(os.path.join(SITE, "index.html"), "w", encoding="utf-8").write(page)
print("groups:", len(G), "| visas:", len(V), "| wrote index.html")
