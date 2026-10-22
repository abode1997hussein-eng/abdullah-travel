/* بوت واتساب «سافر مع عبدالله» — على كلاود فلير (Workers + Durable Object بقاعدة SQLite).
 *
 * يسوي 3 شغلات:
 *   1. يرسل رسالة العروض (قالب معتمد من ميتا) لكل الأرقام، على دفعات حسب الحد اليومي لميتا، وبساعات الدوام بس.
 *   2. يرد وحده على الزبائن: أسعار التذاكر والكروبات والفيزا من bot.json (نفس أسعار الموقع)، ويحوّل للموظف.
 *   3. اللي يكتب «إيقاف» ما توصله عروض بعد، والرقم اللي ما عليه واتساب ينشال وحده.
 *
 * الروابط:
 *   /webhook   ميتا تدز عليه الرسائل وحالة الإرسال (ينحط بإعدادات التطبيق بميتا)
 *   /admin     صفحة الإدارة: رفع الأرقام، الحملات، والمحادثات (بكلمة سر ADMIN_TOKEN)
 *
 * الإعدادات بكلاود فلير (Settings ← Variables and Secrets):
 *   WA_TOKEN        (سري)  توكن دائم من System User بميتا
 *   WA_PHONE_ID            رقم تعريف رقم الهاتف (Phone number ID) من صفحة WhatsApp ← API Setup
 *   WA_APP_SECRET   (سري)  App Secret للتطبيق (حتى نتأكد الرسائل جاية من ميتا)
 *   WA_VERIFY_TOKEN (سري)  أي كلمة تختارها، نفسها تنكتب بميتا وقت ربط الويب هوك
 *   ADMIN_TOKEN     (سري)  كلمة سر صفحة الإدارة
 *   DAILY_LIMIT            كم شخص باليوم (الافتراضي 250، نفس حد ميتا للحساب الجديد). يتغير من صفحة الإدارة هم
 *   SEND_HOURS             ساعات الإرسال بتوقيت بغداد (الافتراضي 10-21)
 *   MIN_DAYS               أقل عدد أيام بين إعلانين لنفس الشخص (الافتراضي 3)
 *   HUMAN_HOURS            كم ساعة يسكت البوت بعد ما الزبون يطلب موظف (الافتراضي 12)
 *   STAFF_PHONE            رقم المكتب للي يريد يحجي مباشرة (الافتراضي من bot.json)
 *   SITE_URL               رابط الموقع اللي بيه bot.json
 */
import { DurableObject } from "cloudflare:workers";
import { reply, phone } from "./bot.js";
import { send, markRead, template, verify, PER_USER } from "./meta.js";
import ADMIN from "./admin.html";

const SITE = "https://abode1997hussein-eng.github.io/abdullah-travel/";
const DAY = 86400000;
const BATCH = 40; // رسائل بكل دفعة (حد كلاود فلير المجاني 50 اتصال بالمرة)
const GAP = 4000; // بين دفعة ودفعة
const RANK = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4, capped: 4, bad: 4, out: 4 };

const json = (b, s) => new Response(JSON.stringify(b), { status: s || 200, headers: { "Content-Type": "application/json; charset=utf-8" } });

