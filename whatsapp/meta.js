/* الاتصال بواتساب الرسمي (Cloud API)، بطريقتين:
 *   - عن طريق 360dialog (D360_API_KEY): نفس رقمك اللي على تطبيق واتساب بزنس يبقى شغّال (Coexistence)، ومفتاح واحد بس.
 *   - مباشرة ويا ميتا (WA_TOKEN + WA_PHONE_ID): رقم جديد وحساب مطوّرين.
 * الرسائل نفسها بنفس الصيغة بالطريقتين. */

const D360 = "https://waba-v2.360dialog.io/";
export const GRAPH = (env) => (env.GRAPH_URL || "https://graph.facebook.com/") + (env.GRAPH_VERSION || "v23.0") + "/";
const endpoint = (env) => (env.D360_API_KEY ? (env.GRAPH_URL || D360) + "messages" : GRAPH(env) + env.WA_PHONE_ID + "/messages");
const auth = (env) => (env.D360_API_KEY ? { "D360-API-KEY": env.D360_API_KEY } : { Authorization: "Bearer " + env.WA_TOKEN });

/* رابط الويب هوك السري (360dialog ما توقّع الرسائل، فالسر بالرابط نفسه) */
export async function hookKey(env) {
  if (env.WA_VERIFY_TOKEN) return env.WA_VERIFY_TOKEN;
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("hook:" + (env.ADMIN_TOKEN || "")));
  return [...new Uint8Array(h)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* يخلي 360dialog تدز الردود وحالة الإرسال على رابطنا */
export async function setHook(env, url) {
  const r = await fetch((env.GRAPH_URL || D360) + "v1/configs/webhook", {
    method: "POST",
    headers: { ...auth(env), "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) throw new Error("360dialog رفضت: " + r.status + " " + (await r.text()).slice(0, 200));
}

/* يرسل رسالة. يرجّع { ok, id } أو { ok: false, code, msg, retry } */
export async function send(env, to, msg) {
  let r, j;
  try {
    r = await fetch(endpoint(env), {
      method: "POST",
      headers: { ...auth(env), "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...msg }),
    });
    j = await r.json();
  } catch (e) {
    return { ok: false, code: 0, msg: "network: " + e, retry: true };
  }
  if (r.ok && j.messages && j.messages[0]) return { ok: true, id: j.messages[0].id };
  const err = j.error || {};
  return { ok: false, code: err.code || r.status, msg: err.message || "", retry: r.status >= 500 || err.code === 130429 || err.code === 131000 };
}

export function markRead(env, id) {
  return fetch(endpoint(env), {
    method: "POST",
    headers: { ...auth(env), "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: id }),
  }).catch(() => null);
}

/* رسالة القالب الإعلاني المعتمد من ميتا.
 * vars: نصوص المتغيرات {{1}} {{2}}... بالترتيب، و«{name}» ينبدّل باسم الزبون. image: رابط صورة الهيدر (إذا القالب بيه صورة). */
export function template(c, name) {
  const comps = [];
  if (c.image) comps.push({ type: "header", parameters: [{ type: "image", image: { link: c.image } }] });
  const vars = JSON.parse(c.vars || "[]");
  if (vars.length) {
    comps.push({
      type: "body",
      parameters: vars.map((v) => ({ type: "text", text: String(v).replace(/\{name\}/g, name || "زبوننا العزيز") || "-" })),
    });
  }
  return { type: "template", template: { name: c.tpl, language: { code: c.lang || "ar" }, ...(comps.length ? { components: comps } : {}) } };
}

/* توقيع ميتا على الويب هوك (X-Hub-Signature-256) حتى محد يزوّر رسائل */
export async function verify(env, raw, header) {
  if (!env.WA_APP_SECRET) return true;
  if (!header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.WA_APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const want = header.slice(7);
  if (hex.length !== want.length) return false;
  let d = 0;
  for (let i = 0; i < hex.length; i++) d |= hex.charCodeAt(i) ^ want.charCodeAt(i);
  return d === 0;
}

/* أخطاء تخص الرقم نفسه (نكمل الإرسال للباقي) */
export const PER_USER = {
  131026: "bad", // الرقم ما عليه واتساب أو ما يستلم
  131049: "capped", // ميتا حددت كم إعلان يوصل للشخص من كل الشركات، ينرسل له بحملة ثانية
  131050: "out", // الشخص وكّف رسائل التسويق من واتساب نفسه
  131021: "bad", // نفس رقم الشركة
};
