/* إرسال عروض «سافر مع عبدالله» بالواتساب الرسمي — على كلاود فلير (Workers + Durable Object بقاعدة SQLite).
 *
 * الفكرة بسيطة: عندك عرض ← تفتح /admin ← تحط الصورة والنص ← «أرسل للكل».
 *   - ينرسل لكل الأرقام اللي عليها واتساب، على دفعات حسب الحد اليومي لميتا، وبساعات الدوام بس.
 *   - الرقم اللي ما عليه واتساب ميتا ترفضه، فينعلّم وما ينرسله بعد (وما تنحسب كلفته).
 *   - البوت ما يرد على الزبائن. بس اللي يكتب «إيقاف» ينشال من العروض (هذا يحمي الرقم من الحظر)،
 *     وردود الناس تبين بصفحة الإدارة حتى تكلمهم من رقم المكتب.
 *   - إذا ميتا نزّلت جودة الرقم أو وكّفت القالب، الإرسال يوكف وحده.
 *
 * الروابط:
 *   /webhook   ميتا تدز عليه حالة الإرسال والردود (ينحط بإعدادات التطبيق بميتا)
 *   /admin     صفحة الإدارة (بكلمة سر ADMIN_TOKEN)
 *
 * الإعدادات بكلاود فلير (Settings ← Variables and Secrets):
 *   WA_TOKEN        (سري)  توكن دائم من System User بميتا
 *   WA_PHONE_ID            رقم تعريف رقم الهاتف (Phone number ID) من صفحة WhatsApp ← API Setup
 *   WA_APP_SECRET   (سري)  App Secret للتطبيق (حتى نتأكد الرسائل جاية من ميتا)
 *   WA_VERIFY_TOKEN (سري)  أي كلمة تختارها، نفسها تنكتب بميتا وقت ربط الويب هوك
 *   ADMIN_TOKEN     (سري)  كلمة سر صفحة الإدارة
 *   DAILY_LIMIT            كم شخص باليوم (الافتراضي 250، نفس حد ميتا للحساب الجديد). يتغير من صفحة الإدارة هم
 *   SEND_HOURS             ساعات الإرسال بتوقيت بغداد (الافتراضي 10-21)
 *   MIN_DAYS               أقل عدد أيام بين عرضين لنفس الشخص (الافتراضي 3)
 */
import { DurableObject } from "cloudflare:workers";
import { phone, isStop, isStart } from "./phone.js";
import { send, markRead, template, verify, PER_USER } from "./meta.js";
import ADMIN from "./admin.html";

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
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
    `);
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

  /* البوت ما يرد على الزبائن: يسجّل الرد بس، وإلا «إيقاف» أو «اشتراك» */
  async incoming(m, profile) {
    const p = m.from;
    const now = Date.now();
    this.sql.exec(
      "INSERT INTO contacts (phone, name, added, last_in) VALUES (?, ?, ?, ?) ON CONFLICT(phone) DO UPDATE SET last_in = excluded.last_in, bad = 0, name = COALESCE(NULLIF(contacts.name, ''), excluded.name)",
      p, profile, now, now
    );
    let text = "";
    if (m.type === "text") text = (m.text || {}).body || "";
    else if (m.type === "button") text = (m.button || {}).text || "";
    else if (m.type === "interactive") text = (((m.interactive || {}).button_reply || {}).title) || "";
    this.log(p, "in", text || "[" + m.type + "]");

    let answer = "";
    if (isStop(text)) {
      this.sql.exec("UPDATE contacts SET out = 1 WHERE phone = ?", p);
      answer = "تم ✅ ما راح توصلك عروض بعد. وإذا تريد ترجع اكتب «اشتراك».";
    } else if (isStart(text)) {
      this.sql.exec("UPDATE contacts SET out = 0 WHERE phone = ?", p);
      answer = "هلا بيك من جديد 🌹 راح توصلك عروضنا.";
    }
    if (answer) {
      await markRead(this.env, m.id);
      const res = await send(this.env, p, { type: "text", text: { body: answer } });
      if (res.ok) this.log(p, "bot", answer);
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
          tpl: this.get("tpl", ""),
          lang: this.get("lang", "ar"),
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
      case "offer": {
        // عرض جديد = حملة: القالب المعتمد + صورة + نص العرض. test: يرسل لرقمك بس
        if (!/^[a-z0-9_]+$/.test(b.tpl || "")) throw new Error("اسم القالب لازم نفس اللي بميتا بالضبط (حروف إنكليزية صغيرة وأرقام و_)");
        if (!b.text) throw new Error("اكتب نص العرض");
        const vars = JSON.stringify(["{name}", String(b.text).replace(/\s*\n\s*/g, " · ").slice(0, 900)]);
        const c = { tpl: b.tpl, lang: b.lang || "ar", image: b.image || "", vars };
        this.set("tpl", c.tpl);
        this.set("lang", c.lang);
        if (b.test) {
          const p = phone(b.test, this.env.COUNTRY_CODE || "964");
          if (!p) throw new Error("رقم التجربة غلط");
          const res = await send(this.env, p, template(c, "علوان"));
          if (!res.ok) throw new Error("ميتا رفضت: " + res.code + " " + res.msg);
          return { ok: true, test: true };
        }
        this.sql.exec("UPDATE camps SET state = 'paused' WHERE state = 'running'");
        this.sql.exec("INSERT INTO camps (name, tpl, lang, image, vars, state, created, note) VALUES (?, ?, ?, ?, ?, 'running', ?, '')",
          String(b.text).split("\n")[0].slice(0, 60), c.tpl, c.lang, c.image, vars, now);
        this.set("fails", 0);
        await this.ctx.storage.setAlarm(now + 1000);
        return { ok: true };
      }
      case "resume": {
        if (!this.one("SELECT id FROM camps WHERE id = ? AND state = 'paused'", b.id)) throw new Error("ماكو هالعرض");
        this.sql.exec("UPDATE camps SET state = 'paused' WHERE state = 'running'");
        this.sql.exec("UPDATE camps SET state = 'running', note = '' WHERE id = ?", b.id);
        this.set("fails", 0);
        await this.ctx.storage.setAlarm(now + 1000);
        return { ok: true };
      }
      case "pause":
        this.sql.exec("UPDATE camps SET state = 'paused', note = 'وكّفتها من صفحة الإدارة' WHERE id = ?", b.id);
        return { ok: true };
      case "replies":
        // آخر الناس اللي ردّوا على العروض، حتى تكلمهم من رقم المكتب
        return {
          rows: this.q(
            `SELECT m.phone, c.name, c.out, m.body, m.at FROM msgs m LEFT JOIN contacts c ON c.phone = m.phone
             WHERE m.id IN (SELECT MAX(id) FROM msgs WHERE dir = 'in' GROUP BY phone) ORDER BY m.id DESC LIMIT 100`
          ),
        };
    }
    throw new Error("not_found");
  }
}
