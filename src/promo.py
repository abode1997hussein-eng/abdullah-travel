"""promo.html: صفحة لصاحب الموقع تطلّع منشورات إنستغرام جاهزة (بوست وستوري) بأحدث الأسعار.

تنبني ويا صفحات كوكل (pages.build_pages)، فالأسعار بيها دايماً مثل الموقع. الصفحة مخفية عن كوكل (noindex).
الرسم بالمتصفح على canvas، وزر الحفظ يطلّع PNG (أو قائمة المشاركة بالموبايل).
"""
import json, re

PROMO = "promo.html"

PAGE = r"""<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>منشورات جاهزة — سافر مع عبدالله</title>
<link rel="icon" href="img/logo/logo-icon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@500;700&family=Lalezar&display=swap">
<style>
:root{--bg:#F6F7F9;--ink:#111827;--muted:#6B7280;--line:#E3E5EA;--accent:#F26A21;--navy:#123A6B}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 "IBM Plex Sans Arabic",Tahoma,sans-serif}
.wrap{max-width:720px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:4px 0;color:var(--navy)}
.small{font-size:13px;color:var(--muted)}
.row{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:9px 14px;font:inherit;font-weight:600;cursor:pointer}
.chip[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
select{font:inherit;padding:9px 12px;border-radius:12px;border:1px solid var(--line);background:#fff;max-width:100%}
.prev{background:#fff;border:1px solid var(--line);border-radius:18px;padding:10px;text-align:center}
canvas{max-width:100%;height:auto;border-radius:10px;max-height:70vh}
.btn{display:block;width:100%;border:0;border-radius:999px;padding:14px;font:inherit;font-weight:700;font-size:17px;background:#25D366;color:#fff;cursor:pointer;margin:12px 0}
.btn.ghost{background:#fff;color:var(--navy);border:1px solid var(--line)}
textarea{width:100%;min-height:150px;border-radius:14px;border:1px solid var(--line);padding:12px;font:inherit;font-size:14px}
</style>
</head>
<body>
<div class="wrap">
<h1>منشورات جاهزة لإنستغرام</h1>
<p class="small">الأسعار من الموقع نفسه وتتحدث وحدها. اختار المنشور والحجم، واحفظ الصورة، وانسخ الكابشن. آخر تحديث: __UPDATED__</p>
<div class="row" id="kinds"></div>
<div class="row" id="extra"></div>
<div class="row" id="sizes"><button class="chip" data-size="post" aria-pressed="true">بوست (4:5)</button><button class="chip" data-size="story" aria-pressed="false">ستوري (9:16)</button></div>
<div class="prev"><canvas id="cv" width="1080" height="1350" dir="rtl"></canvas></div>
<button class="btn" id="save">حفظ الصورة</button>
<p class="small">الكابشن:</p>
<textarea id="cap" readonly></textarea>
<button class="btn ghost" id="copy">نسخ الكابشن</button>
</div>
<script>
var P = __DATA__;
var kind = P.kinds[0].k, size = "post", gi = 0;
var C = { o:"#F26A21", o2:"#D9531A", navy:"#123A6B", ink:"#111827", mut:"#6B7280", wa:"#25D366" };
var IMG = {};
function img(src){ return new Promise(function(ok){ var i = new Image(); i.onload = function(){ ok(i); }; i.onerror = function(){ ok(null); }; i.src = src; }); }
function fmt(n){ return Number(n).toLocaleString("en-US"); }
function rr(x, y, w, h, r, fill){ var c = ctx; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); c.fillStyle = fill; c.fill(); }
function txt(s, x, y, font, color, align){ ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || "right"; ctx.fillText(s, x, y); }
function fit(s, maxW, size, fam){ ctx.font = size + "px " + fam; while (ctx.measureText(s).width > maxW && size > 18){ size -= 2; ctx.font = size + "px " + fam; } return size; }
var cv = document.getElementById("cv"), ctx = cv.getContext("2d");
ctx.direction = "rtl";
var LZ = '"Lalezar"', PX = '"IBM Plex Sans Arabic"';

function frame(W, H){
  var g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, C.o); g.addColorStop(0.5, C.o2); g.addColorStop(1, C.navy);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  var r = ctx.createRadialGradient(W * 0.9, -H * 0.05, 0, W * 0.9, -H * 0.05, W * 0.85);
  r.addColorStop(0, "rgba(255,255,255,.25)"); r.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
  if (IMG.logo){ var lw = 330, lh = lw * IMG.logo.height / IMG.logo.width; rr(W - 56 - lw - 28, 44, lw + 28, lh + 20, 22, "#fff"); ctx.drawImage(IMG.logo, W - 56 - lw - 14, 54, lw, lh); }
}
function footer(W, H){
  var y = H - 150;
  if (IMG.mascot){ var mw = size === "story" ? 260 : 190, mh = mw * IMG.mascot.height / IMG.mascot.width; ctx.drawImage(IMG.mascot, 30, H - mh - 20, mw, mh); }
  rr(W - 56 - 520, y, 520, 92, 46, C.wa);
  txt("واتساب  \u2066" + P.phone + "\u2069", W - 56 - 260, y + 60, "700 40px " + PX, "#fff", "center");
  txt("\u2066" + P.site + "\u2069", W - 56, y + 128, "500 24px " + PX, "rgba(255,255,255,.9)", "right");
}
function cards(items, top, W, H, cols){
  var gap = 22, x0 = 56, w = (W - x0 * 2 - gap * (cols - 1)) / cols, rows = Math.ceil(items.length / cols);
  var avail = H - (size === "story" ? 340 : 290) - top, h = Math.min(250, (avail - gap * (rows - 1)) / rows);
  items.forEach(function(it, i){
    var c = i % cols, r = Math.floor(i / cols), x = W - x0 - w - c * (w + gap), y = top + r * (h + gap);
    rr(x, y, w, h, 28, i === 0 ? "#FFF3EA" : "#fff");
    var cx = x + w / 2;
    var s1 = fit(it.t, w - 30, 46, PX); txt(it.t, cx, y + h * 0.30, "700 " + s1 + "px " + PX, C.navy, "center");
    if (it.s) txt(it.s, cx, y + h * 0.46, "500 24px " + PX, C.mut, "center");
    var s2 = fit(it.p, w - 30, 62, LZ); txt(it.p, cx, y + h * 0.80, s2 + "px " + LZ, C.o2, "center");
  });
}
function draw(){
  var W = 1080, H = size === "story" ? 1920 : 1350; cv.width = W; cv.height = H; ctx.direction = "rtl";
  frame(W, H);
  var K = P.kinds.filter(function(k){ return k.k === kind; })[0], st = size === "story" ? 140 : 0;
  if (kind === "group"){
    var g = P.groups[gi]; if (!g) return;
    if (IMG.plane) ctx.drawImage(IMG.plane, 60, 150 + st, 380, 380 * IMG.plane.height / IMG.plane.width);
    txt("كروب", W - 56, 270 + st, "64px " + LZ, "#FFE1CC");
    var ts = fit(g.title, W - 112, 130, LZ); txt(g.title, W - 56, 400 + st, ts + "px " + LZ, "#fff");
    txt(g.dur, W - 56, 470 + st, "700 40px " + PX, "#fff");
    var y = 560 + st;
    if (g.from){ rr(W - 56 - 560, y, 560, 150, 30, "#fff"); txt("السعر يبدي من", W - 56 - 280, y + 50, "700 30px " + PX, C.mut, "center"); txt(g.from + "$", W - 56 - 280, y + 125, "84px " + LZ, C.o2, "center"); y += 190; }
    if (g.dates.length){ txt("المواعيد: " + g.dates.slice(0, 3).map(function(d){ return "\u2066" + d + "\u2069"; }).join(" · "), W - 56, y + 30, "700 34px " + PX, "#fff"); y += 70; }
    g.inc.slice(0, size === "story" ? 6 : 4).forEach(function(s){ txt("✓ " + s, W - 56, y + 30, "500 34px " + PX, "#fff"); y += 56; });
  } else {
    txt(K.h1, W - 56, 250 + st, "96px " + LZ, "#fff");
    txt(K.h2, W - 56, 330 + st, "700 38px " + PX, "#FFE1CC");
    cards(K.items.slice(0, size === "story" ? 8 : 6), 390 + st, W, H, 2);
  }
  footer(W, H);
  document.getElementById("cap").value = kind === "group" ? P.groups[gi].cap : K.cap;
}
function ui(){
  document.getElementById("kinds").innerHTML = P.kinds.map(function(k){ return '<button class="chip" data-k="' + k.k + '" aria-pressed="' + (k.k === kind) + '">' + k.n + '</button>'; }).join("");
  document.getElementById("extra").innerHTML = kind === "group" ? '<select id="gsel">' + P.groups.map(function(g, i){ return '<option value="' + i + '"' + (i === gi ? " selected" : "") + '>' + g.title + " — " + g.dur + '</option>'; }).join("") + '</select>' : "";
  var s = document.getElementById("gsel"); if (s) s.onchange = function(){ gi = +s.value; draw(); };
  document.querySelectorAll("[data-size]").forEach(function(b){ b.setAttribute("aria-pressed", String(b.getAttribute("data-size") === size)); });
}
document.addEventListener("click", function(e){
  var k = e.target.closest("[data-k]"), z = e.target.closest("[data-size]");
  if (k){ kind = k.getAttribute("data-k"); ui(); draw(); }
  if (z){ size = z.getAttribute("data-size"); ui(); draw(); }
});
document.getElementById("save").onclick = function(){
  cv.toBlob(function(b){
    var name = "safir-" + kind + "-" + size + ".png", f = window.File ? new File([b], name, { type:"image/png" }) : null;
    if (f && navigator.canShare && navigator.canShare({ files:[f] })) { navigator.share({ files:[f] }).catch(function(){}); return; }
    var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }, "image/png");
};
document.getElementById("copy").onclick = function(){
  var t = document.getElementById("cap"); t.select();
  (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).catch(function(){ document.execCommand("copy"); });
  this.textContent = "انسخ ✓"; var b = this; setTimeout(function(){ b.textContent = "نسخ الكابشن"; }, 1500);
};
if (!P.groups.length) P.kinds = P.kinds.filter(function(k){ return k.k !== "group"; });
Promise.all([img("img/logo/logo-light.png"), img("img/mascot.webp"), img("img/planes/iraqi.webp"),
  document.fonts ? Promise.all([document.fonts.load('64px "Lalezar"', "تخفيض"), document.fonts.load('700 40px "IBM Plex Sans Arabic"', "سافر"), document.fonts.load('500 24px "IBM Plex Sans Arabic"', "سافر")]).catch(function(){}) : null])
  .then(function(r){ IMG.logo = r[0]; IMG.mascot = r[1]; IMG.plane = r[2]; ui(); draw(); });
</script>
</body>
</html>
"""

