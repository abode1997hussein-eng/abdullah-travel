"""يقرا أكسل الشركة (Google Sheet) ويطلع منه الفنادق والمدد والأسعار والتواريخ لكل كروب.

ياخذ عمود البيع بس — ما ينشر التسديد ولا العمولة. الأعمدة تنعرف من عناوينها مو من مكانها،
فإذا الشركة بدّلت ترتيب الأعمدة يبقى يشتغل. إذا تبويب ما انقرا، الكروب يبقى على بياناته
القديمة بـ data.py، والـ build يطبع السبب.

python3 -I sheet.py book.xlsx   ->  يطبع ملخص اللي انقرا
"""
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from datetime import date

SHEET_ID = "1EE1rFTwHFsm6fIUglgcI4zaH1i8FB4gNzmwhPbWogy0"
SHEET_URL = "https://docs.google.com/spreadsheets/d/%s/export?format=xlsx" % SHEET_ID

AR = re.compile(r"[؀-ۿ]")
LAT = re.compile(r"[A-Za-z]")


# ---------------------------------------------------------------- قراءة xlsx بدون مكتبات
def read_xlsx(path):
    N = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
    z = zipfile.ZipFile(path)
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(N + "si"):
            ss.append("".join(t.text or "" for t in si.iter(N + "t")))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}

    def col(ref):
        n = 0
        for ch in re.match(r"[A-Z]+", ref).group():
            n = n * 26 + ord(ch) - 64
        return n - 1

    book = {}
    for sh in ET.fromstring(z.read("xl/workbook.xml")).iter(N + "sheet"):
        t = rels[sh.get(R + "id")].lstrip("/")
        t = t if t.startswith("xl/") else "xl/" + t
        rows = []
        for row in ET.fromstring(z.read(t)).iter(N + "row"):
            r = {}
            for c in row.iter(N + "c"):
                v, typ = c.find(N + "v"), c.get("t")
                if typ == "s" and v is not None:
                    val = ss[int(v.text)]
                elif typ == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter(N + "t"))
                else:
                    val = v.text if v is not None else ""
                val = (val or "").strip()
                if val:
                    r[col(c.get("r"))] = val
            if r:
                rows.append([r.get(i, "") for i in range(max(r) + 1)])
        book[sh.get("name")] = rows
    return book


# ---------------------------------------------------------------- تنظيف النصوص
def clean(s):
    s = unicodedata.normalize("NFKC", s or "")
    s = re.sub("[\u200e\u200f\u202a-\u202e\u2066-\u2069\u0307\u0640\"]", "", s).replace("\\", " ")
    s = s.replace("&amp;", "&")
    return re.sub(r"[ \t]+", " ", s).strip()


def key(s):
    return re.sub(r"\s+", "", clean(s))


def lines(s):
    return [x.strip(" -/*") for x in clean(s).split("\n") if x.strip(" -/*")]


def money(v):
    """'1075.0' '$460' '460$' '1,250,000' → رقم صحيح، أو None."""
    s = clean(v).replace(",", "").replace("$", "")
    m = re.search(r"\d+(?:\.\d+)?", s)
    if not m or re.search(r"[؀-ۿ]", s.replace("الف", "")):
        return None
    n = float(m.group())
    return int(round(n * 1000 if "الف" in s else n))


def fmt(n):
    if n is None:
        return ""
    return "{:,} د.ع".format(n) if n >= 10000 else "%d$" % n


def stars(v):
    m = re.search(r"\b([1-5])\b", clean(v))
    return m.group(1) if m else ""


EXTRA = re.compile(r"افطار|إفطار|فطور|عرض خاص|ينصح|خدمات|متاح|جيك|التوفر|اسرة|أسرة|الإقامة|الاقامة|^\d+\s*(?:نجوم|STARS?)", re.I)
EXTRA_TR = [  # ملاحظة الفندق كما هي بالأكسل ← صيغة الموقع
    (r"بدون (?:ا|إ)فطار", "بدون فطور"), (r"مع (?:ا|إ)فطار|مع فطور", "مع فطور"), (r"عرض خاص", "عرض خاص"),
    (r"متاح شهر 11", "متاح بشهر 11 فقط"), (r"جيك التوفر", "يتأكد التوفر قبل التثبيت"),
    (r"اسرة متصلة|أسرة متصلة", "أسرّة متصلة فقط"),
]


