// فحص عقل البوت بلا إنترنت: node whatsapp/test.mjs  (يقرا bot.json من جذر المستودع)
import assert from "node:assert/strict";
import fs from "node:fs";
import { reply, phone, find } from "./bot.js";

const data = JSON.parse(fs.readFileSync(new URL("../bot.json", import.meta.url)));
const body = (r) => r.msgs.map((m) => (m.text ? m.text.body : JSON.stringify(m.interactive))).join("\n");

assert.equal(phone("0770 123 4567"), "9647701234567");
assert.equal(phone("+964 770 123 4567"), "9647701234567");
assert.equal(phone("٠٧٧٠١٢٣٤٥٦٧"), "9647701234567");
assert.equal(phone("00964 0770 1234567"), "9647701234567");
assert.equal(phone("7701234567"), "9647701234567");
assert.equal(phone("+90 532 123 4567"), "905321234567");
assert.equal(phone("123"), "");

assert.equal(reply("ايقاف", "", data).act, "stop");
assert.equal(reply("إيقاف العروض", "", data).act, "stop");
assert.equal(reply("STOP", "", data).act, "stop");
assert.equal(reply("", "stop", data).act, "stop");
assert.equal(reply("اشتراك", "", data).act, "start");
assert.equal(reply("ايقاف", "", data, { human: true }).act, "stop"); // الإيقاف يشتغل حتى ويا الموظف
assert.equal(reply("دبي", "", data, { human: true }).msgs.length, 0); // الموظف يرد، البوت يسكت
assert.equal(reply("اريد احجي ويا موظف", "", data).act, "human");
assert.equal(reply("احجز", "", data).act, "human");
assert.equal(reply("مرحبا", "", data).msgs[0].interactive.type, "list");

if (data.flights.length) {
  assert.match(body(reply("اسطنبول", "", data)), /إسطنبول/);
  assert.match(body(reply("بإسطنبول", "", data)), /إسطنبول/);
  assert.match(body(reply("", "flights", data)), /أرخص رحلات/);
}
if (data.visas.length) {
  const v = data.visas.find((x) => x.c.includes("تركيا"));
  if (v) assert.equal(find("فيزا تركيا", data).visas[0].c, v.c);
  assert.match(body(reply("شكد فيزا الامارات؟", "", data)), /فيزا الإمارات/);
}
if (data.tours.length) assert.match(body(reply("", "tour:0", data)), /كروب/);
assert.equal(reply("شلونكم", "", data).msgs.length, 2); // ما فهم ← يعتذر ويطلّع القائمة

// قيود واتساب على القوائم
for (const r of [reply("مرحبا", "", data), reply("", "tours", data)]) {
  const it = r.msgs[0].interactive;
  if (!it || it.type !== "list") continue;
  const rows = it.action.sections.flatMap((s) => s.rows);
  assert.ok(rows.length <= 10);
  for (const x of rows) assert.ok(x.title.length <= 24 && (x.description || "").length <= 72, x.title);
}
console.log("كل الفحوصات نجحت ✅");