function same(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const hub = env.HUB.get(env.HUB.idFromName("main"));

    if (url.pathname === "/") return json({ ok: true, service: "abdullah-whatsapp" });

    if (url.pathname === "/webhook") {
      if (req.method === "GET") {
        const ok = url.searchParams.get("hub.mode") === "subscribe" && same(url.searchParams.get("hub.verify_token"), env.WA_VERIFY_TOKEN);
        return ok ? new Response(url.searchParams.get("hub.challenge") || "") : new Response("forbidden", { status: 403 });
      }
      if (req.method === "POST") {
        const raw = await req.text();
        if (!(await verify(env, raw, req.headers.get("X-Hub-Signature-256")))) return new Response("bad signature", { status: 401 });
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }
        ctx.waitUntil(hub.webhook(body)); // ميتا تريد 200 بسرعة، والشغل يكمل بعدين
        return new Response("ok");
      }
    }

    if (url.pathname === "/admin") return new Response(ADMIN, { headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" } });

    if (url.pathname.startsWith("/api/")) {
      const tok = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
      if (!env.ADMIN_TOKEN || !same(tok, env.ADMIN_TOKEN)) return json({ error: "كلمة السر غلط" }, 401);
      let body = {};
      if (req.method === "POST") body = await req.json().catch(() => ({}));
      const q = Object.fromEntries(url.searchParams);
      try {
        return json(await hub.api(url.pathname.slice(5), { ...q, ...body }));
      } catch (e) {
        return json({ error: String(e.message || e) }, 400);
      }
    }
    return json({ error: "not_found" }, 404);
  },
};

