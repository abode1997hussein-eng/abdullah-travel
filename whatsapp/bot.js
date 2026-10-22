/* عقل البوت: يقرا رسالة الزبون ويرجّع الرد (بدون أي اتصال بالإنترنت، حتى ينفحص بسهولة: node test.mjs).
 *
 * البيانات من bot.json اللي ينبني ويا الموقع من الأكسل (src/bot.py)، فالأسعار نفس أسعار الموقع.
 * reply(text, id, data, ctx) ← { msgs: [رسائل جاهزة للإرسال], act: "stop" | "start" | "human" | "" }
 */

/* نفس norm بـsrc/pages.py: بلا تشكيل وهمزات، والتاء المربوطة هاء */
export function norm(s) {
  return String(s || "")
    .replace(/[ً-ٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .toLowerCase()
    .trim();
}

/* «بإسطنبول» و«والامارات» و«لدبي» ← نفس الكلمة */
function stem(w) {
  if (w.length > 3 && w[0] === "و") w = w.slice(1);
  if (w.length > 3 && "بلف".includes(w[0])) w = w.slice(1);
  if (w.length > 3 && w.startsWith("ال")) w = w.slice(2);
  return w;
}

function words(s) {
  return norm(s).split(/[\s،,.!?؟/()\-–]+/).filter((w) => w.length >= 2);
}

/* رقم الموبايل بصيغة واتساب الدولية (بلا + وبلا أصفار): 07701234567 ← 9647701234567 */
export function phone(raw, cc = "964") {
  let p = String(raw || "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  p = p.replace(/\D/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith(cc + "0")) p = cc + p.slice(cc.length + 1);
  if (cc === "964") {
    if (/^07\d{9}$/.test(p)) p = "964" + p.slice(1);
    else if (/^7\d{9}$/.test(p)) p = "964" + p;
  } else if (p.startsWith("0")) p = cc + p.slice(1);
  return /^\d{10,15}$/.test(p) ? p : "";
}

const STOP = /^(ايقاف|توقف|وقف|اوقف|بطل|كافي|الغاء|الغاء الاشتراك|لا ترسل|لاترسل|stop|unsubscribe|ڕاگرتن|راگرتن)( .*)?$/;
const START = /^(اشتراك|اشترك|رجعني|start|subscribe)$/;
const HUMAN = /(موظف|انسان|بشري|شخص|احجي|اتكلم|اتصال|اتصل|agent|human)/;
const BOOK = /^(احجز|حجز|احجزلي|اريد احجز|ابي احجز|book)/;
const HELLO = /^(هلا|هلو|مرحبا|مرحبه|السلام|سلام|اهلا|القائمه|قائمه|منيو|menu|hi|hello|عروض|العروض|شوف العروض|شنو العروض|عروضكم|0)$/;
const VISA = /(فيزا|فيزه|تاشيره|visa|viza)/;
const TOUR = /(كروب|كروبات|جروب|سفره|رحله سياحيه|برنامج|بكج|باكج|package|tour)/;

const money = (n, iqd) => (n == null ? "" : Number(n).toLocaleString("en-US") + (iqd ? " د.ع" : "$"));
const dmy = (iso) => (iso && iso.length >= 10 ? iso.slice(8, 10) + "-" + iso.slice(5, 7) + "-" + iso.slice(0, 4) : "");
const text = (body) => ({ type: "text", text: { body: body.slice(0, 4000), preview_url: false } });

function menu(name, data) {
  return {
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: "سافر مع عبدالله ✈️" },
      body: { text: (name ? "هلا " + name + " 🌹\n" : "هلا بيك 🌹\n") + "شنو تحب نساعدك بيه؟ اختار من القائمة، أو اكتب اسم أي مدينة أو دولة وأرد عليك بالسعر." },
      footer: { text: "تذاكر · كروبات · فيزا" },
      action: {
        button: "القائمة",
        sections: [
          {
            title: "خدماتنا",
            rows: [
              { id: "flights", title: "✈️ أرخص التذاكر", description: "أرخص رحلات الأسبوع من بغداد" },
              { id: "tours", title: "🌴 الكروبات السياحية", description: "برامج كاملة: طيران وفندق واستقبال" },
              { id: "visa", title: "🛂 الفيزا", description: "الأسعار والأوراق المطلوبة لكل دولة" },
              { id: "human", title: "👤 أحجي ويا موظف", description: "للحجز أو أي سؤال ثاني" },
              { id: "stop", title: "🔕 إيقاف العروض", description: "ما توصلك رسائل العروض بعد" },
            ],
          },
        ],
      },
    },
  };
}

/* أرخص 8 رحلات ذهاب فقط من بغداد */
function cheapest(data) {
  const fs = (data.flights || []).filter((f) => f.o === "BGW" && f.ow).sort((a, b) => a.ow.p - b.ow.p).slice(0, 8);
  if (!fs.length) return null;
  return (
    "✈️ أرخص رحلات الأسبوع من بغداد (ذهاب فقط، للشخص):\n\n" +
    fs.map((f) => "• " + f.to + ": " + money(f.ow.p) + " (" + dmy(f.ow.date) + ")").join("\n") +
    "\n\nاكتب اسم المدينة اللي تريدها وأطلعلك كل أسعارها، أو اكتب «احجز»." +
    "\nالأسعار تتحدث كل ساعة وتتغير حسب التوفر."
  );
}

function flightText(fs, data) {
  const f0 = fs[0];
  const lines = ["✈️ تذاكر إلى " + f0.to + (f0.country && f0.country !== f0.to ? " (" + f0.country + ")" : "")];
  for (const f of fs.slice(0, 3)) {
    lines.push("", "من " + f.from + ":");
    for (const k of ["ow", "rt"]) {
      const m = (f.manual || []).filter((x) => x[k]).sort((a, b) => a[k] - b[k])[0];
      if (m) lines.push("• " + m.air.replace(/\s*-\s*كلاس.*$/, "") + (k === "ow" ? " ذهاب فقط" : " ذهاب وعودة") + " يبدي من " + money(m[k], m.iqd));
    }
    if (f.ow) lines.push("• ذهاب فقط يبدي من " + money(f.ow.p) + " (" + dmy(f.ow.date) + (f.ow.air ? "، " + f.ow.air : "") + ")");
    if (f.rt) lines.push("• ذهاب وعودة يبدي من " + money(f.rt.p) + " (" + dmy(f.rt.date) + " ← " + dmy(f.rt.ret) + ")");
    lines.push("التفاصيل: " + data.site + f.url);
  }
  lines.push("", "تريد نحجزلك؟ اكتب «احجز» ويا تاريخك وعدد المسافرين.");
  return lines.join("\n");
}

function visaText(v, data) {
  const rows = (v.rows || []).slice(0, 8);
  return [
    "🛂 " + v.c,
    "",
    ...rows.map((r) => "• " + r.t + ": " + (r.p ? money(r.p) : "اسأل موظفنا") + (r.d ? " (الإصدار " + r.d + ")" : "")),
    ...(v.req && v.req.length ? ["", "الأوراق المطلوبة:", ...v.req.slice(0, 8).map((x) => "- " + x)] : []),
    "",
    "التفاصيل والتقديم: " + data.site + v.url,
    "تريد تقدّم؟ اكتب «احجز» وموظفنا يكمل وياك.",
  ].join("\n");
}

function tourText(t, data) {
  const head = [
    "🌴 كروب " + t.t,
    t.dur && "🗓 " + t.dur,
    t.dates && t.dates.length && "المواعيد: " + t.dates.join("، "),
    t.p && "💵 يبدي من " + money(t.p) + " للشخص",
    t.inc && t.inc.length && "يشمل: " + t.inc.join("، "),
  ].filter(Boolean);
  return [...head, "", "الفنادق وكل التفاصيل: " + data.site + t.url, "تريد تحجز؟ اكتب «احجز»."].join("\n");
}

function tourList(data) {
  const ts = data.tours || [];
  if (!ts.length) return text("حالياً ماكو كروبات منزلة. اكتب «موظف» ونخبرك بأقرب كروب.");
  return {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "🌴 الكروبات السياحية من بغداد. اختار كروب وأدزلك تفاصيله، أو اكتب اسم الوجهة." },
      action: {
        button: "الكروبات",
        sections: [
          {
            title: "الكروبات",
            rows: ts.slice(0, 10).map((t, i) => ({
              id: "tour:" + i,
              title: t.t.slice(0, 24),
              description: ((t.dur || "") + (t.p ? " · من " + money(t.p) : "")).slice(0, 72),
            })),
          },
        ],
      },
    },
  };
}

