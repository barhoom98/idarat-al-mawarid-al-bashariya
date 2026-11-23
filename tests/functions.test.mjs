// Edge-function helpers (supabase/functions/*): Web Push encryption and VAPID signature, which tasks get a reminder,
// and the calendar file. Runs under Node 22+ (TypeScript types are stripped):  node tests/functions.test.mjs
import assert from 'node:assert/strict';
import { b64u, encrypt, newVapidKeys, vapidHeader } from '../supabase/functions/task-reminders/webpush.ts';
import { ammanNow, dueReminders, reminderMessage, t12 } from '../supabase/functions/task-reminders/remind.ts';
import { ammanToUtc, taskIcs } from '../supabase/functions/task-cal/ics.ts';

const { subtle } = globalThis.crypto;
const enc = new TextEncoder(), dec = new TextDecoder();
let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('ok  ' + name); };

/* --- Web Push: decrypt as a browser would (RFC 8291), independently of the sender's code --- */
async function hkdf(salt, ikm, info, bytes) {
  const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}
const join = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };

await test('push payload decrypts on the receiving side', async () => {
  const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPub = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const msg = { title: 'تذكير: مهمة موعدها غداً', body: 'إقرار ضريبة الدخل · شركة الاختبار' };
  const body = await encrypt(enc.encode(JSON.stringify(msg)), b64u.enc(uaPub), b64u.enc(auth));
  const salt = body.slice(0, 16), rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0), idlen = body[20], asPub = body.slice(21, 21 + idlen);
  assert.equal(rs, 4096); assert.equal(idlen, 65);
  const as = await subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: as }, ua.privateKey, 256));
  const ikm = await hkdf(auth, shared, join(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.slice(21 + idlen)));
  assert.equal(plain[plain.length - 1], 2, 'last record ends with the 0x02 delimiter');
  assert.deepEqual(JSON.parse(dec.decode(plain.slice(0, -1))), msg);
});

await test('VAPID header is an ES256 token for the push service, signed by the public key it names', async () => {
  const keys = await newVapidKeys();
  const now = Date.parse('2026-11-23T06:00:00Z');
  const h = await vapidHeader('https://fcm.googleapis.com/fcm/send/abc', { ...keys, subject: 'https://hr.alabed-jo.com' }, now);
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(h);
  assert.ok(m, h);
  const [hd, pl, sig] = m[1].split('.');
  assert.equal(m[2], keys.publicKey);
  assert.deepEqual(JSON.parse(dec.decode(b64u.dec(hd))), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(dec.decode(b64u.dec(pl)));
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, 'https://hr.alabed-jo.com');
  assert.ok(claims.exp > now / 1000 && claims.exp <= now / 1000 + 24 * 3600);
  const pub = await subtle.importKey('raw', b64u.dec(m[2]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64u.dec(sig), enc.encode(hd + '.' + pl)));
});

/* --- which tasks are reminded --- */
await test('reminders: tomorrow once per due date, missed ones today, nothing done or far off', () => {
  const today = '2026-11-23';
  const T = (id, o) => ({ id, title: 'مهمة ' + id, status: 'new', created: '2026-11-20T08:00:00Z', ...o });
  const tasks = [
    T('a', { due: '2026-11-24', time: '14:00' }),
    T('b', { due: '2026-11-24' }),
    T('c', { due: '2026-11-24', reminded: '2026-11-24' }),          // already reminded for this date
    T('d', { due: '2026-11-24', reminded: '2026-11-20' }),          // moved to tomorrow after an earlier reminder
    T('e', { due: '2026-11-24', status: 'done' }),
    T('f', { due: '2026-11-25' }),
    T('g', { due: '2026-11-23', created: '2026-11-22T20:00:00Z' }), // added 23:00 last night (Amman): its reminder was missed
    T('h', { due: '2026-11-23', created: '2026-11-22T22:30:00Z' }), // added 01:30 today (Amman) for today: no reminder
    T('i', { due: '' }),
    T('j', { due: '2026-11-24', time: '09:00' }),
  ];
  assert.deepEqual(dueReminders(tasks, today).map((x) => x.id), ['g', 'j', 'a', 'b', 'd']);
  assert.deepEqual(ammanNow('2026-11-22T21:30:00Z'), { date: '2026-11-23', hour: 0 });
  assert.equal(t12('14:05'), '2:05 م'); assert.equal(t12('00:30'), '12:30 ص'); assert.equal(t12('12:00'), '12:00 م');
});

