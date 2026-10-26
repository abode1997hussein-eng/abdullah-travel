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

SITE_URL = "https://abdullah-travel.pages.dev/"  # الرابط القصير (Cloudflare Pages يجيب الموقع من GitHub Pages)
LANGS = ("ar", "ku", "en")

# معلومات الشركة — كل نص بثلاث لغات
COMPANY = {
    "name": {"ar": "سافر مع عبدالله", "ku": "لەگەڵ عەبدوڵڵا گەشت بکە", "en": "Travel with Abdullah"},
    "phone": "9647713310011",
    "phone_display": "0771 331 0011",
    # مواقع الخطوط الرسمية: المسافر يشوف السعر هناك، والحجز يكمل ويانا بالواتساب.
    # الرابط الفاضي ← الشركة ما تطلع لحد ما ينضاف رابطها.
    # عمولة الحجز ويانا: تنضاف على السعر اللي يشوفه المسافر بالمواقع الرسمية
    "fee_fly": 15,    # $ للشخص على تذكرة الطيران
    "fee_hotel": 10,  # $ لليلة على الفندق
    "airlines": [
        {"k": "iraqi", "ar": "الخطوط الجوية العراقية", "ku": "هێڵی ئاسمانی عێراقی", "en": "Iraqi Airways", "url": "https://iraqiairways.com.iq/"},
        {"k": "flybaghdad", "ar": "فلاي بغداد", "ku": "فلای بەغدا", "en": "Fly Baghdad", "url": ""},
        {"k": "qatar", "ar": "الخطوط القطرية", "ku": "قەتەر ئێروەیز", "en": "Qatar Airways", "url": "https://www.qatarairways.com"},
        {"k": "emirates", "ar": "طيران الإمارات", "ku": "ئیمارات", "en": "Emirates", "url": "https://www.emirates.com"},
        {"k": "flydubai", "ar": "فلاي دبي", "ku": "فلای دوبەی", "en": "flydubai", "url": "https://www.flydubai.com"},
        {"k": "turkish", "ar": "الخطوط التركية", "ku": "هێڵی ئاسمانی تورکی", "en": "Turkish Airlines", "url": "https://www.turkishairlines.com"},
        {"k": "airarabia", "ar": "العربية للطيران", "ku": "ئێر عەرەبیا", "en": "Air Arabia", "url": "https://www.airarabia.com"},
        {"k": "royaljordanian", "ar": "الملكية الأردنية", "ku": "ڕۆیاڵ ئوردنی", "en": "Royal Jordanian", "url": "https://www.rj.com"},
        {"k": "egyptair", "ar": "مصر للطيران", "ku": "میسر ئێر", "en": "EgyptAir", "url": "https://www.egyptair.com"},
        {"k": "salamair", "ar": "طيران السلام", "ku": "سەلام ئێر", "en": "SalamAir", "url": "https://www.salamair.com"},
    ],
    "branches": [
        {"ar": "بغداد - شارع فلسطين - تقاطع الصخرة - مقابل المستشفى الملكي",
         "ku": "بەغدا - شەقامی فەلەستین - چوارڕیانی سەخرە - بەرامبەر نەخۆشخانەی مەلەکی",
         "en": "Baghdad - Palestine Street - Al-Sakhra Intersection - opposite the Royal Hospital",
         "q": "تقاطع الصخرة شارع فلسطين بغداد المستشفى الملكي",
         "link": "https://maps.app.goo.gl/sxFwUHWSeYXrePgY9", "ll": "33.3614386,44.4145624"},
        {"ar": "بغداد - المنصور - شارع 14 رمضان - بناية العسل",
         "ku": "بەغدا - مەنسوور - شەقامی 14ی ڕەمەزان - باڵەخانەی عەسەل",
         "en": "Baghdad - Al-Mansour - 14 Ramadan Street - Al-Asal Building",
         "q": "بناية العسل شارع 14 رمضان المنصور بغداد",
         "link": "https://maps.app.goo.gl/zixw9NDUFJ5SEpe7A", "ll": "33.3079758,44.3399773"},
    ],
}
for b in COMPANY["branches"]:
    # الموقع الدقيق من رابط خرائط كوكل اللي دزّه صاحب الشركة
    b["map"] = b["link"]
    b["embed"] = "https://maps.google.com/maps?q=" + b["ll"] + "&z=17&output=embed"

