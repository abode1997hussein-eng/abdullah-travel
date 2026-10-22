"""صفحات ثابتة لكوكل: صفحة لكل خط طيران، ولكل فيزا، ولكل كروب، وصفحة لكل الوجهات، وsitemap.xml.

تنبني ويا index.html من نفس البيانات (build.py ينادي build_pages)، فتبقى محدثة ويا الأكسل والأسعار.
تجربة على الجهاز من index.html الموجود:  python3 -I pages.py
"""
import html, json, os, re
from datetime import date
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
DIRS = ("flights", "visa", "tours")
HUB = "destinations.html"
GA = "G-VTHF4XVDNT"  # Google Analytics (نفس اللي بـtemplate.html)
FONT = ("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700"
        "&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap")
CSS = """
:root{--bg:#F6F7F9;--card:#FFFFFF;--ink:#111827;--muted:#6B7280;--line:#E3E5EA;--accent:#F26A21;--accent-2:#D9531A;--navy:#123A6B;--ok:#15803D;--chip:#FDE6D8}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 "IBM Plex Sans Arabic","Noto Sans Arabic",Tahoma,sans-serif}
a{color:var(--navy)}
.top{background:var(--navy);color:#fff;padding:14px 16px}
.top a{color:#fff;text-decoration:none;font-weight:700;display:inline-flex;align-items:center;gap:10px}
.top img{width:34px;height:34px}
.wrap{max-width:860px;margin:0 auto;padding:0 16px}
.crumb{font-size:13px;color:var(--muted);margin:16px 0 0}
.crumb a{color:var(--muted)}
h1{font-size:clamp(24px,5vw,34px);line-height:1.35;margin:10px 0 6px;color:var(--navy)}
h2{font-size:20px;margin:28px 0 10px}
.lead{color:var(--muted);margin:0 0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;margin:12px 0}
table{width:100%;border-collapse:collapse;font-size:15px}
th,td{padding:10px 8px;border-bottom:1px solid var(--line);text-align:start;vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:13px}
tr:last-child td{border-bottom:0}
.p{font-weight:700;color:var(--accent-2);white-space:nowrap}
.small{font-size:13px;color:var(--muted)}
.btns{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 20px;border-radius:999px;font-weight:700;text-decoration:none;background:var(--accent);color:#fff}
.btn.wa{background:#25D366}
.btn.ghost{background:var(--card);color:var(--navy);border:1px solid var(--line)}
ul.list{margin:0;padding-inline-start:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.grid a{display:block;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;text-decoration:none;color:var(--ink)}
.grid a b{display:block;color:var(--navy)}
.grid a small{color:var(--muted)}
details{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:8px 0}
summary{font-weight:600;cursor:pointer}
footer{margin:40px 0 0;padding:24px 16px 90px;background:#0B2546;color:#C9D3E0;font-size:14px}
footer a{color:#fff}
.sticky{position:fixed;bottom:12px;inset-inline:12px;display:flex;gap:8px;max-width:600px;margin:0 auto}
.sticky .btn{flex:1;box-shadow:0 10px 24px rgba(0,0,0,.18)}
"""

e = html.escape


def norm(s):
    s = re.sub("[ً-ٟـ]", "", s or "").replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
    return s.replace("ة", "ه").replace("ى", "ي").strip()


def vname(c):
    """«فيزا الإمارات»، بس «فيزا شنغن – أوربا» و«إجازة سوق دولية» تبقى مثل ما هي"""
    return c if re.search("فيزا|إجازة|موعد", c) else "فيزا " + c


def vtitle(c):
    return vname(c) + ("" if "العراق" in c else " من العراق")


def money(n, iqd):
    return ("{:,}".format(int(n)) + " د.ع") if iqd else ("{:,}".format(int(n)) + "$")


def ddmmyyyy(iso):
    return iso[8:10] + "-" + iso[5:7] + "-" + iso[:4] if iso and len(iso) >= 10 else ""


