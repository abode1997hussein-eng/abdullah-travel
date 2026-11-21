/* أدوات صغيرة بلا إنترنت (تنفحص بـ node whatsapp/test.mjs). */

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

function norm(s) {
  return String(s || "")
    .replace(/[ً-ٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .trim();
}

/* «إيقاف» وأخواتها: الشخص ما يريد عروض بعد */
export const isStop = (t) => /^(ايقاف|توقف|وقف|اوقف|بطل|كافي|الغاء|الغاء الاشتراك|لا ترسل|لاترسل|stop|unsubscribe|ڕاگرتن|راگرتن)( .*)?$/.test(norm(t));
/* يريد يرجع للعروض */
export const isStart = (t) => /^(اشتراك|اشترك|رجعني|start|subscribe)$/.test(norm(t));