# أعلام الدول اللي ما إلها رمز بملف البيانات
FLAG_FIX = {"أفغانستان": "af", "شرق أفريقيا (أوغندا – رواندا – كينيا)": "ke", "جيبوتي": "dj", "الكونغو": "cd",
            "بوروندي": "bi", "جزر القمر": "km", "ساحل العاج": "ci", "جنوب السودان": "ss", "موزمبيق": "mz",
            "موريتانيا": "mr", "فيزا شنغن – أوربا": "eu", "جورجيا": "ge", "أذربيجان": "az", "البرازيل": "br",
            "بوليفيا": "bo", "فيزا العراق": "iq", "إجازة سوق دولية": "iq"}

# ---------------------------------------------------------------- الأسعار من أكسل الشركة
# python3 -I build.py --sheet book.xlsx  ← الفنادق والمدد والأسعار والتواريخ تنقرا من الأكسل،
# وأي كروب ما انقرا يبقى على بياناته بـ data.py.
OPT_KEYS = ("البرنامج", "الفندق", "الفندق الثاني", "الموقع", "الفئة", "ينصح به", "سعر البيع", "السنكل",
            "الطفل بدون سرير", "الطفل بسرير", "الرضيع")


def upcoming(ds):
    """يشيل التواريخ اللي فاتت؛ إذا كلها فاتت يرجعها مثل ما هي."""
    today = date.today().strftime("%Y%m%d")
    left = [d for d in ds if d[6:] + d[3:5] + d[:2] >= today]
    return left or ds


def apply_sheet(path):
    import sheet
    live, errs, book = sheet.load(path)
    out, seen = [], set()
    for r in data.GROUPS:
        name = r["الوجهة"]
        if name not in live:
            if name not in sheet.TRIED:  # كروب مو من الأكسل يبقى مثل ما هو
                out.append(r)
            continue  # كروب من الأكسل ما انقرا: ما يطلع بأسعار قديمة
        if name in seen:
            continue
        seen.add(name)
        head = {k: v for k, v in r.items() if k not in OPT_KEYS}
        if live[name]["dates"]:
            head["التواريخ"] = "؛".join(upcoming(live[name]["dates"]))
        for i, opt in enumerate(live[name]["rows"]):
            row = data.g(**head) if i == 0 else data.g(الوجهة=name)
            row.update(opt)
            if i == 0:  # سعر الطفل والرضيع العام للكروب ياخذه من أول فندق، وإذا فاضي يبقى القديم
                for k in ("الطفل بدون سرير", "الرضيع"):
                    row[k] = opt.get(k) or r[k]
            out.append(row)
    data.GROUPS[:] = out

    try:
        hs = sheet.hotels(book)
        if hs:
            data.HOTELS[:] = hs
            print("من الأكسل:", len(hs), "فندق")
    except Exception as e:  # noqa: BLE001
        errs.append("فنادق: %s" % e)
    try:
        vs = sheet.visas(book)
        try:
            vs.update(sheet.visas_eu(book))
        except Exception as e:  # noqa: BLE001
            errs.append("فيزا أوربا: %s" % e)
        by = {}
        for v in data.VISAS:
            by.setdefault(v["الدولة"], []).append(v)
        for c, rows in by.items():
            lv = vs.get(c)
            if not lv:
                continue
            if len(lv) != len(rows):
                errs.append("فيزا %s: عدد الأسطر بالأكسل %d والموقع %d، بقت مثل ما هي" % (c, len(lv), len(rows)))
                continue
            for v, (d, p, val) in zip(rows, lv):
                v["سعر البيع"] = p or v["سعر البيع"]
                v["مدة الإصدار"] = d or v["مدة الإصدار"]
                v["الصلاحية"] = val or v["الصلاحية"]
    except Exception as e:  # noqa: BLE001
        errs.append("فيزا: %s" % e)
    print("من الأكسل:", len(live), "كروب")
    for e in errs:
        print("  ما انقرا:", e)


if "--sheet" in sys.argv:
    apply_sheet(sys.argv[sys.argv.index("--sheet") + 1])

photos = {f[:-5] for f in os.listdir(os.path.join(SITE, "assets/photos")) if f.endswith(".webp")}
# جزر 3D مرسومة لكل كروب؛ إذا الجزيرة موجودة تنعرض بدل الصورة الحقيقية
islands = {f[:-5] for f in os.listdir(os.path.join(SITE, "assets/islands")) if f.endswith(".webp")}
HERO = ()  # الواجهة صارت سماء متحركة بطيارات مرسومة، فما بيها صور تحتاج ذكر مصوّر
flags = {f[:-4] for f in os.listdir(os.path.join(SITE, "assets/flags")) if f.endswith(".svg")}
credits = json.load(open(os.path.join(SITE, "assets/photos/credits.json"), encoding="utf-8"))


def split(s):
    return [x.strip() for x in re.split(r"[;؛\n]+", s or "") if x.strip()]