await test('reminder text: one task in detail, several as a list', () => {
  const people = { employees: { 'emp-1': { name: 'سامر خالد يوسف' } }, clients: { 'cl-1': { name: 'شركة النجمة للتجارة' } } };
  const one = reminderMessage([{ id: 'a', title: 'إقرار المبيعات', due: '2026-11-24', time: '10:30', client_id: 'cl-1', employee_id: 'emp-1', years: '2025' }], '2026-11-23', people);
  assert.equal(one.title, 'تذكير: مهمة موعدها غداً');
  assert.equal(one.body, 'إقرار المبيعات\nالعميل: شركة النجمة للتجارة\nالمسؤول: سامر خالد يوسف\nالساعة 10:30 ص\nالسنوات: 2025');
  const list = Array.from({ length: 8 }, (_, i) => ({ id: 't' + i, title: 'مهمة ' + i, due: '2026-11-24', employee_id: 'emp-1' }));
  const many = reminderMessage(list, '2026-11-23', people);
  assert.equal(many.title, 'تذكير: 8 مهام موعدها غداً');
  assert.equal(many.body.split('\n').length, 7);
  assert.match(many.body, /^• مهمة 0 · سامر$/m);
  assert.match(many.body, /و2 أخرى/);
  const two = reminderMessage([{ id: 'x', title: 'أ', due: '2026-11-23' }, { id: 'y', title: 'ب', due: '2026-11-24' }], '2026-11-23', people);
  assert.equal(two.title, 'تذكير: مهمتان تقترب مواعيدها');
  assert.equal(two.body, '• اليوم: أ\n• غداً: ب');
  assert.equal(many.url, './#tasks');
});

/* --- calendar file --- */
await test('calendar: Amman time in UTC, alarm a day before, folded and escaped', () => {
  assert.equal(ammanToUtc('2026-11-24', '10:00').toISOString(), '2026-11-24T07:00:00.000Z');
  assert.equal(ammanToUtc('2026-11-25', '00:30').toISOString(), '2026-11-24T21:30:00.000Z');
  const now = new Date('2026-11-23T06:00:00Z');
  const timed = taskIcs({ id: 'tk-1', title: 'مراجعة كشف, الربع الرابع', client: 'شركة النجمة للتجارة والاستيراد والتصدير المحدودة', due: '2026-11-24', time: '10:00', years: '2024، 2025', employee: 'سامر', company: 'شركة الاختبار' }, now);
  assert.ok(timed.endsWith('\r\n'));
  const lines = timed.split('\r\n');
  for (const l of lines) assert.ok(enc.encode(l).length <= 75, 'line over 75 octets: ' + l);
  const unfolded = timed.replace(/\r\n /g, '');
  assert.match(unfolded, /\r\nDTSTART:20261124T070000Z\r\nDTEND:20261124T080000Z\r\n/);
  assert.match(unfolded, /\r\nUID:tk-1@hr\.alabed-jo\.com\r\n/);
  assert.match(unfolded, /SUMMARY:مراجعة كشف\\, الربع الرابع — شركة النجمة/);
  assert.match(unfolded, /DESCRIPTION:العميل: .*\\nالسنوات المطلوبة: 2024، 2025\\nالمسؤول: سامر/);
  assert.match(unfolded, /BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:[^\r]+\r\nTRIGGER:-P1D\r\nEND:VALARM/);
  const allDay = taskIcs({ id: 'tk-2', title: 'تقديم إقرار', due: '2026-11-30' }, now).replace(/\r\n /g, '');
  assert.match(allDay, /DTSTART;VALUE=DATE:20261130\r\nDTEND;VALUE=DATE:20261201/);
  assert.match(allDay, /TRIGGER:-PT15H/);
  assert.doesNotMatch(allDay, /DESCRIPTION:\r\n|URL:/);
});

console.log(`\n${n} groups passed`);
