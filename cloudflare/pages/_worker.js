// الرابط القصير المجاني safir-abdullah.pages.dev
// ما بيه نسخة من الموقع: كل طلب يجيب نفس الصفحة من GitHub Pages ويرجعها، فالموقع يبقى يتحدث من main مثل ما هو
// وما يحتاج ينبني من جديد ويا كل تحديث أسعار.
const ORIGIN = "https://abode1997hussein-eng.github.io";
const BASE = "/abdullah-travel";

export default {
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const upstream = ORIGIN + BASE + url.pathname + url.search;
    const html = url.pathname === "/" || url.pathname.endsWith(".html");
    const res = await fetch(upstream, {
      method: req.method,
      redirect: "manual",
      // الصفحات تتحدث كل دقيقة، والصور والملفات الثانية كل ساعة
      cf: { cacheTtl: html || /\.(json|js|xml|webmanifest)$/.test(url.pathname) ? 60 : 3600, cacheEverything: true },
    });
    const out = new Response(res.body, res);
    const loc = res.headers.get("Location");
    if (loc) {
      // GitHub يحوّل المجلدات لنفسه (مثل /abdullah-travel/flights → .../flights/)، نخلي التحويل يبقى على الرابط القصير
      const l = new URL(loc, upstream);
      if (l.origin === ORIGIN && l.pathname.startsWith(BASE)) out.headers.set("Location", url.origin + l.pathname.slice(BASE.length) + l.search + l.hash);
    }
    out.headers.delete("x-github-request-id");
    return out;
  },
};
