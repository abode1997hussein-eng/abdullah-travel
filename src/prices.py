"""أسعار الطيران الخاصة من ملف «أسعار الطيران - سافر مع عبدالله» (أكسل صاحب الموقع).

كل تبويب بنفس الأعمدة: الشركة | من | إلى | ذهاب فقط | ذهاب وعودة | العملة | ملاحظة
أو تبويب «لصق»: رسالة الأسعار مثل ما توصل بالواتساب تنلصق بخانة وحدة (أو أكثر)، والملف يفهمها:
  🇱🇧 بغداد ✈️ بيروت
  🔹 ذهاب فقط: 343,000 دينار
  🔸 ذهاب وعودة: 643,000 دينار
أسماء المدن بالعربي (أو الإنكليزي) تتحول لرموزها من places.json، والأسعار نهائية للزبون.
"""
import json
import os
import re

from sheet import clean, money, read_xlsx

HERE = os.path.dirname(os.path.abspath(__file__))
PLACES = os.path.join(os.path.dirname(HERE), "places.json")

COLS = {"الشركة": "a", "من": "o", "إلى": "d", "ذهاب فقط": "ow", "ذهاب وعودة": "rt", "العملة": "cur", "ملاحظة": "n"}
# أسماء ما بيها مدينة بنفس الاسم أو تنكتب بأكثر من شكل
ALIAS = {"صبيحه": ["IST", "SAW"], "مطار صبيحه": ["IST", "SAW"], "اسطنبول": ["IST"], "كوانزو": ["CAN"], "غوانزو": ["CAN"],
         "عمان": ["AMM"], "مسقط": ["MCT"], "سليمانيه": ["ISU"], "السليمانيه": ["ISU"], "رشت": ["RAS"], "المدينه": ["MED"]}
# رموز ثانية لنفس المدينة (مثل مطاراتها) حتى يطابق البحث أي وحدة منها
ALT = {"BAK": ["GYD"], "MOW": ["SVO", "DME", "VKO"], "ANK": ["ESB"], "THR": ["IKA"], "DXB": ["DWC"]}


def norm(s):
    s = re.sub("[ً-ٟـ]", "", clean(s)).replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
    return s.replace("ة", "ه").replace("ى", "ي").replace("ی", "ي").replace("ک", "ك").lower().strip()


def city_index():
    idx = {}
    try:
        for code, ar, en, _ in json.load(open(PLACES, encoding="utf-8"))["c"]:
            for n in (ar, en):
                if n and norm(n) not in idx:
                    idx[norm(n)] = [code]
    except (OSError, ValueError, KeyError):
        pass
    for k, v in ALIAS.items():
        idx[norm(k)] = v
    return idx


def codes(name, idx):
    n = norm(name)
    c = idx.get(n) or idx.get(re.sub(r"^ال", "", n)) or (idx.get("ال" + n) if not n.startswith("ال") else None)
    if not c and re.fullmatch(r"[a-z]{3}", n):
        c = [n.upper()]
    if not c:
        return None
    out = list(c)
    for x in c:
        out += [y for y in ALT.get(x, []) if y not in out]
    return out