class Site:
    def __init__(self, DATA, company, site_url, fares, places, airl):
        self.D, self.C, self.url = DATA, company, site_url
        self.fares, self.places, self.airl = fares or {}, places or {}, airl or {}
        self.P = {c[0]: c for c in self.places.get("c", [])}
        self.K = self.places.get("k", {})
        self.phone, self.phone_d = company["phone"], company["phone_display"]
        self.today = date.today().isoformat()
        self.urls = []

    # ------------------------------------------------------------ أسماء
    def city(self, code):
        p = self.P.get(code)
        return (p[1] or p[2]) if p else code

    def country(self, code):
        p = self.P.get(code)
        k = self.K.get(p[3]) if p else None
        return (k[0] or k[1]) if k else ""

    def airline(self, code):
        if code in self.airl:
            return self.airl[code]
        a = (self.fares.get("al") or {}).get(code)
        return (a[0] or a[1]) if a else code

    def wa(self, text):
        return "https://wa.me/" + self.phone + "?text=" + quote(text)

    # ------------------------------------------------------------ قالب الصفحة
    def page(self, path, title, desc, crumbs, body, ld=None, wa_text="مرحباً، أريد أحجز"):
        depth = path.count("/")
        up = "../" * depth
        canon = self.url + path
        lds = "".join('<script type="application/ld+json">' + json.dumps(x, ensure_ascii=False) + "</script>" for x in (ld or []))
        crumb = ' › '.join('<a href="' + up + h + '">' + e(n) + '</a>' if h is not None else e(n) for n, h in crumbs)
        bc = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": n, "item": self.url + (h if h is not None else path)}
            for i, (n, h) in enumerate(crumbs)]}
        lds += '<script type="application/ld+json">' + json.dumps(bc, ensure_ascii=False) + "</script>"
        doc = f"""<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(canon)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ar_IQ">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(canon)}">
<meta property="og:image" content="{e(self.url)}img/og.jpg">
<meta name="theme-color" content="#123A6B">
<link rel="icon" href="{up}img/logo/logo-icon.svg">
<script async src="https://www.googletagmanager.com/gtag/js?id={GA}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag("js",new Date());gtag("config","{GA}");
document.addEventListener("click",function(e){{var a=e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href")||"";if(/wa\\.me\\//.test(h))gtag("event","whatsapp_click",{{section:"landing"}});else if(/^tel:/.test(h))gtag("event","call_click",{{section:"landing"}});}},true);</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONT}">
<style>{CSS}</style>
{lds}
</head>
<body>
<header class="top"><div class="wrap"><a href="{up}./"><img src="{up}img/logo/logo-icon.svg" alt="" width="34" height="34">سافر مع عبدالله</a></div></header>
<main class="wrap">
<p class="crumb">{crumb}</p>
{body}
</main>
<footer><div class="wrap">
<p><b>سافر مع عبدالله</b> · تذاكر طيران، كروبات سياحية، وفيزا من العراق لكل العالم.</p>
<p>واتساب واتصال: <a href="tel:+{self.phone}" dir="ltr">{e(self.phone_d)}</a></p>
<p>{"<br>".join(e(b["ar"]) for b in self.C.get("branches", []))}</p>
<p><a href="{up}./">الصفحة الرئيسية</a> · <a href="{up}{HUB}">كل الوجهات والفيز والكروبات</a></p>
<p class="small" style="color:#9FB0C6">الأسعار تتغير حسب التوفر، والسعر النهائي يتأكد وقت الحجز. آخر تحديث: {ddmmyyyy(self.today)}</p>
</div></footer>
<div class="sticky"><a class="btn wa" href="{e(self.wa(wa_text))}" target="_blank" rel="noopener">احجز بالواتساب</a><a class="btn ghost" href="tel:+{self.phone}">اتصل بينا</a></div>
</body>
</html>
"""
        self.out[path] = doc
        self.urls.append(path)

    # ------------------------------------------------------------ الطيران
    def routes(self):
        R = {}
        for f in self.fares.get("fares", []):
            if f.get("o") in self.P and f.get("d") in self.P:
                R.setdefault((f["o"], f["d"]), []).append(f)
        for x in self.D.get("manual", []):
            for o in x.get("o", []):
                d = (x.get("d") or [None])[0]
                if o in self.P and d in self.P:
                    R.setdefault((o, d), [])
        return R

    def flight_page(self, o, d, fl):
        on, dn = self.city(o), self.city(d)
        cn = self.country(d)
        path = "flights/" + o.lower() + "-" + d.lower() + ".html"
        man = [x for x in self.D.get("manual", []) if o in x.get("o", []) and d in x.get("d", [])]
        parts = []
        if man:
            rows = "".join(
                f'<tr><td>{e(x.get("a") or "")}<div class="small">{e(x.get("n") or "")}</div></td>'
                f'<td class="p">{money(x["ow"], x.get("cur") == "iqd") if x.get("ow") else "اسأل بالواتساب"}</td>'
                f'<td class="p">{money(x["rt"], x.get("cur") == "iqd") if x.get("rt") else "اسأل بالواتساب"}</td></tr>' for x in man)
            parts.append(f'<h2>أسعارنا الخاصة من {e(on)} إلى {e(dn)}</h2><div class="card"><table><tr><th>الشركة</th><th>ذهاب فقط</th><th>ذهاب وعودة</th></tr>{rows}</table>'
                         '<p class="small">سعر ثابت للشخص، حسب توفر المقاعد بتاريخك.</p></div>')
        best = {}
        for f in fl:
            k = (f.get("a"), bool(f.get("rt")))
            if k not in best or f["p"] < best[k]["p"]:
                best[k] = f
        if best:
            rows = "".join(
                f'<tr><td>{e(self.airline(f["a"]))}</td><td>{"ذهاب وعودة" if f.get("rt") else "ذهاب فقط"}</td>'
                f'<td><span style="white-space:nowrap">{ddmmyyyy(f.get("dep", ""))}</span>{("<br><span class=small style=white-space:nowrap>العودة " + ddmmyyyy(f["ret"]) + "</span>") if f.get("rt") and f.get("ret") else ""}</td>'
                f'<td style="white-space:nowrap">{"مباشر" if not f.get("tr") else str(f["tr"]) + " توقف"}</td><td class="p">{money(f["p"], False)}</td></tr>'
                for f in sorted(best.values(), key=lambda f: (bool(f.get("rt")), f["p"]))[:12])
            parts.append(f'<h2>أرخص أسعار تذاكر {e(on)} {e(dn)} حسب الشركة</h2><div class="card"><table><tr><th>الشركة</th><th>النوع</th><th>التاريخ</th><th>الرحلة</th><th>من</th></tr>{rows}</table>'
                         '<p class="small">أرخص سعر لقيناه للشخص ويشمل خدمتنا، ويتحدث كل ساعة. السعر النهائي يتأكد وياك بالواتساب وقت الحجز.</p></div>')
        low = [money(x["rt"] or x["ow"], x.get("cur") == "iqd") for x in man if x.get("rt") or x.get("ow")]
        low_f = min((f["p"] for f in fl), default=None)
        price_line = ("تبدي من " + (money(low_f, False) if low_f else low[0])) if (low_f or low) else ""
        visa = self.visa_by_cc.get((self.P[d][3] or "").lower()) if d in self.P else None
        live = "../?from=" + o + "&to=" + d + "&nohello#fly"
        wa_text = f"مرحباً، أريد تذكرة طيران من {on} إلى {dn}"
        body = (f'<h1>تذاكر طيران من {e(on)} إلى {e(dn)}</h1>'
                f'<p class="lead">احجز تذكرتك من {e(on)} إلى {e(dn)}{(" (" + e(cn) + ")") if cn else ""} بأرخص الأسعار وبكل شركات الطيران، ذهاب فقط أو ذهاب وعودة. '
                f'{e(price_line)}{"." if price_line else ""} شوف الأسعار بوقتها واحجز ويانا مباشرة بالواتساب.</p>'
                f'<div class="btns"><a class="btn" href="{e(live)}">شوف الرحلات والأسعار</a>'
                f'<a class="btn wa" href="{e(self.wa(wa_text))}" target="_blank" rel="noopener">احجز بالواتساب</a></div>'
                + "".join(parts) +
                (f'<h2>تحتاج فيزا {e(cn or visa[1]["c"])}؟</h2><p>نطلعلك الفيزا ويا التذكرة. <a href="../{visa[0]}">شوف أسعار {e(vname(visa[1]["c"]))} والأوراق المطلوبة</a>.</p>' if visa else "") +
                f'<h2>أسئلة شائعة</h2>'
                f'<details><summary>شلون أحجز تذكرة من {e(on)} إلى {e(dn)}؟</summary><p>ابحث بالموقع وشوف كل الرحلات بأسعارها، واختار الرحلة واضغط «ثبّت الحجز بالواتساب». نأكد وياك السعر والموعد ونطلعلك التذكرة.</p></details>'
                f'<details><summary>شلون أدفع؟</summary><p>تدفع بزين كاش أو ماستركارد، أو بفروعنا ببغداد.</p></details>'
                f'<details><summary>الأسعار نهائية؟</summary><p>الأسعار تتحدث كل ساعة وتتغير حسب توفر المقاعد، والسعر النهائي يتأكد وياك وقت الحجز.</p></details>')
        faq = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": f"شلون أحجز تذكرة من {on} إلى {dn}؟", "acceptedAnswer": {"@type": "Answer", "text": "ابحث بموقع سافر مع عبدالله، اختار الرحلة، وثبّت الحجز بالواتساب."}},
            {"@type": "Question", "name": "شلون أدفع؟", "acceptedAnswer": {"@type": "Answer", "text": "زين كاش أو ماستركارد، أو بفروعنا ببغداد."}}]}
        self.page(path, f"تذاكر طيران من {on} إلى {dn} | أرخص الأسعار — سافر مع عبدالله",
                  f"أرخص أسعار تذاكر الطيران من {on} إلى {dn} ذهاب فقط وذهاب وعودة، بكل شركات الطيران. {price_line}. احجز بالواتساب {self.phone_d}.".replace(". .", "."),
                  [("الرئيسية", "./"), ("الوجهات", HUB), (f"{on} ← {dn}", None)], body, [faq], wa_text)
        return path, on, dn, price_line

    # ------------------------------------------------------------ الفيزا
    def visa_slug(self, v, used):
        m = re.search(r"/([a-z]{2})\.svg$", v.get("flag") or "")
        s = m.group(1) if m else "v"
        base, i = s, 2
        while s in used:
            s, i = base + str(i), i + 1
        used.add(s)
        return "visa/" + s + ".html"

    def visa_page(self, path, v, i):
        rows = "".join(f'<tr><td>{e(r.get("t", ""))}{"<div class=small>" + e(r["n"]) + "</div>" if r.get("n") else ""}</td>'
                       f'<td>{e(r.get("d", ""))}</td><td>{e(r.get("v", ""))}</td><td class="p">{e(r.get("p", ""))}{"$" if r.get("p") else ""}</td></tr>'
                       for r in v.get("rows", []))
        req = "".join("<li>" + e(r) + "</li>" for r in v.get("req", []))
        cheapest = min((float(r["p"]) for r in v.get("rows", []) if re.fullmatch(r"\d+(\.\d+)?", str(r.get("p", "")))), default=None)
        c = v["c"] + ((" (" + v["sub"] + ")") if v.get("sub") else "")
        wa_text = "مرحباً، أريد " + vname(c)
        body = (f'<h1>{e(vtitle(c))}</h1>'
                f'<p class="lead">نطلعلك {e(vname(c))} من بغداد ولكل المحافظات. هنا الأسعار، والمدة، والأوراق المطلوبة'
                f'{"، والسعر يبدي من " + str(int(cheapest)) + "$" if cheapest else ""}.</p>'
                f'<div class="btns"><a class="btn" href="../?visa={i}&nohello#visa">قدّم على الفيزا</a>'
                f'<a class="btn wa" href="{e(self.wa(wa_text))}" target="_blank" rel="noopener">اسأل بالواتساب</a></div>'
                + (f'<h2>أسعار {e(vname(v["c"]))}</h2><div class="card"><table><tr><th>النوع</th><th>مدة الإصدار</th><th>الصلاحية</th><th>السعر</th></tr>{rows}</table></div>' if rows else "")
                + (f'<h2>الأوراق المطلوبة</h2><div class="card"><ul class="list">{req}</ul></div>' if req else "")
                + (f'<p class="small">{e(v["refund"])}</p>' if v.get("refund") else ""))
        self.page(path, f"{vtitle(c)} — الأسعار والأوراق المطلوبة | سافر مع عبدالله",
                  f"أسعار {vtitle(c)}، مدة الإصدار، والأوراق المطلوبة. قدّم ويانا وتابع طلبك بالواتساب {self.phone_d}.",
                  [("الرئيسية", "./"), ("الوجهات", HUB), (vname(c), None)], body, None, wa_text)
        return c, cheapest

    # ------------------------------------------------------------ الكروبات
    def tour_page(self, path, g):
        opts = "".join(f'<tr><td>{e(o.get("h1", ""))}{(" + " + e(o["h2"])) if o.get("h2") else ""}{"<div class=small>" + e(o["d"]) + "</div>" if o.get("d") else ""}</td>'
                       f'<td class="p">{e(o.get("p", ""))}{"$" if o.get("p") else ""}</td><td>{e(o.get("s", ""))}{"$" if o.get("s") else ""}</td></tr>'
                       for o in g.get("opts", []))
        li = lambda xs: "".join("<li>" + e(x) + "</li>" for x in xs)
        wa_text = "مرحباً، أريد أحجز كروب " + g["title"]
        prices = [float(o["p"]) for o in g.get("opts", []) if re.fullmatch(r"\d+(\.\d+)?", str(o.get("p", "")))]
        start = int(min(prices)) if prices else None
        body = (f'<h1>كروب {e(g["title"])} من بغداد</h1>'
                f'<p class="lead">{e(g.get("dur", ""))}{" · " + e(g["air"]) if g.get("air") else ""}{" · السعر يبدي من " + str(start) + "$ للشخص" if start else ""}.</p>'
                f'<div class="btns"><a class="btn" href="../?go={e(g["id"])}&nohello#groups">شوف تفاصيل الكروب</a>'
                f'<a class="btn wa" href="{e(self.wa(wa_text))}" target="_blank" rel="noopener">احجز بالواتساب</a></div>'
                + (f'<h2>المواعيد</h2><div class="card"><ul class="list">{li(g["dates"])}</ul>{"<p class=small>" + e(g["flight"]) + "</p>" if g.get("flight") else ""}</div>' if g.get("dates") else "")
                + (f'<h2>الفنادق والأسعار</h2><div class="card"><table><tr><th>الفندق</th><th>للشخص</th><th>السنكل</th></tr>{opts}</table>'
                   f'{"<p class=small>الطفل " + e(g["child"]) + "$ · الرضيع " + e(g["infant"]) + "$</p>" if g.get("child") or g.get("infant") else ""}</div>' if opts else "")
                + (f'<h2>يشمل</h2><div class="card"><ul class="list">{li(g["inc"])}</ul></div>' if g.get("inc") else "")
                + (f'<h2>ملاحظات</h2><div class="card"><ul class="list">{li(g["notes"])}</ul></div>' if g.get("notes") else "")
                + (f'<h2>الأوراق المطلوبة</h2><div class="card"><ul class="list">{li(g["req"])}</ul></div>' if g.get("req") else ""))
        self.page(path, f"كروب {g['title']} من بغداد {g.get('dur', '')} | سافر مع عبدالله".replace("  ", " "),
                  f"كروب سياحي إلى {g['title']} من بغداد: {g.get('dur', '')}، الطيران والفندق والاستقبال. {('يبدي من ' + str(start) + '$. ') if start else ''}احجز بالواتساب {self.phone_d}.",
                  [("الرئيسية", "./"), ("الوجهات", HUB), ("كروب " + g["title"], None)], body, None, wa_text)
        return start

    # ------------------------------------------------------------ الكل
    def build(self):
        self.out = {}
        ar = self.D.get("ar", {})
        used, visas = set(), []
        self.visa_by_cc = {}
        for i, v in enumerate(ar.get("visas", [])):
            path = self.visa_slug(v, used)
            visas.append((path, v, i))
            cc = path[5:7]
            if not v.get("sub") and cc not in self.visa_by_cc and len(path) == 12:
                self.visa_by_cc[cc] = (path, v)
        fl = []
        R = self.routes()
        for (o, d), fs in sorted(R.items(), key=lambda kv: (kv[0][0] != "BGW", kv[0])):
            fl.append(self.flight_page(o, d, fs))
        vl = [(p, *self.visa_page(p, v, i)) for p, v, i in visas]
        tl, seen = [], set()
        for g in ar.get("groups", []):
            s = re.sub(r"[^a-z0-9]+", "-", (g.get("code") or g.get("id") or "").lower()).strip("-") or g.get("id", "g")
            base, k = s, 2
            while s in seen:
                s, k = base + "-" + str(k), k + 1
            seen.add(s)
            path = "tours/" + s + ".html"
            tl.append((path, g, self.tour_page(path, g)))
        # صفحة كل الوجهات
        by_o = {}
        for p, on, dn, pl in fl:
            by_o.setdefault(on, []).append((p, dn, pl))
        body = ('<h1>كل الوجهات: طيران، فيزا، وكروبات</h1><p class="lead">اختار وجهتك وشوف الأسعار والتفاصيل، واحجز ويانا بالواتساب.</p>'
                + "".join(f'<h2>طيران من {e(on)}</h2><div class="grid">' + "".join(
                    f'<a href="{p}"><b>{e(on)} ← {e(dn)}</b><small>{e(pl)}</small></a>' for p, dn, pl in xs) + "</div>" for on, xs in by_o.items())
                + '<h2>الكروبات السياحية</h2><div class="grid">' + "".join(
                    f'<a href="{p}"><b>كروب {e(g["title"])}</b><small>{e(g.get("dur", ""))}{" · من " + str(s) + "$" if s else ""}</small></a>' for p, g, s in tl) + "</div>"
                + '<h2>الفيزا</h2><div class="grid">' + "".join(
                    f'<a href="{p}"><b>{e(vname(c))}</b><small>{"من " + str(int(ch)) + "$" if ch else "اسأل بالواتساب"}</small></a>' for p, c, ch in vl) + "</div>")
        self.page(HUB, "كل الوجهات — تذاكر طيران وفيزا وكروبات من العراق | سافر مع عبدالله",
                  f"تذاكر طيران من بغداد وأربيل والبصرة والنجف لكل العالم، فيزا لأكثر من {len(vl)} دولة، وكروبات سياحية. احجز بالواتساب {self.phone_d}.",
                  [("الرئيسية", "./"), ("الوجهات", None)], body)
        return self.out


