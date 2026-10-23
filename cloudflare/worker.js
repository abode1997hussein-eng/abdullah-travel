/* سيرفر البحث اللحظي لـ«سافر مع عبدالله» — ينلصق بكلاود فلير (Workers).
 *
 * الموقع يسأله: /search?from=BGW&to=IST&date=2026-11-10&ret=2026-11-20&adults=1
 * وهو يسأل كوكل فلايتس عن طريق «سيرب» (serpapi.com)، ويرجّع الرحلات بأسعارها + العمولة.
 *
 * الإعدادات بكلاود فلير (Settings ← Variables and Secrets):
 *   SERPAPI_KEY      (سري)  مفتاح حساب سيرب
 *   COMMISSION       العمولة بالدولار على سعر الشخص (الافتراضي 15)
 *   ALLOWED_ORIGINS  المواقع المسموح تبحث (الافتراضي موقع الشركة)
 *   CACHE_SECONDS    كم ثانية يبقى نفس البحث محفوظ حتى ما ينحسب مرتين (الافتراضي 3600)
 *   MAX_PER_HOUR     أكثر عدد بحث لنفس الشخص بالساعة (الافتراضي 40)
 */

const SITE = "https://abode1997hussein-eng.github.io,https://abdullah-travel.pages.dev";
const CODES = /^[A-Z]{3}(,[A-Z]{3}){0,7}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ذاكرة قصيرة داخل السيرفر: نفس البحث، وعدّاد البحث لكل شخص */
const memo = new Map();
const hits = new Map();

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(headers || {}) },
  });
}

/* نختصر رد كوكل لشي صغير: السعر + العمولة، المدة، الرحلات، والترانزيت */
function shape(j, fee, rt) {
  const pick = (f) => ({
    p: Math.round(f.price + fee),
    dur: f.total_duration || 0,
    legs: (f.flights || []).map((l) => ({
      al: l.airline || "",
      logo: l.airline_logo || "",
      no: l.flight_number || "",
      from: (l.departure_airport || {}).id || "",
      to: (l.arrival_airport || {}).id || "",
      dep: (l.departure_airport || {}).time || "",
      arr: (l.arrival_airport || {}).time || "",
      dur: l.duration || 0,
      plane: l.airplane || "",
    })),
    lay: (f.layovers || []).map((x) => ({ id: x.id || "", name: x.name || "", dur: x.duration || 0, night: !!x.overnight })),
  });
  const all = [...(j.best_flights || []), ...(j.other_flights || [])]
    .filter((f) => f.price && f.flights && f.flights.length)
    .map(pick)
    .sort((a, b) => a.p - b.p);
  const pi = j.price_insights || {};
  return {
    rt,
    flights: all,
    insight: pi.price_level
      ? {
          level: pi.price_level,
          low: pi.lowest_price ? Math.round(pi.lowest_price + fee) : null,
          typical: (pi.typical_price_range || []).map((x) => Math.round(x + fee)),
        }
      : null,
    at: new Date().toISOString(),
  };
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const allowed = (env.ALLOWED_ORIGINS || SITE).split(",").map((s) => s.trim()).filter(Boolean);
    const origin = req.headers.get("Origin") || "";
    const cors = { "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0], Vary: "Origin" };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" } });
    }
    if (url.pathname === "/") return json({ ok: true, service: "abdullah-flights" }, 200, cors);
    if (url.pathname !== "/search" || req.method !== "GET") return json({ error: "not_found" }, 404, cors);
    if (!allowed.includes(origin)) return json({ error: "forbidden" }, 403, cors);
    if (!env.SERPAPI_KEY) return json({ error: "no_key" }, 500, cors);

    const from = (url.searchParams.get("from") || "").toUpperCase();
    const to = (url.searchParams.get("to") || "").toUpperCase();
    const date = url.searchParams.get("date") || "";
    const ret = url.searchParams.get("ret") || "";
    const adults = Math.min(9, Math.max(1, parseInt(url.searchParams.get("adults") || "1", 10) || 1));
    if (!CODES.test(from) || !CODES.test(to) || !DATE.test(date) || (ret && !DATE.test(ret))) {
      return json({ error: "bad_request" }, 400, cors);
    }

    const keyStr = [from, to, date, ret, adults].join("|");
    const ttl = (parseInt(env.CACHE_SECONDS || "3600", 10) || 3600) * 1000;
    const now = Date.now();
    const m = memo.get(keyStr);
    if (m && now - m.t < ttl) return json(m.body, 200, { ...cors, "X-Cache": "memo" });

    const cacheKey = new Request("https://cache.abdullah-flights/search?" + encodeURIComponent(keyStr));
    const cache = typeof caches !== "undefined" ? caches.default : null;
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const body = await hit.json();
        memo.set(keyStr, { t: now, body });
        return json(body, 200, { ...cors, "X-Cache": "edge" });
      }
    }

    /* حد البحث لكل شخص بالساعة، حتى محد يصرف رصيد الحساب */
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    const max = parseInt(env.MAX_PER_HOUR || "40", 10) || 40;
    const h = (hits.get(ip) || []).filter((t) => now - t < 3600000);
    if (h.length >= max) return json({ error: "too_many" }, 429, cors);
    h.push(now);
    hits.set(ip, h);

    const q = new URLSearchParams({
      engine: "google_flights",
      departure_id: from,
      arrival_id: to,
      outbound_date: date,
      type: ret ? "1" : "2",
      currency: "USD",
      hl: "en",
      gl: "iq",
      adults: String(adults),
      api_key: env.SERPAPI_KEY,
    });
    if (ret) q.set("return_date", ret);

    let j;
    try {
      const r = await fetch("https://serpapi.com/search.json?" + q.toString());
      j = await r.json();
    } catch (e) {
      return json({ error: "provider_down" }, 502, cors);
    }
    /* «ماكو نتائج» مو خطأ: نرجع قائمة فاضية حتى الموقع يطلّع زر الواتساب */
    if (j.error && !/returned any results/i.test(j.error)) return json({ error: "provider", message: j.error }, 502, cors);

    const body = shape(j, parseFloat(env.COMMISSION || "15") || 0, !!ret);
    memo.set(keyStr, { t: now, body });
    if (cache && body.flights.length) {
      ctx.waitUntil(cache.put(cacheKey, json(body, 200, { "Cache-Control": "public, max-age=" + Math.round(ttl / 1000) })));
    }
    return json(body, 200, { ...cors, "X-Cache": "miss" });
  },
};