TAGS = "#سافر_مع_عبدالله #تذاكر_طيران #سفر #بغداد #العراق #حجز_طيران #سياحة"


def build_promo(site):
    """يرجّع HTML صفحة المنشورات من نفس بيانات صفحات كوكل."""
    url = site.url
    tail = "\n\nللحجز واتساب: " + site.phone_d + "\nأو من موقعنا: " + url + "\n\n" + TAGS
    # أرخص رحلة ذهاب فقط لكل وجهة من بغداد
    best = {}
    for f in site.fares.get("fares", []):
        if f.get("o") == "BGW" and not f.get("rt") and f.get("d") in site.P:
            if f["d"] not in best or f["p"] < best[f["d"]]["p"]:
                best[f["d"]] = f
    cheap = sorted(best.values(), key=lambda f: f["p"])[:8]
    k_cheap = {"k": "cheap", "n": "أرخص رحلات من بغداد", "h1": "أرخص رحلات الأسبوع", "h2": "من بغداد · ذهاب فقط · للشخص",
               "items": [{"t": site.city(f["d"]), "s": "تبدي من", "p": str(f["p"]) + "$"} for f in cheap],
               "cap": "✈️ أرخص رحلات الأسبوع من بغداد\n\n" + "\n".join(
                   f"• {site.city(f['d'])} تبدي من {f['p']}$ (ذهاب فقط)" for f in cheap) +
               "\n\nالأسعار تتحدث كل ساعة وتتغير حسب التوفر." + tail}
    man = [x for x in site.D.get("manual", []) if "BGW" in x.get("o", []) and (x.get("rt") or x.get("ow"))]
    man = sorted(man, key=lambda x: x.get("rt") or x.get("ow"))[:8]
    unit = lambda x: "" if x.get("cur") == "iqd" else "$"
    k_ia = {"k": "ia", "n": "أسعار العراقية", "h1": "الخطوط الجوية العراقية", "h2": "من بغداد · ذهاب وعودة · للشخص بالدينار",
            "items": [{"t": x["dn"], "s": "ذهاب وعودة" if x.get("rt") else "ذهاب فقط", "p": "{:,}".format(x.get("rt") or x.get("ow")) + unit(x)} for x in man],
            "cap": "✈️ أسعار الخطوط الجوية العراقية من بغداد\n\n" + "\n".join(
                f"• {x['dn']}: " + "{:,}".format(x.get("rt") or x.get("ow")) + (" دينار" if x.get("cur") == "iqd" else "$") +
                (" ذهاب وعودة" if x.get("rt") else " ذهاب فقط") for x in man) +
            "\n\nالأسعار حسب توفر المقاعد." + tail}
    groups = []
    for g in site.D.get("ar", {}).get("groups", []):
        prices = [float(o["p"]) for o in g.get("opts", []) if re.fullmatch(r"\d+(\.\d+)?", str(o.get("p", "")))]
        start = int(min(prices)) if prices else None
        groups.append({"title": g["title"], "dur": g.get("dur", ""), "from": start, "dates": g.get("dates", []), "inc": g.get("inc", []),
                       "cap": f"🌍 كروب {g['title']} من بغداد\n🗓 {g.get('dur', '')}" +
                              (f"\n📅 المواعيد: {' · '.join(g.get('dates', [])[:4])}" if g.get("dates") else "") +
                              (f"\n💵 السعر يبدي من {start}$ للشخص" if start else "") +
                              ("\n\nيشمل:\n" + "\n".join("✓ " + s for s in g.get("inc", [])) if g.get("inc") else "") + tail})
    kinds = [k for k in (k_cheap, k_ia) if k["items"]] + [{"k": "group", "n": "كروب"}]
    data = {"kinds": kinds, "groups": groups, "phone": site.phone_d, "site": url.replace("https://", "").rstrip("/")}
    upd = site.today[8:10] + "-" + site.today[5:7] + "-" + site.today[:4]
    return PAGE.replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/")).replace("__UPDATED__", upd)
