"""أسعار الطيران من Travelpayouts (Aviasales): أرخص الأسعار من مطارات العراق للشهرين الجايين.

TP_TOKEN=... python3 -I fares.py  ->  ../fares.json

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
API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates"

COMMISSION = 0  # $ تنضاف على سعر الشخص
ORIGINS = ["BGW", "EBL", "BSR", "NJF"]
# رموز المدن (المدينة تشمل كل مطاراتها: IST = اسطنبول وصبيحة، THR = طهران)
DESTS = ["IST", "AYT", "TZX", "DXB", "SHJ", "AUH", "DOH", "AMM", "BEY", "CAI", "SSH", "DAM", "MCT",
         "JED", "MED", "KUL", "BKK", "LON", "THR", "MHD", "SYZ", "IFN", "TBS", "BUS", "GYD", "CMB",
         "TUN", "BAH", "KWI", "RUH", "ISU"]
PER = 6  # أرخص كم رحلة لكل شهر ونوع


def months(n=2):
    d = date.today()
    out = []
    for i in range(n):
        m = (d.month - 1 + i) % 12 + 1
        y = d.year + (d.month - 1 + i) // 12
        out.append("%d-%02d" % (y, m))
    return out


def get(token, **q):
    q.update(currency="usd", sorting="price", unique="false", limit=PER, page=1, token=token)
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
    for o in ORIGINS:
        for d in DESTS:
            if o == d:
                continue
            for m in months():
                for one_way in ("true", "false"):
                    try:
                        res = get(token, origin=o, destination=d, departure_at=m, one_way=one_way)
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
                        key = (o, d, f.get("airline"), f.get("flight_number"), f.get("departure_at"), f.get("return_at"))
                        if key in seen or not f.get("price"):
                            continue
                        seen.add(key)
                        out.append({
                            "o": o, "d": d, "a": f.get("airline", ""), "n": f.get("flight_number", ""),
                            "dep": (f.get("departure_at") or "")[:16], "ret": (f.get("return_at") or "")[:16],
                            "tr": f.get("transfers", 0), "rtr": f.get("return_transfers", 0),
                            "p": int(round(float(f["price"]))) + COMMISSION, "rt": one_way == "false",
                        })
                    time.sleep(0.05)
    print("أسعار الطيران: %d طلب ناجح، %d فشل، %d سعر" % (ok, bad, len(out)))
    if not out:
        print("ما رجع ولا سعر، بقت الأسعار القديمة")
        return
    out.sort(key=lambda f: (f["o"], f["d"], f["dep"], f["p"]))
    json.dump({"updated": date.today().isoformat(), "commission": COMMISSION, "fares": out},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
    sys.exit(0)
