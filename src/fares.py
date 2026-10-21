"""أسعار الطيران من Travelpayouts (Aviasales): أرخص الأسعار من مطارات العراق لكل مدن العالم.

TP_TOKEN=... python3 -I fares.py  ->  ../fares.json و ../places.json

fares.json: الأسعار + أسماء الخطوط اللي بيها (al: رمز ← [عربي، إنكليزي]).
places.json: كل مدن العالم اللي بيها مطارات، حتى المسافر يكتب أي مدينة بخانتي «من» و«إلى».

يشتغل بالتحديث التلقائي كل ساعة. التوكن سرّي بـGitHub (TP_TOKEN). العمولة تنضاف على كل سعر.
إذا الطلب فشل كله يبقى fares.json القديم، حتى الموقع ما يطلع فاضي.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "fares.json")
PLACES_OUT = os.path.join(os.path.dirname(HERE), "places.json")
DATA = "https://api.travelpayouts.com/data/%s/%s.json"
API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates"

COMMISSION = 15  # $ تنضاف على سعر الشخص
ORIGINS = ["BGW", "EBL", "BSR", "NJF", "ISU"]
# رموز المدن (المدينة تشمل كل مطاراتها: IST = اسطنبول وصبيحة، THR = طهران)
DESTS = ["IST", "AYT", "TZX", "DXB", "SHJ", "AUH", "DOH", "AMM", "BEY", "CAI", "SSH", "DAM", "MCT",
         "JED", "MED", "KUL", "BKK", "LON", "THR", "MHD", "SYZ", "IFN", "TBS", "BUS", "GYD", "CMB",
         "TUN", "BAH", "KWI", "RUH",
         "BGW", "EBL", "BSR", "NJF", "ISU"]  # الرحلات الداخلية (أكثرها للخطوط العراقية)
PER = 6  # أرخص كم رحلة لكل شهر ونوع (للوجهات الأشهر)
KEEP = 10  # أرخص كم سعر نخلي لكل رحلة
WORLD = 1000  # كل الوجهات: طلب واحد بدون وجهة يرجّع أرخص الرحلات لكل مدن العالم


def months(n=2):
    d = date.today()
    out = []
    for i in range(n):
        m = (d.month - 1 + i) % 12 + 1
        y = d.year + (d.month - 1 + i) // 12
        out.append("%d-%02d" % (y, m))
    return out


def get(token, limit=PER, **q):
    q.update(currency="usd", sorting="price", unique="false", limit=limit, page=1, token=token)
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(q),
                                 headers={"Accept-Encoding": "identity", "X-Access-Token": token})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def main():
    token = os.environ.get("TP_TOKEN", "").strip()
    if not token:
        print("أسعار الطيران: ماكو TP_TOKEN، بقت الأسعار القديمة")
        return
    seen, out, ok, bad = set(), [], 0, 0
    # أولاً كل العالم (بدون وجهة) لـ3 أشهر، وبعدها رحلات أكثر للوجهات الأشهر
    jobs = [(o, None, m, ow, WORLD) for o in ORIGINS for m in months(3) for ow in ("true", "false")]
    jobs += [(o, d, m, ow, PER) for o in ORIGINS for d in DESTS if o != d for m in months() for ow in ("true", "false")]
    for o, d, m, one_way, limit in jobs:
        q = dict(origin=o, departure_at=m, one_way=one_way)
        if d:
            q["destination"] = d
        try:
            res = get(token, limit, **q)
        except urllib.error.HTTPError as e:
            bad += 1
            if e.code == 401 and not ok:
                print("أسعار الطيران: التوكن مرفوض (401). تأكد من TP_TOKEN بإعدادات GitHub. بقت الأسعار القديمة")
                return
            continue
        except Exception as e:  # noqa: BLE001 — وجهة وحدة ما توقف الباقي
            bad += 1
            if bad <= 3:
                print("  خطأ:", o, d, m, e)
            continue
        if not res.get("success", True):
            bad += 1
            continue
        ok += 1
        for f in res.get("data", []):
            fo, fd = f.get("origin") or o, f.get("destination") or d
            if not fd or fo == fd:
                continue
            key = (fo, fd, f.get("airline"), f.get("flight_number"), f.get("departure_at"), f.get("return_at"))
            if key in seen or not f.get("price"):
                continue
            seen.add(key)
            out.append({
                "o": fo, "d": fd, "a": f.get("airline", ""), "n": f.get("flight_number", ""),
                "dep": (f.get("departure_at") or "")[:16], "ret": (f.get("return_at") or "")[:16],
                "tr": f.get("transfers", 0), "rtr": f.get("return_transfers", 0),
                "p": int(round(float(f["price"]))) + COMMISSION, "rt": one_way == "false",
            })
        time.sleep(0.05)
    print("أسعار الطيران: %d طلب ناجح، %d فشل، %d سعر" % (ok, bad, len(out)))
    if not out:
        print("ما رجع ولا سعر، بقت الأسعار القديمة")
        return
    # لكل رحلة (من، إلى، ذهاب أو ذهاب وعودة) أرخص KEEP سعر بس، حتى يبقى الملف خفيف على الموبايل
    groups = {}
    for f in sorted(out, key=lambda f: f["p"]):
        g = groups.setdefault((f["o"], f["d"], f["rt"]), [])
        if len(g) < KEEP:
            g.append(f)
    out = [f for g in groups.values() for f in g]
    out.sort(key=lambda f: (f["o"], f["d"], f["dep"], f["p"]))
    al = {}
    try:
        al = airlines({f["a"] for f in out if f["a"]})
    except Exception as e:  # noqa: BLE001 — الأسعار أهم من الأسماء
        print("  أسماء الخطوط ما نزلت:", e)
    json.dump({"updated": date.today().isoformat(), "commission": COMMISSION, "fares": out, "al": al},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("أسعار الطيران: %d مدينة وصول، %d خطوط" % (len({f["d"] for f in out}), len({f["a"] for f in out})))


def data(lang, name):
    req = urllib.request.Request(DATA % (lang, name), headers={"Accept-Encoding": "identity"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def named(lang, name):
    """{رمز: الاسم} من ملف بيانات Travelpayouts. العربي إذا ما موجود يرجع فاضي."""
    try:
        rows = data(lang, name)
    except Exception:  # noqa: BLE001
        return {}
    out = {}
    for r in rows:
        n = (r.get("name_translations") or {}).get(lang) or r.get("name") or ""
        if r.get("code") and n:
            out[r["code"]] = n.strip()
    return out


def airlines(codes):
    en, ar = named("en", "airlines"), named("ar", "airlines")
    return {c: [ar.get(c, ""), en.get(c, c)] for c in sorted(codes) if c in en or c in ar}


def places():
    """كل مدن العالم اللي بيها مطار رحلات: [رمز، عربي، إنكليزي، رمز الدولة]، وأسماء الدول، ورموز المطارات."""
    cities = data("en", "cities")
    ar = named("ar", "cities")
    c = []
    for r in cities:
        code = r.get("code")
        if not code or r.get("has_flightable_airport") is False:
            continue
        en = (r.get("name_translations") or {}).get("en") or r.get("name") or code
        c.append([code, ar.get(code, ""), en, r.get("country_code") or ""])
    c.sort(key=lambda p: p[2])
    ken, kar = named("en", "countries"), named("ar", "countries")
    k = {cc: [kar.get(cc, ""), ken.get(cc, cc)] for cc in sorted({p[3] for p in c}) if cc}
    a = {}
    try:
        for r in data("en", "airports"):
            if r.get("code") and r.get("city_code") and r["code"] != r["city_code"] and r.get("flightable", True) \
                    and r.get("iata_type", "airport") == "airport":
                a[r["code"]] = r["city_code"]
    except Exception as e:  # noqa: BLE001
        print("  المطارات ما نزلت:", e)
    if len(c) < 500:
        print("مدن العالم: رجع عدد قليل (%d)، بقى الملف القديم" % len(c))
        return
    json.dump({"updated": date.today().isoformat(), "c": c, "k": k, "a": a},
              open(PLACES_OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("مدن العالم: %d مدينة، %d دولة، %d مطار، العربي لـ%d مدينة" % (len(c), len(k), len(a), sum(1 for p in c if p[1])))


if __name__ == "__main__":
    try:
        places()
    except Exception as e:  # noqa: BLE001 — المدن تبقى القديمة
        print("مدن العالم ما نزلت:", e)
    main()
    sys.exit(0)
