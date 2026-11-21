// فحص بلا إنترنت: node whatsapp/test.mjs
import assert from "node:assert/strict";
import { phone, isStop, isStart } from "./phone.js";

assert.equal(phone("0770 123 4567"), "9647701234567");
assert.equal(phone("+964 770 123 4567"), "9647701234567");
assert.equal(phone("٠٧٧٠١٢٣٤٥٦٧"), "9647701234567");
assert.equal(phone("00964 0770 1234567"), "9647701234567");
assert.equal(phone("7701234567"), "9647701234567");
assert.equal(phone("+90 532 123 4567"), "905321234567");
assert.equal(phone("123"), "");

for (const t of ["ايقاف", "إيقاف", "إيقاف العروض", "STOP", "وقف", "لا ترسل"]) assert.ok(isStop(t), t);
for (const t of ["مرحبا", "شكد سعر اسطنبول", "اريد اوقف بالفندق"]) assert.ok(!isStop(t), t);
assert.ok(isStart("اشتراك"));
console.log("كل الفحوصات نجحت ✅");