def hotel(cell):
    """خلية فندق ← (الاسم «عربي (English)»، ملاحظات، ينصح به)."""
    ls = [re.sub(r"\b\d\s*(?:stars?|نجوم)\b\s*\+?|\bVIP\b|بالسنتر", "", x, flags=re.I).strip(" /+") for x in lines(cell)]
    ls = [x for x in ls if x]
    ar = [x for x in ls if AR.search(x) and not EXTRA.search(x)]
    la = [x for x in ls if LAT.search(x) and not AR.search(x)]
    la = [re.sub(r"\b\d\s*stars?\b|\bVIP\b|\bHOTEL\b(?=\s*$)", "", x, flags=re.I).strip(" &+") for x in la]
    la = [x for x in la if LAT.search(x)]
    notes = []
    for pat, txt in EXTRA_TR:
        if re.search(pat, clean(cell)) and txt not in notes:
            notes.append(txt)
    a = re.sub(r"\s*&\s*", " + ", ar[0]) if ar else ""
    a = re.sub(r"\s*\d\s*(?:نجوم|stars?)\b.*$", "", a, flags=re.I).strip()
    e = " ".join(la[:1]).strip()
    e = re.sub(r"\s*[&+]\s*", " & ", e)
    e = (e.title() if e.isupper() else e).replace("\u0307", "")
    name = "%s (%s)" % (a, e) if a and e else (a or e)
    return name, notes, "ينصح" in cell


def place(v):
    s = "، ".join(lines(v)).replace(",", "،")
    for a, b in (("منطقة ", ""), ("الجيزه", "الجيزة"), ("الاهرامات", "الأهرامات"), ("دقيقه", "دقيقة"), ("القاهره", "القاهرة")):
        s = s.replace(a, b)
    return re.sub(r"\s*،\s*", "، ", s).strip("، ")


def plan_len(v):
    """'8 أيام 7 ليالي' '15 أيام 14 ليالي' '5 ايام 4 ليالي' ← '8 أيام / 7 ليالي'."""
    m = re.search(r"(\d+)\s*(?:أيام|ايام|يوم).*?(\d+)\s*(?:ليالي|ليلة|ليله)", clean(v))
    if not m:
        m2 = re.search(r"(\d+)\s*(?:أيام|ايام|يوم)", clean(v))
        return ("%s أيام" % m2.group(1)) if m2 else clean(v)
    d, n = int(m.group(1)), int(m.group(2))
    return "%d %s / %d %s" % (d, "يوم" if d > 10 else "أيام", n, "ليلة" if n > 10 else "ليالي")


def dates(text, year_less=False):
    out = []
    for d, m, y in re.findall(r"(?<![\d:])(\d{1,2})[-./](\d{1,2})(?:[-./](\d{4}))?(?![\d:])", clean(text)):
        if not y and not year_less:
            continue
        d, m = int(d), int(m)
        if not (1 <= d <= 31 and 1 <= m <= 12):
            continue
        y = int(y) if y else (date.today().year if m >= date.today().month - 1 else date.today().year + 1)
        s = "%02d-%02d-%d" % (d, m, y)
        if s not in out:
            out.append(s)
    return out


# ---------------------------------------------------------------- الجداول داخل التبويب
FIELDS = [  # الحقل، دالة تطابق عنوان العمود (بدون فراغات)
    ("sell", lambda h: h in ("البيع", "بيع", "المبيع", "الدبل", "سعرالبيع") or h.startswith("سعرالبالغ")),
    ("single", lambda h: "سنكل" in h),
    ("childbed", lambda h: "بالسرير" in h or "معسرير" in h),
    ("child", lambda h: "بدونسرير" in h or h.startswith("طفلمن2")),
    ("infant", lambda h: "رضيع" in h),
    ("hotel2", lambda h: h in ("الفندقفيبوكيت", "الفندقفيفوكيت", "الفندقفيبتايا", "فندقسوسة", "فندقالحمامات", "فندقعمان")),
    ("hotel", lambda h: h in ("الفندق", "اسمالفندق", "اسمالمنتجع", "الفندقفيبانكوك", "اسمالفندقمسقط", "فندقتونس", "فندقالعقبة")),
    ("stars", lambda h: h in ("تقيمالفندق", "فئةالفندق", "الفئة")),
    ("loc", lambda h: h in ("الموقع", "موقعالفندق")),
    ("dur", lambda h: h in ("مدةالبقاء", "الايام", "عددالايام", "المدة", "عددالأيام")),
    ("stay", lambda h: h == "الاقامة"),
    ("prog", lambda h: h == "البرنامج"),
    ("date", lambda h: "تاريخ" in h or "تأريخ" in h),
]