/* يدوّر على مدينة/دولة/كروب بكلام الزبون، والأكثر كلمات مطابقة أول */
export function find(t, data) {
  const ws = words(t).map(stem);
  const score = (k) => (k || []).filter((x) => ws.includes(stem(x))).length;
  const pick = (xs, first) =>
    (xs || [])
      .map((x) => [score(x.k), x])
      .filter(([s]) => s)
      .sort((a, b) => b[0] - a[0] || (first ? first(a[1]) - first(b[1]) : 0))
      .map(([, x]) => x);
  return {
    flights: pick(data.flights, (f) => (f.o === "BGW" ? 0 : 1)),
    visas: pick(data.visas),
    tours: pick(data.tours),
  };
}

export function reply(t, id, data, ctx = {}) {
  const n = norm(t);
  const name = ctx.name || "";
  const staff = ctx.staff || data.phone || "";
  const staffLine = staff ? "\nأو راسلنا مباشرة: https://wa.me/" + staff : "";

  if (id === "stop" || STOP.test(n)) {
    return { act: "stop", msgs: [text("تم ✅ ما راح توصلك رسائل العروض بعد.\nإذا احتجت أي شي راسلنا بأي وقت، وإذا تريد ترجع للعروض اكتب «اشتراك».")] };
  }
  if (START.test(n)) {
    return { act: "start", msgs: [text("هلا بيك من جديد 🌹 رجعنالك العروض. اكتب «القائمة» حتى تشوف خدماتنا.")] };
  }
  if (ctx.human) return { act: "", msgs: [] }; // موظف يرد هسه، البوت يسكت

  if (id === "human" || HUMAN.test(n)) {
    return { act: "human", msgs: [text("أكيد 🌹 واحد من موظفينا يرد عليك هنا بأقرب وقت.\nاكتب سؤالك أو تفاصيل سفرتك (الوجهة، التاريخ، عدد المسافرين)." + staffLine)] };
  }
  if (BOOK.test(n)) {
    return {
      act: "human",
      msgs: [text("تمام 👌 حتى نحجزلك، اكتب:\n1. الوجهة\n2. تاريخ السفر (والرجعة إذا موجودة)\n3. عدد المسافرين (بالغين وأطفال)\n\nوموظفنا يكمل وياك هنا بأقرب وقت." + staffLine)],
    };
  }
  if (id === "menu" || HELLO.test(n)) return { act: "", msgs: [menu(name, data)] };
  if (id === "flights") return { act: "", msgs: [text(cheapest(data) || "اكتب اسم المدينة اللي تريد تسافر إلها وأطلعلك أسعارها.")] };
  if (id === "tours") return { act: "", msgs: [tourList(data)] };
  if (id === "visa") {
    const vs = (data.visas || []).slice(0, 12).map((v) => v.c.replace(/^فيزا /, "")).join("، ");
    return { act: "", msgs: [text("🛂 اكتب اسم الدولة اللي تريد فيزتها وأدزلك السعر والأوراق.\nعدنا فيزا لأكثر من " + (data.visas || []).length + " دولة، مثل: " + vs + "\n\nكل الفيز: " + data.site + "destinations.html")] };
  }
  if (id && id.startsWith("tour:")) {
    const tour = (data.tours || [])[parseInt(id.slice(5), 10)];
    if (tour) return { act: "", msgs: [text(tourText(tour, data))] };
  }

  const f = find(t, data);
  const wantVisa = VISA.test(n);
  const wantTour = TOUR.test(n);
  const out = [];
  if (wantVisa && f.visas.length) out.push(text(visaText(f.visas[0], data)));
  else if (wantTour && f.tours.length) out.push(...f.tours.slice(0, 2).map((x) => text(tourText(x, data))));
  else {
    if (f.tours.length) out.push(text(tourText(f.tours[0], data)));
    if (f.flights.length) {
      const d = f.flights[0].d;
      out.push(text(flightText(f.flights.filter((x) => x.d === d), data)));
    }
    if (f.visas.length && !out.length) out.push(text(visaText(f.visas[0], data)));
  }
  if (out.length) return { act: "", msgs: out.slice(0, 3) };

  if (wantVisa) return reply("", "visa", data, ctx);
  if (wantTour) return reply("", "tours", data, ctx);
  return {
    act: "",
    msgs: [text("ما فهمت عليك تماماً 🙏 اكتب اسم المدينة أو الدولة (مثلاً: إسطنبول، دبي، فيزا تركيا)، أو اكتب «موظف» حتى يرد عليك واحد من الشركة."), menu("", data)],
  };
}