export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS contacts (phone TEXT PRIMARY KEY, name TEXT, added INTEGER, out INTEGER DEFAULT 0, bad INTEGER DEFAULT 0, last_in INTEGER);
      CREATE TABLE IF NOT EXISTS camps (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, tpl TEXT, lang TEXT, image TEXT, vars TEXT, state TEXT, created INTEGER, note TEXT);
      CREATE TABLE IF NOT EXISTS sends (camp INTEGER, phone TEXT, at INTEGER, wamid TEXT, st TEXT, err TEXT, PRIMARY KEY (camp, phone));
      CREATE INDEX IF NOT EXISTS sends_wamid ON sends (wamid);
      CREATE INDEX IF NOT EXISTS sends_at ON sends (at);
      CREATE INDEX IF NOT EXISTS sends_phone ON sends (phone, at);
      CREATE TABLE IF NOT EXISTS msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT, dir TEXT, body TEXT, at INTEGER);
      CREATE INDEX IF NOT EXISTS msgs_phone ON msgs (phone, id);
      CREATE TABLE IF NOT EXISTS human (phone TEXT PRIMARY KEY, until INTEGER);
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
    `);
    this.data = null;
  }

  q(s, ...a) {
    return this.sql.exec(s, ...a).toArray();
  }
  one(s, ...a) {
    return this.q(s, ...a)[0] || null;
  }
  get(k, d) {
    const r = this.one("SELECT v FROM kv WHERE k = ?", k);
    return r ? r.v : d;
  }
  set(k, v) {
    this.sql.exec("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, String(v));
  }
  log(p, dir, body) {
    this.sql.exec("INSERT INTO msgs (phone, dir, body, at) VALUES (?, ?, ?, ?)", p, dir, String(body || "").slice(0, 2000), Date.now());
  }

  /* أسعار البوت من الموقع، تتحدث كل 10 دقايق */
  async botData() {
    if (this.data && Date.now() - this.data.t < 600000) return this.data.d;
    try {
      const r = await fetch((this.env.SITE_URL || SITE) + "bot.json", { cf: { cacheTtl: 300 } });
      if (r.ok) this.data = { t: Date.now(), d: await r.json() };
    } catch {}
    return this.data ? this.data.d : { site: this.env.SITE_URL || SITE, flights: [], visas: [], tours: [] };
  }

  /* ------------------------------------------------------------ الويب هوك */
  async webhook(body) {
    for (const e of body.entry || []) {
      for (const ch of e.changes || []) {
        const v = ch.value || {};
        if (ch.field === "messages") {
          const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, (c.profile || {}).name || ""]));
          for (const s of v.statuses || []) this.status(s);
          for (const m of v.messages || []) await this.incoming(m, names[m.from] || "");
        } else if (ch.field === "phone_number_quality_update") {
          this.set("quality", (v.event || "") + " " + (v.current_limit || ""));
          if (/FLAGGED|DOWNGRADE/i.test(v.event || "")) this.pauseAll("ميتا نزّلت جودة الرقم (" + v.event + "). وكّفنا الإرسال حتى ما ينحظر.");
        } else if (ch.field === "message_template_status_update") {
          if (/PAUSED|DISABLED|REJECTED/i.test(v.event || "")) {
            this.sql.exec("UPDATE camps SET state = 'paused', note = ? WHERE tpl = ? AND state = 'running'", "ميتا وكّفت القالب (" + v.event + "): " + (v.reason || ""), v.message_template_name || "");
          }
        }
      }
    }
  }

  status(s) {
    const row = this.one("SELECT camp, phone, st FROM sends WHERE wamid = ?", s.id || "");
    if (!row) return;
    let st = s.status;
    const err = (s.errors || [])[0];
    if (st === "failed" && err && PER_USER[err.code]) st = PER_USER[err.code];
    if ((RANK[st] ?? -1) <= (RANK[row.st] ?? -1) && st !== "failed") return;
    this.sql.exec("UPDATE sends SET st = ?, err = ? WHERE camp = ? AND phone = ?", st, err ? err.code + " " + (err.title || err.message || "") : null, row.camp, row.phone);
    this.flag(row.phone, st);
  }

  flag(p, kind) {
    if (kind === "bad") this.sql.exec("UPDATE contacts SET bad = 1 WHERE phone = ?", p);
    if (kind === "out") this.sql.exec("UPDATE contacts SET out = 1 WHERE phone = ?", p);
  }

  async incoming(m, profile) {
    const p = m.from;
    const now = Date.now();
    this.sql.exec(
      "INSERT INTO contacts (phone, name, added, last_in) VALUES (?, ?, ?, ?) ON CONFLICT(phone) DO UPDATE SET last_in = excluded.last_in, bad = 0, name = COALESCE(NULLIF(contacts.name, ''), excluded.name)",
      p, profile, now, now
    );
    let text = "", id = "";
    if (m.type === "text") text = (m.text || {}).body || "";
    else if (m.type === "button") (text = (m.button || {}).text || ""), (id = /^(stop|menu|human|flights|tours|visa)$/.test((m.button || {}).payload || "") ? m.button.payload : "");
    else if (m.type === "interactive") {
      const r = (m.interactive || {}).button_reply || (m.interactive || {}).list_reply || {};
      (text = r.title || ""), (id = r.id || "");
    }
    this.log(p, "in", text || "[" + m.type + "]");
    await markRead(this.env, m.id);

    const h = this.one("SELECT until FROM human WHERE phone = ?", p);
    const human = !!(h && h.until > now);
    const c = this.one("SELECT name FROM contacts WHERE phone = ?", p);
    const name = ((c && c.name) || profile || "").split(/\s+/)[0];
    const hours = parseFloat(this.env.HUMAN_HOURS || "12") || 12;

    let r;
    if (!text && !id) {
      // صورة، صوت، ملف... (جواز أو مستمسكات غالباً): تروح للموظف
      r = human ? { act: "", msgs: [] } : { act: "human", msgs: [{ type: "text", text: { body: "وصلت 👍 موظفنا يشوفها ويرد عليك هنا بأقرب وقت." } }] };
    } else {
      r = reply(text, id, await this.botData(), { name, human, staff: this.env.STAFF_PHONE });
    }
    if (r.act === "stop") this.sql.exec("UPDATE contacts SET out = 1 WHERE phone = ?", p);
    if (r.act === "start") this.sql.exec("UPDATE contacts SET out = 0 WHERE phone = ?", p);
    if (r.act === "human") this.sql.exec("INSERT INTO human (phone, until) VALUES (?, ?) ON CONFLICT(phone) DO UPDATE SET until = excluded.until", p, now + hours * 3600000);
    for (const msg of r.msgs) {
      const res = await send(this.env, p, msg);
      this.log(p, "bot", res.ok ? (msg.text ? msg.text.body : "[القائمة]") : "[ما انرسل: " + res.code + " " + res.msg + "]");
    }
  }

  /* ------------------------------------------------------------ الإرسال على دفعات */
  pauseAll(note) {
    this.sql.exec("UPDATE camps SET state = 'paused', note = ? WHERE state = 'running'", note);
  }

  limit() {
    return parseInt(this.get("limit", this.env.DAILY_LIMIT || "250"), 10) || 250;
  }

  used() {
    return this.one("SELECT COUNT(DISTINCT phone) AS n FROM sends WHERE at > ? AND wamid IS NOT NULL", Date.now() - DAY).n;
  }

  /* الوقت الجاي اللي يصير بيه إرسال، بتوقيت بغداد (UTC+3) */
  openAt(now) {
    const [a, b] = (this.env.SEND_HOURS || "10-21").split("-").map((x) => parseInt(x, 10));
    const h = (new Date(now).getUTCHours() + 3) % 24;
    if (h >= a && h < b) return now;
    const d = new Date(now);
    d.setUTCMinutes(0, 0, 0);
    let add = (a - h + 24) % 24 || 24;
    return d.getTime() + add * 3600000;
  }

  async alarm() {
    const c = this.one("SELECT * FROM camps WHERE state = 'running' ORDER BY id LIMIT 1");
    if (!c) return;
    const now = Date.now();
    const open = this.openAt(now);
    if (open > now) return this.ctx.storage.setAlarm(open);

    const room = this.limit() - this.used();
    if (room <= 0) {
      const old = this.one("SELECT MIN(at) AS t FROM sends WHERE at > ? AND wamid IS NOT NULL", now - DAY);
      this.sql.exec("UPDATE camps SET note = ? WHERE id = ?", "وصلنا حد اليوم (" + this.limit() + ")، يكمل وحده بعدين", c.id);
      return this.ctx.storage.setAlarm(Math.max(now + 60000, ((old && old.t) || now) + DAY + 1000));
    }

    const gap = (parseFloat(this.env.MIN_DAYS || "3") || 0) * DAY;
    const rows = this.q(
      `SELECT phone, name FROM contacts c WHERE out = 0 AND bad = 0
         AND NOT EXISTS (SELECT 1 FROM sends s WHERE s.camp = ? AND s.phone = c.phone)
         AND NOT EXISTS (SELECT 1 FROM sends s WHERE s.phone = c.phone AND s.at > ?)
       ORDER BY rowid LIMIT ?`,
      c.id, now - gap, Math.min(room, BATCH)
    );
    if (!rows.length) {
      const left = this.one("SELECT COUNT(*) AS n FROM contacts c WHERE out = 0 AND bad = 0 AND NOT EXISTS (SELECT 1 FROM sends s WHERE s.camp = ? AND s.phone = c.phone)", c.id).n;
      if (left) {
        this.sql.exec("UPDATE camps SET note = ? WHERE id = ?", left + " رقم وصلهم إعلان قبل أقل من " + (this.env.MIN_DAYS || 3) + " أيام، ينرسلهم بعدين", c.id);
        return this.ctx.storage.setAlarm(now + 3600000);
      }
      this.sql.exec("UPDATE camps SET state = 'done', note = 'خلصت' WHERE id = ?", c.id);
      return this.next();
    }

    for (const r of rows) {
      const res = await send(this.env, r.phone, template(c, (r.name || "").split(/\s+/)[0]));
      if (res.ok) {
        this.sql.exec("INSERT OR REPLACE INTO sends (camp, phone, at, wamid, st) VALUES (?, ?, ?, ?, 'accepted')", c.id, r.phone, Date.now(), res.id);
        this.set("fails", 0);
      } else if (PER_USER[res.code]) {
        this.sql.exec("INSERT OR REPLACE INTO sends (camp, phone, at, st, err) VALUES (?, ?, ?, ?, ?)", c.id, r.phone, Date.now(), PER_USER[res.code], res.code + " " + res.msg);
        this.flag(r.phone, PER_USER[res.code]);
      } else if (res.retry) {
        const f = parseInt(this.get("fails", "0"), 10) + 1;
        this.set("fails", f);
        if (f >= 10) return this.pauseAll("ميتا ما ترد (" + res.code + " " + res.msg + ")");
        return this.ctx.storage.setAlarm(Date.now() + 60000 * f);
      } else {
        // التوكن، القالب، أو الحساب: نوكّف ونكتب السبب حتى تصلحه
        return this.sql.exec("UPDATE camps SET state = 'paused', note = ? WHERE id = ?", "وكّف: " + res.code + " " + res.msg, c.id);
      }
    }
    this.sql.exec("UPDATE camps SET note = '' WHERE id = ?", c.id);
    this.ctx.storage.setAlarm(Date.now() + GAP);
  }

  next() {
    if (this.one("SELECT id FROM camps WHERE state = 'running' LIMIT 1")) this.ctx.storage.setAlarm(Date.now() + 1000);
  }

  /* ------------------------------------------------------------ صفحة الإدارة */
  async api(path, b) {
    const now = Date.now();
    switch (path) {
      case "stats": {
        const n = (s, ...a) => this.one(s, ...a).n;
        const camps = this.q("SELECT * FROM camps ORDER BY id DESC LIMIT 20").map((c) => {
          const by = Object.fromEntries(this.q("SELECT st, COUNT(*) AS n FROM sends WHERE camp = ? GROUP BY st", c.id).map((r) => [r.st, r.n]));
          const pending = n("SELECT COUNT(*) AS n FROM contacts x WHERE out = 0 AND bad = 0 AND NOT EXISTS (SELECT 1 FROM sends s WHERE s.camp = ? AND s.phone = x.phone)", c.id);
          return { ...c, by, pending };
        });
        return {
          contacts: n("SELECT COUNT(*) AS n FROM contacts"),
          out: n("SELECT COUNT(*) AS n FROM contacts WHERE out = 1"),
          bad: n("SELECT COUNT(*) AS n FROM contacts WHERE bad = 1"),
          replied: n("SELECT COUNT(*) AS n FROM contacts WHERE last_in > ?", now - 7 * DAY),
          used: this.used(),
          limit: this.limit(),
          quality: this.get("quality", ""),
          camps,
        };
      }
      case "contacts": {
        const cc = this.env.COUNTRY_CODE || "964";
        let ok = 0, bad = 0;
        const before = this.one("SELECT COUNT(*) AS n FROM contacts").n;
        for (const r of (b.rows || []).slice(0, 5000)) {
          const p = phone(r.phone, cc);
          if (!p) {
            bad++;
            continue;
          }
          ok++;
          this.sql.exec(
            "INSERT INTO contacts (phone, name, added) VALUES (?, ?, ?) ON CONFLICT(phone) DO UPDATE SET name = COALESCE(NULLIF(contacts.name, ''), excluded.name)",
            p, String(r.name || "").slice(0, 80), now
          );
        }
        const added = this.one("SELECT COUNT(*) AS n FROM contacts").n - before;
        return { added, dup: ok - added, invalid: bad };
      }
      case "optout": {
        let n = 0;
        for (const raw of b.phones || []) {
          const p = phone(raw, this.env.COUNTRY_CODE || "964");
          if (!p) continue;
          this.sql.exec("INSERT INTO contacts (phone, name, added, out) VALUES (?, '', ?, 1) ON CONFLICT(phone) DO UPDATE SET out = 1", p, now);
          n++;
        }
        return { n };
      }
      case "optouts":
        return { phones: this.q("SELECT phone, name FROM contacts WHERE out = 1 ORDER BY phone") };
      case "limit": {
        const l = parseInt(b.limit, 10);
        if (!(l > 0)) throw new Error("الرقم غلط");
        this.set("limit", l);
        this.next();
        return { limit: l };
      }
      case "campaign": {
        if (!/^[a-z0-9_]+$/.test(b.tpl || "")) throw new Error("اسم القالب لازم نفس اللي بميتا بالضبط (حروف إنكليزية صغيرة وأرقام و_)");
        const vars = Array.isArray(b.vars) ? b.vars : String(b.vars || "").split("\n").map((s) => s.trim()).filter(Boolean);
        this.sql.exec("INSERT INTO camps (name, tpl, lang, image, vars, state, created, note) VALUES (?, ?, ?, ?, ?, 'draft', ?, '')",
          b.name || b.tpl, b.tpl, b.lang || "ar", b.image || "", JSON.stringify(vars), now);
        return { id: this.one("SELECT last_insert_rowid() AS id").id };
      }
      case "test": {
        const c = b.id ? this.one("SELECT * FROM camps WHERE id = ?", b.id) : { tpl: b.tpl, lang: b.lang, image: b.image, vars: JSON.stringify(b.vars || []) };
        const p = phone(b.phone, this.env.COUNTRY_CODE || "964");
        if (!c || !p) throw new Error("الحملة أو الرقم غلط");
        const res = await send(this.env, p, template(c, b.name || ""));
        if (!res.ok) throw new Error("ميتا رفضت: " + res.code + " " + res.msg);
        return { ok: true };
      }
      case "start": {
        const c = this.one("SELECT * FROM camps WHERE id = ?", b.id);
        if (!c) throw new Error("ماكو هالحملة");
        this.sql.exec("UPDATE camps SET state = 'paused' WHERE state = 'running' AND id != ?", c.id);
        this.sql.exec("UPDATE camps SET state = 'running', note = '' WHERE id = ?", c.id);
        this.set("fails", 0);
        await this.ctx.storage.setAlarm(now + 1000);
        return { ok: true };
      }
      case "pause":
        this.sql.exec("UPDATE camps SET state = 'paused', note = 'وكّفتها من صفحة الإدارة' WHERE id = ?", b.id);
        return { ok: true };
      case "inbox":
        return {
          chats: this.q(
            `SELECT m.phone, MAX(m.id) AS last, c.name, h.until > ? AS human,
               (SELECT body FROM msgs x WHERE x.phone = m.phone ORDER BY id DESC LIMIT 1) AS body,
               (SELECT at FROM msgs x WHERE x.phone = m.phone ORDER BY id DESC LIMIT 1) AS at
             FROM msgs m LEFT JOIN contacts c ON c.phone = m.phone LEFT JOIN human h ON h.phone = m.phone
             GROUP BY m.phone ORDER BY (h.until > ?) DESC, last DESC LIMIT 60`,
            now, now
          ),
        };
      case "chat":
        return { msgs: this.q("SELECT dir, body, at FROM msgs WHERE phone = ? ORDER BY id DESC LIMIT 100", b.phone || "").reverse() };
      case "reply": {
        const p = phone(b.phone, this.env.COUNTRY_CODE || "964");
        if (!p || !b.text) throw new Error("الرقم أو النص فاضي");
        const res = await send(this.env, p, { type: "text", text: { body: String(b.text).slice(0, 4000) } });
        if (!res.ok) {
          throw new Error(res.code === 131047 ? "مرت أكثر من 24 ساعة على آخر رسالة من الزبون، واتساب ما يسمح نرد إلا بقالب" : "ما انرسلت: " + res.code + " " + res.msg);
        }
        this.log(p, "staff", b.text);
        const hours = parseFloat(this.env.HUMAN_HOURS || "12") || 12;
        this.sql.exec("INSERT INTO human (phone, until) VALUES (?, ?) ON CONFLICT(phone) DO UPDATE SET until = excluded.until", p, now + hours * 3600000);
        return { ok: true };
      }
      case "bot":
        this.sql.exec("DELETE FROM human WHERE phone = ?", b.phone || "");
        return { ok: true };
    }
    throw new Error("not_found");
  }
}
