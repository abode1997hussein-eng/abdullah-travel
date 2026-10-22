"""bot.json: الأسعار اللي يرد بيها بوت الواتساب (whatsapp/worker.js) على الزبائن.

ينبني ويا صفحات كوكل (pages.build_pages)، فالبوت يرد دايماً بنفس أسعار الموقع والأكسل.
كل وجهة إلها «k»: أسماء مبسّطة (بلا همزات وتشكيل) حتى البوت يلكاها لو الزبون كتب «اسطنبول» أو «istanbul» أو «IST».
"""
import json, re

from pages import norm, vname

BOT = "bot.json"
# كلمات عامة ما تميّز وجهة عن وجهة (الزبون يكتبها ويا اسم الدولة)
GENERIC = {"فيزا", "فيزه", "visa", "ڤیزای", "ڤیزا", "تاشيره", "كروب", "رحله"}


def keys(*names):
    out = []
    for n in names:
        for w in re.split(r"[\s،,/()–-]+", n or ""):
            w = norm(w).lower()
            if len(w) >= 2 and w not in out and w not in GENERIC:
                out.append(w)
    return out


def num(x):
    return int(float(x)) if re.fullmatch(r"\d+(\.\d+)?", str(x or "")) else None


def build_bot(site):
    b = getattr(site, "built", {})
    flights = []
    for (o, d), fs in sorted(b.get("routes", {}).items()):
        ow = min((f for f in fs if not f.get("rt")), key=lambda f: f["p"], default=None)
        rt = min((f for f in fs if f.get("rt")), key=lambda f: f["p"], default=None)
        man = [x for x in site.D.get("manual", []) if o in x.get("o", []) and d in x.get("d", [])]
        if not (ow or rt or man):
            continue
        p = site.P.get(d) or [d, "", "", ""]
        fare = lambda f: f and {"p": f["p"], "date": f.get("dep", "")[:10], "ret": f.get("ret", "")[:10], "air": site.airline(f.get("a", ""))}
        flights.append({"o": o, "from": site.city(o), "d": d, "to": site.city(d), "country": site.country(d),
                        "ow": fare(ow), "rt": fare(rt),
                        "manual": [{"air": x.get("a", ""), "ow": x.get("ow"), "rt": x.get("rt"), "iqd": x.get("cur") == "iqd"} for x in man],
                        "url": "flights/" + o.lower() + "-" + d.lower() + ".html",
                        "k": keys(site.city(d), p[1], p[2], d, site.country(d))})
    visas = []
    for path, v, _ in b.get("visas", []):
        rows = [{"t": r.get("t", ""), "d": r.get("d", ""), "p": num(r.get("p")), "v": r.get("v", "")} for r in v.get("rows", [])]
        visas.append({"c": vname(v["c"] + ((" (" + v["sub"] + ")") if v.get("sub") else "")), "rows": rows,
                      "req": v.get("req", []), "url": path, "k": keys(v.get("ar", ""), v.get("alias", ""))})
    tours = []
    for path, g, start in b.get("tours", []):
        tours.append({"t": g["title"], "dur": g.get("dur", ""), "dates": g.get("dates", [])[:4], "p": start,
                      "inc": g.get("inc", []), "url": path, "k": keys(g["title"], g.get("code", ""))})
    return json.dumps({"updated": site.today, "site": site.url, "phone": site.phone, "phone_display": site.phone_d,
                       "flights": flights, "visas": visas, "tours": tours}, ensure_ascii=False, separators=(",", ":"))