def load(path):
    """يرجّع قائمة رحلات: الشركة، رموز من وإلى، اسم الوجهة، السعرين، العملة، الملاحظة."""
    idx, out, bad = city_index(), [], []
    book = read_xlsx(path)
    # تبويبات اللصق أول شي: إذا نفس الرحلة موجودة بجدول وبرسالة ملصوقة، الرسالة (الأحدث عادةً) تغلب
    for tab, rows in sorted(book.items(), key=lambda kv: 0 if re.search("لصق|paste", kv[0], re.I) else 1):
        if not rows:
            continue
        head = {i: COLS[clean(h)] for i, h in enumerate(rows[0]) if clean(h) in COLS}
        if not {"o", "d"} <= set(head.values()):
            # كل خانة = رسالة وحدة (الشركة من عنوانها)، وسطور الشرح تنترك
            for c in (c for r in rows for c in r if c):
                if not re.match(r"\s*(الصق|شكل الرسالة)", c):
                    out += message(c, tab, idx, bad)
            continue
        for r in rows[1:]:
            x = {k: clean(r[i]) if i < len(r) else "" for i, k in head.items()}
            ow, rt = money(x.get("ow", "")), money(x.get("rt", ""))
            if not (ow or rt):
                continue
            o, d = codes(x.get("o", ""), idx), codes(x.get("d", ""), idx)
            if not (o and d):
                bad.append("%s: %s ← %s" % (tab, x.get("o"), x.get("d")))
                continue
            cur = "iqd" if "د" in x.get("cur", "") or "دينار" in x.get("cur", "") or (ow or rt) >= 10000 else "usd"
            out.append({"a": x.get("a", ""), "o": o, "d": d, "dn": x.get("d", ""), "ow": ow, "rt": rt, "cur": cur, "n": x.get("n", "")})
    seen, uniq = set(), []
    for x in out:
        k = (norm(x["a"]), tuple(x["o"]), tuple(x["d"]))
        if k not in seen:
            seen.add(k)
            uniq.append(x)
    out = uniq
    print("أسعار الطيران الخاصة: %d رحلة" % len(out))
    for b in bad:
        print("  مدينة ما انعرفت (صحّح اسمها):", b)
    return out


# ---------------------------------------------------------------- رسالة أسعار ملصوقة
EMOJI = re.compile("[\U0001F000-\U0001FFFF\u2600-\u27BF\uFE0F\u200d]")
ROUTE = re.compile(r"^(.+?)\s*(?:←|→|->|<-|—|–| - | إلى | الى )\s*(.+)$")
FARE = re.compile(r"(ذهاب\s*و\s*عودة|ذهاب\s*واياب|ذهاب\s*فقط|ذهاب)\s*[:：]?\s*([\d,.٬]+)\s*(الف)?\s*(دينار|د\.?ع|\$|دولار)?")


def message(text, tab, idx, bad):
    """رسالة أسعار (مثل ما توصل بالواتساب) → رحلات. الشركة من عنوان الرسالة أو من اسم التبويب."""
    air, cur, out = "", None, []
    tab_air = "" if re.search("لصق|paste", tab, re.I) else clean(tab)
    for raw in text.splitlines():
        line = clean(EMOJI.sub(" ", raw.replace("✈️", " → ").replace("✈", " → "))).strip(" -*•:")
        if not line:
            continue
        f = FARE.search(line)
        if f and cur:
            n = money(f.group(2).replace("٬", ",") + (" الف" if f.group(3) else ""))
            if n:
                cur["rt" if "عودة" in f.group(1) or "اياب" in f.group(1) else "ow"] = n
                u = f.group(4) or ""
                if "$" in u or "دولار" in u:
                    cur["cur"] = "usd"
                elif u:
                    cur["cur"] = "iqd"
            continue
        m = ROUTE.match(line)
        if m and not re.search(r"\d", line):
            a, b = clean(m.group(1)), clean(m.group(2))
            o, d = codes(a, idx), codes(b, idx)
            if o and d:
                cur = {"a": air or tab_air, "o": o, "d": d, "dn": b, "ow": None, "rt": None, "cur": None, "n": ""}
                out.append(cur)
            else:
                bad.append("%s: %s ← %s" % (tab, a, b))
                cur = None
            continue
        if not air and re.search("الخطوط|طيران|airways|airlines|air", line, re.I):
            air = re.sub(r"^(أسعار|اسعار)\s*(رحلات|تذاكر)?\s*", "", line.strip(" →←-")).strip()
    out = [x for x in out if x["ow"] or x["rt"]]
    for x in out:
        x["a"] = x["a"] or air or tab_air
        if not x["cur"]:
            x["cur"] = "iqd" if (x["ow"] or x["rt"]) >= 10000 else "usd"
    if out:
        print("  %s: %d رحلة من رسالة ملصوقة (%s)" % (tab, len(out), out[0]["a"] or "بدون اسم شركة"))
    return out
