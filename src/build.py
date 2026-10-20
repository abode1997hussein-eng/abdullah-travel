"""Build the one-page site from data.py, in Arabic, Kurdish (Sorani) and English.

python3 -I build.py  ->  ../index.html
"""
import json, os, re, sys
from datetime import date
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import data  # noqa: E402
from tr import T, MISSING  # noqa: E402

SITE_URL = "https://abode1997hussein-eng.github.io/abdullah-travel/"
LANGS = ("ar", "ku", "en")

# معلومات الشركة — كل نص بثلاث لغات
COMPANY = {
    "name": {"ar": "سافر مع عبدالله", "ku": "لەگەڵ عەبدوڵڵا گەشت بکە", "en": "Travel with Abdullah"},
    "phone": "9647713310011",
    "phone_display": "+964 771 331 0011",
    "branches": [
        {"ar": "بغداد - شارع فلسطين - تقاطع الصخرة - مقابل المستشفى الملكي",
         "ku": "بەغدا - شەقامی فەلەستین - چوارڕیانی سەخرە - بەرامبەر نەخۆشخانەی مەلەکی",
         "en": "Baghdad - Palestine Street - Al-Sakhra Intersection - opposite the Royal Hospital",
         "q": "تقاطع الصخرة شارع فلسطين بغداد المستشفى الملكي"},
        {"ar": "بغداد - المنصور - شارع 14 رمضان - بناية العسل",
         "ku": "بەغدا - مەنسوور - شەقامی 14ی ڕەمەزان - باڵەخانەی عەسەل",
         "en": "Baghdad - Al-Mansour - 14 Ramadan Street - Al-Asal Building",
         "q": "بناية العسل شارع 14 رمضان المنصور بغداد"},
    ],
}
for b in COMPANY["branches"]:
    b["map"] = "https://www.google.com/maps/search/?api=1&query=" + quote(b["q"])
    b["embed"] = "https://maps.google.com/maps?q=" + quote(b["q"]) + "&z=16&output=embed"

# أعلام الدول اللي ما إلها رمز بملف البيانات
FLAG_FIX = {"أفغانستان": "af", "شرق أفريقيا (أوغندا – رواندا – كينيا)": "ke", "جيبوتي": "dj", "الكونغو": "cd",
            "بوروندي": "bi", "جزر القمر": "km", "ساحل العاج": "ci", "جنوب السودان": "ss", "موزمبيق": "mz",
            "موريتانيا": "mr", "فيزا شنغن – أوربا": "eu", "جورجيا": "ge", "أذربيجان": "az", "البرازيل": "br",
            "بوليفيا": "bo", "فيزا العراق": "iq", "إجازة سوق دولية": "iq"}

photos = {f[:-5] for f in os.listdir(os.path.join(SITE, "assets/photos")) if f.endswith(".webp")}
flags = {f[:-4] for f in os.listdir(os.path.join(SITE, "assets/flags")) if f.endswith(".svg")}
credits = json.load(open(os.path.join(SITE, "assets/photos/credits.json"), encoding="utf-8"))


def split(s):
    return [x.strip() for x in re.split(r"[;؛\n]+", s or "") if x.strip()]


def price(p):
    """السعر رقم بس، بدون دولار أو دينار."""
    return re.sub(r"\s*(\$|د\.ع|دينار|دولار)\s*", "", p or "").strip()