def header(row):
    m = {}
    for i, c in enumerate(row):
        h = key(c)
        for f, ok in FIELDS:
            if f not in m and h and ok(h):
                m[f] = i
                break
    return m if "sell" in m else None


def tables(rows):
    """كل جدول بالتبويب: (عنوان الجدول، أعمدته، أسطره) — يوقف عند سطر بلا سعر وبلا فندق وبلا مدة."""
    out, i, title = [], 0, ""
    while i < len(rows):
        h = header(rows[i])
        if not h:
            title = " ".join(rows[i])
            i += 1
            continue
        body, j = [], i + 1
        while j < len(rows) and not header(rows[j]):
            r = rows[j] + [""] * 30
            if not any(clean(r[h[f]]) for f in ("sell", "hotel", "dur") if f in h):
                break
            body.append(r)
            j += 1
        out.append((title, h, body))
        title = ""
        i = j
    return out


def cells(h, r, prev):
    """قيم السطر حسب أعمدة الجدول، والخلية الفاضية تاخذ قيمة السطر اللي قبلها."""
    v = {}
    for f, i in h.items():
        x = clean(r[i]) if i < len(r) else ""
        if not x and f not in ("sell", "single"):
            x = prev.get(f, "")
        v[f] = x
    return v


def opts(tbl, prog=None, single_diff=False):
    """أسطر الجدول ← خيارات الكروب بنفس أعمدة data.py."""
    title, h, body = tbl
    rows, prev = [], {}
    for r in body:
        v = cells(h, r, prev)
        prev = v
        p = money(v.get("sell"))
        if p is None:
            continue
        name, notes, rec = hotel(v.get("hotel", ""))
        name2 = hotel(v.get("hotel2", ""))[0] if v.get("hotel2") else ""
        s = money(v.get("single"))
        if single_diff and s is not None and s < p:
            s += p
        loc = " · ".join(x for x in [place(v.get("loc", ""))] + notes if x)
        row = {"الفندق": name, "الفندق الثاني": name2, "الموقع": loc, "الفئة": stars(v.get("stars", "")),
               "ينصح به": "نعم" if rec else "", "سعر البيع": fmt(p), "السنكل": fmt(s),
               "الطفل بدون سرير": fmt(money(v.get("child"))), "الطفل بسرير": fmt(money(v.get("childbed"))),
               "الرضيع": fmt(money(v.get("infant")))}
        if prog:
            row["البرنامج"] = prog(v, title)
        rows.append(row)
    return rows


def table_dates(tbl, year_less=False):
    _, h, body = tbl
    out = []
    for r in body:
        for d in dates(r[h["date"]] if "date" in h else r[0], year_less):
            if d not in out:
                out.append(d)
    return out


# ---------------------------------------------------------------- كل كروب ومن وين ينقرا
def find(book, *names):
    """التبويب بالاسم؛ إذا أكثر من تبويب بنفس الاسم ياخذ اللي بيه أحدث تاريخ."""
    def newest(rows):
        ds = dates("\n".join(" ".join(r) for r in rows))
        return max((d[6:] + d[3:5] + d[:2] for d in ds), default="")
    for n in names:
        hits = [rows for k, rows in book.items() if key(k) == key(n)]
        if hits:
            return max(hits, key=newest)
    raise KeyError("ما لكيت تبويب: " + " أو ".join(names))


def pick(tbls, test):
    for t in tbls:
        if test(t):
            return t
    raise KeyError("ما لكيت الجدول")


def has(h, *f):
    return all(x in h for x in f)


WEEK = [("سبت", "السبت"), ("احد", "الأحد"), ("أحد", "الأحد"), ("اثنين", "الاثنين"), ("ثلاثاء", "الثلاثاء"),
        ("اربعاء", "الأربعاء"), ("أربعاء", "الأربعاء"), ("خميس", "الخميس"), ("جمعة", "الجمعة")]