def sitemap(url, paths, today):
    rows = "".join(f"<url><loc>{e(url + p)}</loc><lastmod>{today}</lastmod></url>" for p in [""] + paths)
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + rows + "</urlset>\n"


def airl_from_template():
    try:
        s = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
        block = s[s.index("var AIRL = {"):]
        block = block[:block.index("};")]
        return {k.strip('"'): v for k, v in re.findall(r'("?[0-9A-Z]{2,3}"?):\["([^"]*)"', block)}
    except (OSError, ValueError):
        return {}


def build_pages(DATA, company, site_url):
    """يكتب flights/ visa/ tours/ وdestinations.html وsitemap.xml. أي خطأ ما يوكّف بناء الموقع."""
    try:
        load = lambda n: json.load(open(os.path.join(SITE, n), encoding="utf-8")) if os.path.exists(os.path.join(SITE, n)) else {}
        site = Site(DATA, company, site_url, load("fares.json"), load("places.json"), airl_from_template())
        out = site.build()
        for d in DIRS:
            os.makedirs(os.path.join(SITE, d), exist_ok=True)
            for f in os.listdir(os.path.join(SITE, d)):
                if f.endswith(".html") and d + "/" + f not in out:
                    os.remove(os.path.join(SITE, d, f))
        for p, doc in out.items():
            open(os.path.join(SITE, p), "w", encoding="utf-8").write(doc)
        open(os.path.join(SITE, "sitemap.xml"), "w", encoding="utf-8").write(sitemap(site_url, site.urls, site.today))
        n = {d: sum(1 for p in out if p.startswith(d + "/")) for d in DIRS}
        print("صفحات كوكل: %d طيران، %d فيزا، %d كروب + %s وsitemap.xml" % (n["flights"], n["visa"], n["tours"], HUB))
    except Exception as ex:  # noqa: BLE001
        print("صفحات كوكل ما انبنت:", ex)


if __name__ == "__main__":
    s = open(os.path.join(SITE, "index.html"), encoding="utf-8").read()
    D, _ = json.JSONDecoder().raw_decode(s[s.index('{"ar": {"groups"'):])
    url = re.search(r'<link rel="canonical" href="([^"]+)"', s).group(1)
    build_pages(D, D["company"], url)