def groups(L):
    out, by = [], {}
    for r in data.GROUPS:
        if r["ظاهر"] != "نعم":
            continue
        name = r["الوجهة"]
        if name not in by:
            code = r["الرمز"]
            by[name] = {
                "id": "g%d" % len(out), "title": T(name, L), "code": code,
                "kind": "event" if "حفل" in r["النوع"] else "group",
                "region": T(r["المنطقة"] or "حفلات", L),
                "dur": T(r["المدة"], L), "air": T(r["الطيران"], L),
                "dates": [T(x, L) for x in split(r["التواريخ"])],
                "flight": T(r["تفاصيل الطيران"], L), "hotels": T(r["الفنادق"], L),
                "inc": [T(x, L) for x in split(r["يشمل"])],
                "notes": [T(x, L) for x in split(r["ملاحظة"])], "req": [T(x, L) for x in split(r["المتطلبات"])],
                "tickets": [T(x, L) for x in split(r["التذاكر"])],
                "child": price(r["الطفل بدون سرير"]), "infant": price(r["الرضيع"]),
                "img": "assets/photos/%s.webp" % code.lower() if code.lower() in photos else "",
                "opts": [],
            }
            out.append(by[name])
        if r["الفندق"] or r["سعر البيع"]:
            by[name]["opts"].append({"d": T(r["البرنامج"], L), "h1": T(r["الفندق"], L), "h2": T(r["الفندق الثاني"], L),
                                     "loc": T(r["الموقع"], L), "stars": re.sub(r"\D", "", r.get("الفئة", "")),
                                     "rec": r["ينصح به"] == "نعم", "p": price(r["سعر البيع"]), "s": price(r["السنكل"]),
                                     "c": price(r["الطفل بدون سرير"]), "cb": price(r["الطفل بسرير"]), "i": price(r["الرضيع"])})
    return out


def visas(L):
    out, by = [], {}
    for r in data.VISAS:
        c = r["الدولة"]
        if c not in by:
            fl = (r["العلم"] or FLAG_FIX.get(c, "")).lower()
            by[c] = {"c": T(c, L), "ar": c, "region": T(r["المنطقة"] or "أخرى", L),
                     "alias": r["أسماء للبحث"] + " " + c + " " + T(c, "en") + " " + T(c, "ku"),
                     "sub": T(r["تحت الاسم"], L), "flag": "assets/flags/%s.svg" % fl if fl in flags else "",
                     "req": [T(x, L) for x in split(r["المتطلبات"])], "refund": T(r["الاسترجاع"], L), "rows": []}
            out.append(by[c])
        by[c]["rows"].append({"t": T(r["نوع التأشيرة"], L), "d": T(r["مدة الإصدار"], L), "p": price(r["سعر البيع"]),
                              "v": T(r["الصلاحية"], L), "n": T(r["ملاحظات"], L)})
    return out


def fares(L):
    return [{"from": f.get("من", ""), "to": f.get("إلى", ""), "air": T(f.get("الخطوط", ""), L),
             "trip": f.get("النوع", ""), "p": price(f.get("السعر", "")), "n": T(f.get("ملاحظة", ""), L)}
            for f in getattr(data, "FARES", [])]


DATA = {L: {"groups": groups(L), "visas": visas(L), "fares": fares(L)} for L in LANGS}
DATA["company"] = COMPANY
if MISSING:
    print("ترجمة ناقصة (تطلع بالعربي):", *sorted(MISSING), sep="\n  ")

used = sorted({g["code"].lower() for g in DATA["ar"]["groups"] if g["img"]})
credit_line = "، ".join(
    f'<a href="{credits[k]["page"]}" target="_blank" rel="noopener">{credits[k]["title"]}</a> '
    f'({credits[k]["artist"] or "?"}، {credits[k]["license"]})' for k in used if k in credits)

tpl = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
page = (tpl.replace("{{DATA}}", json.dumps(DATA, ensure_ascii=False))
           .replace("{{UPDATED}}", date.today().strftime("%d-%m-%Y"))
           .replace("{{CREDITS}}", credit_line)
           .replace("{{SITE_URL}}", SITE_URL)
           .replace("{{PHONE}}", COMPANY["phone"])
           .replace("{{PHONE_DISPLAY}}", COMPANY["phone_display"]))
left = re.findall(r"\{\{\w+\}\}", page)
assert not left, left
open(os.path.join(SITE, "index.html"), "w", encoding="utf-8").write(page)
print("groups:", len(DATA["ar"]["groups"]), "| visas:", len(DATA["ar"]["visas"]),
      "| fares:", len(DATA["ar"]["fares"]), "| wrote index.html")