def muscat_plan(v, title):
    """'4 أيام' + «كل يوم سبت» ← '4 أيام · كل سبت'، وأكثر من يوم ← '8 أيام · السبت والثلاثاء والأربعاء'."""
    d = plan_len(v.get("dur", ""))
    m = re.search(r"كل\s*يوم[^\n]*", clean(v.get("date", "")))
    days = []
    for w in re.findall(r"[؀-ۿ]+", m.group() if m else ""):
        for a, b in WEEK:
            if w.endswith(a) and b not in days:
                days.append(b)
    if len(days) == 1:
        return d + " · كل " + ("أحد" if days[0] == "الأحد" else days[0][2:])
    return d + (" · " + " و".join(days) if days else "")


def load(path):
    """يرجع {اسم الكروب: {"rows": [...], "dates": [...]}} وقائمة المشاكل."""
    book = read_xlsx(path)
    live, errs = {}, []

    def add(name, fn):
        try:
            rows, ds = fn()
            if not rows:
                raise ValueError("ما بيه أسعار")
            live[name] = {"rows": rows, "dates": ds}
        except Exception as e:  # noqa: BLE001 — كروب واحد خربان ما يوقف الباقي
            errs.append("%s: %s" % (name, e))

    th = tables(find(book, "تايلنــــد "))
    add("بانكوك", lambda: (opts(th[0]), table_dates(th[0])))
    add("بانكوك + بوكيت", lambda: (opts(th[1]), table_dates(th[1])))

    def lanka():
        rows, ds = [], []
        for t in tables(find(book, "رحلات سريلانكا ")):
            for r in opts(t, prog=lambda v, title: plan_len(title)):
                r["الفندق"] = "راديسون + أراليا ريد + إيكو سورف"
                r["الموقع"] = ""
                rows.append(r)
            ds += [d for d in table_dates(t) if d not in ds]
        return rows, ds
    add("سريلانكا", lanka)

    my = tables(find(book, "ماليزيا "))

    def malaysia(t):
        rows = []
        title, h, body = t
        prev = {}
        out = opts(t)
        k = 0
        for r in body:
            v = cells(h, r, prev)
            prev = v
            if money(v.get("sell")) is None:
                continue
            pl = lines(v.get("prog", ""))
            name = pl[0] if pl else ""
            extra = [x for x in pl[1:]]
            o = out[k]
            k += 1
            o["الموقع"] = " · ".join(x for x in [", ".join(lines(v.get("stay", ""))), o["الفندق"]] + extra if x)
            o["الفندق"] = name
            rows.append(o)
        return rows
    add("ماليزيا", lambda: (malaysia(my[0]), table_dates(my[0])))
    add("ماليزيا بدون طيران", lambda: (malaysia(my[1]), []))

    sh = tables(find(book, "شرم الشيخ  "))
    add("شرم الشيخ", lambda: (opts(sh[0]), table_dates(sh[0])))
    add("شرم الشيخ + القاهرة", lambda: (opts(sh[1]), table_dates(sh[1])))

    cai = tables(find(book, "كروبات القاهره بغداد "))
    add("القاهرة", lambda: (opts(cai[0]), table_dates(cai[0])))
    add("القاهرة + شرم الشيخ", lambda: (opts(cai[1]), table_dates(cai[1])))

    for name, tab in (("مسقط من بغداد", "مسقط بغداد  "), ("مسقط من أربيل", "مسقط اربيل ")):
        t = tables(find(book, tab))[0]
        add(name, lambda t=t: (opts(t, prog=muscat_plan), table_dates(t)))

    ist = tables(find(book, "اسطنبول فلاي بغداد+ AJT"))[0]
    add("اسطنبول – فلاي بغداد", lambda: (opts(ist, prog=lambda v, _: plan_len(v["dur"])), table_dates(ist)))
    ia = tables(find(book, "اسطنبول عراقية"))[0]
    add("اسطنبول – العراقية", lambda: (opts(ia, prog=lambda v, _: plan_len(v["dur"])), table_dates(ia)))

    bey = tables(find(book, "بيروت اور + عالميه"))[0]
    add("بيروت", lambda: (opts(bey, prog=lambda v, _: plan_len(v["dur"]), single_diff=True), table_dates(bey)))

    aq = tables(find(book, "كروب العقبة حفلة كاظم "))[0]
    add("حفلة كاظم الساهر في العقبة – الأردن", lambda: (opts(aq), []))

    def tunis():
        rows = []
        for title, h, body in tables(find(book, "تونس  حفلة راغب علامه ")):
            pl = ("تونس 3 ليالي + سوسة 4 ليالي" if "سوسة" in title else
                  "تونس 3 ليالي + الحمامات 4 ليالي" if "حمامات" in title else "تونس فقط")
            rows += opts((title, h, body), prog=lambda v, _, pl=pl: pl)
        return rows, []
    add("تونس + حفلة راغب علامة", tunis)

    amr = tables(find(book, "عمرو دياب& شاكيرا القاهرة"))[0]
    add("حفلة شاكيرا وعمرو دياب في القاهرة",
        lambda: (opts(amr, prog=lambda v, _: plan_len(v["dur"])), table_dates(amr, year_less=True)))

    def kazim_ist():
        rows, ds = [], []
        for t in tables(find(book, "كاظم الساهر اسطنبول راس السنة")):
            first = clean(t[2][0][t[1].get("date", 0)]) if t[2] else ""
            air = "فلاي بغداد" if "فلاي" in first else "العراقية"
            pl = air + " · " + plan_len(first)
            rows += opts(t, prog=lambda v, _, pl=pl: pl)
            ds += [d for d in table_dates(t) if d not in ds]
        return rows, ds
    add("حفلة كاظم الساهر رأس السنة في اسطنبول", kazim_ist)

    for name, tab in (("حفلة كاظم الساهر رأس السنة في بيروت – العراقية", "بيروت راس السنه عراقية "),
                      ("حفلة كاظم الساهر رأس السنة في بيروت – طيران العالمية", "بيروت راس السنه عالمية ")):
        t = tables(find(book, tab))[0]
        add(name, lambda t=t: (opts(t, prog=lambda v, _: plan_len(v["dur"])), []))

    return live, errs, book