def price(p):
    """السعر رقم بس، بدون دولار أو دينار."""
    return re.sub(r"\s*(\$|د\.ع|دينار|دولار)\s*", "", p or "").strip()


def gprice(p):
    """سعر الكروب: الدولار رقم بس، والدينار يبقى وياه «د.ع» حتى ما ينقرا دولار."""
    return price(p) + (" د.ع" if "د.ع" in (p or "") else "")


AIRPORT = {"GAL": "IST", "HKT": "BKK"}  # رموز الصور اللي مو مطارات ← المطار الحقيقي


def route(name, code, air):
    """BGW ← المطار، مثل بطاقات fly4all. الكروب اللي بلا طيران ما إله مسار."""
    if not air or not code:
        return None
    dest = "SSH" if code == "SPH" and name.startswith("شرم") else "CAI" if code == "SPH" else AIRPORT.get(code, code)
    return ["EBL" if "أربيل" in name else "BGW", dest]


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
                "img": ("assets/islands/%s.webp" % r["الصورة"] if r["الصورة"] in islands else
                        "assets/photos/%s.webp" % r["الصورة"] if r["الصورة"] in photos else ""),
                "route": route(name, code, r["الطيران"]),
                "opts": [],
            }
            out.append(by[name])
        if r["الفندق"] or r["سعر البيع"]:
            by[name]["opts"].append({"d": T(r["البرنامج"], L), "h1": T(r["الفندق"], L), "h2": T(r["الفندق الثاني"], L),
                                     "loc": T(r["الموقع"], L), "stars": re.sub(r"\D", "", r.get("الفئة", "")),
                                     "rec": r["ينصح به"] == "نعم", "p": gprice(r["سعر البيع"]), "s": gprice(r["السنكل"]),
                                     "c": gprice(r["الطفل بدون سرير"]), "cb": gprice(r["الطفل بسرير"]), "i": gprice(r["الرضيع"])})
    # كروب بلا أسعار (تبويبه ما انقرا) ما يطلع، والأرقام تتسلسل من جديد
    out = [g for g in out if g["opts"]]
    for k, g in enumerate(out):
        g["id"] = "g%d" % k
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


def hotels(L):
    return [{"city": T(c, L), "ar": c, "h": T(h, L), "st": st, "d": d, "t": tr, "s": sg, "b": T(b, L)}
            for c, h, st, d, tr, sg, b in data.HOTELS]


def hotel_notes(L):
    return {c: [T(x, L) for x in split(n)] for c, n in data.HOTEL_NOTES.items()}


def fares(L):
    return [{"from": f.get("من", ""), "to": f.get("إلى", ""), "air": T(f.get("الخطوط", ""), L),
             "trip": f.get("النوع", ""), "p": price(f.get("السعر", "")), "n": T(f.get("ملاحظة", ""), L)}
            for f in getattr(data, "FARES", [])]


DATA = {L: {"groups": groups(L), "visas": visas(L), "fares": fares(L), "hotels": hotels(L), "hnotes": hotel_notes(L)} for L in LANGS}
DATA["company"] = COMPANY
# أسعار الطيران الخاصة (العراقية، الإيرانية، ...) من أكسل صاحب الموقع: --prices prices.xlsx
# إذا ما موجود أو ما انقرا، تبقى أسعار العراقية المكتوبة بـdata.py
MANUAL = None
if "--prices" in sys.argv:
    try:
        import prices
        MANUAL = prices.load(sys.argv[sys.argv.index("--prices") + 1])
        DATA["esim"] = prices.esim(sys.argv[sys.argv.index("--prices") + 1])
        DATA["transfers"] = prices.transfers(sys.argv[sys.argv.index("--prices") + 1])
    except Exception as e:  # noqa: BLE001
        print("أسعار الطيران الخاصة ما انقرت:", e)
if not MANUAL:
    MANUAL = [{"a": "الخطوط الجوية العراقية", "o": ["BGW"], "d": c.split("|"), "dn": ar, "ow": ow, "rt": rt, "cur": "iqd", "n": ""}
              for c, ar, en, ow, rt in getattr(data, "IA_FARES", [])]
DATA["manual"] = MANUAL
if MISSING:
    print("ترجمة ناقصة (تطلع بالعربي):", *sorted(MISSING), sep="\n  ")

used = sorted({g["img"].split("/")[-1][:-5] for g in DATA["ar"]["groups"] if "/photos/" in g["img"]} | set(HERO))
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

# صفحات كوكل (طيران، فيزا، كروبات) من نفس البيانات
import pages  # noqa: E402
pages.build_pages(DATA, COMPANY, SITE_URL)
