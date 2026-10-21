"""أسعار الطيران الخاصة من ملف «أسعار الطيران - سافر مع عبدالله» (أكسل صاحب الموقع).

كل تبويب بنفس الأعمدة: الشركة | من | إلى | ذهاب فقط | ذهاب وعودة | العملة | ملاحظة
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
    for tab, rows in read_xlsx(path).items():
        if not rows:
            continue
        head = {i: COLS[clean(h)] for i, h in enumerate(rows[0]) if clean(h) in COLS}
        if not {"o", "d"} <= set(head.values()):
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
    print("أسعار الطيران الخاصة: %d رحلة" % len(out))
    for b in bad:
        print("  مدينة ما انعرفت (صحّح اسمها):", b)
    return out