# ---------------------------------------------------------------- الفيزا: الأسعار والمدد من Visa Elite
VISA_NAMES = {"سيريلانكا": "سريلانكا", "الموزنبيق": "موزمبيق", "اثيوبيا": "إثيوبيا", "افغانستان": "أفغانستان",
              "اندونيسيا": "إندونيسيا", "إندونيسيا": "إندونيسيا", "كينيا": "كينيا", "بوليفيا": "بوليفيا",
              "موعد تركيا": "موعد فيزا تركيا", "العراق": "فيزا العراق", "شرق افريقيا": "شرق أفريقيا (أوغندا – رواندا – كينيا)",
              "ء": "الإمارات", "الاردن": "الأردن", "اذربيجان": "أذربيجان"}


def visas(book):
    """{الدولة: [(مدة الإصدار، سعر البيع، الصلاحية) لكل سطر بالترتيب]}"""
    rows = find(book, "Visa Elite")
    t = None
    for i, r in enumerate(rows):
        if "سعرالبيع" in [key(c) for c in r]:
            hk = [key(c) for c in r]
            t = (i, hk.index("الدولة"), hk.index("مدةالإصدار"), hk.index("سعرالبيع"), hk.index("الصلاحيةخارجبلدالزيارة"))
            break
    i0, cc, cd, cp, cv = t
    out, cur = {}, None
    for r in rows[i0 + 1:]:
        r = r + [""] * 12
        c = lines(r[cc])
        p = money(r[cp])
        if c and p is None and not any(r[cc + 1:cp + 1]):
            cur = None  # عنوان منطقة
            continue
        if c:
            cur = VISA_NAMES.get(c[0], c[0])
            out.setdefault(cur, [])
        if cur and p is not None:
            out[cur].append((clean(r[cd]), fmt(p), clean(r[cv])))
    return out


if __name__ == "__main__":
    live, errs, book = load(sys.argv[1])
    for k, v in live.items():
        print("%-55s %3d سطر  تواريخ: %s" % (k, len(v["rows"]), " ".join(v["dates"])))
        for r in v["rows"][:2]:
            print("     ", {a: b for a, b in r.items() if b})
    print("مشاكل:", errs or "ماكو")
    vs = visas(book)
    print("فيزا:", len(vs), "دولة", list(vs.items())[:3])
